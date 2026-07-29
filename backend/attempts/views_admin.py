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
from django.db.models import Q
from django.db.models.functions import Coalesce
from django.utils.dateparse import parse_date
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.permissions import IsPlatformAdmin
from olympy_api.pagination import LargePageNumberPagination

from .models import TestSession

# Ro'yxatga kiradigan (va `?status=` bilan toraytirilishi mumkin bo'lgan)
# holatlar. Boshqa holatlar — `active` (hali ishlayapti) va `completed`
# (muammosiz topshirgan) — bu ko'rinishning mavzusi emas.
CHEATING_STATUSES = (TestSession.STATUS_DISQUALIFIED, TestSession.STATUS_PENDING_REVIEW)


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


def _session_payload(session):
    """Bitta sessiyaning panel uchun ko'rinishi.

    Maydon nomlari va qiymatlari `olympiad_live_proctoring` dagi qatorlar bilan
    ataylab bir xil (`status`, `cheating_reason`, ism/telefon fallback'lari) —
    admin ro'yxatidan menejer ekraniga o'tganda bir xil ma'lumot bir xil
    ko'rinsin.
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

    paginator = LargePageNumberPagination()
    page = paginator.paginate_queryset(qs, request)
    sessions = page if page is not None else list(qs[:100])
    data = [_session_payload(s) for s in sessions]
    if page is not None:
        return paginator.get_paginated_response(data)
    return Response(data)
