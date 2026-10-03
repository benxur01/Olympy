"""Phone normalization helpers — must mirror the frontend rules in store.jsx.

The platform rule: one phone number = one account. The same number written in
many shapes must be treated as identical.

Examples that all collapse to ``+998901234567``:
    +998 90 123 45 67
    +998901234567
    998901234567
    90 123 45 67
    (90) 123-45-67
"""
import base64
import hashlib
import logging
import re
import uuid


logger = logging.getLogger(__name__)


# ─── TOTP secret shifrlash ────────────────────────────────────────────────────
# 2FA maxfiy kaliti (`totp_secret`) DB'da OCHIQ (plaintext) saqlanmasligi kerak:
# DB dump sizib chiqsa barcha 2FA kalitlari ochiq qolardi. Shuning uchun uni
# Fernet (symmetric AES) bilan shifrlab saqlaymiz. Shifrlash kaliti:
#   1) `TOTP_ENCRYPTION_KEY` env var (agar berilgan bo'lsa) — to'g'ridan-to'g'ri
#      Fernet kaliti (url-safe base64, 32 bayt) sifatida ishlatiladi; yoki
#   2) aks holda Django `SECRET_KEY` dan SHA-256 orqali derivatsiya qilinadi.
# Fernet aniq 32-baytli url-safe base64 kalit talab qiladi — SECRET_KEY har
# qanday uzunlikda bo'lishi mumkin, shuning uchun uni xeshlab normallashtiramiz.


def _totp_fernet():
    """`cryptography.fernet.Fernet` nusxasini qaytaradi.

    `cryptography` paketi o'rnatilmagan bo'lsa ImportError ko'taradi —
    chaqiruvchilar (encrypt/decrypt) buni ushlab graceful fallback qiladi.
    """
    from cryptography.fernet import Fernet  # lazy import

    from django.conf import settings

    explicit = getattr(settings, 'TOTP_ENCRYPTION_KEY', None)
    if explicit:
        key = explicit.encode() if isinstance(explicit, str) else explicit
    else:
        # SECRET_KEY'dan barqaror 32-baytli kalit derivatsiya qilamiz.
        digest = hashlib.sha256(settings.SECRET_KEY.encode('utf-8')).digest()
        key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


def encrypt_totp_secret(plaintext):
    """TOTP maxfiy kalitini shifrlaydi (DB'ga yozishdan oldin).

    Bo'sh qiymat bo'sh qaytadi (2FA o'chirilgan holat). Shifrlash imkonsiz
    bo'lsa (paket yo'q) — kalit yo'qotilmasin uchun ochiq saqlanadi (orqaga
    moslik); bunday holat production'da bo'lmasligi kerak.
    """
    if not plaintext:
        return ''
    try:
        return _totp_fernet().encrypt(str(plaintext).encode('utf-8')).decode('ascii')
    except Exception:
        return str(plaintext)


def decrypt_totp_secret(stored):
    """DB'dan o'qilgan shifrlangan TOTP kalitini ochadi.

    Bo'sh bo'lsa bo'sh qaytadi. Shifrni ochib bo'lmasa (eski migratsiya
    qilinmagan plaintext qiymat yoki noto'g'ri kalit) — qiymatni o'zini
    qaytaramiz, shunda migratsiyadan oldin yoki kalit muammosida 2FA butunlay
    ishdan chiqmaydi (eski plaintext base32 kalit pyotp uchun yaroqli qoladi).
    """
    if not stored:
        return ''
    try:
        return _totp_fernet().decrypt(str(stored).encode('ascii')).decode('utf-8')
    except Exception:
        return str(stored)


# ─── TOTP kodini bir martalik qilib tekshirish ────────────────────────────────
# `valid_window=1` bilan bitta kod ~90 soniya (oldingi + joriy + keyingi
# time-step) davomida yaroqli bo'ladi. Qaysi step ishlatilgani eslab
# qolinmasa, kod o'sha oyna ichida QAYTA ishlatilishi mumkin: yelka ortidan
# ko'rilgan, log/proxy'da qolgan yoki phishing sahifasida ushlangan kod
# bilan tajovuzkor ikkinchi amalni bajara oladi.
#
# Yechim: oxirgi MUVAFFAQIYATLI time-step raqamini cache'da saqlaymiz va undan
# kichik yoki TENG step bilan kelgan kodni rad etamiz. Saqlash uchun DB maydoni
# EMAS, cache tanlandi: qiymat bor-yo'g'i bir necha o'nlab soniya kerak
# (login lockout hisoblagichi bilan bir xil yondashuv), migratsiya talab
# qilmaydi va har 2FA tekshiruvida DB'ga yozishdan qutqaradi.
TOTP_USED_STEP_CACHE_PREFIX = 'totp_used_step:'


