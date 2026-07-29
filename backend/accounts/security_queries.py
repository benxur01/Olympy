"""Xavfsizlik tekshiruvlari uchun qayta ishlatiladigan so'rovlar.

View'lardan ATAYLAB ajratilgan: bu yerdagi funksiyalarni boshqa app'lar ham
import qiladi (admin paneldagi "Xavfsizlik" tabining keyingi bloklari), va
`views_*` modulini boshqa app'dan import qilish aylanma bog'liqlik hamda
keraksiz DRF yuklamasini keltirib chiqaradi. Bu modul faqat ORM'ga tayanadi.
"""
from datetime import timedelta

from django.db.models import Count, Max, Min
from django.utils import timezone

from .models import LoginEvent


def get_shared_ip_accounts(min_accounts=5, window_days=30):
    """Bitta IP'dan kirgan TURLI hisoblar soni chegaradan oshgan IP'lar.

    Bir manzil ortida bir nechta hisob bo'lishi o'z-o'zicha qoidabuzarlik
    emas (maktab/markaz sinfxonasi, uy Wi-Fi, mobil operator NAT'i) — shu
    sababli funksiya faqat RO'YXAT beradi, hech qanday chora ko'rmaydi:
    qaror adminniki.

    Qaytadi: `{'ip_address', 'distinct_users', 'first_seen', 'last_seen'}`
    lug'atlari (ValuesQuerySet) — eng ko'p hisobli IP birinchi.

    `first_seen`/`last_seen` AYNAN shu agregat so'rovda hisoblanadi: har bir
    IP uchun alohida so'rov qilinsa ro'yxat uzunligiga teng N+1 chiqardi.

    DIQQAT: oxiridagi `order_by` majburiy. `LoginEvent.Meta.ordering`
    (`-created_at`) `values(...).annotate(...)` bilan birga kelsa Django
    `created_at` ni ham GROUP BY ga qo'shib yuboradi va guruhlash IP bo'yicha
    emas, "IP + vaqt" bo'yicha bo'lib qolardi.

    DIQQAT-2: bo'sh satr uchun `.exclude(ip_address='')` ATAYLAB yo'q.
    `GenericIPAddressField.empty_strings_allowed = False` — Django '' ni
    yozishdan oldin NULL ga aylantiradi, ya'ni ustunda bo'sh satr umuman
    bo'lmaydi. Bundan tashqari bunday `exclude` SQL'da `ip_address = NULL`
    bo'lib chiqadi (qiymat ham prep'dan o'tadi): butun WHERE sharti NULL
    bo'lib, natija HAR DOIM bo'sh qaytardi.
    """
    cutoff = timezone.now() - timedelta(days=window_days)
    return (
        LoginEvent.objects
        .filter(created_at__gte=cutoff)
        .exclude(ip_address__isnull=True)
        .values('ip_address')
        .annotate(
            distinct_users=Count('user_id', distinct=True),
            first_seen=Min('created_at'),
            last_seen=Max('created_at'),
        )
        .filter(distinct_users__gte=min_accounts)
        # `ip_address` — ikkinchi darajali tartib: bir xil sonli IP'lar
        # kesib olinganda (LIMIT) har safar bir xil natija chiqsin.
        .order_by('-distinct_users', 'ip_address')
    )


def get_ip_account_ids(ip_address):
    """Shu IP'dan kirgan hisoblarning id → oxirgi kirish vaqti lug'ati.

    Bitta agregat so'rov: id'lar ro'yxati va har biri uchun "oxirgi marta shu
    IP'dan qachon kirgan" birga keladi (foydalanuvchilarning o'zi keyin BITTA
    `User.objects.filter(pk__in=...)` so'rovi bilan olinadi).
    """
    return {
        row['user_id']: row['last_seen']
        for row in (
            LoginEvent.objects
            .filter(ip_address=ip_address)
            .values('user_id')
            .annotate(last_seen=Max('created_at'))
            .order_by()
        )
    }
