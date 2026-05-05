from django.shortcuts import get_object_or_404
from rest_framework import status as http_status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Olympiad
from .serializers import OlympiadSerializer
from .services import event_readiness_errors, user_can_manage_center_event, visible_events_filter


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def olympiads_list_create(request):
    """GET /api/olympiads/  — visible olympiads/competitions.
    POST /api/olympiads/    — create draft event (manager/owner/admin).
    """
    if request.method == 'GET':
        queryset = (
            Olympiad.objects
            .prefetch_related('questions')
            .select_related('center')
            .order_by('-created_at')
        )
        qs = queryset.filter(visible_events_filter(request.user)).distinct()
        # Pagination: 500+ olimpiada bo'lishi mumkin, ayniqsa platform admin
        # uchun. DRF PageNumberPagination orqali default 50/sahifa.
        from rest_framework.pagination import PageNumberPagination
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(qs, request)
        if page is not None:
            return paginator.get_paginated_response(OlympiadSerializer(page, many=True).data)
        return Response(OlympiadSerializer(qs, many=True).data)

    serializer = OlympiadSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    center = serializer.validated_data['center']
    questions = serializer.validated_data.pop('questions', None)
    if not user_can_manage_center_event(request.user, center):
        return Response({'detail': "Sizda bu markaz uchun tadbir yaratish huquqi yo'q"},
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
    """PATCH /api/olympiads/{id}/ — update draft/inactive event fields/questions."""
    olympiad = get_object_or_404(Olympiad, pk=olympiad_id)
    if not user_can_manage_center_event(request.user, olympiad.center):
        return Response({'detail': 'Forbidden'},
                        status=http_status.HTTP_403_FORBIDDEN)
    if olympiad.status not in [Olympiad.STATUS_DRAFT, Olympiad.STATUS_INACTIVE]:
        return Response(
            {'detail': "Faqat draft yoki nofaol tadbirni tahrirlash mumkin"},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
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
    if not user_can_manage_center_event(request.user, olympiad.center):
        return Response({'detail': 'Forbidden'},
                        status=http_status.HTTP_403_FORBIDDEN)
    if olympiad.status not in [Olympiad.STATUS_DRAFT, Olympiad.STATUS_INACTIVE]:
        return Response(
            {'detail': 'Faqat draft yoki nofaol tadbirni faollashtirish mumkin'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    readiness_errors = event_readiness_errors(olympiad)
    if readiness_errors:
        return Response(
            {'detail': 'Tadbir hali tayyor emas', 'errors': readiness_errors},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    olympiad.status = Olympiad.STATUS_ACTIVE
    olympiad.save(update_fields=['status'])

    if olympiad.event_type == Olympiad.EVENT_TYPE_COMPETITION:
        # Lazy import: avoid circular dependency.
        from centers.models import CenterMembership
        from notifications.services import send_olympiad_published_bulk
        approved_students = CenterMembership.objects.filter(
            center=olympiad.center,
            role=CenterMembership.ROLE_STUDENT,
            status=CenterMembership.STATUS_APPROVED,
        ).select_related('user')
        try:
            send_olympiad_published_bulk(
                [m.user for m in approved_students],
                olympiad,
                olympiad.center,
            )
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning('Notification send failed: %s', e)
    return Response(OlympiadSerializer(olympiad).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def finish_olympiad(request, olympiad_id):
    """POST /api/olympiads/{id}/finish/ — flip status to finished."""
    olympiad = get_object_or_404(Olympiad, pk=olympiad_id)
    if not user_can_manage_center_event(request.user, olympiad.center):
        return Response({'detail': 'Forbidden'},
                        status=http_status.HTTP_403_FORBIDDEN)
    if olympiad.status != Olympiad.STATUS_ACTIVE:
        return Response({'detail': "Faqat faol tadbirni yakunlash mumkin"},
                        status=http_status.HTTP_400_BAD_REQUEST)
    olympiad.status = Olympiad.STATUS_FINISHED
    olympiad.save(update_fields=['status'])
    return Response(OlympiadSerializer(olympiad).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def deactivate_olympiad(request, olympiad_id):
    """POST /api/olympiads/{id}/deactivate/ — pause an active event for editing."""
    olympiad = get_object_or_404(Olympiad, pk=olympiad_id)
    if not user_can_manage_center_event(request.user, olympiad.center):
        return Response({'detail': 'Forbidden'},
                        status=http_status.HTTP_403_FORBIDDEN)
    if olympiad.status != Olympiad.STATUS_ACTIVE:
        return Response({'detail': 'Faqat faol tadbirni nofaollashtirish mumkin'},
                        status=http_status.HTTP_400_BAD_REQUEST)
    olympiad.status = Olympiad.STATUS_INACTIVE
    olympiad.save(update_fields=['status'])
    return Response(OlympiadSerializer(olympiad).data)