def verify_totp_code(user, code, valid_window=1):
    """TOTP kodini tekshiradi va uni "ishlatilgan" deb belgilaydi (replay himoyasi).

    `pyotp.TOTP(...).verify(code, valid_window=1)` o'rniga ishlatiladi:
    tekshiruvdan tashqari qaysi time-step mos kelganini aniqlaydi va o'sha
    step (yoki undan eskisi) bilan ikkinchi marta kelgan kodni rad etadi.

    Taqqoslash `pyotp.utils.strings_equal` bilan — `verify()` ning o'zi ham
    aynan shuni ishlatadi (doimiy vaqtli, timing side-channel yo'q).

    Cache o'chib qolsa (Redis restart, locmem tozalanishi) eng yomon holatda
    xulq avvalgi holatga qaytadi — ya'ni bu himoya hech qachon halol
    foydalanuvchini bloklamaydi.
    """
    import time as _time

    import pyotp
    from django.core.cache import cache

    secret = getattr(user, 'totp_secret', '')
    code = str(code or '').strip()
    if not secret or not code:
        return False

    totp = pyotp.TOTP(secret)
    interval = totp.interval or 30
    now = int(_time.time())
    matched_step = None
    for offset in range(-valid_window, valid_window + 1):
        for_time = now + offset * interval
        if pyotp.utils.strings_equal(code, totp.at(for_time)):
            matched_step = for_time // interval
            break
    if matched_step is None:
        return False

    cache_key = f'{TOTP_USED_STEP_CACHE_PREFIX}{user.pk}'
    last_step = cache.get(cache_key)
    if last_step is not None and matched_step <= int(last_step):
        return False
    # TTL — butun yaroqlilik oynasidan bir step uzunroq: undan keyin bu kod
    # baribir eskiradi va yozuvni saqlashning ma'nosi qolmaydi.
    cache.set(cache_key, int(matched_step), interval * (2 * valid_window + 2))
    return True


# ─── User-scoped cache helpers ────────────────────────────────────────────────
# Bashorat (predictions) va obuna (subscription) holatlari har HTTP so'rovda
# DB aggregate/filter talab qiladi. Bularni qisqa muddatli cache'da saqlaymiz
# va tegishli ma'lumot o'zgarganda (yangi attempt, obuna o'zgarishi) bekor
# qilamiz. Kalitlar markazda — invalidatsiya har joyda bir xil bo'lsin.

def predictions_cache_key(user_id):
    return f"user_predictions_{user_id}"


def subscription_cache_key(user_id):
    return f"user_subscription_{user_id}"


def invalidate_user_predictions_cache(user_id):
    """Foydalanuvchi natijalari o'zgarganda bashorat cache'ini tozalaydi."""
    if not user_id:
        return
    try:
        from django.core.cache import cache
        cache.delete(predictions_cache_key(user_id))
    except Exception:
        pass


def invalidate_user_subscription_cache(user_id):
    """Obuna holati o'zgarganda (premium berildi/bekor qilindi) cache tozalanadi."""
    if not user_id:
        return
    try:
        from django.core.cache import cache
        cache.delete(subscription_cache_key(user_id))
        cache.delete(premium_realtime_cache_key(user_id))
    except Exception:
        pass


def invalidate_user_subscription_caches(user_ids):
    """`invalidate_user_subscription_cache` ning toplu varianti.

    Ommaviy premium amali minglab hisobga tegishi mumkin — har biri uchun
    alohida `cache.delete()` shuncha Redis borib-kelishini anglatardi.
    """
    if not user_ids:
        return
    try:
        from django.core.cache import cache
        keys = []
        for user_id in user_ids:
            keys.append(subscription_cache_key(user_id))
            keys.append(premium_realtime_cache_key(user_id))
        cache.delete_many(keys)
    except Exception:
        pass


def premium_realtime_cache_key(user_id):
    return f"user_premium_rt_{user_id}"


# is_user_premium natijasi qisqa muddat keshlanadi — premium-only endpoint'lar
# har so'rovda DB'ga subscription query yubormasin.
PREMIUM_CHECK_CACHE_TTL = 60


