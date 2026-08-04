"""Navbatga bayroq qo'yadigan sinxron yordamchilar.

`tasks.py` dan farqi: u davriy (soatlik) detektor va o'zi ma'lumot izlaydi,
bu yerdagi funksiyalar esa CHAQIRUVCHI amalning ichida — hodisa aynan sodir
bo'lgan paytda — ishlaydi (masalan admin ogohlantirish yuborgan so'rov
ichida).
"""
from datetime import timedelta

from django.utils import timezone

from notifications.models import Notification

from .models import ModerationFlag

# Necha ogohlantirishdan keyin hisob admin tekshiruviga tushadi va qanday
# oynada sanaladi. Oyna SURILUVCHI: "oxirgi N kun", kalendar oyi emas.
#
# 30 kun ATAYLAB `SUSPICIOUS_IP_WINDOW_DAYS` (1 kun) dan uzun: shubhali IP —
# bir martalik portlash, ogohlantirish esa admin qo'li bilan yoziladigan
# kamyob hodisa. Bir oydan eski ogohlantirishlar sanoqdan chiqadi, ya'ni
# hisob "toza"lanadi va yillar oldingi uchta yozuv bugun bayroq ko'tarmaydi.
WARNING_STRIKE_THRESHOLD = 3
WARNING_STRIKE_WINDOW_DAYS = 30


def maybe_flag_warning_threshold(user):
    """Ogohlantirishlar chegarasidan oshgan hisobni navbatga qo'yadi.

    Chaqiriladi ogohlantirish YARATILGANDAN KEYIN (`admin_warn_user`), ya'ni
    yangi yozuv ham sanoqqa kiradi: uchinchi ogohlantirish o'zi bayroq
    ko'taradi.

    HECH QANDAY chora ko'rilmaydi — hisob bloklanmaydi, sessiyalar
    yakunlanmaydi, foydalanuvchiga qo'shimcha xabar ketmaydi. Bu shubhali IP
    detektori bilan bir xil qoida: avtomatika faqat NOMZOD qo'yadi, qarorni
    admin qabul qiladi. Ogohlantirishlar turli sabablarga (biri jiddiy, ikkitasi
    mayda) berilgan bo'lishi mumkin va ularni faqat odam tarozida tortadi.

    Idempotent: shu hisob uchun OCHIQ bayroq turgan bo'lsa yangisi
    yaratilmaydi — admin bir qatorni yopmasdan turib keyingi har ogohlantirish
    navbatga dublikat tashlab ketmasin. Admin bayroqni yopgandan keyin
    ogohlantirish davom etsa, bu yangi hodisa va yangi qator oladi
    (`detect_suspicious_activity` dagi bilan bir xil).

    Yaratilgan bayroqni (yoki `None` ni) qaytaradi.
    """
    since = timezone.now() - timedelta(days=WARNING_STRIKE_WINDOW_DAYS)
    warning_count = Notification.objects.filter(
        user=user,
        type=Notification.TYPE_ACCOUNT_WARNING,
        created_at__gte=since,
    ).count()
    if warning_count < WARNING_STRIKE_THRESHOLD:
        return None

    # Barcha qidiruv maydonlari oddiy ustunlar (JSON kaliti emas), shuning
    # uchun `flag_question` dagidek `get_or_create` — takrorni tekshirish va
    # yaratish bitta chaqiruvda.
    flag, created = ModerationFlag.objects.get_or_create(
        flag_type=ModerationFlag.FLAG_TYPE_WARNING_THRESHOLD,
        target_type='User',
        target_id=user.id,
        status=ModerationFlag.STATUS_PENDING,
        defaults={
            'reason': (
                f'Oxirgi {WARNING_STRIKE_WINDOW_DAYS} kunda {warning_count} ta '
                'rasmiy ogohlantirish'
            )[:255],
            # `raised_by` berilmaydi — bayroqni ogohlantirishni yozgan admin
            # emas, TIZIM ko'taradi (chegara avtomatik hisoblanadi).
            'extra': {
                'user_id': user.id,
                'full_name': user.full_name,
                'warning_count': warning_count,
                'window_days': WARNING_STRIKE_WINDOW_DAYS,
                'threshold': WARNING_STRIKE_THRESHOLD,
            },
        },
    )
    return flag if created else None
