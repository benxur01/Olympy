"""Platforma admini uchun markazlararo (cross-center) attempt ko'rinishlari.

`/api/admin/attempts/...` ostida mount qilinadi (accounts/urls_me.py) va faqat
platforma admini uchun ochiq. `attempts/views.py` allaqachon juda uzun bo'lgani
uchun bu yo'nalish loyihadagi odatga ko'ra (views_essay.py) alohida modulda
turadi.

MUHIM: bu modul FAQAT o'qish uchun. Cheating bo'yicha qaror (diskvalifikatsiya
yoki davom ettirish) `ReviewCheatingCaseView` da qoladi — u `select_for_update`
bilan ikki menejerning bir vaqtdagi qarorini (race) himoyalaydi va uni bu yerda
takrorlash o'sha himoyani ikkinchi nusxaga ajratib yuborardi.
"""
from django.db.models import (
    Case, Count, IntegerField, OuterRef, Q, Subquery, Value, When,
)
from django.db.models.functions import Coalesce, Least, Lower, Trim
from django.utils.dateparse import parse_date
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.permissions import IsPlatformAdmin
from olympy_api.pagination import LargePageNumberPagination

from .models import TestAttempt, TestSession

# Ro'yxatga kiradigan (va `?status=` bilan toraytirilishi mumkin bo'lgan)
# holatlar. Boshqa holatlar — `active` (hali ishlayapti) va `completed`
# (muammosiz topshirgan) — bu ko'rinishning mavzusi emas.
CHEATING_STATUSES = (TestSession.STATUS_DISQUALIFIED, TestSession.STATUS_PENDING_REVIEW)

# --- Shubha darajasi (severity) ---------------------------------------------
#
# Shu paytgacha navbatdagi barcha qatorlar bir xil ko'rinardi: bir marta tab
# almashtirgan o'quvchi bilan bir necha marta yuzi aniqlanmagani yonma-yon
# turardi va menejer qaysi biridan boshlashni bilmasdi.
#
# Yorliqlar `accounts.views.compute_user_risk_profile` bilan ATAYLAB bir xil
# ('past' / "o'rta" / 'yuqori') — panelda ikkala joyda bir xil so'z ko'rinsin.
# U yerdagi 'kritik' bu yerda ishlatilmaydi: u butun hisob bo'yicha jamlanma
# baho, bu esa BITTA hodisaning og'irligi.
SEVERITY_LOW = 'past'
SEVERITY_MEDIUM = "o'rta"
SEVERITY_HIGH = 'yuqori'
# Indeks = SQL'da hisoblangan `severity_rank` (0/1/2). Daraja SQL'da
# hisoblanishi SHART: `?sort=severity` shu ustun bo'yicha saralaydi va
# saralash Python'da bo'lsa faqat joriy sahifa saralanib, sahifalar orasida
# tartib noto'g'ri bo'lardi.
SEVERITY_BY_RANK = (SEVERITY_LOW, SEVERITY_MEDIUM, SEVERITY_HIGH)

# Sabab kodlari frontenddagi yagona manbalardan olingan:
# `src/proctoring/reasons.js`, `src/proctoring/voiceReasons.js` va
# `pages/ManagerDashboard.jsx` dagi `CHEATING_REASON_LABELS`.
#
# YUQORI — hodisaning o'zi tashqi yordam yoki boshqa odam borligini
# ko'rsatadi: kadrda yuz umuman yo'q, bir nechta yuz, parallel qurilmadan
# kirish, ikkinchi monitor, DevTools. Bularni menejer birinchi ko'rishi kerak.
HIGH_SEVERITY_REASONS = (
    'no_face_detected',
    'multiple_faces_detected',
    'concurrent_session',
    'multi_monitor_detected',
    'devtools_open',
)
# PAST — bitta tasodifiy hodisa bilan ham yuz beradi (bildirishnoma ochildi,
# telefon jiringladi, to'liq ekran o'chdi). O'zi diskvalifikatsiya uchun asos
# emas, shu sababli navbatning tepasiga chiqmasligi kerak.
LOW_SEVERITY_REASONS = (
    'tab_or_app_left',
    'test_window_left',
    'fullscreen_exit',
)
# Qolgani ("o'rta", `default` orqali): ma'lum lekin bir ma'noli bo'lmagan
# signallar (`copy_paste_attempt`, `gaze_away_sustained`,
# `ambient_speech_detected` — atrofdagi ovoz oila a'zosiniki ham bo'lishi
# mumkin) va menejer qo'lda yozgan erkin matn. Noma'lum kod "past" ga
# tushirilmaydi — yangi signal qo'shilganda u jimgina e'tibordan qolmasin.
# Sabab UMUMAN bo'sh bo'lsa — hech qanday signal yo'q, ya'ni 'past'.

