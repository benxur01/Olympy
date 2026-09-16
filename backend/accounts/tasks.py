"""Periodic background tasks for the accounts app."""
import logging
import random
from datetime import timedelta

from celery import shared_task
from django.db import transaction
from django.db.models import Avg, Count, Exists, Max, OuterRef, Q
from django.utils import timezone

from .models import PhoneVerification

DAILY_QUESTION_COUNT = 3


@shared_task
def cleanup_phone_verifications():
    """Delete stale phone-verification sessions.

    Three classes are removed:
      * OTP sent and expired (otp_expires_at < now)
      * No OTP issued and the session is older than 1 hour (Telegram
        contact never arrived; otp_expires_at IS NULL)
      * Already verified and older than 30 days
    """
    now = timezone.now()
    cutoff_pending = now - timedelta(hours=1)
    cutoff_verified = now - timedelta(days=30)

    deleted = PhoneVerification.objects.filter(
        Q(otp_expires_at__isnull=False, otp_expires_at__lt=now)
        | Q(otp_expires_at__isnull=True, verified_at__isnull=True, created_at__lt=cutoff_pending)
        | Q(verified_at__isnull=False, verified_at__lt=cutoff_verified)
    ).delete()
    return f'Cleaned {deleted[0]} phone verification rows'


@shared_task(name='accounts.flush_expired_jwt_tokens')
def flush_expired_jwt_tokens(batch_size=2000, max_batches=50):
    """Muddati o'tgan `OutstandingToken` yozuvlarini o'chiradi.

    NEGA KERAK: `rest_framework_simplejwt.token_blacklist` o'rnatilgani uchun
    HAR BIR yangi refresh token (`RefreshToken.for_user`) jadvalga bitta qator
    yozadi — ya'ni har bir login (jumladan Google login) va, ROTATE_REFRESH_
    TOKENS=True bo'lgani uchun, har bir `/api/auth/token/refresh/`. Faol
    foydalanuvchi access token muddati (30 daqiqa) bo'yicha yangilanib turadi,
    demak bitta sessiya kuniga ~48 qator qoldiradi va `token` ustunida to'liq
    JWT saqlanadi. Hech narsa ularni o'chirmasdi.

    Jadval o'sgan sari LOGIN sekinlashadi: har kirishdagi INSERT ikkita
    indeksni (`jti` unique va `user_id`) yangilashi kerak, ular esa kichik
    Postgres instansiyasining keshiga sig'may qoladi.

    Batch bilan o'chiramiz: bitta katta `DELETE` cascade uchun barcha PK'larni
    xotiraga yig'adi — 512MB konteynerda bu xavfli. `max_batches` — bitta
    ishga tushishda o'chiriladigan yuqori chegara; qolgani ertangi kunga
    qoladi (task idempotent, takror ishga tushirish xavfsiz).
    """
    import logging

    from rest_framework_simplejwt.token_blacklist.models import OutstandingToken

    logger = logging.getLogger(__name__)
    now = timezone.now()
    total = 0

    for _ in range(max_batches):
        ids = list(
            OutstandingToken.objects
            .filter(expires_at__lte=now)
            .values_list('id', flat=True)[:batch_size]
        )
        if not ids:
            break
        # Cascade `BlacklistedToken` ga ham tegadi (FK on_delete=CASCADE).
        deleted, _detail = OutstandingToken.objects.filter(id__in=ids).delete()
        total += deleted
        if len(ids) < batch_size:
            break

    if total:
        logger.info('flush_expired_jwt_tokens: deleted %s rows', total)
    return {'deleted_rows': total}


@shared_task(name='accounts.purge_soft_deleted_accounts')
def purge_soft_deleted_accounts():
    """Grace muddati o'tgan soft-delete hisoblarni hard-delete qiladi.

    Owner (EducationCenter.owner PROTECT) bo'lgan hisoblar o'tkazib yuboriladi —
    ular soft-delete paytida ham bloklangan bo'lishi kerak edi, lekin edge-case.
    """
    from django.conf import settings
    from django.contrib.auth import get_user_model
    from centers.models import EducationCenter

    User = get_user_model()
    grace = int(getattr(settings, 'ACCOUNT_DELETE_GRACE_DAYS', 30))
    cutoff = timezone.now() - timedelta(days=grace)
    qs = User.objects.filter(deleted_at__isnull=False, deleted_at__lt=cutoff)
    purged = 0
    skipped = 0
    for user in qs.iterator(chunk_size=100):
        if EducationCenter.objects.filter(owner_id=user.pk).exists():
            skipped += 1
            continue
        try:
            user.delete()
            purged += 1
        except Exception:
            skipped += 1
    return f'Purged {purged} soft-deleted users (skipped {skipped})'


@shared_task(name='accounts.celery_heartbeat')
def celery_heartbeat_task():
    """Celery worker tirikligini health check uchun cache'ga belgilaydi.

    Beat har 30 soniyada chaqiradi; /api/health/ esa cache'dagi timestamp
    60 soniyadan eski (yoki yo'q) bo'lsa "celery": "down" qaytaradi. Timeout
    120s — kechikkan heartbeat'ni ham aniq yoshi bilan o'qiy olamiz.
    """
    import time
    from django.core.cache import cache

    cache.set('celery_heartbeat', time.time(), timeout=120)


@shared_task(
    bind=True,
    max_retries=5,
    default_retry_delay=5,
    name='accounts.send_telegram_otp',
)
def send_telegram_otp_task(self, chat_id, text, bot='auth'):
    """OTP kodni Telegram orqali background'da yuboradi.

    HTTP so'rovni bloklamaslik uchun OTP yuborish ishi shu task'ga
    ko'chirildi. Telegram 429 (rate limit) yoki vaqtinchalik xato bo'lsa
    Celery avtomatik qayta urinadi — Gunicorn worker'lar qotib qolmaydi.

    `text` chaqiruvchi tomonda to'liq shakllantiriladi (masalan,
    'Tasdiqlash kodi: 123456' yoki 'Parolni tiklash kodi: 123456') —
    shu sababli xabar formati o'zgarmaydi.
    """
    # Circular import oldini olish uchun lokal import.
    from django.conf import settings
    from accounts.views import _send_telegram_message, _telegram_bot_token

    # Token umuman yo'q (lokal/dev muhit) — qayta urinishning ma'nosi yo'q.
    if not _telegram_bot_token(bot):
        return {'sent': False, 'reason': 'no_token', 'chat_id': chat_id}

    # `_send_telegram_message` ichida 429 retry_after bilan boshqariladi va
    # OTP matni log'da maskirovka qilinadi. Muvaffaqiyatda True qaytaradi.
    ok = _send_telegram_message(chat_id, text, bot=bot)
    if ok:
        return {'sent': True, 'chat_id': chat_id}

    # EAGER rejimda (Redis yo'q — lokal/dev) retry ham sinxron bo'ladi va
    # so'rovni bloklab qotirib qo'yadi — ya'ni asl muammoni qaytaradi. Shu
    # sababli faqat real broker bo'lganda (production) qayta urinamiz.
    if getattr(settings, 'CELERY_TASK_ALWAYS_EAGER', False):
        return {'sent': False, 'reason': 'send_failed', 'chat_id': chat_id}

    # Yuborilmadi (rate limit tugadi yoki Telegram not-ok qaytardi) —
    # task darajasida qayta urinamiz.
    raise self.retry(
        exc=Exception('telegram sendMessage failed'),
        countdown=10,
    )


