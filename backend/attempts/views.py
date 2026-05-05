from datetime import timedelta

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status as http_status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from centers.models import CenterMembership
from olympiads.models import Olympiad

from .models import TestAttempt, TestSession
from .serializers import SubmitAttemptSerializer, TestAttemptSerializer
from .session_utils import score_session_answers, session_is_expired


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def submit_attempt(request):
    """POST /api/attempts/ — student submits answers, server scores them.

    Enforces: the user must be an *approved* student of the olympiad's center,
    the olympiad must be active, and one user can only submit once per
    olympiad. Score is a weighted percentage based on ``Question.score``.
    """
    serializer = SubmitAttemptSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    with transaction.atomic():
        olympiad = get_object_or_404(
            Olympiad.objects.select_for_update(),
            pk=serializer.validated_data['olympiad'],
        )

        if TestAttempt.objects.filter(user=request.user, olympiad=olympiad).exists():
            return Response(
                {'detail': "Siz bu olimpiadaga allaqachon qatnashgansiz"},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        if olympiad.status != Olympiad.STATUS_ACTIVE:
            return Response({'detail': "Olimpiada faol emas"},
                            status=http_status.HTTP_400_BAD_REQUEST)
        now = timezone.now()
        if olympiad.start_datetime and now < olympiad.start_datetime:
            return Response({'detail': 'Olimpiada hali boshlanmagan'},
                            status=http_status.HTTP_400_BAD_REQUEST)
        end_time = (
            olympiad.start_datetime + timedelta(minutes=olympiad.duration_minutes)
            if olympiad.start_datetime and olympiad.duration_minutes else None
        )
        if end_time and now > end_time:
            return Response({'detail': 'Olimpiada vaqti tugagan'},
                            status=http_status.HTTP_400_BAD_REQUEST)
        is_approved_student = CenterMembership.objects.filter(
            user=request.user, center=olympiad.center,
            role=CenterMembership.ROLE_STUDENT,
            status=CenterMembership.STATUS_APPROVED,
        ).exists()
        if not is_approved_student:
            return Response(
                {'detail': "Olimpiadaga qatnashish uchun o'quv markaz tasdig'i kerak"},
                status=http_status.HTTP_403_FORBIDDEN,
            )

        session = (
            TestSession.objects
            .select_for_update()
            .filter(user=request.user, olympiad=olympiad)
            .first()
        )
        if not session:
            return Response(
                {'detail': "Avval test savollarini boshlang"},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        if session.status == TestSession.STATUS_DISQUALIFIED:
            return Response(
                {'detail': "Siz cheating qildingiz. Olimpiada yakunlandi."},
                status=http_status.HTTP_403_FORBIDDEN,
            )
        if session_is_expired(session, olympiad):
            return Response({'detail': 'Test vaqti tugagan'},
                            status=http_status.HTTP_400_BAD_REQUEST)

        answers = serializer.validated_data.get('answers', {}) or {}
        scored = score_session_answers(session, olympiad, answers)
        total = scored['total']
        correct = scored['correct']
        wrong = scored['wrong']
        max_possible = scored['max_possible']
        score = scored['score']
        time_spent = max(0, int((timezone.now() - session.started_at).total_seconds()))
        if olympiad.duration_minutes:
            time_spent = min(time_spent, olympiad.duration_minutes * 60)

        attempt = TestAttempt.objects.create(
            user=request.user,
            olympiad=olympiad,
            answers=answers,
            score=score,
            correct_count=correct,
            wrong_count=wrong,
            total_questions=total,
            time_spent=time_spent,
            rank=None,
        )

        # Re-rank ALL attempts on this olympiad. Lock them all under
        # select_for_update so concurrent submissions cannot leave stale
        # ranks. Tie-break: higher score, then less time spent, then earlier
        # submission.
        all_attempts = list(
            TestAttempt.objects
            .select_for_update()
            .filter(olympiad=olympiad)
            .order_by('-score', 'time_spent', 'submitted_at')
        )
        to_update = []
        for index, item in enumerate(all_attempts, start=1):
            if item.rank != index:
                item.rank = index
                to_update.append(item)
        if to_update:
            TestAttempt.objects.bulk_update(to_update, ['rank'])
        session.status = TestSession.STATUS_COMPLETED
        session.save(update_fields=['status'])

        attempt.refresh_from_db(fields=['rank'])
        data = TestAttemptSerializer(attempt).data
        data['max_score'] = max_possible
        return Response(data, status=http_status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def report_cheating(request):
    """POST /api/attempts/cheating/ — disqualify current user's test session."""
    olympiad_id = request.data.get('olympiad')
    reason = str(request.data.get('reason') or 'test_window_left')[:120]
    if not olympiad_id:
        return Response({'detail': 'olympiad majburiy'}, status=http_status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        olympiad = get_object_or_404(
            Olympiad.objects.select_for_update().select_related('center', 'center__owner'),
            pk=olympiad_id,
        )
        is_approved_student = CenterMembership.objects.filter(
            user=request.user,
            center=olympiad.center,
            role=CenterMembership.ROLE_STUDENT,
            status=CenterMembership.STATUS_APPROVED,
        ).exists()
        if not is_approved_student:
            return Response({'detail': 'Forbidden'}, status=http_status.HTTP_403_FORBIDDEN)
        if TestAttempt.objects.filter(user=request.user, olympiad=olympiad).exists():
            return Response({'disqualified': False, 'detail': 'Attempt already submitted'})
        session = (
            TestSession.objects
            .select_for_update()
            .filter(user=request.user, olympiad=olympiad)
            .first()
        )
        if not session:
            return Response({'detail': "Test session topilmadi"}, status=http_status.HTTP_400_BAD_REQUEST)
        if session.status == TestSession.STATUS_COMPLETED:
            return Response({'disqualified': False, 'detail': 'Attempt already submitted'})
        notify = session.status != TestSession.STATUS_DISQUALIFIED
        session.status = TestSession.STATUS_DISQUALIFIED
        session.disqualified_at = session.disqualified_at or timezone.now()
        session.cheating_reason = session.cheating_reason or reason
        session.save(update_fields=['status', 'disqualified_at', 'cheating_reason'])

    if notify:
        try:
            from notifications.services import send_cheating_detected_notification

            send_cheating_detected_notification(request.user, olympiad, olympiad.center, reason)
        except Exception:
            import logging
            logging.getLogger(__name__).exception('cheating notification failed')
    return Response({
        'disqualified': True,
        'detail': "Siz cheating qildingiz. Olimpiada yakunlandi.",
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_results(request):
    """GET /api/results/me/ — current user's attempt history.

    Asosiy frontend ko'rinishlari (StudentDashboard, Profile) so'nggi 200
    tagacha attemptga muhtoj. Limit qo'shilmasa, ko'p yillik foydalanuvchilarda
    javob hajmi haddan oshib ketardi.
    """
    qs = TestAttempt.objects.filter(user=request.user).select_related('olympiad')[:500]
    return Response(TestAttemptSerializer(qs, many=True).data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_stats(request):
    """GET /api/results/me/stats/ — aggregated per-subject stats.

    Returns:
      {
        total_attempts, average_score, best_rank,
        subjects: [{subject, attempts, average_score}, ...]
      }
    """
    qs = TestAttempt.objects.filter(user=request.user).select_related('olympiad')
    attempts = list(qs)
    total = len(attempts)
    if total == 0:
        return Response({
            'total_attempts': 0,
            'average_score': 0,
            'best_rank': None,
            'subjects': [],
        })
    avg = round(sum(a.score for a in attempts) / total, 1)
    ranks = [a.rank for a in attempts if a.rank]
    best_rank = min(ranks) if ranks else None
    subject_buckets = {}
    for a in attempts:
        subj = a.olympiad.subject if a.olympiad else '—'
        bucket = subject_buckets.setdefault(subj, {'subject': subj, 'attempts': 0, 'total': 0})
        bucket['attempts'] += 1
        bucket['total'] += a.score
    subjects = [
        {
            'subject': b['subject'],
            'attempts': b['attempts'],
            'average_score': round(b['total'] / b['attempts'], 1) if b['attempts'] else 0,
        }
        for b in subject_buckets.values()
    ]
    subjects.sort(key=lambda x: -x['average_score'])
    return Response({
        'total_attempts': total,
        'average_score': avg,
        'best_rank': best_rank,
        'subjects': subjects,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def leaderboard(request):
    """GET /api/leaderboard/?olympiad=<id>  — ranked attempts.

    Without ``olympiad`` query param, returns the top scores within the
    requesting user's approved centers (per-center isolation).
    """
    qs = (
        TestAttempt.objects
        .select_related('user', 'olympiad', 'olympiad__center')
        .order_by('-score', 'time_spent')
    )
    olympiad_id = request.query_params.get('olympiad')
    if olympiad_id:
        olympiad = get_object_or_404(Olympiad.objects.select_related('center'), pk=olympiad_id)
        if not request.user.is_platform_admin:
            allowed = CenterMembership.objects.filter(
                user=request.user,
                center=olympiad.center,
                status=CenterMembership.STATUS_APPROVED,
            ).exists()
            if not allowed:
                return Response({'detail': 'Forbidden'}, status=http_status.HTTP_403_FORBIDDEN)
        qs = qs.filter(olympiad=olympiad)
    if not olympiad_id:
        allowed_center_ids = CenterMembership.objects.filter(
            user=request.user, status=CenterMembership.STATUS_APPROVED,
        ).values_list('center_id', flat=True)
        qs = qs.filter(olympiad__center_id__in=allowed_center_ids)
    qs = qs[:200]
    return Response([
        {
            'rank': i + 1,
            'attempt_id': a.id,
            'user_id': a.user_id,
            'name': a.user.full_name,
            'center': a.olympiad.center.name,
            'organization_type': a.olympiad.center.organization_type,
            'country': a.olympiad.center.country,
            'region': a.olympiad.center.region,
            'district': a.olympiad.center.district,
            'subject': a.olympiad.subject,
            'score': a.score,
            'time_spent': a.time_spent,
        }
        for i, a in enumerate(qs)
    ])
