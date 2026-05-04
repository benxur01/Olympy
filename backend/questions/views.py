from django.shortcuts import get_object_or_404
from rest_framework import status as http_status
from rest_framework.decorators import api_view, parser_classes, permission_classes, throttle_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

from centers.models import CenterMembership

from .ai_generation import generate_questions
from .models import Question
from .serializers import QuestionSerializer


class AiQuestionRateThrottle(UserRateThrottle):
    scope = 'ai_question'


def _user_can_create_for_center(user, center_id):
    """Teacher/Manager/Owner with approved membership can create questions."""
    if user.is_platform_admin:
        return True
    return CenterMembership.objects.filter(
        user=user, center_id=center_id,
        role__in=[
            CenterMembership.ROLE_TEACHER,
            CenterMembership.ROLE_MANAGER,
            CenterMembership.ROLE_OWNER,
        ],
        status=CenterMembership.STATUS_APPROVED,
    ).exists()


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
@parser_classes([JSONParser, MultiPartParser, FormParser])
def questions_list_create(request):
    """GET /api/questions/?center=<id>  — list questions for a center.
    POST /api/questions/                 — create one (approved teacher/manager/owner only).
    """
    if request.method == 'GET':
        center_id = request.query_params.get('center')
        if not center_id:
            return Response(
                {'detail': 'center query parametri majburiy'},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        if not _user_can_create_for_center(request.user, center_id):
            return Response(
                {'detail': 'Forbidden'},
                status=http_status.HTTP_403_FORBIDDEN,
            )
        qs = Question.objects.filter(center_id=center_id)
        return Response(QuestionSerializer(qs, many=True).data)

    serializer = QuestionSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    center_id = serializer.validated_data['center'].id
    if not _user_can_create_for_center(request.user, center_id):
        return Response(
            {'detail': "Savol yaratish uchun o'qituvchi/manager arizangiz tasdiqlanishi kerak"},
            status=http_status.HTTP_403_FORBIDDEN,
        )
    question = serializer.save(created_by=request.user)
    return Response(QuestionSerializer(question).data,
                    status=http_status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([AiQuestionRateThrottle])
def generate_ai_questions(request):
    """POST /api/questions/generate-ai/ — preview AI questions before saving."""
    center_id = request.data.get('center')
    if not center_id:
        return Response(
            {'detail': 'center majburiy'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    if not _user_can_create_for_center(request.user, center_id):
        return Response(
            {'detail': "Savol yaratish uchun o'qituvchi/manager arizangiz tasdiqlanishi kerak"},
            status=http_status.HTTP_403_FORBIDDEN,
        )

    result = generate_questions(
        subject=request.data.get('subject'),
        topic=request.data.get('topic'),
        count=request.data.get('count', 10),
        difficulty=request.data.get('difficulty', 'medium'),
        question_type=request.data.get('question_type'),
    )
    if not result.get('ok'):
        status_code = (
            http_status.HTTP_400_BAD_REQUEST
            if result.get('error') in ("Fan va mavzu majburiy.",)
            else http_status.HTTP_503_SERVICE_UNAVAILABLE
        )
        return Response(
            {'detail': result.get('error') or "AI savol yarata olmadi"},
            status=status_code,
        )
    return Response({'questions': result['questions']})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def olympiad_questions(request, olympiad_id):
    from datetime import timedelta

    from django.utils import timezone

    from olympiads.models import Olympiad

    olympiad = get_object_or_404(Olympiad, pk=olympiad_id)
    if olympiad.status != Olympiad.STATUS_ACTIVE:
        return Response({'detail': 'Olimpiada faol emas'}, status=http_status.HTTP_403_FORBIDDEN)
    # Time-window check (timezone-aware): the celery finisher may not have run
    # yet, so don't trust status alone.
    now = timezone.now()
    if olympiad.start_datetime and now < olympiad.start_datetime:
        return Response(
            {'detail': "Olimpiada hali boshlanmagan"},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    if olympiad.start_datetime and olympiad.duration_minutes:
        end_time = olympiad.start_datetime + timedelta(minutes=olympiad.duration_minutes)
        if now > end_time:
            return Response(
                {'detail': "Olimpiada vaqti tugagan"},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
    membership = CenterMembership.objects.filter(
        user=request.user,
        center=olympiad.center,
        status=CenterMembership.STATUS_APPROVED,
        role=CenterMembership.ROLE_STUDENT,
    ).first()
    if not membership and not request.user.is_platform_admin:
        return Response({'detail': 'Forbidden'}, status=http_status.HTTP_403_FORBIDDEN)
    from attempts.models import TestAttempt
    from attempts.session_utils import (
        get_or_create_test_session,
        questions_payload,
        session_is_expired,
    )

    if TestAttempt.objects.filter(user=request.user, olympiad=olympiad).exists():
        return Response(
            {'detail': "Siz bu olimpiadaga allaqachon qatnashgansiz"},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    session = get_or_create_test_session(request.user, olympiad)
    if session_is_expired(session, olympiad):
        return Response(
            {'detail': "Test vaqti tugagan"},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    return Response(questions_payload(session, olympiad))
