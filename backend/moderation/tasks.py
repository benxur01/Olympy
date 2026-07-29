"""Moderatsiya navbatini to'ldiradigan avtomatik detektorlar."""
from celery import shared_task

from accounts.security_queries import get_shared_ip_accounts

from .models import ModerationFlag

# `min_accounts` — admin paneldagi qo'lda ko'riladigan ro'yxat bilan bir xil
# (accounts/views_security.py: SHARED_IP_DEFAULT_MIN_ACCOUNTS = 5).
#
# OYNA esa ATAYLAB boshqacha: qo'lda ko'rish uchun default 30 kun (admin
# umumiy manzarani ko'radi), soatlik AVTOMATIK detektor uchun esa 1 kun.
# 30 kunlik oynada bir marta chegaradan oshgan IP keyingi bir oy davomida
# "shubhali" bo'lib qolaverardi va admin uni yopgani bilan navbatga qayta
# tushaverardi; 1 kunlik oyna faqat oxirgi sutkada HAQIQATAN faol bo'lgan
# manzillarni, ya'ni yangi portlashlarni ko'rsatadi.
SUSPICIOUS_IP_MIN_ACCOUNTS = 5
SUSPICIOUS_IP_WINDOW_DAYS = 1


@shared_task(name='moderation.detect_suspicious_activity')
def detect_suspicious_activity():
    """Shubhali faollikni topib, moderatsiya navbatiga bayroq qo'yadi.

    Hozircha bitta detektor: bir xil IP ortidagi ko'p hisob. Ro'yxat
    `accounts.security_queries.get_shared_ip_accounts` dan olinadi — admin
    panelidagi qo'lda ko'riladigan blok bilan AYNAN bir xil so'rov, ya'ni
    ikkala joyda "shubhali" ta'rifi bir xil bo'lib qoladi.

    Task hech qanday chora KO'RMAYDI (bloklamaydi, xabar yubormaydi): bir
    manzil ortida bir nechta haqiqiy hisob bo'lishi normal (markaz
    sinfxonasi, oila Wi-Fi'si, operator NAT'i). U faqat admin tekshiruvi
    uchun nomzod qo'yadi.

    AuditLog yozilmaydi: `AuditLog.log()` `request` talab qiladi (aktor, IP)
    va request'siz variant yo'q, bu yerda esa aktor ham, IP ham yo'q.
    Yaratilgan `ModerationFlag` qatorining O'ZI iz bo'lib qoladi —
    `raised_by=None` (Tizim), `created_at`, `reason` va `extra` bilan.
    Adminning qarori ham shu qatorda qoladi (`resolved_by`/`resolved_at`).

    Idempotent: har soatda ishlaydi, ochiq bayrog'i bor IP uchun yangisini
    yaratmaydi.
    """
    created = 0
    for row in get_shared_ip_accounts(
        min_accounts=SUSPICIOUS_IP_MIN_ACCOUNTS,
        window_days=SUSPICIOUS_IP_WINDOW_DAYS,
    ):
        ip_address = row['ip_address']
        # ATAYLAB `get_or_create` emas, balki "tekshir → yarat" (ikki so'rov).
        # Takrorni aniqlash sharti JSON ichidagi kalit bo'yicha
        # (`extra__ip_address`), `get_or_create` esa lookup'li (`__` li)
        # kalitlarni `create()` ga umuman uzatmaydi — natijada qator
        # `extra={}` bilan yaratilib, keyingi safar yana takrorlanardi.
        # Bundan tashqari `get_or_create` ning "atomikligi" faqat unique
        # cheklov bo'lganda ish beradi, JSON kaliti bo'yicha esa bunday
        # cheklov yo'q. Soatiga bir marta va o'nlab qator uchun ishlagan
        # joyda ortiqcha so'rov muammo emas, xatolik esa muammo.
        already_open = ModerationFlag.objects.filter(
            flag_type=ModerationFlag.FLAG_TYPE_SUSPICIOUS_IP,
            status=ModerationFlag.STATUS_PENDING,
            extra__ip_address=ip_address,
        ).exists()
        if already_open:
            continue
        ModerationFlag.objects.create(
            flag_type=ModerationFlag.FLAG_TYPE_SUSPICIOUS_IP,
            # Nishon model emas — shuning uchun `target_id` yo'q, manzilning
            # o'zi `extra` da (takrorni tekshirish ham shu kalit bo'yicha).
            target_type='ip_address',
            reason=(
                f"Bir xil IP'dan {row['distinct_users']} ta hisob "
                f"(oxirgi {SUSPICIOUS_IP_WINDOW_DAYS} kun)"
            ),
            extra={
                'ip_address': ip_address,
                'distinct_users': row['distinct_users'],
                'window_days': SUSPICIOUS_IP_WINDOW_DAYS,
            },
        )
        created += 1
    return f'Created {created} suspicious IP flags'