@shared_task(
    bind=True,
    max_retries=5,
    default_retry_delay=5,
    name='accounts.send_telegram_message',
)
def send_telegram_message_task(self, chat_id, text, reply_markup=None, bot='auth'):
    """Oddiy Telegram xabarni background'da yuboradi (fire-and-forget).

    `send_telegram_otp_task` bilan bir xil pattern, lekin OTP bo'lmagan
    umumiy xabarlar uchun (eski egani ogohlantirish, callback'dan keyingi
    ma'lumot xabari). HTTP so'rovni bloklamaslik uchun ishlatiladi: oldin bu
    chaqiruvlar `_telegram_api_call` ichidagi retry/sleep tufayli Gunicorn
    worker thread'ini 9 soniyagacha bloklardi (3 retry × 3s). `reply_markup`
    ixtiyoriy — keyboard yuborish kerak bo'lganda beriladi.
    """
    from django.conf import settings
    from accounts.views import _send_telegram_message, _telegram_bot_token

    # Token yo'q (lokal/dev) — qayta urinish ma'nosiz.
    if not _telegram_bot_token(bot):
        return {'sent': False, 'reason': 'no_token', 'chat_id': chat_id}

    ok = _send_telegram_message(chat_id, text, reply_markup=reply_markup, bot=bot)
    if ok:
        return {'sent': True, 'chat_id': chat_id}

    # EAGER rejimda (Redis yo'q) retry sinxron bo'lib so'rovni bloklaydi —
    # faqat real broker bo'lganda (production) qayta urinamiz.
    if getattr(settings, 'CELERY_TASK_ALWAYS_EAGER', False):
        return {'sent': False, 'reason': 'send_failed', 'chat_id': chat_id}

    raise self.retry(
        exc=Exception('telegram sendMessage failed'),
        countdown=10,
    )


@shared_task(name='accounts.delete_storage_file')
def delete_storage_file_task(name):
    """Storage'dagi (disk yoki Cloudinary) faylni background'da o'chiradi.

    `accounts.utils.delete_replaced_image_file` shu task orqali ishlaydi.
    Sabab `send_telegram_message_task` bilan bir xil: Cloudinary yoqilganda
    (production) `storage.delete()` — bu Cloudinary API'ga tarmoq so'rovi va u
    HTTP so'rov-javob sikli ichida bajarilardi, ya'ni jami 6 ta Gunicorn
    thread'idan bittasini rasm almashtirilgan har safar ushlab turardi.

    Fire-and-forget: rasm allaqachon saqlangan, eski faylni o'chirish faqat
    tozalash. Xato bo'lsa qayta urinilmaydi — avvalgi sinxron xulq aynan shu
    edi (yetim fayl qolishi so'rovni buzishdan arzonroq), faqat log yoziladi.

    Celery chegarasidan storage obyekti emas, faqat fayl NOMI o'tkaziladi
    (loyihadagi "task'ga model emas, ID/nom beriladi" naqshi). Rasm maydonlari
    (`User.avatar`, `EducationCenter.image`, `RewardProduct.image`) alohida
    `storage=` bermaydi — hammasi default storage'da, shuning uchun
    `default_storage` `field_file.storage` bilan bir xil obyekt.
    """
    from django.core.files.storage import default_storage

    logger = logging.getLogger(__name__)
    try:
        default_storage.delete(name)
    except Exception:
        logger.warning(
            "eski rasm faylini o'chirib bo'lmadi: %s", name, exc_info=True,
        )
        return {'deleted': False, 'name': name}
    return {'deleted': True, 'name': name}


@shared_task(name='accounts.generate_daily_questions')
def generate_daily_questions(count=DAILY_QUESTION_COUNT):
    """DH1: Bugungi `count` ta kunlik savolni tanlaydi (idempotent).

    Bu task Celery Beat tomonidan har kuni avtomatik ishga tushiriladi
    (settings.CELERY_BEAT_SCHEDULE['generate-daily-questions'], har kuni 06:00
    UTC). `generate_daily_questions` management command logikasining Celery beat
    varianti. Bugun uchun savollar yetarli bo'lsa qayta ishlamaydi. Savol
    tanlash ID-asosli random bilan amalga oshiriladi (`order_by('?')` to'liq
    jadval skanini oldini olish uchun).
    """
    from accounts.models import DailyQuestion
    from questions.models import Question

    count = max(1, int(count or DAILY_QUESTION_COUNT))
    today = timezone.now().date()

    existing = DailyQuestion.objects.filter(date=today).count()
    if existing >= count:
        return f'skipped: {existing} daily questions already exist for {today}'

    need = count - existing
    # Bugun allaqachon tanlangan savollarni qayta tanlamaymiz.
    used_ids = list(
        DailyQuestion.objects.filter(date=today).values_list('question_id', flat=True)
    )
    # Kunlik savol barcha o'quvchilarga ko'rsatiladi — shu sababli faqat umumiy
    # olimpiada bankidan olinadi. O'qituvchining shaxsiy Jonli Viktorina savoli
    # bu yerga tushib qolmasligi kerak.
    candidate_ids = list(
        Question.objects
        .filter(purpose=Question.QUESTION_PURPOSE_OLYMPIAD)
        .exclude(id__in=used_ids)
        .values_list('id', flat=True)
    )
    if not candidate_ids:
        return 'no questions available — nothing created'

    picked_ids = random.sample(candidate_ids, min(need, len(candidate_ids)))
    questions = Question.objects.filter(id__in=picked_ids)

    created = 0
    for q in questions:
        _, was_created = DailyQuestion.objects.get_or_create(
            question=q,
            date=today,
            defaults={'subject': q.subject or ''},
        )
        if was_created:
            created += 1

    return f'daily questions ready: {created} created for {today}'


