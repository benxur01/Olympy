"""Periodic background tasks for the accounts app."""
from datetime import timedelta

from celery import shared_task
from django.db.models import Q
from django.utils import timezone

from .models import PhoneVerification


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