def is_user_premium(user):
    """Premium holatini real vaqtda tekshiradi (60 soniyalik cache bilan).

    `user.is_premium` flag'i obuna muddati tugaganda darhol yangilanmaydi
    (`accounts.expire_stale_premium` task kuniga bir marta yuradi, /me lazy
    expiry esa faqat /me so'rovida ishlaydi). Premium-only endpoint'lar shu
    helper orqali flag + obuna holatini tekshiradi — muddati o'tgan (lekin
    hali sync qilinmagan) obuna bilan premium imkoniyat ochilmaydi.

    MUHIM: premium har doim ham UserSubscription yozuvi bilan berilmaydi —
    eski admin toggle (duration'siz), Django admin'dagi is_premium checkbox
    va ensure_manager komandasi faqat flag'ni o'rnatadi. Bunday foydalanuvchida
    aktiv obuna yozuvi umuman bo'lmaydi; /me lazy expiry ham flag'ni
    o'chirmaydi (frontend premium deb ko'rsatadi). Avval bu yerda
    `exists()` talab qilinardi — natijada frontend premium deb so'rov
    yuborar, backend esa 403 qaytarib, "Tarixim"da "Ba'zi ma'lumotlar
    yuklanmadi" xatosi chiqardi. Endi: aktiv obuna yozuvi YO'Q bo'lsa
    flag'ga ishonamiz; yozuv BOR bo'lsa kamida bittasining muddati
    o'tmagan bo'lishi shart (real-time himoya saqlanadi).
    """
    if user is None or not getattr(user, 'is_authenticated', True):
        return False
    if not getattr(user, 'is_premium', False):
        return False
    try:
        from django.core.cache import cache
        key = premium_realtime_cache_key(user.id)
        cached = cache.get(key)
        if cached is not None:
            return bool(cached)
    except Exception:
        cache = None
    from django.utils import timezone
    now = timezone.now()
    end_dates = list(
        user.subscriptions.filter(is_active=True).values_list('end_date', flat=True)
    )
    if end_dates:
        # Aktiv obuna yozuvlari bor — kamida bittasi hali amal qilishi kerak.
        active = any(ed and ed > now for ed in end_dates)
    else:
        # Aktiv obuna yozuvi yo'q, lekin is_premium=True — bu legacy/manual
        # grant (admin toggle, Django admin checkbox) yoki 1 oylik sinov
        # muddati. Ikkala holatda ham flag'ga ishonamiz: sinov tugaganida flag
        # /me lazy-expiry va Celery task tomonidan False qilinadi, shu sababli
        # bu yerda alohida trial muddatini tekshirib manual grant'larni xato
        # rad etmaymiz.
        active = True
    if cache is not None:
        try:
            cache.set(key, 1 if active else 0, PREMIUM_CHECK_CACHE_TTL)
        except Exception:
            pass
    return active


# ─── Premium berish / bekor qilish ────────────────────────────────────────────
# Bitta foydalanuvchilik admin toggle (`admin_toggle_user_premium`) ham,
# "barcha o'quvchilarga" ommaviy amali ham AYNAN shu ikki funksiyani chaqiradi
# — semantika (eski obunani yopish, yangi yozuv yaratish, markaz bayrog'i,
# sinov muddatini so'ndirish) bitta joyda turadi.
#
# Ikkalasi ham id RO'YXATI ustida to'plamli (set-based) SQL bilan ishlaydi:
# foydalanuvchilar soni bir bo'ladimi, o'n ming bo'ladimi — so'rovlar soni
# o'zgarmaydi (`bulk_create` paketlari bundan mustasno).

# `UserSubscription.end_date` NOT NULL, shu sababli "umrbod" premium juda
# uzoq kelajakdagi sana bilan ifodalanadi — barcha `end_date > now`
# taqqoslashlari (is_premium sync, /me lazy expiry, billing) uni doim amal
# qiluvchi deb sanaydi.
PREMIUM_LIFETIME_DAYS = 365 * 100

# `0` — umrbod; qolganlari kun hisobida. `-1` (bekor qilish) bu yerda yo'q,
# uni `revoke_premium` bajaradi.
PREMIUM_GRANT_DURATIONS = (30, 90, 180, 365, 0)

PREMIUM_BULK_BATCH_SIZE = 500