@shared_task(name='accounts.send_weekly_digest')
def send_weekly_digest():
    """B2B: Markaz egalariga (owner) haftalik hisobotni Telegram orqali yuboradi.

    Bu task Celery Beat tomonidan har hafta avtomatik ishga tushiriladi
    (settings.CELERY_BEAT_SCHEDULE['send-weekly-digest'], har dushanba
    08:30 UTC). Har bir tasdiqlangan (approved) markaz owner'iga (faqat
    `telegram_chat_id` bo'lsa) o'sha markaz bo'yicha qisqa statistika ketadi:
    jami o'quvchilar, bu hafta faol o'quvchilar, o'rtacha ball, eng zaif fan.

    Bittasida xato bo'lsa o'sha markaz o'tkazib yuboriladi, batch to'xtamaydi.
    """
    import logging

    from django.conf import settings

    from centers.models import CenterMembership, EducationCenter
    from attempts.models import TestAttempt

    logger = logging.getLogger(__name__)
    week_ago = timezone.now() - timedelta(days=7)
    site_url = getattr(settings, 'SITE_URL', 'https://prolymp.uz')

    centers = (
        EducationCenter.objects
        .filter(status=EducationCenter.STATUS_APPROVED, owner__isnull=False)
        .select_related('owner')
    )

    sent = 0
    skipped = 0
    for center in centers:
        owner = center.owner
        chat_id = getattr(owner, 'telegram_chat_id', '') if owner else ''
        if not chat_id:
            skipped += 1
            continue

        # Markazning tasdiqlangan o'quvchilari.
        student_ids = list(
            CenterMembership.objects
            .filter(
                center=center,
                role=CenterMembership.ROLE_STUDENT,
                status=CenterMembership.STATUS_APPROVED,
            )
            .values_list('user_id', flat=True)
        )
        total_students = len(student_ids)

        # Bu hafta faol o'quvchilar — markaz olimpiadalarida oxirgi 7 kunda
        # urinish qilganlar (diskvalifikatsiyasiz). distinct user.
        active_this_week = (
            TestAttempt.objects
            .filter(
                olympiad__center=center,
                olympiad__is_deleted=False,
                disqualified=False,
                submitted_at__gte=week_ago,
            )
            .values('user_id')
            .distinct()
            .count()
        )

        # O'rtacha ball — markaz olimpiadalaridagi barcha urinishlar.
        agg = (
            TestAttempt.objects
            .filter(
                olympiad__center=center,
                olympiad__is_deleted=False,
                disqualified=False,
            )
            .aggregate(avg=Avg('score'))
        )
        avg_score = round(agg['avg'] or 0, 1)

        # Eng zaif fan — o'rtacha ball eng past bo'lgan fan (kamida bitta urinish).
        subject_rows = (
            TestAttempt.objects
            .filter(
                olympiad__center=center,
                olympiad__is_deleted=False,
                disqualified=False,
            )
            .values('olympiad__subject')
            .annotate(avg=Avg('score'), cnt=Count('id'))
            .order_by('avg')
        )
        weakest_subject = '—'
        for row in subject_rows:
            subj = (row['olympiad__subject'] or '').strip()
            if subj:
                weakest_subject = subj
                break

        msg = (
            f"📊 *Olympy haftalik hisobot*\n\n"
            f"🏫 *{center.name}*\n"
            f"👥 Jami o'quvchilar: {total_students}\n"
            f"✅ Bu hafta faol: {active_this_week}\n"
            f"🏆 O'rtacha ball: {avg_score}\n"
            f"📉 Eng zaif fan: {weakest_subject}\n\n"
            f"_Batafsil: {site_url}/dashboard/owner_"
        )

        try:
            from notifications.services import send_telegram_markdown
            send_telegram_markdown(chat_id, msg)
            sent += 1
        except Exception:
            logger.exception(
                'weekly digest failed for center=%s owner=%s',
                center.id, owner.id if owner else None,
            )
            skipped += 1

    return f'weekly digest: {sent} sent, {skipped} skipped'


def _build_trial_reminder_message(name, total, avg_score, best_score):
    """P4: Trial tugashi eslatmasi uchun shaxsiylashtirilgan matn tuzadi.

    `total` — shu oydagi test soni. 0 bo'lsa (foydalanuvchi bu oy umuman test
    ishlamagan) soxta statistika yozmaymiz — umumiy, lekin baribir foydali
    matn qaytaramiz. Aks holda real raqamlarga asoslangan matn beriladi.
    """
    greeting = name or 'Salom'
    if total > 0:
        return (
            f"⏳ {greeting}, premium sinov muddatingiz tugashiga oz qoldi!\n\n"
            f"📊 Bu oy siz {total} ta test ishladingiz, o'rtacha balingiz "
            f"{avg_score}% (eng yaxshisi {best_score}%).\n\n"
            f"💎 Premium bilan natijangizni yanada yaxshilang: cheksiz olimpiada, "
            f"AI tahlil va batafsil statistika sizni kutmoqda. Obunani uzaytiring "
            f"va o'sishda davom eting!"
        )
    return (
        f"⏳ {greeting}, premium sinov muddatingiz tugashiga oz qoldi!\n\n"
        f"💎 Premium imkoniyatlardan to'liq foydalanish uchun hali kech emas: "
        f"cheksiz olimpiada, AI tahlil va shaxsiy statistika bilan bilimingizni "
        f"sinab ko'ring. Obunani uzaytiring va birinchi natijangizga erishing!"
    )


