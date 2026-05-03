from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status as http_status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from centers.models import CenterMembership, EducationCenter

from .models import Olympiad
from .serializers import OlympiadSerializer


def _user_can_manage_center(user, center):
    """True if user can create/manage olympiads for the center."""
    if user.is_platform_admin:
        return True
    if center.owner_id == user.id:
        # Once admin has approved the center, the owner has full management
        # rights regardless of their CenterMembership state — the membership
        # row is bookkeeping, the center.owner_id is authoritative.
        return center.status == EducationCenter.STATUS_APPROVED
    return CenterMembership.objects.filter(
        user=user, center=center,
        role__in=[CenterMembership.ROLE_MANAGER, CenterMembership.ROLE_TEACHER],
        status=CenterMembership.STATUS_APPROVED,
    ).exists()


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def olympiads_list_create(request):
    """GET /api/olympiads/  — visible olympiads (filter to user's centers).
    POST /api/olympiads/    — create draft olympiad (manager/owner/admin).
    """
    if request.method == 'GET':
        queryset = (
            Olympiad.objects
            .prefetch_related('questions')
            .select_related('center')
            .order_by('-created_at')
        )
        if request.user.is_platform_admin:
            qs = queryset
        else:
            # Olympiads at any center the user has an approved membership at.
            center_ids = list(CenterMembership.objects.filter(
                user=request.user, status=CenterMembership.STATUS_APPROVED,
            ).values_list('center_id', flat=True))
            qs = queryset.filter(center_id__in=center_ids)
        return Response(OlympiadSerializer(qs, many=True).data)

    serializer = OlympiadSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    center = serializer.validated_data['center']
    questions = serializer.validated_data.pop('questions', None)
    if not _user_can_manage_center(request.user, center):
        return Response({'detail': "Sizda bu markaz uchun olimpiada yaratish huquqi yo'q"},
                        status=http_status.HTTP_403_FORBIDDEN)
    olympiad = serializer.save(
        created_by=request.user,
        status=Olympiad.STATUS_DRAFT,
    )
    if questions is not None:
        olympiad.questions.set(questions)
    return Response(OlympiadSerializer(olympiad).data,
                    status=http_status.HTTP_201_CREATED)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def olympiad_detail(request, olympiad_id):
    """PATCH /api/olympiads/{id}/ — update draft olympiad fields/questions."""
    olympiad = get_object_or_404(Olympiad, pk=olympiad_id)
    if not _user_can_manage_center(request.user, olympiad.center):
        return Response({'detail': 'Forbidden'},
                        status=http_status.HTTP_403_FORBIDDEN)
    serializer = OlympiadSerializer(olympiad, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    questions = serializer.validated_data.pop('questions', None)
    olympiad = serializer.save()
    if questions is not None:
        olympiad.questions.set(questions)
    return Response(OlympiadSerializer(olympiad).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def publish_olympiad(request, olympiad_id):
    """POST /api/olympiads/{id}/publish/ — flip status to active and notify."""
    olympiad = get_object_or_404(Olympiad, pk=olympiad_id)
    if not _user_can_manage_center(request.user, olympiad.center):
        return Response({'detail': 'Forbidden'},
                        status=http_status.HTTP_403_FORBIDDEN)
    if olympiad.status != Olympiad.STATUS_DRAFT:
        return Response(
            {'detail': 'Faqat draft olimpiadani nashr qilish mumkin'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    if olympiad.start_datetime and olympiad.start_datetime < timezone.now():
        return Response(
            {'detail': "Boshlanish vaqti o'tib ketgan"},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    if not olympiad.questions.exists():
        return Response({'detail': "Avval savollar tayinlang"},
                        status=http_status.HTTP_400_BAD_REQUEST)
    olympiad.status = Olympiad.STATUS_ACTIVE
    olympiad.save(update_fields=['status'])

    # Lazy import: avoid circular dependency.
    from notifications.services import send_olympiad_published_notification
    approved_students = CenterMembership.objects.filter(
        center=olympiad.center,
        role=CenterMembership.ROLE_STUDENT,
        status=CenterMembership.STATUS_APPROVED,
    ).select_related('user')
    try:
        for m in approved_students:
            send_olympiad_published_notification(m.user, olympiad, olympiad.center)
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning('Notification send failed: %s', e)
    return Response(OlympiadSerializer(olympiad).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def finish_olympiad(request, olympiad_id):
    """POST /api/olympiads/{id}/finish/ — flip status to finished."""
    olympiad = get_object_or_404(Olympiad, pk=olympiad_id)
    if not _user_can_manage_center(request.user, olympiad.center):
        return Response({'detail': 'Forbidden'},
                        status=http_status.HTTP_403_FORBIDDEN)
    if olympiad.status != Olympiad.STATUS_ACTIVE:
        return Response({'detail': "Faqat faol olimpiadani yakunlash mumkin"},
                        status=http_status.HTTP_400_BAD_REQUEST)
    olympiad.status = Olympiad.STATUS_FINISHED
    olympiad.save(update_fields=['status'])
    return Response(OlympiadSerializer(olympiad).data)
