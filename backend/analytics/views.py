"""Analitika API endpoint'lari.

Metrikalar (`analytics.metrics.get_metrics`) ilgari faqat Django admin
dashboard'i orqali ko'rinardi. Bu modul shu metrikalarni JSON API sifatida ham
ochadi — faqat admin (staff/superuser) foydalanuvchilar uchun. Frontend admin
paneli (React) shu endpointdan retention/conversion/premium ko'rsatkichlarini
o'qishi mumkin.

Hisoblash mantig'i bitta joyda (metrics.py) qoladi — bu view faqat shu
funksiyani HTTP orqali taqdim etadi.
"""
from datetime import timedelta

from django.db.models import Avg, Count, Max, Sum
from django.db.models.functions import TruncDate, TruncMonth, TruncWeek
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status as http_status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsPlatformAdmin

from .metrics import METRICS_CACHE_SECONDS, get_cached_block, get_metrics
from .presence import ONLINE_WINDOW_SECONDS, get_online_count, get_online_user_ids


def _refresh_requested(request):
    """`?refresh=1` — cache'ni chetlab o'tish (metrics_dashboard bilan bir xil)."""
    return request.GET.get('refresh') in ('1', 'true', 'True')


@api_view(['GET'])
@permission_classes([IsPlatformAdmin])
def metrics_dashboard(request):
    """GET /api/analytics/metrics/ — retention/conversion/premium metrikalari.

    Faqat platforma admini (is_platform_admin) uchun. `?refresh=1` cache'ni
    chetlab o'tib qayta hisoblaydi (admin dashboard bilan bir xil xulq).
    """
    force = _refresh_requested(request)
    metrics = get_metrics(force_refresh=force)
    return Response({
        **metrics,
        'cache_minutes': METRICS_CACHE_SECONDS // 60,
    })


@api_view(['GET'])
@permission_classes([IsPlatformAdmin])
def online_users(request):
    """GET /api/analytics/online/ — hozir onlayn foydalanuvchilar soni.

    `metrics_dashboard`dan ATAYIN alohida va CACHE'LANMAYDI: u yerdagi 10
    daqiqalik cache "hozir onlayn" ko'rsatkichini ma'nosiz qilardi. Hisob
    Redis sorted set'dan o'qiladi (`analytics.presence`) — DB'ga umuman
    tegmaydi, shu sababli har 15 soniyada so'ralishi arzon.

    Faqat agregat son qaytadi (kim onlayn ekani emas). Redis sozlanmagan yoki
    javob bermasa `online_count: null` — frontend "—" ko'rsatadi.
    """
    return Response({
        'online_count': get_online_count(),
        'window_minutes': ONLINE_WINDOW_SECONDS // 60,
    })


@api_view(['GET'])
@permission_classes([IsPlatformAdmin])
def online_users_detail(request):
    """GET /api/analytics/online/users/ — BARCHA foydalanuvchilar + onlayn holati.

    "Hozir onlayn" kartasi bosilganda ochiladigan ro'yxat uchun. Sanoq
    endpointidan farqli o'laroq bu yerda kim onlayn ekani ham ko'rinadi —
    faqat platforma admini uchun (`IsPlatformAdmin`).

    Onlayn foydalanuvchilar ro'yxat boshida turadi (`online_rank`), keyin
    qolganlari eng yangisidan boshlab — admin kartani bosgan zahoti kimlar
    faolligini birinchi sahifadayoq ko'radi.

    Platforma adminlari ham ro'yxatda qoladi. `admin_users_list` ularni
    chiqarib tashlaydi, chunki u yerdagi ro'yxat statistikani (foydalanuvchilar
    soni, o'sish grafigi) oziqlantiradi; bu ro'yxat esa statistika emas —
    "hozir kim ishlayapti" degan savolga javob.

    Redis sozlanmagan yoki javob bermasa har qatordagi `is_online` `null`
    bo'ladi: hammani "oflayn" deb ko'rsatish yolg'on bo'lardi (`presence`
    moduli bo'yicha "ma'lumot yo'q" != "hech kim yo'q"). `last_seen_at` esa
    Redis'ga bog'liq emas — u DB ustuni (`User.touch_last_seen`) va Redis
    o'chgan paytda ham to'g'ri qoladi.

    Paginatsiya: `?page=` / `?page_size=` (default 100, max 200) —
    `admin_users_list` bilan bir xil, foydalanuvchilar jadvali o'n minglab
    qator bo'lishi mumkin.
    """
    from django.contrib.auth import get_user_model
    from django.db.models import Case, IntegerField, Value, When

    from olympy_api.pagination import LargePageNumberPagination

    User = get_user_model()
    online_ids = get_online_user_ids()
    # Redis yo'q bo'lsa tartib oddiy "eng yangisi birinchi" bo'lib qoladi.
    rank_ids = list(online_ids) if online_ids else []
    qs = (
        User.objects
        .only('id', 'full_name', 'normalized_phone', 'created_at', 'last_seen_at')
        .annotate(online_rank=Case(
            When(pk__in=rank_ids, then=Value(0)),
            default=Value(1),
            output_field=IntegerField(),
        ))
        .order_by('online_rank', '-created_at')
    )

    paginator = LargePageNumberPagination()
    paginator.page_size = 100
    page = paginator.paginate_queryset(qs, request)
    rows = [{
        'user_id': u.id,
        'full_name': u.full_name,
        # Raqam maskalanmaydi: endpoint faqat platforma admini uchun va aynan
        # hisobni tanib olish uchun kerak (`admin_shared_ip_detail` bilan bir
        # xil qoida).
        'phone': u.normalized_phone,
        'is_online': (u.id in online_ids) if online_ids is not None else None,
        # Oflayn qatorlar uchun "qachondan beri" (frontend nisbiy satrga
        # aylantiradi). Redis'dan olib bo'lmaydi — u oynadan chiqqan yozuvni
        # o'chiradi; qiymat `User.touch_last_seen()` yozgan doimiy ustundan
        # keladi. Hech qachon so'rov yubormagan (yoki ustun to'lgunicha faol
        # bo'lmagan) hisoblarda NULL.
        'last_seen_at': u.last_seen_at.isoformat() if u.last_seen_at else None,
    } for u in page]
    return paginator.get_paginated_response(rows)


