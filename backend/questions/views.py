from django.shortcuts import get_object_or_404
from rest_framework import status as http_status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from centers.models import CenterMembership

from .models import Question
from .serializers import QuestionSerializer


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


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def olympiad_questions(request, olympiad_id):
    from olympiads.models import Olympiad

    olympiad = get_object_or_404(Olympiad, pk=olympiad_id)
    if olympiad.status != Olympiad.STATUS_ACTIVE:
        return Response({'detail': 'Olimpiada faol emas'}, status=http_status.HTTP_403_FORBIDDEN)
    membership = CenterMembership.objects.filter(
        user=request.user,
        center=olympiad.center,
        status=CenterMembership.STATUS_APPROVED,
        role=CenterMembership.ROLE_STUDENT,
    ).first()
    if not membership and not request.user.is_platform_admin:
        return Response({'detail': 'Forbidden'}, status=http_status.HTTP_403_FORBIDDEN)
    questions = olympiad.questions.all()
    data = [
        {'id': q.id, 'text': q.text, 'options': q.options, 'score': q.score}
        for q in questions
    ]
    return Response(data)
