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


# User modelida `email` maydoni bor-yo'qligini bir marta aniqlaymiz (har
# chaqiruvda field introspection qilmaslik uchun). Maydon umuman bo'lmasa,
# har bir `send_*` chaqiruvi jimgina no-op bo'ladi — bu holatda foydalanuvchiga
# xabar Telegram orqali boradi (notifications.services). Konfiguratsiya
# muammosini ko'rish uchun bir marta WARNING yoziladi.
_EMAIL_FIELD_AVAILABLE = None
_EMAIL_NOT_CONFIGURED_LOGGED = False


def _user_email(user):
    """Foydalanuvchidan email manzilini xavfsiz olish (yo'q bo'lsa None).

    User modelida `email` maydoni mavjud bo'lmasa (autentifikatsiya telefon
    orqali) — birinchi chaqiruvda bir marta `logger.warning` yoziladi va None
    qaytaradi. Email kanali sozlanmagan, lekin chaqiruvchi oqim (obuna, to'lov,
    markaz tasdig'i) buzilmaydi — xabar Telegram orqali yetkaziladi.
    """
    global _EMAIL_FIELD_AVAILABLE, _EMAIL_NOT_CONFIGURED_LOGGED
    email = getattr(user, 'email', None)
    if not email:
        # Maydon umuman yo'q (None va ataylab bo'sh emas) — konfiguratsiya
        # holatini bir marta log'ga chiqaramiz. Render stderr'ni yig'adi.
        if _EMAIL_FIELD_AVAILABLE is None:
            _EMAIL_FIELD_AVAILABLE = hasattr(user, 'email')
        if not _EMAIL_FIELD_AVAILABLE and not _EMAIL_NOT_CONFIGURED_LOGGED:
            logger.warning(
                "Email not configured: User modelida 'email' maydoni yo'q — "
                "email bildirishnomalari o'tkazib yuborilmoqda, xabarlar "
                "Telegram orqali yuboriladi."
            )
            _EMAIL_NOT_CONFIGURED_LOGGED = True
        return None
    return email


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