@shared_task(name='accounts.send_trial_ending_reminders')
def send_trial_ending_reminders():
    """P4: Premium sinovi tugayotgan foydalanuvchilarga konversiya eslatmasi.

    Bu task Celery Beat tomonidan har kuni avtomatik ishga tushiriladi
    (settings.CELERY_BEAT_SCHEDULE['send-trial-ending-reminders'], har kuni
    09:00 UTC). `send_trial_ending_reminders` management command logikasining
    Celery beat varianti.

    Tanlanadigan foydalanuvchilar:
      * `premium_trial_end` mavjud va keyingi 3 kun ichida tugaydi
        (now < premium_trial_end <= now + 3 kun) — trial davrida user
        `is_premium=True` bo'ladi, shuning uchun premium holatiga emas, aynan
        trial muddatiga qaraymiz;
      * `is_active=True` — aktiv user;
      * `telegram_chat_id` bo'sh emas;
      * `trial_reminder_sent_at` NULL — eslatma hali yuborilmagan (har trial
        bir martalik, takror yubormaslik uchun).

    Har bir foydalanuvchiga shu oydagi (oxirgi 30 kun) TestAttempt statistikasi
    asosida shaxsiylashtirilgan matn yuboriladi. Bittasida xato bo'lsa o'sha
    user o'tkazib yuboriladi, batch to'xtamaydi.
    """
    import logging

    from django.contrib.auth import get_user_model
    from attempts.models import TestAttempt

    logger = logging.getLogger(__name__)
    User = get_user_model()

    now = timezone.now()
    horizon = now + timedelta(days=3)
    month_ago = now - timedelta(days=30)

    skipped = 0
    # Yuboriladigan xabarlarni shu yerga yig'amiz va Telegram HTTP so'rovlarini
    # FAQAT lock yopilgandan keyin (alohida Celery subtask sifatida) yuboramiz.
    # Ilgari `_send_telegram_message` aynan `select_for_update()` qulfi ostida
    # chaqirilardi — DB qatori lock'da turgan holda har user uchun bloklovchi
    # HTTP bajariladi, 1000+ userda kuchli lock contention / deadlock xavfi.
    pending_messages = []

    # Tanlangan userlarni transaction + select_for_update() ostida qulflaymiz —
    # ikkita parallel ishga tushish (Celery beat + management command) bir
    # userga ikki marta eslatma yubormasligi uchun. Qulf ichida FAQAT DB ishi
    # bajariladi: stat o'qish, `trial_reminder_sent_at` belgilash. Belgilashni
    # darhol (yuborishdan oldin) qilamiz — bu lock'ning asl maqsadi (idempotent,
    # takror yubormaslik). Yuborishni esa subtask'ga retry bilan topshiramiz.
    with transaction.atomic():
        users = User.objects.filter(
            premium_trial_end__isnull=False,
            premium_trial_end__gt=now,
            premium_trial_end__lte=horizon,
            is_active=True,
            trial_reminder_sent_at__isnull=True,
        ).exclude(telegram_chat_id='').select_for_update()

        for user in users:
            chat_id = user.telegram_chat_id
            if not chat_id:
                skipped += 1
                continue

            agg = TestAttempt.objects.filter(
                user=user, disqualified=False, submitted_at__gte=month_ago,
            ).aggregate(avg=Avg('score'), best=Max('score'), total=Count('id'))

            total = agg['total'] or 0
            avg_score = round(agg['avg'] or 0, 1)
            best_score = agg['best'] or 0
            name = user.full_name or user.first_name or ''

            msg = _build_trial_reminder_message(name, total, avg_score, best_score)

            # Faqat shu maydonni yangilaymiz — save() ichidagi ortiqcha
            # logikani (normalize_phone, full_name) chetlab o'tib.
            user.trial_reminder_sent_at = now
            user.save(update_fields=['trial_reminder_sent_at'])

            pending_messages.append((chat_id, msg))

    # Lock yopildi — endi Telegram yuborishni alohida subtask'larga bo'lamiz.
    # `send_telegram_otp_task` har xabar uchun mustaqil ishlaydi, 429/xatoda
    # 5 martagacha qayta urinadi (production'da) va lokal/dev'da token yo'q
    # bo'lsa darrov no_token qaytaradi. Eslatma optimistik tarzda "yuborilgan"
    # deb belgilanadi (trial bir martalik) — takror yubormaslik DB lock'i bilan
    # kafolatlangani uchun bu maqbul.
    for chat_id, msg in pending_messages:
        try:
            send_telegram_otp_task.delay(chat_id, msg, bot='auth')
        except Exception:
            logger.exception(
                'trial reminder enqueue failed for chat_id=%s', chat_id,
            )

    return {'sent': len(pending_messages), 'skipped': skipped}


@shared_task(name='accounts.expire_stale_suspensions')
def expire_stale_suspensions():
    """Muddati tugagan vaqtinchalik bloklarni toplu ochadi.

    Bu task Celery Beat tomonidan har kuni ishga tushiriladi
    (settings.CELERY_BEAT_SCHEDULE['expire-stale-suspensions'], har kuni
    04:05 UTC). `User.release_expired_suspension` mantig'ining batch varianti:
    o'sha yerda tekshiruv faqat foydalanuvchi KIRISHGA urinsagina bajariladi
    — qaytmagan foydalanuvchi admin ro'yxatida "Bloklangan" bo'lib
    qolaverardi (`expire_stale_premium` bilan bir xil muammo va yechim).

    Doimiy bloklar (`blocked_until` NULL) va soft-delete qilingan hisoblar
    (`deleted_at` to'ldirilgan — ular ham `is_active=False`, lekin
    `blocked_until` siz) tanlovga umuman tushmaydi. Takror ishga tushirish
    xavfsiz: faqat `is_active=False` va muddati o'tgan yozuvlar yangilanadi.

    token_version teginilmaydi — bloklash paytida allaqachon oshirilgan,
    eski tokenlar baribir bekor.
    """
    import logging

    from django.contrib.auth import get_user_model

    logger = logging.getLogger(__name__)
    User = get_user_model()
    now = timezone.now()

    released = (
        User.objects
        .filter(is_active=False, blocked_until__isnull=False, blocked_until__lte=now)
        .update(is_active=True, block_reason='', blocked_until=None)
    )
    if released:
        logger.info('expire_stale_suspensions: released %s users', released)
    return {'released_users': released}