def _weak_threshold():
    """Kuchsiz o'quvchi chegarasi (foiz). 50% dan past — yordam kerak."""
    return 50


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def group_stats(request):
    """GET /api/analytics/group-stats/?center_id=X&group_tag=Y

    Markaz guruhlari (CenterMembership.group_tag) bo'yicha o'quvchi natijalari
    analitikasi. Faqat markaz egasi/menejeri (yoki platforma admini) ko'ra
    oladi — ruxsat `user_can_manage_center` orqali.

    Har bir guruh uchun: o'quvchi soni, o'rtacha ball (mock olimpiada
    foizlari + tashqi natija foizlari bo'yicha), eng kuchli o'quvchi,
    50% dan past ballga ega kuchsiz o'quvchilar va olimpiada qatnashuvlari
    soni (TestAttempt). `group_tag` berilsa faqat shu guruh qaytariladi.

    O'rtacha ball uchun har o'quvchining barcha urinishlari foizga aylantirilib
    o'rtacha olinadi: MockAttempt.score / MockAttempt.total_questions * 100 va
    ExternalOlympiadResult.score / max_score * 100.
    """
    from centers.models import (
        CenterMembership,
        EducationCenter,
        ExternalOlympiadResult,
        MockAttempt,
    )
    from centers.services import user_can_manage_center
    from attempts.models import TestAttempt

    center_id = (request.query_params.get('center_id') or '').strip()
    if not center_id:
        return Response(
            {'detail': 'center_id majburiy'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    center = get_object_or_404(EducationCenter, pk=center_id)
    if not user_can_manage_center(request.user, center):
        return Response({'detail': 'Forbidden'}, status=http_status.HTTP_403_FORBIDDEN)

    group_tag_filter = (request.query_params.get('group_tag') or '').strip()
    weak_threshold = _weak_threshold()

    members_qs = CenterMembership.objects.filter(
        center=center,
        role=CenterMembership.ROLE_STUDENT,
        status=CenterMembership.STATUS_APPROVED,
    ).select_related('user')
    if group_tag_filter:
        members_qs = members_qs.filter(group_tag=group_tag_filter)
    members = list(members_qs)

    if not members:
        return Response({
            'groups': [],
            'overall': {
                'total_students': 0,
                'avg_score': 0,
                'total_olympiad_participations': 0,
            },
        })

    user_ids = [m.user_id for m in members]

    # Har o'quvchining mock olimpiada urinishlari foizlari (score/total*100).
    # Bitta so'rovda yig'amiz va Python'da user bo'yicha guruhlaymiz.
    mock_scores = {}  # user_id -> [percent, ...]
    mock_rows = (
        MockAttempt.objects
        .filter(
            user_id__in=user_ids,
            mock__center=center,
            submitted_at__isnull=False,
            total_questions__gt=0,
        )
        .values('user_id', 'score', 'total_questions')
    )
    for row in mock_rows:
        total = row['total_questions'] or 0
        if total <= 0:
            continue
        pct = round(row['score'] / total * 100, 1)
        mock_scores.setdefault(row['user_id'], []).append(pct)

    # Tashqi (import qilingan) olimpiada natijalari foizlari (score/max*100).
    external_rows = (
        ExternalOlympiadResult.objects
        .filter(center=center, student_id__in=user_ids, max_score__gt=0)
        .values('student_id', 'score', 'max_score')
    )
    for row in external_rows:
        max_score = float(row['max_score'] or 0)
        if max_score <= 0:
            continue
        pct = round(float(row['score'] or 0) / max_score * 100, 1)
        mock_scores.setdefault(row['student_id'], []).append(pct)

    # Platforma olimpiada qatnashuvlari soni (markaz olimpiadalari bo'yicha,
    # diskvalifikatsiyasiz) — har o'quvchi uchun. Bitta GROUP BY so'rov.
    participation_map = {
        row['user_id']: row['cnt']
        for row in (
            TestAttempt.objects
            .filter(
                user_id__in=user_ids,
                olympiad__center=center,
                olympiad__is_deleted=False,
                disqualified=False,
            )
            .values('user_id')
            .annotate(cnt=Count('id'))
        )
    }

    # O'quvchilarni guruh tegi bo'yicha guruhlaymiz. Bo'sh teg — "Guruhsiz".
    UNGROUPED = 'Guruhsiz'
    groups = {}  # group_tag -> {members: [], ...}
    for m in members:
        tag = (m.group_tag or '').strip() or UNGROUPED
        groups.setdefault(tag, []).append(m)

    def _student_avg(uid):
        """O'quvchining o'rtacha foizi (mock + external). Yo'q bo'lsa None."""
        scores = mock_scores.get(uid) or []
        if not scores:
            return None
        return round(sum(scores) / len(scores), 1)

    def _student_name(member):
        user = member.user
        return (
            user.full_name
            or getattr(user, 'normalized_phone', '')
            or "O'quvchi"
        )

    group_results = []
    overall_score_sum = 0.0
    overall_score_count = 0
    overall_participations = 0

    for tag, tag_members in sorted(groups.items()):
        scored = []  # [(member, avg_pct)]
        group_participations = 0
        for member in tag_members:
            group_participations += participation_map.get(member.user_id, 0) or 0
            avg = _student_avg(member.user_id)
            if avg is not None:
                scored.append((member, avg))

        avg_score = (
            round(sum(s for _, s in scored) / len(scored), 1) if scored else 0
        )

        top_student = None
        if scored:
            top_member, top_score = max(scored, key=lambda x: x[1])
            top_student = {
                'name': _student_name(top_member),
                'score': top_score,
                'user_id': top_member.user_id,
            }

        # 50% dan past ballga ega o'quvchilar (eng pastdan boshlab).
        weak = sorted(
            [(m, s) for m, s in scored if s < weak_threshold],
            key=lambda x: x[1],
        )
        weak_students = [
            {
                'name': _student_name(m),
                'score': s,
                'user_id': m.user_id,
            }
            for m, s in weak
        ]

        group_results.append({
            'group_tag': tag,
            'student_count': len(tag_members),
            'avg_score': avg_score,
            'top_student': top_student,
            'weak_students': weak_students,
            'olympiad_participations': group_participations,
        })

        overall_participations += group_participations
        for _, s in scored:
            overall_score_sum += s
            overall_score_count += 1

    overall_avg = (
        round(overall_score_sum / overall_score_count, 1)
        if overall_score_count else 0
    )

    return Response({
        'groups': group_results,
        'overall': {
            'total_students': len(members),
            'avg_score': overall_avg,
            'total_olympiad_participations': overall_participations,
        },
    })


# ─── Admin panel — kengaytirilgan analitika diagrammalari ────────────────────
# Quyidagi endpoint'lar React admin panelining "Tahlil" tabidagi qo'shimcha
# diagrammalarni quvvatlaydi. Hammasi faqat platforma admini uchun
# (IsPlatformAdmin) — metrics_dashboard bilan bir xil himoya. Hisoblash oddiy
# ORM aggregate'lari bilan bajariladi; jadval bo'sh bo'lsa bo'sh ro'yxat
# qaytariladi (frontend graceful fallback ko'rsatadi).
#
# Har bir bloknig natijasi `get_cached_block` orqali metrics_dashboard bilan
# AYNAN bir xil muddatga (METRICS_CACHE_SECONDS) cache'lanadi va `?refresh=1`
# bilan qayta hisoblanadi. Hisoblash mantig'i `_..._data()` funksiyalarida —
# metrics.py'dagi `_retention_block`/`compute_metrics` ajratmasi bilan bir xil.


def _attempts_trend_data():
    """Oxirgi 30 kun kunlik attempt soni (0 bilan to'ldirilgan)."""
    from attempts.models import TestAttempt

    now = timezone.now()
    start = (now - timedelta(days=29)).replace(hour=0, minute=0, second=0, microsecond=0)

    rows = (
        TestAttempt.objects
        .filter(submitted_at__gte=start)
        .annotate(day=TruncDate('submitted_at'))
        .values('day')
        .annotate(count=Count('id'))
    )
    counts = {row['day']: row['count'] for row in rows}

    start_date = start.date()
    today = now.date()
    data = []
    day = start_date
    while day <= today:
        data.append({'date': day.isoformat(), 'count': counts.get(day, 0)})
        day += timedelta(days=1)
    return data


@api_view(['GET'])
@permission_classes([IsPlatformAdmin])
def attempts_trend(request):
    """GET /api/analytics/attempts-trend/ — oxirgi 30 kun kunlik attempt soni.

    Response: [{"date": "2026-06-01", "count": 42}, ...]. Attempt yozilmagan
    kunlar 0 bilan to'ldiriladi (grafik uzluksiz chiziq chizishi uchun).
    """
    return Response(get_cached_block(
        'attempts_trend', _attempts_trend_data, _refresh_requested(request),
    ))


def _olympiad_stats_data():
    """Eng ko'p ishtirokchili 10 olimpiada (DQ'siz)."""
    from django.db.models import Q

    from olympiads.models import Olympiad

    valid = Q(attempts__disqualified=False)
    rows = (
        Olympiad.objects
        .filter(is_deleted=False)
        .annotate(
            participants=Count('attempts', filter=valid),
            avg_score=Avg('attempts__score', filter=valid),
        )
        .filter(participants__gt=0)
        .order_by('-participants')[:10]
        .values('title', 'participants', 'avg_score')
    )
    data = [
        {
            'name': row['title'],
            'participants': row['participants'],
            'avg_score': round(row['avg_score'] or 0, 1),
        }
        for row in rows
    ]
    return data


@api_view(['GET'])
@permission_classes([IsPlatformAdmin])
def olympiad_stats(request):
    """GET /api/analytics/olympiad-stats/ — eng ko'p ishtirokchili 10 olimpiada.

    Har olimpiada uchun ishtirokchilar soni (attempt) va o'rtacha ball.
    Response: [{"name": "...", "participants": 120, "avg_score": 74.5}, ...].
    Diskvalifikatsiya qilingan attempt'lar hisobga olinmaydi.
    """
    return Response(get_cached_block(
        'olympiad_stats', _olympiad_stats_data, _refresh_requested(request),
    ))


def _question_stats_data():
    """Fan va manba bo'yicha savol taqsimoti (umumiy bank)."""
    from questions.models import Question

    # Taqsimot faqat umumiy (olimpiada) banki bo'yicha: o'qituvchilarning
    # shaxsiy Jonli Viktorina savollari umumiy bank statistikasiga kirmaydi.
    olympiad_bank = Question.objects.filter(
        purpose=Question.QUESTION_PURPOSE_OLYMPIAD,
    )
    by_subject = [
        {'name': row['subject'] or "Noma'lum", 'count': row['count']}
        for row in (
            olympiad_bank
            .values('subject')
            .annotate(count=Count('id'))
            .order_by('-count')[:12]
        )
    ]

    # source maydoni choice — inson o'qiy oladigan label bilan birga qaytaramiz.
    source_labels = dict(Question.SOURCE_CHOICES)
    by_source = [
        {
            'name': row['source'] or 'manual',
            'label': source_labels.get(row['source'], row['source'] or 'manual'),
            'count': row['count'],
        }
        for row in (
            olympiad_bank
            .values('source')
            .annotate(count=Count('id'))
            .order_by('-count')
        )
    ]

    return {'by_subject': by_subject, 'by_source': by_source}


@api_view(['GET'])
@permission_classes([IsPlatformAdmin])
def question_stats(request):
    """GET /api/analytics/question-stats/ — fan va manba bo'yicha savol taqsimoti.

    Response: {"by_subject": [{"name": "Matematika", "count": 120}, ...],
               "by_source": [{"name": "manual", "count": 300}, ...]}.
    Fan bo'yicha eng ko'p 12 ta fan qaytariladi (uzun grafikni oldini olish).
    """
    return Response(get_cached_block(
        'question_stats', _question_stats_data, _refresh_requested(request),
    ))


def _revenue_trend_data():
    """Oxirgi 12 oy oylik daromad (faqat success to'lovlar)."""
    from billing.models import PaymentTransaction

    now = timezone.now()
    # 12 oylik oyna boshi (joriy oy + oldingi 11 oy).
    start = (now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
             - timedelta(days=365))
    start = start.replace(day=1)

    rows = (
        PaymentTransaction.objects
        .filter(status=PaymentTransaction.STATUS_SUCCESS, created_at__gte=start)
        .annotate(month=TruncMonth('created_at'))
        .values('month')
        .annotate(total=Sum('amount'))
    )
    totals = {row['month'].strftime('%Y-%m'): row['total'] for row in rows}

    # Joriy oydan 11 oy orqaga — uzluksiz 12 ta nuqta.
    data = []
    year = now.year
    month = now.month
    months = []
    for _ in range(12):
        months.append(f'{year:04d}-{month:02d}')
        month -= 1
        if month == 0:
            month = 12
            year -= 1
    for key in reversed(months):
        amount = totals.get(key)
        data.append({'month': key, 'amount': int(amount) if amount else 0})
    return data


@api_view(['GET'])
@permission_classes([IsPlatformAdmin])
def revenue_trend(request):
    """GET /api/analytics/revenue-trend/ — oxirgi 12 oy oylik daromad.

    Faqat muvaffaqiyatli (success) to'lovlar yig'iladi. Response:
    [{"month": "2026-01", "amount": 450000}, ...]. To'lov bo'lmagan oylar 0.
    PaymentTransaction bo'sh bo'lsa — barcha oylar 0 bilan qaytadi.
    """
    return Response(get_cached_block(
        'revenue_trend', _revenue_trend_data, _refresh_requested(request),
    ))


def _center_stats_data():
    """Markazlar bo'yicha kengaytirilgan analitika (4 ta mustaqil bo'lim)."""
    from attempts.models import TestAttempt
    from centers.models import CenterRatingHistory, EducationCenter
    from olympiads.models import Olympiad

    now = timezone.now()

    # 1) Viloyat bo'yicha tasdiqlangan markazlar.
    by_region = [
        {'name': row['region'] or "Belgilanmagan", 'count': row['count']}
        for row in (
            EducationCenter.objects
            .filter(status=EducationCenter.STATUS_APPROVED)
            .values('region')
            .annotate(count=Count('id'))
            .order_by('-count')[:12]
        )
    ]

    # 2) Premium vs free markazlar oylik olimpiada soni (oxirgi 6 oy).
    months_start = (now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
                    - timedelta(days=160))
    months_start = months_start.replace(day=1)
    olymp_rows = (
        Olympiad.objects
        .filter(is_deleted=False, created_at__gte=months_start)
        .annotate(month=TruncMonth('created_at'))
        .values('month', 'center__is_premium')
        .annotate(count=Count('id'))
    )
    # {month_str: {'premium': n, 'free': n}}
    pf_map = {}
    for row in olymp_rows:
        key = row['month'].strftime('%Y-%m')
        bucket = pf_map.setdefault(key, {'premium': 0, 'free': 0})
        if row['center__is_premium']:
            bucket['premium'] += row['count']
        else:
            bucket['free'] += row['count']
    # Oxirgi 6 oyni uzluksiz tartibda chiqaramiz.
    pf_months = []
    year, month = now.year, now.month
    for _ in range(6):
        pf_months.append(f'{year:04d}-{month:02d}')
        month -= 1
        if month == 0:
            month = 12
            year -= 1
    premium_vs_free = []
    for key in reversed(pf_months):
        bucket = pf_map.get(key, {'premium': 0, 'free': 0})
        premium_vs_free.append({
            'month': key,
            'premium': bucket['premium'],
            'free': bucket['free'],
        })

    # 3) Haftalik diskvalifikatsiya/cheating attempt soni (oxirgi 8 hafta).
    weeks_start = (now - timedelta(weeks=8)).replace(
        hour=0, minute=0, second=0, microsecond=0,
    )
    dq_rows = (
        TestAttempt.objects
        .filter(disqualified=True, submitted_at__gte=weeks_start)
        .annotate(week=TruncWeek('submitted_at'))
        .values('week')
        .annotate(count=Count('id'))
    )
    dq_counts = {row['week'].date(): row['count'] for row in dq_rows}
    # Hafta boshi (dushanba) bo'yicha uzluksiz 8 nuqta.
    week_start = (now - timedelta(days=now.weekday())).date()
    dq_trend = []
    for i in range(7, -1, -1):
        wk = week_start - timedelta(weeks=i)
        dq_trend.append({'week': wk.isoformat(), 'count': dq_counts.get(wk, 0)})

    # 4) Eng yuqori reytingli 5 markazning rating dinamikasi.
    top_centers = list(
        EducationCenter.objects
        .filter(status=EducationCenter.STATUS_APPROVED)
        .order_by('-rating')[:5]
        .values('id', 'name')
    )
    top_ids = [c['id'] for c in top_centers]
    rating_history = {cid: [] for cid in top_ids}
    if top_ids:
        history_start = (now - timedelta(days=180)).date()
        for row in (
            CenterRatingHistory.objects
            .filter(center_id__in=top_ids, date__gte=history_start)
            .order_by('date')
            .values('center_id', 'date', 'score')
        ):
            rating_history[row['center_id']].append({
                'date': row['date'].isoformat(),
                'score': float(row['score'] or 0),
            })
    top_centers_rating = [
        {
            'center_id': c['id'],
            'name': c['name'],
            'points': rating_history.get(c['id'], []),
        }
        for c in top_centers
    ]

    return {
        'by_region': by_region,
        'premium_vs_free': premium_vs_free,
        'dq_trend': dq_trend,
        'top_centers_rating': top_centers_rating,
    }


@api_view(['GET'])
@permission_classes([IsPlatformAdmin])
def center_stats(request):
    """GET /api/analytics/center-stats/ — markazlar bo'yicha kengaytirilgan analitika.

    Response:
      by_region        — viloyat bo'yicha tasdiqlangan markazlar soni
      premium_vs_free  — oxirgi 6 oy premium va free markazlar olimpiada soni
      dq_trend         — oxirgi 8 hafta diskvalifikatsiya/cheating attempt soni
      top_centers_rating — eng yuqori reytingli 5 markazning rating dinamikasi

    Har bo'lim mustaqil hisoblanadi; tegishli jadval bo'sh bo'lsa o'sha bo'lim
    bo'sh ro'yxat qaytaradi (frontend "Ma'lumot yo'q" ko'rsatadi).
    """
    return Response(get_cached_block(
        'center_stats', _center_stats_data, _refresh_requested(request),
    ))


# ─── Suiiste'mol (abuse) signallari ──────────────────────────────────────────
# "Tahlil" tabining oxirgi bo'limi. Yuqoridagi bloklardan farqi faqat
# MAVZUDA: himoya (IsPlatformAdmin), cache (get_cached_block) va javob shakli
# aynan o'shalarnikidek.
#
# Bu yerdagi hech bir signal chora KO'RMAYDI va bayroq YARATMAYDI —
# `moderation.tasks` bilan aralashtirmaslik kerak: u navbatga yozadi, bu esa
# navbat va ogohlantirishlar tarixini faqat SANAYDI. Ro'yxatlar qo'lda
# tekshirish uchun nomzod beradi, xolos.

# Bayroq/ogohlantirish dinamikasi oynasi — `_attempts_trend_data` bilan bir
# xil granularlik (kunlik, 30 kun).
ABUSE_TREND_DAYS = 30

# "Eng ko'p ogohlantirilgan" ro'yxati qaysi davr uchun va nechta qator
# (kesim `_olympiad_stats_data` dagi top-10 bilan bir xil).
ABUSE_TOP_WINDOW_DAYS = 30
ABUSE_TOP_LIMIT = 10

# Kontent portlashi: qisqa vaqtda g'ayrioddiy ko'p savol yaratgan hisoblar.
# Chegara ATAYLAB oddiy va qat'iy konstanta (statistik model emas) — bu
# birinchi bosqich signali, ro'yxatdagi hisobga avtomatik chora ko'rilmaydi.
# Oyna `moderation.tasks.SUSPICIOUS_IP_WINDOW_DAYS` bilan bir xil sababdan
# 1 kun: aynan oxirgi sutkadagi portlash ko'rinadi. Uzunroq oynada bir necha
# hafta davomida savol bankini to'ldirgan oddiy o'qituvchi ham ro'yxatga
# tushib qolardi.
CONTENT_BURST_WINDOW_DAYS = 1
CONTENT_BURST_MIN_QUESTIONS = 100

# Ogohlantirishlar seriyasining kaliti. `ModerationFlag.FLAG_TYPE_CHOICES`
# kalitlari bilan to'qnashmasligi kerak — shuning uchun xuddi manba
# maydonidagidek nom (`Notification.TYPE_ACCOUNT_WARNING`).
WARNING_SERIES_KEY = 'account_warning'


def _abuse_stats_data():
    """Suiiste'mol signallari (3 ta mustaqil bo'lim)."""
    from moderation.models import ModerationFlag
    from notifications.models import Notification
    from questions.models import Question

    now = timezone.now()

    # 1) Kunlik bayroq + ogohlantirish soni (oxirgi 30 kun).
    #
    # Seriyalar ro'yxati ham javobda qaytadi: bayroq turining o'zbekcha nomi
    # BITTA joyda — modelning `FLAG_TYPE_CHOICES` ida — turadi (moderatsiya
    # navbatidagi `flag_type_label` bilan bir xil qoida), ya'ni yangi tur
    # qo'shilganda diagramma frontendga tegmasdan o'zi yangilanadi.
    series = [
        {'key': key, 'label': label}
        for key, label in ModerationFlag.FLAG_TYPE_CHOICES
    ]
    # Admin qo'lda yuborgan ogohlantirishlar avtomatik bayroq EMAS (alohida
    # jadval — `Notification`), lekin bir xil savolga javob beradi: "qancha
    # ish ochildi". Shuning uchun bir diagrammada, alohida seriya sifatida.
    series.append({'key': WARNING_SERIES_KEY, 'label': 'Ogohlantirish'})

    trend_start = now - timedelta(days=ABUSE_TREND_DAYS)
    # {sana: {seriya_kaliti: son}} — ikkala manba ham DB'da guruhlanadi.
    counts = {}
    for row in (
        ModerationFlag.objects
        .filter(created_at__gte=trend_start)
        .annotate(day=TruncDate('created_at'))
        .values('day', 'flag_type')
        .annotate(count=Count('id'))
    ):
        counts.setdefault(row['day'], {})[row['flag_type']] = row['count']
    for row in (
        Notification.objects
        .filter(
            type=Notification.TYPE_ACCOUNT_WARNING,
            created_at__gte=trend_start,
        )
        .annotate(day=TruncDate('created_at'))
        .values('day')
        .annotate(count=Count('id'))
    ):
        counts.setdefault(row['day'], {})[WARNING_SERIES_KEY] = row['count']

    # Bo'sh kunlar 0 bilan to'ldiriladi (attempt trendi bilan bir xil).
    #
    # Kunlar `timezone.localdate()` bo'yicha sanaladi, `now.date()` bo'yicha
    # emas: `TruncDate` sanani MAHALLIY zonada (settings.TIME_ZONE =
    # Asia/Tashkent, UTC+5) kesadi. UTC sanasi bilan solishtirilsa har kuni
    # 19:00 UTC dan keyin yozilgan qatorlar "ertangi" kunga tushib, oxirgi
    # kun grafikdan butunlay yo'qolardi. Filtr esa oddiy rolling oyna —
    # oynadan chetdagi kun quyidagi siklga umuman kirmaydi.
    today = timezone.localdate()
    flag_trend = []
    day = today - timedelta(days=ABUSE_TREND_DAYS - 1)
    while day <= today:
        bucket = counts.get(day, {})
        flag_trend.append({
            'date': day.isoformat(),
            **{s['key']: bucket.get(s['key'], 0) for s in series},
        })
        day += timedelta(days=1)

    # 2) Eng ko'p ogohlantirilgan hisoblar (oxirgi 30 kun).
    # Telefon raqami maskalanmaydi — endpoint faqat platforma admini uchun va
    # aynan hisobni tanib olish uchun kerak (`online_users_detail` bilan bir
    # xil qoida).
    top_warned_users = [
        {
            'user_id': row['user_id'],
            'full_name': row['user__full_name'],
            'phone': row['user__normalized_phone'],
            'warnings': row['warnings'],
            'last_warned_at': row['last_warned_at'].isoformat(),
        }
        for row in (
            Notification.objects
            .filter(
                type=Notification.TYPE_ACCOUNT_WARNING,
                created_at__gte=now - timedelta(days=ABUSE_TOP_WINDOW_DAYS),
            )
            .values('user_id', 'user__full_name', 'user__normalized_phone')
            .annotate(warnings=Count('id'), last_warned_at=Max('created_at'))
            # Ikkinchi darajali tartib (`user_id`) — teng sonli hisoblar
            # kesib olinganda natija har safar bir xil bo'lsin.
            .order_by('-warnings', 'user_id')[:ABUSE_TOP_LIMIT]
        )
    ]

    # 3) Kontent portlashi: 1 kunda chegaradan ko'p savol yaratgan hisoblar.
    # Filtr agregatdan KEYIN qo'llanadi (HAVING) — barcha qatorlarni Python'ga
    # olib sanash emas. Muallifi yo'q (`created_by=NULL`) savollar tushib
    # qoladi: ular hech kimga bog'lanmaydi, ya'ni signal ham bermaydi.
    content_outliers = [
        {
            'user_id': row['created_by_id'],
            'full_name': row['created_by__full_name'],
            'phone': row['created_by__normalized_phone'],
            'questions': row['questions'],
            'last_created_at': row['last_created_at'].isoformat(),
        }
        for row in (
            Question.objects
            .filter(
                created_by__isnull=False,
                created_at__gte=now - timedelta(days=CONTENT_BURST_WINDOW_DAYS),
            )
            .values(
                'created_by_id', 'created_by__full_name',
                'created_by__normalized_phone',
            )
            .annotate(questions=Count('id'), last_created_at=Max('created_at'))
            .filter(questions__gte=CONTENT_BURST_MIN_QUESTIONS)
            .order_by('-questions', 'created_by_id')[:ABUSE_TOP_LIMIT]
        )
    ]

    return {
        'flag_series': series,
        'flag_trend': flag_trend,
        'top_warned_users': top_warned_users,
        'content_outliers': content_outliers,
        # Ekranda AYNAN qo'llanilgan chegaralar ko'rinsin (shared-IP bloki
        # `min_accounts`/`window_days` ni qaytargani bilan bir xil sabab):
        # chegarani o'zgartirish frontend matniga tegmaydi.
        'thresholds': {
            'trend_days': ABUSE_TREND_DAYS,
            'top_window_days': ABUSE_TOP_WINDOW_DAYS,
            'burst_window_days': CONTENT_BURST_WINDOW_DAYS,
            'burst_min_questions': CONTENT_BURST_MIN_QUESTIONS,
        },
    }


@api_view(['GET'])
@permission_classes([IsPlatformAdmin])
def abuse_stats(request):
    """GET /api/analytics/abuse-stats/ — suiiste'mol signallari.

    Response:
      flag_series      — diagramma seriyalari: [{"key", "label"}, ...]
                         (bayroq turlari + "Ogohlantirish")
      flag_trend       — oxirgi 30 kun kunlik soni, har kunda har seriya
                         uchun kalit: [{"date", "question", "suspicious_ip",
                         "account_warning"}, ...]
      top_warned_users — oxirgi 30 kunda eng ko'p ogohlantirilgan 10 hisob
      content_outliers — oxirgi 1 kunda 100+ savol yaratgan hisoblar
      thresholds       — yuqoridagi chegaralarning qo'llanilgan qiymatlari

    Faqat o'qish uchun: hech kim bloklanmaydi, bayroq qo'yilmaydi. Bo'sh
    jadvalda tegishli bo'lim bo'sh ro'yxat qaytaradi.
    """
    return Response(get_cached_block(
        'abuse_stats', _abuse_stats_data, _refresh_requested(request),
    ))


@api_view(['GET'])
@permission_classes([IsPlatformAdmin])
def admin_live_radar(request):
    """GET /api/analytics/live-radar/ — Jonli imtihon va test jarayonlari radari."""
    from attempts.models import TestSession
    from olympiads.models import Olympiad

    active_sessions_qs = TestSession.objects.filter(status=TestSession.STATUS_ACTIVE).select_related('user', 'olympiad')
    pending_review_qs = TestSession.objects.filter(status=TestSession.STATUS_PENDING_REVIEW).select_related('user', 'olympiad')
    active_olympiads_qs = Olympiad.objects.filter(is_deleted=False, status=Olympiad.STATUS_ACTIVE).select_related('center')

    live_sessions = [
        {
            'id': s.id,
            'user_id': s.user_id,
            'user_name': s.user.full_name or s.user.normalized_phone,
            'phone': s.user.normalized_phone,
            'olympiad_id': s.olympiad_id,
            'olympiad_title': s.olympiad.title,
            'status': s.status,
            'started_at': s.started_at.isoformat(),
            'camera_consent': s.camera_consent_given,
            'microphone_consent': s.microphone_consent_given,
        }
        for s in active_sessions_qs.order_by('-started_at')[:20]
    ]

    pending_reviews = [
        {
            'id': s.id,
            'user_id': s.user_id,
            'user_name': s.user.full_name or s.user.normalized_phone,
            'olympiad_title': s.olympiad.title,
            'cheating_reason': s.cheating_reason,
            'review_requested_at': s.review_requested_at.isoformat() if s.review_requested_at else None,
        }
        for s in pending_review_qs.order_by('-review_requested_at')[:10]
    ]

    ongoing_olympiads = [
        {
            'id': o.id,
            'title': o.title,
            'subject': o.subject,
            'center_name': o.center.name if o.center else 'Olympy Platform',
            'duration_minutes': o.duration_minutes,
            'live_active_count': TestSession.objects.filter(olympiad=o, status=TestSession.STATUS_ACTIVE).count(),
        }
        for o in active_olympiads_qs[:10]
    ]

    return Response({
        'active_sessions_count': active_sessions_qs.count(),
        'pending_review_count': pending_review_qs.count(),
        'ongoing_olympiads_count': active_olympiads_qs.count(),
        'live_sessions': live_sessions,
        'pending_reviews': pending_reviews,
        'ongoing_olympiads': ongoing_olympiads,
    })


@api_view(['GET'])
@permission_classes([IsPlatformAdmin])
def admin_recent_transactions(request):
    """GET /api/analytics/recent-transactions/ — So'nggi to'lov tranzaksiyalari ro'yxati."""
    from billing.models import PaymentTransaction

    qs = (
        PaymentTransaction.objects
        .select_related('user', 'plan')
        .order_by('-created_at')[:25]
    )

    rows = [
        {
            'id': tx.id,
            'user_id': tx.user_id,
            'user_name': tx.user.full_name if tx.user else 'Noma\'lum',
            'phone': tx.user.normalized_phone if tx.user else '—',
            'plan_name': tx.plan.name if tx.plan else 'Premium obuna',
            'amount': int(tx.amount),
            'provider': tx.provider,
            'status': tx.status,
            'created_at': tx.created_at.isoformat(),
            'failure_reason': tx.failure_reason,
        }
        for tx in qs
    ]

    return Response({'transactions': rows})
