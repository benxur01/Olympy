"""Xavfsizlik tekshiruvlari uchun qayta ishlatiladigan so'rovlar.

View'lardan ATAYLAB ajratilgan: bu yerdagi funksiyalarni boshqa app'lar ham
import qiladi (admin paneldagi "Xavfsizlik" tabining keyingi bloklari), va
`views_*` modulini boshqa app'dan import qilish aylanma bog'liqlik hamda
keraksiz DRF yuklamasini keltirib chiqaradi. Bu modul faqat ORM'ga tayanadi.
"""
from datetime import timedelta

from django.db.models import (
    Case, Count, Exists, ExpressionWrapper, IntegerField, Max, Min, OuterRef, Q,
    Value, When,
)
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


def get_shared_device_accounts(min_accounts=3, window_days=30):
    """Bitta QURILMADAN imtihon topshirgan TURLI hisoblar soni chegaradan
    oshgan qurilmalar.

    `get_shared_ip_accounts` bilan bir xil shakl va bir xil qoida (ro'yxat
    beradi, chora ko'rmaydi), lekin BOSHQA signal ustida. IP asosidagi
    aniqlash markaz sinfxonasida yolg'on signal beradi (bitta Wi-Fi ortida
    o'nlab haqiqiy hisob) va VPN ortidagi haqiqiy fitnachini o'tkazib
    yuboradi. `TestSession.last_device_id` esa brauzer/qurilma izi: bitta
    qurilmadan bir nechta hisob imtihon topshirgani ancha aniqroq belgi —
    shu sababli standart chegara IP'dagi 5 emas, 3.

    Qaytadi: `{'last_device_id', 'distinct_users', 'first_seen', 'last_seen'}`
    lug'atlari (ValuesQuerySet) — eng ko'p hisobli qurilma birinchi. View
    kalitni javobda `device_id` ga o'zgartiradi (panel uchun bu qurilmaning
    o'zi, ustun nomi emas).

    DIQQAT-1: `order_by` majburiy — `TestSession.Meta.ordering`
    (`-started_at`) `values(...).annotate(...)` bilan birga kelsa Django
    `started_at` ni ham GROUP BY ga qo'shib yuborardi (`get_shared_ip_accounts`
    dagi bilan bir xil tuzoq).

    DIQQAT-2: bo'sh `last_device_id` ALBATTA chetlab o'tiladi. IP maydonidan
    farqli o'laroq (`GenericIPAddressField` '' ni NULL ga aylantiradi) bu
    oddiy `CharField(default='')` — ping kelmagan har bir sessiyada '' turadi.
    Ular chetlatilmasa hammasi bitta ulkan soxta "qurilma" bo'lib, ro'yxatning
    birinchi qatorini egallardi.

    Vaqt oynasi va `first_seen`/`last_seen` uchun `started_at` ishlatiladi:
    u `auto_now_add` (har doim to'ldirilgan), `last_ping_at` esa NULL bo'lishi
    mumkin.
    """
    from attempts.models import TestSession  # lokal import — aylanma bog'liqlik

    cutoff = timezone.now() - timedelta(days=window_days)
    return (
        TestSession.objects
        .filter(started_at__gte=cutoff)
        .exclude(last_device_id='')
        .values('last_device_id')
        .annotate(
            distinct_users=Count('user_id', distinct=True),
            first_seen=Min('started_at'),
            last_seen=Max('started_at'),
        )
        .filter(distinct_users__gte=min_accounts)
        # `last_device_id` — ikkinchi darajali tartib: bir xil sonli
        # qurilmalar kesib olinganda (LIMIT) natija barqaror bo'lsin.
        .order_by('-distinct_users', 'last_device_id')
    )


def get_device_account_ids(device_id):
    """Shu qurilmadan topshirgan hisoblarning id → oxirgi sessiya vaqti.

    `get_ip_account_ids` ning qurilma varianti: bitta agregat so'rov,
    foydalanuvchilarning o'zi keyin BITTA `User.objects.filter(pk__in=...)`
    so'rovi bilan olinadi.
    """
    from attempts.models import TestSession  # lokal import — aylanma bog'liqlik

    return {
        row['user_id']: row['last_seen']
        for row in (
            TestSession.objects
            .filter(last_device_id=device_id)
            .values('user_id')
            .annotate(last_seen=Max('started_at'))
            .order_by()
        )
    }