def resolve_premium_plan(duration, plan_type, plan_name=None):
    """Muddat va tarifga mos `SubscriptionPlan` (topilmasa `None`).

    Mos plan topilmasligi xato emas: obuna `plan=None` bilan ham yaratiladi va
    premium bayroqlari baribir qo'yiladi.
    """
    from billing.models import SubscriptionPlan

    if duration == 0:
        return SubscriptionPlan.objects.filter(
            plan_type=plan_type, is_active=True,
        ).order_by('-duration_days').first()
    plan = None
    if plan_name:
        plan = SubscriptionPlan.objects.filter(
            plan_type=plan_type,
            duration_days=duration,
            name__istartswith=plan_name,
            is_active=True,
        ).first()
    if not plan:
        plan = SubscriptionPlan.objects.filter(
            plan_type=plan_type, duration_days=duration, is_active=True,
        ).order_by('-price').first()
    return plan


def grant_premium(user_ids, duration, plan_type='student', plan_name=None):
    """Berilgan hisoblarga premium beradi. Qaytaradi: ta'sirlangan hisoblar soni.

    `duration` — `PREMIUM_GRANT_DURATIONS` dan biri (`0` — umrbod).
    """
    from django.contrib.auth import get_user_model
    from django.db import transaction
    from django.utils import timezone
    from datetime import timedelta

    from billing.models import UserSubscription
    from centers.models import EducationCenter

    user_ids = list(user_ids)
    if not user_ids:
        return 0

    User = get_user_model()
    now = timezone.now()
    days = PREMIUM_LIFETIME_DAYS if duration == 0 else duration
    end_date = now + timedelta(days=days)
    plan = resolve_premium_plan(duration, plan_type, plan_name)

    with transaction.atomic():
        # Bir nechta aktiv obuna /me lazy-expiry mantig'ini chalkashtiradi —
        # yangisini yaratishdan oldin eskilarini yopamiz.
        UserSubscription.objects.filter(user_id__in=user_ids, is_active=True).update(
            is_active=False, end_date=now,
        )
        UserSubscription.objects.bulk_create(
            [
                UserSubscription(
                    user_id=user_id,
                    plan=plan,
                    start_date=now,
                    end_date=end_date,
                    is_active=True,
                )
                for user_id in user_ids
            ],
            batch_size=PREMIUM_BULK_BATCH_SIZE,
        )
        # `bulk_create` `save()` ni chaqirmaydi, ya'ni
        # `UserSubscription.sync_premium_status()` ishlamaydi — bayroqlarni
        # o'zimiz qo'yamiz.
        User.objects.filter(id__in=user_ids).update(is_premium=True)
        # Markaz bayrog'i: tashkilot obunasida sync o'zi qo'yardi; umrbodda esa
        # plan_type'dan qat'i nazar qo'yiladi (aks holda 'student' plan bilan
        # umrbod olgan markaz egasi markaz premiumisiz qolardi).
        if duration == 0 or (plan and plan.plan_type == 'organization'):
            EducationCenter.objects.filter(owner_id__in=user_ids).update(is_premium=True)

    invalidate_user_subscription_caches(user_ids)
    return len(user_ids)


def revoke_premium(user_ids):
    """Berilgan hisoblardan premiumni olib tashlaydi. Qaytaradi: hisoblar soni."""
    from django.contrib.auth import get_user_model
    from django.db import transaction
    from django.utils import timezone

    from billing.models import UserSubscription
    from centers.models import EducationCenter

    user_ids = list(user_ids)
    if not user_ids:
        return 0

    User = get_user_model()
    now = timezone.now()

    with transaction.atomic():
        User.objects.filter(id__in=user_ids).update(is_premium=False)
        # Sinov muddati hali tugamagan bo'lsa `is_premium_active`
        # (is_premium OR trial_active) hamon True qaytarardi va foydalanuvchi
        # bekor qilingandan keyin ham Premium bo'lib ko'rinaverardi.
        User.objects.filter(id__in=user_ids, premium_trial_end__gt=now).update(
            premium_trial_end=now,
        )
        UserSubscription.objects.filter(user_id__in=user_ids, is_active=True).update(
            is_active=False, end_date=now,
        )
        EducationCenter.objects.filter(owner_id__in=user_ids).update(is_premium=False)

    invalidate_user_subscription_caches(user_ids)
    return len(user_ids)