# Takroriy qoidabuzar uchun ko'tarish: har bir OLDINGI diskvalifikatsiya
# darajani bir pog'ona ko'taradi, lekin ko'pi bilan shu qiymatgacha. Ya'ni
#   1 ta oldingi DQ  → daraja bir pog'ona yuqori ('past' → "o'rta")
#   2+ ta oldingi DQ → sababdan qat'i nazar darhol 'yuqori'
# Chegara `compute_user_risk_profile` dagi diskvalifikatsiya og'irligidan
# olingan: u yerda 1 ta DQ = +25% (hali 'past' chegarasi ichida), 2 ta = +50%
# ("o'rta"), ya'ni ikkinchi diskvalifikatsiya birinchi jiddiy signal.
REPEAT_ESCALATION_CAP = 2


def _parse_filter_date(raw):
    """`?date_from=`/`?date_to=` uchun YYYY-MM-DD sanasi (yoki None).

    Noto'g'ri qiymat xato emas — shunchaki filtr qo'llanmaydi (panel sanani
    `<input type="date">` dan yuboradi). `parse_date` noto'g'ri formatda None
    qaytaradi, formati to'g'ri lekin mavjud bo'lmagan sanada (2026-02-30)
    ValueError ko'taradi.
    """
    try:
        return parse_date((raw or '').strip())
    except ValueError:
        return None


def _prior_disqualification_count():
    """Shu o'quvchining BOSHQA olimpiadalardagi diskvalifikatsiyalari soni.

    Korrelyatsiyalangan subquery — ro'yxatdagi har qator uchun alohida so'rov
    EMAS (N+1 yo'q), butun sahifa asosiy so'rov bilan birga keladi.

    Joriy olimpiada chiqarib tashlanadi: sessiya DQ qilinganda aynan shu
    olimpiada uchun `disqualified=True` attempt yaratiladi
    (`finalize_cheating_disqualification`) — u "oldingi" qoidabuzarlik emas,
    shu qatorning o'zi. Aks holda har bir DQ qatori o'zini o'zi ko'targan
    bo'lardi.

    `.order_by()` — `TestAttempt.Meta.ordering` subquery'ga ORDER BY qo'shib,
    GROUP BY ni buzmasligi uchun (agregat-subquery naqshining sharti).
    """
    return Coalesce(
        Subquery(
            TestAttempt.objects
            .filter(user_id=OuterRef('user_id'), disqualified=True)
            .filter(~Q(olympiad_id=OuterRef('olympiad_id')))
            .order_by()
            .values('user_id')
            .annotate(total=Count('pk'))
            .values('total')[:1],
            output_field=IntegerField(),
        ),
        Value(0),
        output_field=IntegerField(),
    )


def _severity_rank_expression():
    """`severity_rank` (0/1/2) — sabab og'irligi + takroriy qoidabuzarlik.

    `reason_key` va `prior_disqualifications` annotatsiyalariga tayanadi, shu
    sababli ular queryset'da BUNDAN OLDIN qo'shilishi kerak.
    """
    top_rank = len(SEVERITY_BY_RANK) - 1
    base = Case(
        When(reason_key__in=HIGH_SEVERITY_REASONS, then=Value(top_rank)),
        When(reason_key__in=LOW_SEVERITY_REASONS, then=Value(0)),
        When(reason_key='', then=Value(0)),
        default=Value(1),
        output_field=IntegerField(),
    )
    # `Least(...)` — har oldingi DQ bir pog'ona, lekin `REPEAT_ESCALATION_CAP`
    # dan oshmaydi. `Case/When` bilan yozilsa korrelyatsiyalangan subquery SQL
    # matnida yana ikki marta takrorlanardi.
    escalation = Least(
        'prior_disqualifications', Value(REPEAT_ESCALATION_CAP), output_field=IntegerField(),
    )
    return Least(base + escalation, Value(top_rank), output_field=IntegerField())