@shared_task(name='accounts.expire_stale_premium')
def expire_stale_premium():
    """Muddati tugagan premium bayrog'ini (`is_premium`) toplu tozalaydi.

    Bu task Celery Beat tomonidan har kuni avtomatik ishga tushiriladi
    (settings.CELERY_BEAT_SCHEDULE['expire-stale-premium'], har kuni 03:45
    UTC). `/me` endpoint'idagi lazy-expiry mantig'ining batch varianti: o'sha
    yerda tekshiruv FAQAT foydalanuvchi so'rov yuborganda bajariladi —
    sinovi (yoki obunasi) tugagandan keyin ilovaga umuman qaytmagan
    foydalanuvchida `is_premium` bazada True bo'lib qolaverardi.

    Asosiy maqsad — bayroqni TO'G'RIDAN-TO'G'RI o'qiydigan joylarni
    (mukofot do'konidagi `is_premium_only`, streak muzlatish perki,
    reyting/a'zolar ro'yxatidagi "Premium ✓" belgisi) eskirgan holatdan
    saqlash. Qo'shimcha samara: `is_user_premium` obuna YOZUVI umuman
    bo'lmaganda bayroqqa ishonadi (legacy/admin grant'larni xato rad
    etmaslik uchun) — ya'ni sinovi tugagan, obunasiz foydalanuvchi `/me`ga
    kirmaguncha premium imkoniyatlarni saqlab qolardi. Task shu oynani
    kuniga bir marta yopadi. Aktiv obuna yozuvi bor holatlarda esa hech
    narsa o'zgarmaydi: `is_user_premium` va `resolve_student_tier` premium
    holatini baribir obuna muddatidan qayta hisoblaydi.

    Bosqichlar (hammasi bitta `now` qiymati bo'yicha):
      1. Muddati o'tgan, lekin hali `is_active=True` bo'lgan obunalarni yopish;
      2. Amal qiluvchi obunasi ham, sinov muddati ham qolmagan premium
         foydalanuvchilarning bayrog'ini o'chirish;
      3. Egasining tashkilot obunasi endigina tugagan markazlarning
         `is_premium` bayrog'ini o'chirish.

    Takror ishga tushirish xavfsiz (idempotent): 2- va 3-qadamlar faqat
    `is_premium=True` yozuvlarni tanlaydi, 1-qadam esa allaqachon yopilgan
    obunani qayta yopmaydi — to'g'ri holatdagi yozuvlar umuman tegilmaydi.
    """
    import logging

    from django.contrib.auth import get_user_model

    from billing.models import UserSubscription
    from centers.models import EducationCenter

    logger = logging.getLogger(__name__)
    User = get_user_model()
    now = timezone.now()

    # 1) Muddati o'tgan aktiv obunalar — `/me` ham har so'rovda xuddi shuni
    # qiladi. Tashkilot (organization) obunasi tugagan egalarni update'dan
    # OLDIN ro'yxatga olamiz: update'dan keyin bu qatorlar `is_active=False`
    # bo'lib, filtrga umuman tushmaydi (3-qadam uchun kerak).
    expired_qs = UserSubscription.objects.filter(is_active=True, end_date__lte=now)
    org_owner_ids = list(
        expired_qs
        .filter(plan__plan_type='organization')
        .values_list('user_id', flat=True)
        .distinct()
    )
    expired_subs = expired_qs.update(is_active=False)

    # 2) Premium bayrog'i qolgan, lekin amal qiluvchi obunasi ham, sinov
    # muddati ham yo'q foydalanuvchilar — `/me` dagi
    # `is_premium and not still_active and not trial_active` shartining aynan
    # o'zi. Sinov va obuna mustaqil manba: ikkalasi ham tugagan bo'lsagina
    # bayroq o'chadi. `~Exists(...)` tufayli bularning hammasi bitta SQL
    # UPDATE'da bajariladi (foydalanuvchilar bo'yicha Python tsikli yo'q).
    active_sub = UserSubscription.objects.filter(
        user_id=OuterRef('pk'), is_active=True, end_date__gt=now,
    )
    cleared_users = (
        User.objects
        .filter(is_premium=True)
        .filter(Q(premium_trial_end__isnull=True) | Q(premium_trial_end__lte=now))
        .filter(~Exists(active_sub))
        .update(is_premium=False)
    )
    # Cache'ni tozalashga hojat yo'q: `subscription_cache_key` faqat `/me`
    # ichidagi qayta tekshiruvni 60 soniyaga o'tkazib yuboradi (u ham shu
    # yerdagi natijani takrorlagan bo'lardi), `is_user_premium` esa cache'dan
    # oldin `user.is_premium` bayrog'ini tekshiradi — bayroq False bo'lgach
    # eski cache qiymati natijaga ta'sir qilmaydi.

    # 3) Markaz premiumi. `/me` markazni faqat obuna ENDIGINA tugaganda qayta
    # hisoblaydi — shuning uchun biz ham 1-qadamda yopilgan TASHKILOT obunasi
    # egalari bilan cheklanamiz. "Aktiv tashkilot obunasi yo'q" degan kengroq
    # shart xavfli bo'lardi: markaz premiumi obunasiz ham beriladi (platforma
    # admini qo'lda yoqadi — centers/views.py, Django admin), va
    # `SubscriptionService` uni "lifetime/admin premium — limitsiz" deb qabul
    # qiladi. Keng shart bunday markazlarni bepul limitlarga tushirib qo'yardi.
    cleared_centers = 0
    if org_owner_ids:
        active_org_sub = UserSubscription.objects.filter(
            user_id=OuterRef('owner_id'),
            is_active=True,
            plan__plan_type='organization',
            end_date__gt=now,
        )
        cleared_centers = (
            EducationCenter.objects
            .filter(is_premium=True, owner_id__in=org_owner_ids)
            .filter(~Exists(active_org_sub))
            .update(is_premium=False)
        )

    if expired_subs or cleared_users or cleared_centers:
        logger.info(
            'expire_stale_premium: closed %s subscriptions, cleared is_premium '
            'for %s users and %s centers',
            expired_subs, cleared_users, cleared_centers,
        )

    return {
        'expired_subscriptions': expired_subs,
        'cleared_users': cleared_users,
        'cleared_centers': cleared_centers,
    }


# ─── Ommaviy premium (barcha o'quvchilar) ──────────────────────────────────
#
# Admin panelidagi "Premium boshqaruvi" bo'limi shu ikki task'ni navbatga
# qo'yadi. Amal minglab hisobga tegishi mumkin — `grant_premium`/
# `revoke_premium` to'plamli SQL bilan ishlasa ham, `bulk_create` paketlari
# gunicorn thread'ini ushlab turmasligi uchun ish worker'da bajariladi
# (view faqat navbatga qo'yadi va darhol javob qaytaradi).


@shared_task(name='accounts.bulk_grant_premium_students')
def bulk_grant_premium_students(duration, plan_type='student', plan_name=None):
    """Barcha `student` rolli hisoblarga premium beradi."""
    import logging

    from .utils import grant_premium, student_premium_targets

    logger = logging.getLogger(__name__)
    user_ids = list(student_premium_targets('grant').values_list('id', flat=True))
    count = grant_premium(user_ids, duration, plan_type, plan_name)
    logger.info(
        'bulk_grant_premium_students: %s students, duration=%s plan_type=%s',
        count, duration, plan_type,
    )
    return {'count': count}


@shared_task(name='accounts.bulk_revoke_premium_students')
def bulk_revoke_premium_students():
    """Premiumi bor barcha `student` rolli hisoblardan premiumni olib tashlaydi."""
    import logging

    from .utils import revoke_premium, student_premium_targets

    logger = logging.getLogger(__name__)
    user_ids = list(student_premium_targets('revoke').values_list('id', flat=True))
    count = revoke_premium(user_ids)
    logger.info('bulk_revoke_premium_students: %s students', count)
    return {'count': count}