# ─────────────────────────────────────────────────────────────────────────────
# Admin ro'yxatidagi xavf darajasi (risk_tier)
# ─────────────────────────────────────────────────────────────────────────────
# Chegaralar `accounts.views.compute_user_risk_profile` dagi bilan AYNAN bir
# xil — admin ro'yxatda ko'rgan daraja "Batafsil" oynasidagi daraja bilan
# ziddiyatga tushmasligi kerak. Ro'yxat SIGNALLARNING QISMINI ishlatgani
# uchun (qimmat IP/ogohlantirish tekshiruvlari faqat detalda) bu yerdagi
# ball har doim detaldagidan KICHIK yoki teng: ro'yxat xavfni hech qachon
# oshirib ko'rsatmaydi.
#
# Shundan kelib chiqadigan natija: `annotate_admin_risk` beradigan eng katta
# ball — 80 (50 + 20 + 10), ya'ni ro'yxatda 'kritik' PAYDO BO'LMAYDI.
# `?risk=kritik` filtri ataylab qoldirilgan: qiymat "Batafsil" oynasida
# ishlatiladi va filtr ro'yxatda ko'rinadigan daraja bilan bir xil
# formuladan kelib chiqishi kerak.
#
# `(quyi, yuqori)` — ikkalasi ham ichiga oladi; `None` yuqori chegarasizlikni
# bildiradi. Tartib muhim: `risk_tier_from_score` shu ketma-ketlikda yuradi.
ADMIN_RISK_TIER_RANGES = {
    'past': (0, 25),
    "o'rta": (26, 55),
    'yuqori': (56, 80),
    'kritik': (81, None),
}

# `?risk=` filtri uchun lotincha taxalluslar. `high` — panelning avvalgi
# yagona qiymati, shuning uchun eski so'rovlar ishlashda davom etadi.
ADMIN_RISK_TIER_ALIASES = {
    'low': 'past',
    'medium': "o'rta",
    'high': 'yuqori',
    'critical': 'kritik',
}


def risk_tier_from_score(score):
    """Ball → daraja nomi. Chegaralar `ADMIN_RISK_TIER_RANGES` da (yagona manba)."""
    for tier, (low, high) in ADMIN_RISK_TIER_RANGES.items():
        if score >= low and (high is None or score <= high):
            return tier
    return 'past'


def annotate_admin_risk(qs):
    """User queryset'iga `risk_tier_score` annotatsiyasini qo'shadi.

    `compute_user_risk_profile` har bir foydalanuvchi uchun ~6 ta ALOHIDA
    so'rov qiladi — 100 qatorlik ro'yxatda bu 600 so'rov bo'lardi. Shu
    sababli ro'yxat uchun faqat SQL'da arzon tushadigan uchta signal olinadi
    va ballari o'sha funksiyadagi bilan bir xil:

    * diskvalifikatsiya qilingan urinishlar — `min(50, n*25)`;
    * faol olimpiada taqiqi (Exam Ban) — `+20`;
    * moderatsiya bayrog'i mavjudligi — `+10` (detalda `min(20, n*10)`,
      ya'ni bu yerda eng kamida bitta bayroq qiymati).

    Qo'shimcha JOIN yo'q: diskvalifikatsiya hisobi `admin_users_list`
    allaqachon ochgan `attempts` join'ini qayta ishlatadi, taqiq holati
    ustunlardan o'qiladi, moderatsiya bayrog'i esa korrelyatsiyalangan
    `EXISTS` (satrlarni ko'paytirmaydi).

    Idempotent: `_filter_admin_users_advanced` ham, `admin_users_list` ham
    chaqiradi — ikkinchi chaqiruv annotatsiyani takrorlamaydi (aks holda
    Django "conflicts with an existing annotation" bilan yiqilardi).
    """
    from moderation.models import ModerationFlag  # lokal import — aylanma bog'liqlik

    if 'risk_tier_score' in qs.query.annotations:
        return qs

    now = timezone.now()
    # `User.is_exam_blocked` property'sining SQL ekvivalenti (muddatli taqiq
    # hali tugamagan YOKI muddatsiz sababli taqiq) — `_filter_admin_users_advanced`
    # dagi `status=exam_blocked` filtri bilan bir xil shart.
    exam_blocked = Q(exam_blocked_until__gt=now) | (
        Q(exam_blocked_until__isnull=True) & ~Q(exam_block_reason='')
    )
    # `ModerationFlag` nishoni generic (FK emas), shuning uchun teskari
    # bog'liqlik orqali `Count` qilib bo'lmaydi — `compute_user_risk_profile`
    # dagi bilan bir xil shart korrelyatsiyalangan subquery'da.
    moderation_flagged = ModerationFlag.objects.filter(
        Q(raised_by_id=OuterRef('pk')) | Q(target_type='user', target_id=OuterRef('pk'))
    )
    return qs.annotate(
        risk_dq_count=Count(
            'attempts', filter=Q(attempts__disqualified=True), distinct=True,
        ),
    ).annotate(
        risk_tier_score=ExpressionWrapper(
            Case(
                When(risk_dq_count=0, then=Value(0)),
                When(risk_dq_count=1, then=Value(25)),
                default=Value(50),
                output_field=IntegerField(),
            )
            + Case(
                When(exam_blocked, then=Value(20)),
                default=Value(0),
                output_field=IntegerField(),
            )
            + Case(
                When(Exists(moderation_flagged), then=Value(10)),
                default=Value(0),
                output_field=IntegerField(),
            ),
            output_field=IntegerField(),
        ),
    )
