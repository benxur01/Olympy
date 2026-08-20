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
from django.db.models.functions import Least
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
# `annotate_admin_risk` beradigan eng katta ball — 100 (50 + 35 + 20 + 10,
# yuqori chegara bilan kesilgan), ya'ni bloklangan apparat izi qo'shilgandan
# keyin ro'yxatda 'kritik' HAM paydo bo'lishi mumkin. Avval eng kattasi 80
# edi va 'kritik' faqat "Batafsil" oynasida ko'rinardi.
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


def parse_risk_filter(value):
    """`?risk=` qiymatini `(quyi, yuqori)` ball oralig'iga aylantiradi.

    Ikki shakl bor:

    * `'yuqori'` — AYNAN shu daraja (ochiluvchi ro'yxatdagi variantlar);
    * `'yuqori+'` — shu daraja VA UNDAN YUQORISI.

    `+` shakli panelning "Yuqori xavf" SEGMENTI uchun kerak. Segment bitta
    daraja yuborganida bloklangan apparat izi ro'yxat balliga qo'shilgach
    ('kritik' endi ro'yxatda ham chiqadi) eng xavfli hisoblar segmentdan
    TUSHIB QOLARDI — admin "Yuqori xavf" ni bosib aynan eng yomon
    qoidabuzarlarni ko'rmay qolardi.

    Lotincha taxalluslar (`high`, `critical`) ikkala shaklda ham ishlaydi.
    `'all'`, bo'sh satr va noma'lum qiymatda `None` qaytadi — chaqiruvchi
    filtrni e'tiborsiz qoldiradi (avvalgi xulq: buzuq parametr butun
    ro'yxatni bo'shatib yubormaydi).

    DIQQAT — kodlash: KODLANMAGAN so'rov satrida (`?risk=yuqori+`) `+`
    belgisi PROBEL bo'lib dekodlanadi va suffiks bildirmay yo'qolardi, ya'ni
    filtr jimgina "aynan yuqori" ga aylanardi. Shu sababli oxiridagi bo'sh
    joy ham `+` bilan teng deb qabul qilinadi. Panelning o'zi
    `URLSearchParams` orqali to'g'ri kodlaydi (`%2B`); bu tolerantlik qo'lda
    yozilgan so'rovlar va eski klientlar uchun.
    """
    raw = value or ''
    # Oxirida `+` yoki bo'sh joy bormi (ya'ni qiymat "kesilgan"mi).
    at_least = raw != raw.rstrip('+ \t\r\n')
    raw = raw.strip().rstrip('+').strip()
    tier = ADMIN_RISK_TIER_ALIASES.get(raw, raw)
    bounds = ADMIN_RISK_TIER_RANGES.get(tier)
    if not bounds:
        return None
    low, high = bounds
    return (low, None if at_least else high)


def annotate_admin_risk(qs):
    """User queryset'iga `risk_tier_score` annotatsiyasini qo'shadi.

    `compute_user_risk_profile` har bir foydalanuvchi uchun ~7 ta ALOHIDA
    so'rov qiladi — 100 qatorlik ro'yxatda bu 700 so'rov bo'lardi. Shu
    sababli ro'yxat uchun faqat SQL'da arzon tushadigan to'rtta signal
    olinadi va ballari o'sha funksiyadagi bilan bir xil:

    * diskvalifikatsiya qilingan urinishlar — `min(50, n*25)`;
    * bloklangan qurilma izi mavjudligi — `+35`;
    * faol olimpiada taqiqi (Exam Ban) — `+20`;
    * moderatsiya bayrog'i mavjudligi — `+10` (detalda `min(20, n*10)`,
      ya'ni bu yerda eng kamida bitta bayroq qiymati).

    Qo'shimcha JOIN yo'q: diskvalifikatsiya hisobi `admin_users_list`
    allaqachon ochgan `attempts` join'ini qayta ishlatadi, taqiq holati
    ustunlardan o'qiladi, qurilma bloki va moderatsiya bayrog'i esa
    korrelyatsiyalangan `EXISTS` (satrlarni ko'paytirmaydi, qator sonidan
    qat'i nazar bitta so'rov — `test_list_query_count_does_not_grow_with_users`).

    Idempotent: `_filter_admin_users_advanced` ham, `admin_users_list` ham
    chaqiradi — ikkinchi chaqiruv annotatsiyani takrorlamaydi (aks holda
    Django "conflicts with an existing annotation" bilan yiqilardi).
    """
    from moderation.models import ModerationFlag  # lokal import — aylanma bog'liqlik

    from .models import DeviceFingerprint

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
    #
    # `target_type` AYNAN 'User' — model klassining nomi (`AuditLog` dagi
    # `type(target).__name__` bilan bir xil qoida, `ModerationFlag` docstringi
    # shunga ishora qiladi). Avval bu yerda kichik harfli 'user' turardi va
    # HECH BIR bayroq mos kelmasdi: yagona foydalanuvchi nishonli yozuvchi
    # (`moderation.services.maybe_flag_warning_threshold`) 'User' yozadi.
    # Ya'ni ogohlantirishlar chegarasidan oshgan hisob xavf ballini umuman
    # olmasdi.
    moderation_flagged = ModerationFlag.objects.filter(
        Q(raised_by_id=OuterRef('pk')) | Q(target_type='User', target_id=OuterRef('pk'))
    )
    # Bloklangan apparat izi (+35, `compute_user_risk_profile` dagi bilan bir
    # xil). `Exists` — bir nechta bloklangan qurilma satrlarni ko'paytirmasin
    # (detalda ham ball SONGA bog'liq emas: bittasi ham, beshtasi ham +35).
    banned_device = DeviceFingerprint.objects.filter(
        user_id=OuterRef('pk'), is_banned=True,
    )
    return qs.annotate(
        # `attempts__removed=False` — `compute_user_risk_profile` dagi bilan
        # bir xil shart: chiqarib yuborilgan urinish `disqualified=True`
        # bo'lsa-da, qoidabuzarlik emas. Ikkala hisob mos bo'lishi SHART —
        # ro'yxatdagi `?risk=` filtri shu SQL, detal esa Python varianti.
        risk_dq_count=Count(
            'attempts',
            filter=Q(attempts__disqualified=True, attempts__removed=False),
            distinct=True,
        ),
    ).annotate(
        risk_tier_score=Least(
            # Detaldagi `min(100, ...)` bilan bir xil yuqori chegara: qurilma
            # bloki qo'shilgach yig'indi 115 gacha chiqishi mumkin, daraja
            # jadvali esa 100 ballik shkalada.
            Value(100),
            ExpressionWrapper(
                Case(
                    When(risk_dq_count=0, then=Value(0)),
                    When(risk_dq_count=1, then=Value(25)),
                    default=Value(50),
                    output_field=IntegerField(),
                )
                + Case(
                    When(Exists(banned_device), then=Value(35)),
                    default=Value(0),
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
            output_field=IntegerField(),
        ),
    )
