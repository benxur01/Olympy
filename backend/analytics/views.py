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

from django.db.models import Avg, Count, Sum
from django.db.models.functions import TruncDate, TruncMonth, TruncWeek
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status as http_status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsPlatformAdmin

from .metrics import METRICS_CACHE_SECONDS, get_metrics


@api_view(['GET'])
@permission_classes([IsPlatformAdmin])
def metrics_dashboard(request):
    """GET /api/analytics/metrics/ — retention/conversion/premium metrikalari.

    Faqat platforma admini (is_platform_admin) uchun. `?refresh=1` cache'ni
    chetlab o'tib qayta hisoblaydi (admin dashboard bilan bir xil xulq).
    """
    force = request.GET.get('refresh') in ('1', 'true', 'True')
    metrics = get_metrics(force_refresh=force)
    return Response({
        **metrics,
        'cache_minutes': METRICS_CACHE_SECONDS // 60,
    })


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


@api_view(['GET'])
@permission_classes([IsPlatformAdmin])
def attempts_trend(request):
    """GET /api/analytics/attempts-trend/ — oxirgi 30 kun kunlik attempt soni.

    Response: [{"date": "2026-06-01", "count": 42}, ...]. Attempt yozilmagan
    kunlar 0 bilan to'ldiriladi (grafik uzluksiz chiziq chizishi uchun).
    """
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
    return Response(data)


@api_view(['GET'])
@permission_classes([IsPlatformAdmin])
def olympiad_stats(request):
    """GET /api/analytics/olympiad-stats/ — eng ko'p ishtirokchili 10 olimpiada.

    Har olimpiada uchun ishtirokchilar soni (attempt) va o'rtacha ball.
    Response: [{"name": "...", "participants": 120, "avg_score": 74.5}, ...].
    Diskvalifikatsiya qilingan attempt'lar hisobga olinmaydi.
    """
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
    return Response(data)


@api_view(['GET'])
@permission_classes([IsPlatformAdmin])
def question_stats(request):
    """GET /api/analytics/question-stats/ — fan va manba bo'yicha savol taqsimoti.

    Response: {"by_subject": [{"name": "Matematika", "count": 120}, ...],
               "by_source": [{"name": "manual", "count": 300}, ...]}.
    Fan bo'yicha eng ko'p 12 ta fan qaytariladi (uzun grafikni oldini olish).
    """
    from questions.models import Question

    by_subject = [
        {'name': row['subject'] or "Noma'lum", 'count': row['count']}
        for row in (
            Question.objects
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
            Question.objects
            .values('source')
            .annotate(count=Count('id'))
            .order_by('-count')
        )
    ]

    return Response({'by_subject': by_subject, 'by_source': by_source})


@api_view(['GET'])
@permission_classes([IsPlatformAdmin])
def revenue_trend(request):
    """GET /api/analytics/revenue-trend/ — oxirgi 12 oy oylik daromad.

    Faqat muvaffaqiyatli (success) to'lovlar yig'iladi. Response:
    [{"month": "2026-01", "amount": 450000}, ...]. To'lov bo'lmagan oylar 0.
    PaymentTransaction bo'sh bo'lsa — barcha oylar 0 bilan qaytadi.
    """
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
    return Response(data)


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

    return Response({
        'by_region': by_region,
        'premium_vs_free': premium_vs_free,
        'dq_trend': dq_trend,
        'top_centers_rating': top_centers_rating,
    })
