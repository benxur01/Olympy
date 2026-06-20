"""Analitika API endpoint'lari.

Metrikalar (`analytics.metrics.get_metrics`) ilgari faqat Django admin
dashboard'i orqali ko'rinardi. Bu modul shu metrikalarni JSON API sifatida ham
ochadi — faqat admin (staff/superuser) foydalanuvchilar uchun. Frontend admin
paneli (React) shu endpointdan retention/conversion/premium ko'rsatkichlarini
o'qishi mumkin.

Hisoblash mantig'i bitta joyda (metrics.py) qoladi — bu view faqat shu
funksiyani HTTP orqali taqdim etadi.
"""
from django.db.models import Count
from django.shortcuts import get_object_or_404
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
