"""Xavfsiz email yuborish yordamchilari.

DIQQAT: autentifikatsiya baribir telefon raqami orqali ishlaydi — `User.email`
IXTIYORIY (tiklash kanali, `email/link/` oqimida tasdiqlanadi), ya'ni
foydalanuvchilarning ko'pchiligida bo'sh. Shu sababli har bir `send_*`
funksiya manzilni `getattr(user, 'email', None)` orqali xavfsiz oladi —
manzil bo'lmasa funksiya jimgina no-op bo'ladi (xato ko'tarmaydi).

Yuborish SINXRON. Har bir chaqiruv try/except bilan o'ralgan — email
yuborishdagi har qanday xato faqat log'ga yoziladi, asosiy oqim (obuna
faollashtirish, markaz tasdiqlash va h.k.) buzilmaydi.
"""
from django.core.mail import send_mail
from django.conf import settings
import logging

logger = logging.getLogger(__name__)


def _user_email(user):
    """Foydalanuvchidan email manzilini xavfsiz olish (yo'q bo'lsa None).

    Manzil bo'lmasa chaqiruvchi oqim (obuna, to'lov, markaz tasdig'i)
    buzilmaydi — xabar Telegram orqali yetkaziladi (notifications.services).
    """
    return getattr(user, 'email', None) or None


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


def send_payment_received(user):
    """To'lov qabul qilindi, tekshirilmoqda — foydalanuvchiga ogohlantirish.

    Webhook to'lovni qayd etganda, lekin obuna hali faollashmagan oraliqda
    yuboriladi (masalan, to'lov pending/processing). Email maydoni bo'lmasa
    jimgina o'tib ketadi.
    """
    email = _user_email(user)
    if not email:
        return
    send_async_email(
        subject="Olympy: To'lovingiz qabul qilindi",
        message=(
            f'Hurmatli {user.full_name},\n\n'
            "To'lovingiz qabul qilindi va tekshirilmoqda. Premium obunangiz "
            "tez orada faollashadi.\n\nOlympy jamoasi"
        ),
        html_message=f'''
        <h2>To'lovingiz qabul qilindi ⏳</h2>
        <p>Hurmatli <b>{user.full_name}</b>,</p>
        <p>To'lovingiz qabul qilindi va tekshirilmoqda. Premium obunangiz tez orada faollashadi.</p>
        <br><p>Olympy jamoasi</p>
        ''',
        recipient_list=[email],
    )


def send_payment_failed(user, support_contact=None):
    """To'lov o'tdi, lekin obuna avtomatik berilmadi — support'ga murojaat.

    `_activate_subscription` False qaytarganda chaqiriladi: pul yechildi, ammo
    premium ulanmadi. Email maydoni bo'lmasa jimgina o'tib ketadi.
    """
    email = _user_email(user)
    if not email:
        return
    contact_line = f'\n\nQo\'llab-quvvatlash: {support_contact}' if support_contact else ''
    contact_html = (
        f'<p>Qo\'llab-quvvatlash: <b>{support_contact}</b></p>' if support_contact else ''
    )
    send_async_email(
        subject="Olympy: To'lovingizda muammo yuz berdi",
        message=(
            f'Hurmatli {user.full_name},\n\n'
            "To'lovingiz qabul qilindi, lekin Premium obunani faollashtirishda "
            "muammo yuz berdi. Iltimos, qo'llab-quvvatlash xizmati bilan "
            f"bog'laning — masala tez orada hal qilinadi.{contact_line}\n\n"
            "Olympy jamoasi"
        ),
        html_message=f'''
        <h2>To'lovda muammo yuz berdi ⚠️</h2>
        <p>Hurmatli <b>{user.full_name}</b>,</p>
        <p>To'lovingiz qabul qilindi, lekin Premium obunani faollashtirishda muammo yuz berdi.
        Iltimos, qo'llab-quvvatlash xizmati bilan bog'laning — masala tez orada hal qilinadi.</p>
        {contact_html}
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


def send_email_verification_code(user, email, code, ttl_minutes):
    """Hisobga email bog'lash uchun bir martalik kod.

    Boshqa `send_*` funksiyalardan farqi: manzil `_user_email(user)` dan
    OLINMAYDI — kod hali tasdiqlanmagan, ya'ni hisobga yozilmagan manzilga
    yuboriladi (manzil confirm bosqichida to'g'ri kod bilan yoziladi).
    """
    if not email:
        return
    send_async_email(
        subject=f'Olympy tasdiqlash kodi: {code}',
        message=(
            f'Hurmatli {user.full_name},\n\n'
            f'Email manzilingizni Olympy hisobingizga bog\'lash uchun kod: {code}\n'
            f'Kod {ttl_minutes} daqiqa amal qiladi.\n\n'
            "Agar bu so'rovni siz yubormagan bo'lsangiz, bu xatni e'tiborsiz "
            'qoldiring.\n\nOlympy jamoasi'
        ),
        html_message=f'''
        <h2>Email manzilini tasdiqlash 📧</h2>
        <p>Hurmatli <b>{user.full_name}</b>,</p>
        <p>Email manzilingizni Olympy hisobingizga bog'lash uchun kod:</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:6px">{code}</p>
        <p>Kod <b>{ttl_minutes} daqiqa</b> amal qiladi.</p>
        <p>Agar bu so'rovni siz yubormagan bo'lsangiz, bu xatni e'tiborsiz qoldiring.</p>
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
