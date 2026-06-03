"""Xavfsiz email yuborish yordamchilari.

DIQQAT: hozirgi User modelida `email` maydoni YO'Q (autentifikatsiya telefon
raqami orqali ishlaydi). Shu sababli har bir `send_*` funksiya foydalanuvchining
email manzilini `getattr(user, 'email', None)` orqali xavfsiz oladi — manzil
bo'lmasa funksiya jimgina no-op bo'ladi (xato ko'tarmaydi). Kelajakda User'ga
`email` maydoni qo'shilsa, bu funksiyalar avtomatik ishlay boshlaydi.

Yuborish SINXRON. Har bir chaqiruv try/except bilan o'ralgan — email
yuborishdagi har qanday xato faqat log'ga yoziladi, asosiy oqim (obuna
faollashtirish, markaz tasdiqlash va h.k.) buzilmaydi.
"""
from django.core.mail import send_mail
from django.conf import settings
import logging

logger = logging.getLogger(__name__)


def _user_email(user):
    """Foydalanuvchidan email manzilini xavfsiz olish (yo'q bo'lsa None)."""
    email = getattr(user, 'email', None)
    return email or None


def send_async_email(subject, message, recipient_list, html_message=None):
    """Xavfsiz email yuborish — xato bo'lsa log'ga yozadi, crash bermaydi."""
    if not recipient_list:
        return
    try:
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=recipient_list,
            html_message=html_message,
            fail_silently=False,
        )
    except Exception as e:
        logger.error(f"Email yuborishda xato: {e}")


def send_subscription_activated(user):
    """Obuna faollashtirilganda foydalanuvchiga xabar."""
    email = _user_email(user)
    if not email:
        return
    send_async_email(
        subject='Olympy Premium faollashtirildi!',
        message=f'Hurmatli {user.full_name},\n\nSizning Premium obunangiz muvaffaqiyatli faollashtirildi.\n\nOlympy jamoasi',
        html_message=f'''
        <h2>Premium faollashtirildi! 🎉</h2>
        <p>Hurmatli <b>{user.full_name}</b>,</p>
        <p>Sizning Premium obunangiz muvaffaqiyatli faollashtirildi.</p>
        <p>Endi barcha premium imkoniyatlardan foydalanishingiz mumkin.</p>
        <br><p>Olympy jamoasi</p>
        ''',
        recipient_list=[email],
    )


def send_olympiad_result(user, olympiad_name, score, rank=None):
    """Olimpiada natijasi haqida xabar."""
    email = _user_email(user)
    if not email:
        return
    rank_text = f'\nReyting: {rank}-o\'rin' if rank else ''
    send_async_email(
        subject=f'Olympy: {olympiad_name} natijalari',
        message=f'Hurmatli {user.full_name},\n\n{olympiad_name} olimpiadasi natijalari:\nBall: {score}{rank_text}\n\nOlympy jamoasi',
        html_message=f'''
        <h2>Olimpiada natijalari 📊</h2>
        <p>Hurmatli <b>{user.full_name}</b>,</p>
        <p><b>{olympiad_name}</b> olimpiadasi natijalari:</p>
        <p>Ball: <b>{score}</b>{rank_text}</p>
        <br><p>Olympy jamoasi</p>
        ''',
        recipient_list=[email],
    )


def send_center_approved(user, center_name):
    """Markaz tasdiqlanganda direktorga xabar."""
    email = _user_email(user)
    if not email:
        return
    send_async_email(
        subject=f'Olympy: {center_name} tasdiqlandi',
        message=f'Hurmatli {user.full_name},\n\n{center_name} markazingiz platformada tasdiqlandi!\n\nOlympy jamoasi',
        html_message=f'''
        <h2>Markaz tasdiqlandi! ✅</h2>
        <p>Hurmatli <b>{user.full_name}</b>,</p>
        <p><b>{center_name}</b> markazingiz Olympy platformasida tasdiqlandi!</p>
        <br><p>Olympy jamoasi</p>
        ''',
        recipient_list=[email],
    )