# ─── Ommaviy foydalanuvchi importi ─────────────────────────────────────────
#
# Premium task'lari bilan bir xil sabab: har qator alohida INSERT (+ markaz
# a'zoligi) va parol hashlash (PBKDF2 — ataylab sekin) talab qiladi, ya'ni
# 200 qatorlik CSV gunicorn thread'ini o'nlab soniyaga ushlab turardi. Farqi
# shundaki bu yerda admin NATIJANI (jumladan generatsiya qilingan parollar)
# ko'rishi shart, shu sababli premium'dagi "navbatga qo'ydik va tamom"
# javobi yetarli emas — AI task'lari naqshi: `task_id` + status polling.
BULK_IMPORT_TASK_PREFIX = 'bulk_import_users'


@shared_task(name='accounts.bulk_import_users')
def bulk_import_users_task(task_id, items):
    """CSV/JSON qatorlaridan foydalanuvchi yaratadi (`admin_bulk_import_users`).

    Har qator ALOHIDA tranzaksiyada: bitta yaroqsiz qator butun importni
    qaytarib yubormasin. Parol berilmagan qatorga har safar YANGI tasodifiy
    parol generatsiya qilinadi (`_make_recovery_password`) va faqat natija
    konvertida (15 daqiqalik kesh, egasi — importni boshlagan admin) bir marta
    qaytariladi; jurnalga ham, server loglariga ham tushmaydi.
    """
    from centers.models import CenterMembership, EducationCenter
    from questions.ai_task_status import set_ai_task_failed, set_ai_task_result

    from .models import User
    from .utils import normalize_phone
    from .views import _make_recovery_password

    logger = logging.getLogger(__name__)
    try:
        created_users = []
        errors = []

        for idx, item in enumerate(items):
            full_name = str(item.get('full_name') or item.get('name') or '').strip()
            phone = str(item.get('phone') or '').strip()
            role = str(item.get('role') or 'student').strip().lower()
            given_password = str(item.get('password') or '').strip()
            center_id = item.get('center_id')

            norm_phone = normalize_phone(phone)
            if not norm_phone:
                errors.append(f"Qator {idx+1}: Telefon raqam noto‘g‘ri ({phone})")
                continue

            if not full_name:
                errors.append(f"Qator {idx+1}: Ism-familiya bo‘sh")
                continue

            if User.objects.filter(normalized_phone=norm_phone).exists():
                errors.append(f"Qator {idx+1}: Bu telefon raqam avval ro‘yxatdan o‘tgan ({norm_phone})")
                continue

            password = given_password or _make_recovery_password()
            try:
                with transaction.atomic():
                    roles_list = [role] if role in ['student', 'teacher', 'manager', 'owner'] else ['student']
                    new_user = User.objects.create_user(
                        phone=norm_phone,
                        password=password,
                        full_name=full_name,
                        roles=roles_list,
                    )

                    if center_id:
                        center = EducationCenter.objects.filter(pk=center_id).first()
                        if center:
                            CenterMembership.objects.create(
                                user=new_user,
                                center=center,
                                role=roles_list[0],
                                status=CenterMembership.STATUS_APPROVED,
                            )

                    created_users.append({
                        'id': new_user.id,
                        'full_name': new_user.full_name,
                        'phone': new_user.phone,
                        'roles': new_user.roles,
                        # Admin qatorda parol bergan bo'lsa qaytarmaymiz — u
                        # allaqachon biladi. Generatsiya qilingani esa BOSHQA
                        # hech qayerda o'qib bo'lmaydi.
                        'generated_password': None if given_password else password,
                    })
            except Exception as exc:
                errors.append(f"Qator {idx+1} ({full_name}): Xatolik - {exc}")

        logger.info(
            'bulk_import_users: %s created, %s errors (task=%s)',
            len(created_users), len(errors), task_id,
        )
        set_ai_task_result(BULK_IMPORT_TASK_PREFIX, task_id, {
            'created_count': len(created_users),
            'errors_count': len(errors),
            'created_users': created_users,
            'errors': errors,
        })
    except Exception as exc:
        logger.exception('Ommaviy import task xatosi task=%s', task_id)
        set_ai_task_failed(
            BULK_IMPORT_TASK_PREFIX, task_id,
            str(exc) or "Importni yakunlab bo'lmadi",
        )


# ─── Sekin AI (Gemini) endpointlari — Celery task'lari ──────────────────────
#
# Quyidagi uchta task avval mos view'lar ichida SINXRON bajarilardi: har biri
# `_gemini_models()` (6 ta model) × API kalitlar bo'yicha 45s timeout bilan
# urinardi, ya'ni eng yomon holatda bir necha daqiqa gunicorn thread'ini
# bloklardi. Endi PDF import oqimidagi naqsh: view validatsiyani bajarib
# `task_id` qaytaradi, frontend `<endpoint>/<task_id>/status/` ni polling qiladi
# (kesh yordamchilari — `questions.ai_task_status`).

STUDY_PLAN_TASK_PREFIX = 'study_plan'
PREP_PLAN_TASK_PREFIX = 'prep_plan'
AI_AUDIO_TASK_PREFIX = 'ai_audio'


@shared_task(name='accounts.generate_study_plan')
def generate_study_plan_task(task_id, user_id, weak_subjects, perf):
    """AI haftalik o'quv rejasi (`POST /api/me/study-plan/`)."""
    from questions.ai_task_status import set_ai_task_failed, set_ai_task_result

    from .models import User
    from .views_student import _generate_study_plan_ai

    logger = logging.getLogger(__name__)
    try:
        user = User.objects.filter(pk=user_id).first()
        plan = _generate_study_plan_ai(
            getattr(user, 'full_name', '') or 'Oʻquvchi',
            weak_subjects or [],
            perf or {},
        )
        # T5: AI reja generatsiyasini menejer faoliyat logiga yozamiz (markaz bo'lsa).
        try:
            from centers.models import ManagerActivityLog
            from centers.services import log_manager_activity, primary_center_for_user
            center = primary_center_for_user(user) if user else None
            if center is not None:
                log_manager_activity(
                    center, user, ManagerActivityLog.ACTION_SEND_PLAN,
                    description="O'quv rejasi (AI) generatsiya qilindi",
                    target_user=user,
                )
        except Exception:
            logger.exception('manager activity log failed for user=%s', user_id)
        set_ai_task_result(STUDY_PLAN_TASK_PREFIX, task_id, {
            'plan': plan,
            'weak_subjects': (weak_subjects or [])[:5],
        })
    except Exception as exc:
        logger.exception('AI o\'quv rejasi task xatosi task=%s', task_id)
        set_ai_task_failed(
            STUDY_PLAN_TASK_PREFIX, task_id,
            str(exc) or "Rejani olib bo'lmadi",
        )