def student_premium_targets(scope='grant'):
    """Ommaviy premium amali qamrab oladigan hisoblar (`student` rolli).

    `scope='grant'` — barcha o'quvchilar; `scope='revoke'` — hozir premiumi
    bor o'quvchilar (`User.is_premium_active` property'sining queryset
    varianti: bayroq YOKI amal qiluvchi sinov muddati).

    Platforma admini va staff hisoblari xavfsizlik to'ri sifatida chetlab
    o'tiladi — odatda ularda `student` roli bo'lmaydi, lekin himoya id
    ro'yxatiga asoslangan ommaviy amallardagi (`_resolve_bulk_targets`) bilan
    bir xil bo'lishi kerak. Rol filtri `roles__icontains` — `admin_users_list`
    dagi rol filtri bilan aynan bir xil lookup (`roles` — JSON ro'yxat).
    """
    from django.contrib.auth import get_user_model
    from django.db.models import Q
    from django.utils import timezone

    User = get_user_model()
    qs = User.objects.filter(roles__icontains='student').exclude(
        Q(is_platform_admin=True) | Q(is_staff=True) | Q(is_superuser=True)
    )
    if scope == 'revoke':
        now = timezone.now()
        qs = qs.filter(Q(is_premium=True) | Q(premium_trial_end__gt=now))
    return qs


# E.164 xalqaro raqam: '+' + davlat kodi + abonent raqami. ITU-T E.164
# bo'yicha raqamlar soni maksimal 15 ta (davlat kodi bilan birga). Minimal
# chegarani amaliy ravishda 8 ta raqam deb olamiz (eng qisqa milliy raqamlar).
E164_MIN_DIGITS = 8
E164_MAX_DIGITS = 15

# O'zbekiston raqamlari: davlat kodi 998 + 9 xonali abonent raqami.
UZ_COUNTRY_CODE = '998'
UZ_LOCAL_DIGITS = 9


def normalize_phone(raw):
    """Telefon raqamni kanonik E.164 (``+<davlat kodi><raqam>``) shaklga keltiradi.

    Qo'llab-quvvatlanadigan kiritmalar:

    - ``+`` bilan boshlangan xalqaro raqam (``+14155552671``,
      ``+998901234567``) — ``+`` saqlanadi, ortiqcha belgilar (bo'shliq,
      qavs, tire) tashlanadi. Raqamlar soni E.164 chegaralarida
      (8..15) bo'lishi shart.
    - ``998`` bilan boshlangan yoki 9 xonali O'zbekiston raqami
      (``998901234567``, ``901234567``, ``90 123 45 67``) — orqaga moslik
      uchun ``+998`` prefiksi qo'yiladi (davlat kodi ko'rsatilmagan deb
      hisoblanadi).

    Noto'g'ri/bo'sh raqam uchun ``''`` qaytaradi.
    """
    if raw is None:
        return ''
    text = str(raw).strip()
    if text.startswith('google_'):
        return text
    digits = re.sub(r'\D', '', text)
    if not digits:
        return ''

    # Foydalanuvchi aniq xalqaro raqam kiritgan ('+' bilan boshlanadi) —
    # davlat kodini saqlaymiz, faqat E.164 uzunlik chegarasini tekshiramiz.
    if text.startswith('+'):
        if E164_MIN_DIGITS <= len(digits) <= E164_MAX_DIGITS:
            return '+' + digits
        return ''

    # '+' yo'q. Orqaga moslik: O'zbekiston raqami deb hisoblaymiz.
    # 998 bilan boshlangan to'liq raqam yoki 9 xonali abonent raqami.
    if digits.startswith(UZ_COUNTRY_CODE) and len(digits) == len(UZ_COUNTRY_CODE) + UZ_LOCAL_DIGITS:
        return '+' + digits
    if len(digits) == UZ_LOCAL_DIGITS:
        return '+' + UZ_COUNTRY_CODE + digits

    # Boshqa hollarda ham eski xulqni saqlaymiz: oxirgi 9 raqamni
    # O'zbekiston abonent raqami deb olamiz (masalan '8 90 123 45 67').
    last9 = digits[-UZ_LOCAL_DIGITS:]
    if len(last9) == UZ_LOCAL_DIGITS and not digits.startswith(UZ_COUNTRY_CODE):
        return '+' + UZ_COUNTRY_CODE + last9
    return ''