def _session_payload(session):
    """Bitta sessiyaning panel uchun ko'rinishi.

    Maydon nomlari va qiymatlari `olympiad_live_proctoring` dagi qatorlar bilan
    ataylab bir xil (`status`, `cheating_reason`, ism/telefon fallback'lari) —
    admin ro'yxatidan menejer ekraniga o'tganda bir xil ma'lumot bir xil
    ko'rinsin.

    `session` — `admin_cheating_overview` queryset'idan kelgan, ya'ni
    `severity_rank`/`prior_disqualifications` annotatsiyalari bilan.
    """
    user = session.user
    olympiad = session.olympiad
    center = olympiad.center
    return {
        'session_id': session.id,
        'student_id': user.id,
        'student_name': user.full_name or user.phone or "O'quvchi",
        # Raqam maskalanmaydi: endpoint faqat platforma admini uchun va aynan
        # hisobni tanib olish uchun kerak (admin_shared_ip_detail bilan bir xil
        # qoida).
        'student_phone': user.normalized_phone or user.phone or '—',
        'olympiad_id': olympiad.id,
        'olympiad_title': olympiad.title,
        'center_id': center.id,
        'center_name': center.name,
        'status': session.status,
        'cheating_reason': session.cheating_reason,
        # Navbatni ustuvorlashtirish uchun shubha darajasi. Yorliq SQL'da
        # hisoblangan `severity_rank` dan olinadi — `?sort=severity` ham
        # aynan o'sha ustun bo'yicha saralaydi, ya'ni ko'rsatilgan daraja va
        # tartib hech qachon bir-biridan uzoqlashmaydi.
        'severity': SEVERITY_BY_RANK[session.severity_rank],
        # Darajaning sababi menejerga ko'rinsin ("nega yuqori?"): shu
        # o'quvchining boshqa olimpiadalardagi diskvalifikatsiyalari soni.
        'prior_disqualifications': session.prior_disqualifications,
        'disqualified_at': session.disqualified_at.isoformat() if session.disqualified_at else None,
        'review_requested_at': session.review_requested_at.isoformat() if session.review_requested_at else None,
        # `reviewed_by` NULL — avtomatik (10 daqiqalik timeout) qaror: qatorda
        # "kim qaror qildi" bo'sh qoladi, bu audit izining bir qismi.
        'reviewed_by_name': session.reviewed_by.full_name if session.reviewed_by else None,
        'reviewed_at': session.reviewed_at.isoformat() if session.reviewed_at else None,
    }