@shared_task(name='accounts.generate_prep_plan')
def generate_prep_plan_task(task_id, olympiad_id, days_left, plan_days, focus_subjects, perf):
    """Olimpiadaga AI tayyorgarlik rejasi (`POST /api/me/olympiad-prep-plan/`)."""
    from olympiads.models import Olympiad
    from questions.ai_task_status import set_ai_task_failed, set_ai_task_result

    from .views_me_premium import _generate_prep_plan_ai

    logger = logging.getLogger(__name__)
    try:
        olympiad = Olympiad.objects.filter(pk=olympiad_id).first()
        if not olympiad:
            set_ai_task_failed(PREP_PLAN_TASK_PREFIX, task_id, 'Olimpiada topilmadi')
            return
        daily_plan = _generate_prep_plan_ai(
            olympiad.title, focus_subjects or [], plan_days, perf or {},
        )
        set_ai_task_result(PREP_PLAN_TASK_PREFIX, task_id, {
            'olympiad_id': olympiad.id,
            'olympiad_name': olympiad.title,
            'days_left': days_left,
            'focus_subjects': focus_subjects or [],
            'daily_plan': daily_plan,
        })
    except Exception as exc:
        logger.exception('AI tayyorgarlik rejasi task xatosi task=%s', task_id)
        set_ai_task_failed(
            PREP_PLAN_TASK_PREFIX, task_id,
            str(exc) or "Tayyorgarlik rejasini olib bo'lmadi",
        )


@shared_task(name='accounts.send_ai_audio_analysis')
def send_ai_audio_analysis_task(task_id, user_id, attempt_id):
    """AI tahlilni Telegram orqali yuboradi (`POST /api/me/ai-audio-analysis/`).

    Bu task ikkita sekin ishni birlashtiradi: Gemini tahlili (mavjud bo'lmasa)
    va Telegram sendVoice/sendMessage (20s timeout) — ikkalasi ham avval bitta
    so'rov ichida ketma-ket bajarilardi.

    Natijadagi yuborish holati `delivery_status` kalitida ('sent' | 'text_only')
    — polling konverti `status` kalitini (PENDING/COMPLETED/FAILED) egallaydi.
    """
    from attempts.models import AttemptAIAnalysis, TestAttempt
    from questions.ai_generation import analyze_attempt_ai
    from questions.ai_task_status import set_ai_task_failed, set_ai_task_result

    from .models import User
    from .views_me_premium import _try_send_voice

    logger = logging.getLogger(__name__)
    try:
        user = User.objects.filter(pk=user_id).first()
        attempt = (
            TestAttempt.objects
            .filter(pk=attempt_id, user_id=user_id)
            .select_related('olympiad')
            .first()
        )
        if not user or not attempt:
            set_ai_task_failed(AI_AUDIO_TASK_PREFIX, task_id, 'Urinish topilmadi')
            return

        # Avval saqlangan AI tahlil bor bo'lsa undan foydalanamiz (qayta
        # generatsiya qilmaymiz — Gemini chaqiruvini tejaymiz).
        analysis = AttemptAIAnalysis.objects.filter(attempt=attempt).first()
        if analysis and analysis.status == AttemptAIAnalysis.STATUS_READY and analysis.analysis_text:
            analysis_text = analysis.analysis_text
        else:
            olympiad = attempt.olympiad
            summary = {
                'olympiad_title': olympiad.title if olympiad else '',
                'subject': olympiad.subject if olympiad else '',
                'score': attempt.score,
                'correct': attempt.correct_count,
                'wrong': attempt.wrong_count,
                'total': attempt.total_questions,
            }
            mistakes = []
            if olympiad:
                from attempts.views import _build_attempt_mistakes
                mistakes = _build_attempt_mistakes(attempt, olympiad, attempt.answers or {})
            analysis_text = analyze_attempt_ai(summary, mistakes)

        # gTTS mavjud bo'lsa audio (voice) yuboramiz, aks holda matn.
        if _try_send_voice(user.telegram_chat_id, analysis_text):
            set_ai_task_result(AI_AUDIO_TASK_PREFIX, task_id, {
                'delivery_status': 'sent',
                'message': 'Audio tahlil Telegram orqali yuborildi.',
            })
            return

        from notifications.services import _send_telegram_to_user
        ok = _send_telegram_to_user(user, f"🎓 Olympy AI tahlil:\n\n{analysis_text}")
        set_ai_task_result(AI_AUDIO_TASK_PREFIX, task_id, {
            'delivery_status': 'text_only',
            'message': (
                "Tahlil matn ko'rinishida yuborildi (audio mavjud emas)."
                if ok else
                "Tahlil tayyor, lekin Telegram yuborishda muammo bo'ldi."
            ),
        })
    except Exception as exc:
        logger.exception('AI audio tahlil task xatosi task=%s', task_id)
        set_ai_task_failed(
            AI_AUDIO_TASK_PREFIX, task_id,
            str(exc) or "AI tahlilni yuborib bo'lmadi",
        )


# ─────────────────────────────────────────────────────────────────────────────
# Avtomatik moderatsiya (anti-cheat) sweep'i
# ─────────────────────────────────────────────────────────────────────────────
AUTO_MODERATION_RULES_CACHE_KEY = 'olympy_auto_moderation_rules'
# Sweep faqat shu oynadagi urinishlarni ko'radi — teg qo'yish takroran
# ishlagani uchun eski urinishlarni qayta-qayta tekshirishning hojati yo'q.
AUTO_MODERATION_WINDOW_DAYS = 7
DEFAULT_AUTO_MODERATION_RULES = {
    'auto_flag_speedrun': True,
    'speedrun_seconds_threshold': 3.0,
    'auto_flag_score_jump': True,
    'score_jump_delta_threshold': 45,
    'auto_tag_shared_ip': True,
    'shared_ip_account_limit': 5,
}