def avatar_url_for(user, request=None):
    """Foydalanuvchi avatari uchun URL qaytaradi (bo'sh bo'lsa '').

    Bu helper barcha serializer/view'larda ishlatilishi uchun `request`
    kontekstidan mustaqil ishlaydi:

    - Cloudinary/S3 ishlatilganda `avatar.url` allaqachon to'liq absolyut
      URL (``https://...``) qaytaradi — o'shani o'zgartirmasdan beramiz.
    - Lokal FileSystem storage'da `avatar.url` nisbiy (``/media/avatars/..``)
      bo'ladi; `request` mavjud bo'lsa absolyut URL yasaymiz, aks holda
      nisbiy URL qaytaramiz (frontend uni API base bilan birlashtiradi).
    """
    avatar = getattr(user, 'avatar', None) if user is not None else None
    if not avatar:
        return ''
    try:
        url = avatar.url
    except Exception:
        return ''
    if not url:
        return ''
    # Allaqachon absolyut (Cloudinary/S3) bo'lsa o'zgartirmaymiz.
    if url.startswith('http://') or url.startswith('https://'):
        return url
    if request is not None:
        try:
            return request.build_absolute_uri(url)
        except Exception:
            return url
    return url


_UPLOAD_IMAGE_EXTENSIONS = {'JPEG': 'jpg', 'PNG': 'png', 'GIF': 'gif', 'WEBP': 'webp'}


def assign_safe_image_name(upload, image_format):
    """Yuklangan rasmga tasodifiy nom va Pillow aniqlagan formatdagi kengaytma beradi.

    Mijoz yuborgan nom saqlansa, Pillow tekshiruvidan o'tadigan poliglot (GIF
    sarlavhali HTML/JS) `.html`/`.js` nomi bilan yozilib, `/media/` dan sayt
    origin'ida shu turda berilardi — stored XSS. Format ro'yxatda bo'lmasa False.
    """
    ext = _UPLOAD_IMAGE_EXTENSIONS.get((image_format or '').upper())
    if not ext:
        return False
    upload.name = f'{uuid.uuid4().hex}.{ext}'
    return True


def delete_replaced_image_file(field_file, old_name):
    """Almashtirilgan rasm faylini storage'dan (disk yoki Cloudinary) o'chiradi.

    Rasm yangisiga ALMASHTIRILGANDA eski fayl storage'da yetim qolib ketardi —
    faqat "rasmni butunlay o'chirish" oqimi (`.delete(save=False)`) tozalardi.
    Render'da har deploy konteyner fayl tizimini yangilagani uchun bu
    ko'rinmasdi; doimiy VPS diskida esa yetim fayllar to'planib boradi.

    `field_file` — YANGI fayl SAQLANGANDAN keyingi maydon (`user.avatar`,
    `center.image` ...), `old_name` — almashtirishdan oldin olingan storage
    nomi. Chaqiruv save'dan KEYIN bo'lishi shart: saqlash xato bersa eski
    rasm joyida qoladi.

    `FieldFile.delete()` ataylab ishlatilmaydi: u `instance.<field>` ni ham
    None qilib qo'yadi va javobdagi yangi rasm yo'qolib ketardi. Nomlar teng
    bo'lsa (storage yangi faylni eskisining ustiga yozgan) hech narsa
    o'chirilmaydi — hali ishlatilayotgan fayl o'chib ketmasligi uchun.

    O'chirishning O'ZI `accounts.delete_storage_file` task'iga topshiriladi:
    Cloudinary yoqilganda `storage.delete()` tashqi API'ga tarmoq so'rovi
    bo'lib, so'rov-javob sikli ichida Gunicorn thread'ini (jami 6 ta) bloklardi
    (`send_telegram_message_task` bilan bir xil sabab va naqsh). Bu yerda faqat
    arzon tekshiruv qoladi. Lokal/dev'da broker bo'lmaganda
    `CELERY_TASK_ALWAYS_EAGER` tufayli task sinxron bajariladi — FileSystem
    storage'da o'chirish baribir bir zumda, eski xulq saqlanadi.

    Tozalash xatosi so'rovni buzmaydi (rasm allaqachon saqlangan) — faqat log.
    """
    if not old_name or old_name == (field_file.name or ''):
        return
    # Circular import oldini olish uchun lokal import (tasks → models → utils).
    from .tasks import delete_storage_file_task
    try:
        delete_storage_file_task.delay(old_name)
    except Exception:
        logger.warning(
            "eski rasm faylini o'chirish navbatga qo'yilmadi: %s",
            old_name, exc_info=True,
        )


