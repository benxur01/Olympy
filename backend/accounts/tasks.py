"""Periodic background tasks for the accounts app."""
import random
from datetime import timedelta

from celery import shared_task
from django.db.models import Avg, Count, Max, Q
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


@shared_task
def send_monthly_report_pdf_telegram_task(chat_id, student_id, filename_tg, caption_tg):
    """Generate child's monthly PDF report and send it to parent via Telegram."""
    from django.contrib.auth import get_user_model
    from accounts.reports import generate_monthly_report_pdf
    from notifications.services import send_pdf_to_telegram
    User = get_user_model()
    try:
        student = User.objects.get(pk=student_id)
        pdf_bytes = generate_monthly_report_pdf(student)
        send_pdf_to_telegram(chat_id, pdf_bytes, filename_tg, caption_tg)
        return f"Successfully sent PDF report for student {student_id} to chat {chat_id}"
    except Exception as e:
        import logging
        logging.getLogger(__name__).exception("Failed to send monthly report to telegram in celery task")
        return f"Error sending PDF report: {str(e)}"


@shared_task
def send_telegram_markdown_task(chat_id, msg):
    """Send markdown weekly digest message to parent via Telegram."""
    from notifications.services import send_telegram_markdown
    try:
        send_telegram_markdown(chat_id, msg)
        return f"Successfully sent weekly digest markdown to chat {chat_id}"
    except Exception as e:
        import logging
        logging.getLogger(__name__).exception("Failed to send telegram markdown in celery task")
        return f"Error sending markdown: {str(e)}"


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


@shared_task(name='accounts.generate_daily_questions')
def generate_daily_questions(count=DAILY_QUESTION_COUNT):
    """DH1: Bugungi `count` ta kunlik savolni tanlaydi (idempotent).

    `generate_daily_questions` management command logikasining Celery beat
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
    candidate_ids = list(
        Question.objects.exclude(id__in=used_ids).values_list('id', flat=True)
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


@shared_task(name='accounts.send_weekly_parent_reports')
def send_weekly_parent_reports():
    """O6: Ota-onalarga farzandning haftalik hisobotini Telegram orqali yuboradi.

    `send_weekly_parent_reports` management command logikasining Celery beat
    varianti. Tasdiqlangan va digest yoqilgan har bir ota-ona-farzand
    bog'lanishi uchun oxirgi 7 kunlik statistikani yuboradi.
    """
    from accounts.models import ParentStudentLink
    from attempts.models import TestAttempt

    week_ago = timezone.now() - timedelta(days=7)

    links = (
        ParentStudentLink.objects
        .filter(is_confirmed=True, weekly_digest_enabled=True)
        .select_related('parent', 'student')
    )

    sent = 0
    skipped = 0
    for link in links:
        parent = link.parent
        student = link.student
        chat_id = getattr(parent, 'telegram_chat_id', '')
        if not chat_id:
            skipped += 1
            continue

        agg = TestAttempt.objects.filter(
            user=student, disqualified=False, submitted_at__gte=week_ago,
        ).aggregate(avg=Avg('score'), best=Max('score'), total=Count('id'))

        olympiads_count = agg['total'] or 0
        avg_score = round(agg['avg'] or 0, 1)
        best_score = agg['best'] or 0
        streak = student.streak_count or 0
        name = student.full_name or 'Farzandingiz'

        msg = (
            f"📊 Haftalik hisobot: {name}\n"
            f"📝 Olimpiadalar: {olympiads_count} ta\n"
            f"⭐ O'rtacha ball: {avg_score}%\n"
            f"🔥 Streak: {streak} kun\n"
            f"🏆 Eng yaxshi natija: {best_score}%"
        )

        try:
            from notifications.services import send_telegram_markdown
            send_telegram_markdown(chat_id, msg)
            sent += 1
        except Exception:
            import logging
            logging.getLogger(__name__).exception(
                'weekly parent report failed for parent=%s student=%s',
                parent.id, student.id,
            )
            skipped += 1

    return f'weekly reports: {sent} sent, {skipped} skipped'