def get_auto_moderation_rules():
    """Joriy avtomatik moderatsiya qoidalari (default'lar ustiga cache).

    CHEKLOV: qoidalar hozircha faqat Django cache'da saqlanadi. `REDIS_URL`
    o'rnatilmaganda cache — LocMemCache, ya'ni har bir gunicorn/celery
    jarayonining o'z nusxasi bo'ladi: admin panelda o'zgartirilgan qoida
    rejalashtirilgan sweep'ga yetib bormaydi va default'lar ishlatiladi
    (cache eviction/restartdan keyin ham shunday). To'liq yechim —
    qoidalarni alohida DB modelida saqlash (model + migratsiya + panel
    o'zgarishi), bu esa alohida ish sifatida qoldirildi.
    """
    from django.core.cache import cache

    rules = dict(DEFAULT_AUTO_MODERATION_RULES)
    rules.update(cache.get(AUTO_MODERATION_RULES_CACHE_KEY) or {})
    return rules


def run_auto_moderation_sweep():
    """Qoidalar bo'yicha teglash sweep'i. `(actions_taken, tagged_user_ids)`.

    Admin paneldagi "Tekshiruvni ishga tushirish" tugmasi ham, soatlik
    Celery Beat jadvali ham AYNAN shu funksiyani chaqiradi — natija ikki
    yo'lda bir xil bo'lishi uchun.
    """
    from collections import defaultdict

    from django.contrib.auth import get_user_model

    from attempts.models import TestAttempt

    from .security_queries import (
        SCORE_JUMP_MAX_PAST_AVERAGE,
        get_ip_account_ids,
        get_shared_ip_accounts,
        score_jump_past_average,
    )

    User = get_user_model()
    rules = get_auto_moderation_rules()
    actions_taken = []
    tagged_user_ids = []
    since = timezone.now() - timedelta(days=AUTO_MODERATION_WINDOW_DAYS)

    # 1. Bir xil IP ortidagi hisoblarga 'Shubhali' tegi
    if rules.get('auto_tag_shared_ip'):
        shared_ips = get_shared_ip_accounts(
            min_accounts=rules.get('shared_ip_account_limit', 5),
            window_days=AUTO_MODERATION_WINDOW_DAYS,
        )
        for row in shared_ips[:10]:
            u_ids = get_ip_account_ids(row['ip_address']).keys()
            for u in User.objects.filter(pk__in=u_ids):
                tags = list(u.admin_tags or [])
                if 'Shubhali' not in tags and 'Multi-Account' not in tags:
                    tags.append('Shubhali')
                    u.admin_tags = tags
                    u.save(update_fields=['admin_tags'])
                    tagged_user_ids.append(u.id)
                    actions_taken.append(
                        f"{u.full_name} ({u.phone}) ga 'Shubhali' tegi berildi "
                        f"(IP: {row['ip_address']})"
                    )

    # 2. Speedrun urinishlari
    if rules.get('auto_flag_speedrun'):
        sec_thresh = rules.get('speedrun_seconds_threshold', 3.0)
        fast_attempts = TestAttempt.objects.filter(
            submitted_at__gte=since,
            score__gte=80,
            disqualified=False,
        ).select_related('user', 'olympiad').order_by('-submitted_at')[:50]

        for att in fast_attempts:
            q_cnt = att.total_questions or 10
            if att.time_spent and (att.time_spent / q_cnt) < sec_thresh:
                tags = list(att.user.admin_tags or [])
                if 'Speedrunner' not in tags:
                    tags.append('Speedrunner')
                    att.user.admin_tags = tags
                    att.user.save(update_fields=['admin_tags'])
                    tagged_user_ids.append(att.user_id)
                    actions_taken.append(
                        f"{att.user.full_name} ga 'Speedrunner' tegi biriktirildi "
                        f"({att.olympiad.title})"
                    )

    # 3. Score Jump urinishlari — mezon `admin_anomalies_detection` bilan bir
    # xil (`score_jump_past_average`), farqi: delta chegarasi qoidalardan
    # olinadi. O'rtacha AYNAN shu oyna ichidagi urinishlardan hisoblanadi.
    if rules.get('auto_flag_score_jump'):
        jump_thresh = rules.get('score_jump_delta_threshold', 45)
        high_attempts = list(
            TestAttempt.objects.filter(
                submitted_at__gte=since,
                score__gte=85,
                disqualified=False,
            ).select_related('user', 'olympiad').order_by('-submitted_at')[:50]
        )
        history = defaultdict(list)
        if high_attempts:
            for row in TestAttempt.objects.filter(
                user_id__in={att.user_id for att in high_attempts},
                submitted_at__gte=since,
                disqualified=False,
            ).values('id', 'user_id', 'score', 'submitted_at'):
                history[row['user_id']].append(
                    (row['id'], row['score'], row['submitted_at'])
                )

        for att in high_attempts:
            past = score_jump_past_average(
                att.id, att.submitted_at, history[att.user_id],
            )
            if not past:
                continue
            avg_past, _past_count = past
            jump = att.score - avg_past
            if avg_past >= SCORE_JUMP_MAX_PAST_AVERAGE or jump < jump_thresh:
                continue
            tags = list(att.user.admin_tags or [])
            if 'Score Jump' not in tags:
                tags.append('Score Jump')
                att.user.admin_tags = tags
                att.user.save(update_fields=['admin_tags'])
                tagged_user_ids.append(att.user_id)
                actions_taken.append(
                    f"{att.user.full_name} ga 'Score Jump' tegi biriktirildi "
                    f"(o'rtacha {round(avg_past, 1)}% → {att.score}%, {att.olympiad.title})"
                )

    return actions_taken, tagged_user_ids


@shared_task(name='accounts.auto_moderation_sweep')
def auto_moderation_sweep():
    """Soatlik avtomatik moderatsiya tekshiruvi (Celery Beat).

    Avval bu mantiq FAQAT admin paneldagi "Tekshiruvni ishga tushirish"
    tugmasi bosilganda ishlardi — ya'ni "avtomatik" qoidalar hech qachon
    o'z-o'zidan ishlamasdi. Jadval `moderation.detect_suspicious_activity`
    bilan bir xil (soatiga bir marta).

    AuditLog yozilmaydi: `AuditLog.log()` `request` (aktor, IP) talab qiladi,
    bu yerda esa aktor yo'q — `moderation.detect_suspicious_activity` dagi
    bilan bir xil sabab. Qo'lda ishga tushirilgan tekshiruv esa avvalgidek
    `admin_auto_moderation_run` yozuvini qoldiradi.
    """
    logger = logging.getLogger(__name__)
    actions_taken, tagged_user_ids = run_auto_moderation_sweep()
    if actions_taken:
        logger.info(
            'auto_moderation_sweep: %s ta chora, %s ta hisob teglandi',
            len(actions_taken), len(set(tagged_user_ids)),
        )
    return {
        'actions_count': len(actions_taken),
        'tagged_user_ids': tagged_user_ids,
    }
