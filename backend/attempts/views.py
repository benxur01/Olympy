from django.shortcuts import get_object_or_404
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
    and the olympiad must be active.
    """
    serializer = SubmitAttemptSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    olympiad = get_object_or_404(Olympiad, pk=serializer.validated_data['olympiad'])

    if olympiad.status != Olympiad.STATUS_ACTIVE:
        return Response({'detail': "Olimpiada faol emas"},
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
    for q in questions:
        chosen = answers.get(str(q.id))
        if chosen is None:
            chosen = answers.get(q.id)  # tolerate int keys
        if chosen is not None and int(chosen) == q.correct_answer:
            correct += 1
    wrong = total - correct
    score = round((correct / total) * 100) if total else 0

    # Compute rank (higher score, then lower time, wins).
    better = TestAttempt.objects.filter(olympiad=olympiad, score__gt=score).count()
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
    return Response(TestAttemptSerializer(attempt).data,
                    status=http_status.HTTP_201_CREATED)


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

    Without ``olympiad`` query param, returns the top scores across all
    olympiads (useful for global leaderboards).
    """
    qs = TestAttempt.objects.all().select_related('user', 'olympiad', 'olympiad__center')
    olympiad_id = request.query_params.get('olympiad')
    if olympiad_id:
        qs = qs.filter(olympiad_id=olympiad_id)
    qs = qs.order_by('-score', 'time_spent')[:200]
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