def mask_phone(raw):
    """Telefon raqamni qisman yashirish: ``+998 ** *** 78 90`` formatida.

    Faqat oxirgi 4 raqam ko'rsatiladi — leaderboard/public endpoint'larda
    PII sizdirilishini kamaytiradi. To'liq raqam faqat profil egasi va
    admin uchun ochiq. Noto'g'ri/bo'sh raqam uchun bo'sh string qaytaradi.

    Xalqaro raqamlar uchun ham ishlaydi: davlat kodi (agar tanib olinsa)
    ochiq qoladi, oradagi raqamlar yulduzcha bilan yashiriladi, oxirgi 4 ta
    raqam ko'rsatiladi (masalan ``+1 ** *** 26 71``).

    Eslatma: bu DISPLAY-only maskalash — backend filtrlash, login va parol
    tiklash hamon to'liq normalized_phone bilan ishlaydi.
    """
    norm = normalize_phone(raw)
    if not norm:
        return ''
    digits = norm[1:]  # '+' tashlanadi
    # Davlat kodini ajratamiz: O'zbekiston (998) bo'lsa ochiq ko'rsatamiz,
    # aks holda birinchi 1-3 raqamni davlat kodi deb taxmin qilamiz.
    if digits.startswith(UZ_COUNTRY_CODE):
        cc = UZ_COUNTRY_CODE
    else:
        cc = digits[:max(1, len(digits) - 9)] if len(digits) > 9 else digits[:1]
    last4 = digits[-4:]
    return f"+{cc} ** *** {last4[:2]} {last4[2:]}"


def predict_success_ai(student_name, avg_score, attempts_count, subject_performance):
    """
    Generates a personalized AI success predictor report for a student in Uzbek.
    """
    from questions.ai_generation import _gemini_api_keys, _gemini_models
    import urllib.request, urllib.parse, json

    keys = _gemini_api_keys()
    if not keys:
        return "AI tahlil sozlanmagan."

    subj_str = ", ".join(f"{sub}: {avg}%" for sub, avg in subject_performance.items())
    prompt = (
        f"Siz professional ta'lim ekspertisiz. O'quvchi haqida quyidagi ma'lumotlar bor:\n"
        f"Ismi: {student_name}\n"
        f"O'rtacha bali: {avg_score}%\n"
        f"Jami topshirgan imtihonlari: {attempts_count} ta\n"
        f"Fanlar kesmidagi natijalari: {subj_str}\n\n"
        f"Ushbu ma'lumotlarga ko'ra, o'quvchining Prezident maktabiga kirish imtihonlari, Al-Xorazmiy olimpiadasi va DTM testlaridagi "
        f"tayyorgarlik darajasi va kelajakdagi muvaffaqiyati bo'yicha o'zbek tilida motivatsion tahlil va maslahatlar yozib bering. "
        f"O'quvchi qaysi mavzularda ko'proq shug'ullanishi kerakligi haqida aniq yo'l xaritasini ko'rsating.\n\n"
        f"Javobni faqat o'zbek tilida va formatlashda Markdown (masalan, ro'yxatlar, sarlavhalar, muhim qismlarini qalin qilish) ishlatib yozing."
    )

    payload = {
        'contents': [{
            'role': 'user',
            'parts': [{'text': prompt}],
        }],
        'generationConfig': {
            'maxOutputTokens': 2048,
        },
    }
    body = json.dumps(payload).encode('utf-8')

    for model in _gemini_models():
        model_path = urllib.parse.quote(model, safe='-_.~/')
        url = f'https://generativelanguage.googleapis.com/v1beta/models/{model_path}:generateContent'
        for api_key in keys:
            req = urllib.request.Request(
                url,
                data=body,
                method='POST',
                headers={
                    'Content-Type': 'application/json',
                    'x-goog-api-key': api_key,
                },
            )
            try:
                with urllib.request.urlopen(req, timeout=45) as response:
                    raw = json.loads(response.read().decode('utf-8'))
                parts = (((raw.get('candidates') or [{}])[0].get('content') or {}).get('parts') or [])
                text = ''.join(part.get('text') or '' for part in parts)
                if text.strip():
                    return text.strip()
            except Exception:
                pass
    return "Hozircha AI tahlilini yuklab bo'lmadi. Iltimos keyinroq qayta urinib ko'ring."

