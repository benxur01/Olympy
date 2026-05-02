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

from .models import TestAttempt
from .serializers import SubmitAttemptSerializer, TestAttemptSerializer


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

        answers = serializer.validated_data.get('answers', {}) or {}
        questions = list(olympiad.questions.all())
        total = len(questions)
        correct = 0
        earned_score = 0
        for q in questions:
            chosen = answers.get(str(q.id))
            if chosen is None:
                chosen = answers.get(q.id)  # tolerate int keys
            if chosen is not None and int(chosen) == q.correct_answer:
                correct += 1
                earned_score += q.score
        wrong = total - correct
        max_possible = sum(q.score for q in questions)
        score = round((earned_score / max_possible) * 100) if max_possible else 0

        # Compute rank under select_for_update lock so concurrent submissions
        # cannot land on the same rank.
        better = (
            TestAttempt.objects
            .select_for_update()
            .filter(olympiad=olympiad, score__gt=score)
            .count()
        )
        rank = better + 1

        attempt = TestAttempt.objects.create(
            user=request.user,
            olympiad=olympiad,
            answers=answers,
            score=score,
            correct_count=correct,
            wrong_count=wrong,
            total_questions=total,
            time_spent=serializer.validated_data.get('time_spent', 0),
            rank=rank,
        )

        data = TestAttemptSerializer(attempt).data
        data['max_score'] = max_possible
        return Response(data, status=http_status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_results(request):
    """GET /api/results/me/ — current user's attempt history."""
    qs = TestAttempt.objects.filter(user=request.user).select_related('olympiad')
    return Response(TestAttemptSerializer(qs, many=True).data)


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
        qs = qs.filter(olympiad_id=olympiad_id)
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
            'subject': a.olympiad.subject,
            'score': a.score,
            'time_spent': a.time_spent,
        }
        for i, a in enumerate(qs)
    ])