@api_view(['GET'])
@permission_classes([IsPlatformAdmin])
def admin_cheating_overview(request):
    """GET /api/admin/attempts/cheating-overview/

    Barcha markazlar bo'yicha diskvalifikatsiya qilingan va tekshiruv
    kutayotgan sessiyalar. Shu paytgacha bu ma'lumot faqat bitta olimpiada
    doirasida (`olympiad_live_proctoring`) ko'rinardi — platforma darajasida
    "qayerda nima bo'lyapti" degan savolga javob yo'q edi.

    Ruxsat AYNAN `IsPlatformAdmin`: bu markazlararo agregatsiya, shuning uchun
    `_user_can_manage_olympiad` (markaz egasi/menejeri ham o'tadi) BU YERDA
    ishlatilmaydi — u bitta olimpiada uchun mo'ljallangan.

    Filtrlar: `?center_id=`, `?status=` (faqat disqualified/pending_review),
    `?date_from=`/`?date_to=` (YYYY-MM-DD), `?search=` (ism yoki telefon).
    Bo'sh `status` — ikkala holat ham (ro'yxatning o'zi allaqachon shu ikkitasi
    bilan chegaralangan); noma'lum qiymat filtrsiz qoldiriladi.

    Tartiblash: standart — voqea vaqti bo'yicha yangisi birinchi. `?sort=severity`
    esa avval eng shubhali qatorlarni beradi (`severity` maydoniga qarang).

    Paginatsiya `LargePageNumberPagination` orqali (`?page=`/`?page_size=`,
    max 200) — moderatsiya navbatidagidek: ro'yxat platforma o'sishi bilan
    cheksiz o'sadi va eski yozuvlarga yetib borish kerak.
    """
    qs = (
        TestSession.objects
        .filter(status__in=CHEATING_STATUSES)
        # `ReviewCheatingCaseView` dagi bilan bir xil zanjir (N+1 siz), faqat
        # `olympiad__center__owner` o'rniga `reviewed_by`: bu yerda markaz
        # egasi emas, "kim qaror qildi" ko'rsatiladi.
        .select_related('user', 'olympiad', 'olympiad__center', 'reviewed_by')
        # Qatorning "voqea vaqti": DQ qilinganda `disqualified_at`, hali
        # kutayotganda `review_requested_at`. Ikki ustunli
        # `order_by('-disqualified_at', '-review_requested_at')` mos kelmaydi:
        # PostgreSQL DESC'da NULL'larni oldinga qo'yadi, ya'ni sanadan qat'i
        # nazar BARCHA `pending_review` qatorlari tepaga chiqib ketardi.
        .annotate(flagged_at=Coalesce('disqualified_at', 'review_requested_at'))
        # Sabab kodini solishtirishga tayyorlaymiz: `cheating_reason` — erkin
        # matn (`CharField`, choices EMAS), shu sababli frontend
        # `cheatingReasonLabel` bilan bir xil qoida — trim + lowercase.
        .annotate(reason_key=Lower(Trim('cheating_reason')))
        .annotate(prior_disqualifications=_prior_disqualification_count())
        .annotate(severity_rank=_severity_rank_expression())
        # `-id` — sahifalash barqaror bo'lishi uchun ikkinchi kalit (bir xil
        # soniyada bir nechta sessiya DQ bo'lishi mumkin).
        .order_by('-flagged_at', '-id')
    )

    # Noto'g'ri (raqam bo'lmagan) `center_id` filtrsiz qoldiriladi — qiymat
    # panelning markazlar ro'yxatidan keladi.
    center_id = request.query_params.get('center_id', '').strip()
    if center_id.isdigit():
        qs = qs.filter(olympiad__center_id=int(center_id))

    status_filter = request.query_params.get('status', '').strip()
    if status_filter in CHEATING_STATUSES:
        qs = qs.filter(status=status_filter)

    # `__date` taqqoslashi joriy vaqt mintaqasida (Asia/Tashkent) bajariladi va
    # ikkala chekka ham ichiga oladi — admin kiritgan kun to'liq tushadi.
    date_from = _parse_filter_date(request.query_params.get('date_from'))
    if date_from:
        qs = qs.filter(flagged_at__date__gte=date_from)
    date_to = _parse_filter_date(request.query_params.get('date_to'))
    if date_to:
        qs = qs.filter(flagged_at__date__lte=date_to)

    search = request.query_params.get('search', '').strip()
    if search:
        qs = qs.filter(
            Q(user__full_name__icontains=search)
            | Q(user__normalized_phone__icontains=search)
        )

    # `?sort=severity` — eng shubhali qatorlar tepada, teng darajalar ichida
    # standart tartib (voqea vaqti) saqlanadi. Saralash filtrlardan KEYIN va
    # sahifalashdan OLDIN, DB darajasida — shunda tartib butun ro'yxat bo'ylab
    # to'g'ri bo'ladi, faqat joriy sahifada emas. Noma'lum qiymat e'tiborsiz
    # qoldiriladi (filtrlardagi bilan bir xil qoida).
    if request.query_params.get('sort', '').strip() == 'severity':
        qs = qs.order_by('-severity_rank', '-flagged_at', '-id')

    paginator = LargePageNumberPagination()
    page = paginator.paginate_queryset(qs, request)
    sessions = page if page is not None else list(qs[:100])
    data = [_session_payload(s) for s in sessions]
    if page is not None:
        return paginator.get_paginated_response(data)
    return Response(data)
