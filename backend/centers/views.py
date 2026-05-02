from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status as http_status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import CenterMembership, EducationCenter
from .serializers import (
    ApproveSerializer,
    CenterMembershipSerializer,
    CenterRegisterSerializer,
    EducationCenterSerializer,
    JoinRequestSerializer,
)


# ─── Public listing & registration ────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def centers_list_create(request):
    """GET /api/centers/  — list approved centers (public).
    POST /api/centers/    — register a new center; status starts pending.
    """
    if request.method == 'GET':
        queryset = EducationCenter.objects.select_related('owner').order_by('-created_at')
        qs = queryset.filter(status=EducationCenter.STATUS_APPROVED)
        return Response(EducationCenterSerializer(qs, many=True).data)

    if not request.user.is_authenticated:
        return Response({'detail': 'Authentication required'},
                        status=http_status.HTTP_401_UNAUTHORIZED)
    serializer = CenterRegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    with transaction.atomic():
        center = EducationCenter.objects.create(
            name=serializer.validated_data['name'],
            city=serializer.validated_data['city'],
            subjects=serializer.validated_data.get('subjects', []),
            owner=request.user,
            status=EducationCenter.STATUS_PENDING,
        )
        CenterMembership.objects.create(
            user=request.user,
            center=center,
            role=CenterMembership.ROLE_OWNER,
            status=CenterMembership.STATUS_APPROVED,
        )
        request.user.add_role('owner')
    return Response(EducationCenterSerializer(center).data,
                    status=http_status.HTTP_201_CREATED)


# ─── Student / Teacher / Manager join flow ────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def join_center(request, center_id):
    """POST /api/centers/{id}/join/ — user requests to join a center.

    Creates a pending role membership. Manager/Owner of the target center
    can later approve. Notification placeholder is fired.
    """
    center = get_object_or_404(EducationCenter, pk=center_id,
                               status=EducationCenter.STATUS_APPROVED)
    serializer = JoinRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    role = serializer.validated_data['role']
    membership, created = CenterMembership.objects.get_or_create(
        user=request.user,
        center=center,
        role=role,
        defaults={
            'subject': serializer.validated_data.get('subject', ''),
            'status': CenterMembership.STATUS_PENDING,
        },
    )
    request.user.add_role(role)
    if created and role == CenterMembership.ROLE_STUDENT:
        # Lazy import: avoid circular dependency at module load time.
        from notifications.services import send_student_join_request_notification
        managers = CenterMembership.objects.filter(
            center=center, role=CenterMembership.ROLE_MANAGER,
            status=CenterMembership.STATUS_APPROVED,
        ).select_related('user')
        for m in managers:
            send_student_join_request_notification(m.user, request.user, center)
        if center.owner_id:
            send_student_join_request_notification(center.owner, request.user, center)
    return Response(CenterMembershipSerializer(membership).data,
                    status=http_status.HTTP_201_CREATED if created
                    else http_status.HTTP_200_OK)


# ─── Approval endpoints ───────────────────────────────────────────────────────

def _user_can_manage_center(user, center):
    if user.is_platform_admin:
        return True
    if center.owner_id == user.id:
        return center.status == EducationCenter.STATUS_APPROVED
    return CenterMembership.objects.filter(
        user=user,
        center=center,
        role=CenterMembership.ROLE_MANAGER,
        status=CenterMembership.STATUS_APPROVED,
    ).exists()


def _user_can_approve(user, center, role):
    """Return True if ``user`` may approve a ``role`` request at ``center``."""
    if user.is_platform_admin:
        return True
    if center.owner_id == user.id:
        # Center owners always have approval authority once admin has approved
        # the center; their own owner-membership record is informational only.
        return center.status == EducationCenter.STATUS_APPROVED
    # Managers can approve students/teachers at their own center.
    if role in (CenterMembership.ROLE_STUDENT, CenterMembership.ROLE_TEACHER):
        return CenterMembership.objects.filter(
            user=user, center=center,
            role=CenterMembership.ROLE_MANAGER,
            status=CenterMembership.STATUS_APPROVED,
        ).exists()
    return False


def _approve(request, center_id, role):
    center = get_object_or_404(EducationCenter, pk=center_id)
    serializer = ApproveSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    membership = get_object_or_404(
        CenterMembership,
        pk=serializer.validated_data['membership_id'],
        center=center,
        role=role,
    )
    if not _user_can_approve(request.user, center, role):
        return Response({'detail': 'Forbidden'},
                        status=http_status.HTTP_403_FORBIDDEN)
    if membership.status != CenterMembership.STATUS_PENDING:
        return Response(
            {'detail': "Bu ariza allaqachon ko'rib chiqilgan"},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    decision = serializer.validated_data['decision']
    membership.status = (
        CenterMembership.STATUS_APPROVED
        if decision in ('approve', 'approved')
        else CenterMembership.STATUS_REJECTED
    )
    membership.approved_by = request.user
    membership.save(update_fields=['status', 'approved_by'])
    if decision in ('approve', 'approved'):
        membership.user.add_role(role)
    return Response(CenterMembershipSerializer(membership).data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def pending_memberships(request, center_id):
    center = get_object_or_404(EducationCenter, pk=center_id)
    if not _user_can_manage_center(request.user, center):
        return Response({'detail': 'Forbidden'}, status=http_status.HTTP_403_FORBIDDEN)
    role = request.query_params.get('role')
    qs = CenterMembership.objects.filter(
        center=center,
        status=CenterMembership.STATUS_PENDING,
    ).select_related('user')
    if role:
        qs = qs.filter(role=role)
    from accounts.serializers import UserSerializer
    data = [{
        'membership_id': m.id,
        'user': UserSerializer(m.user).data,
        'role': m.role,
        'subject': m.subject,
        'created_at': str(m.created_at),
    } for m in qs]
    return Response(data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def approve_student(request, center_id):
    """POST /api/centers/{id}/approve-student/ — owner/manager decides."""
    return _approve(request, center_id, CenterMembership.ROLE_STUDENT)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def approve_teacher(request, center_id):
    """POST /api/centers/{id}/approve-teacher/ — owner/manager decides."""
    return _approve(request, center_id, CenterMembership.ROLE_TEACHER)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def approve_manager(request, center_id):
    """POST /api/centers/{id}/approve-manager/ — owner (or admin) decides."""
    return _approve(request, center_id, CenterMembership.ROLE_MANAGER)


# ─── Platform admin: center approval ──────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def admin_list_centers(request):
    """GET /api/admin/centers/?status=<status> — Platform Admin only.

    Unlike the public listing (which only returns approved centers), this
    surfaces every center so admins can see and act on pending and
    rejected ones too. Optional ``status`` query param narrows the list.
    """
    if not request.user.is_platform_admin:
        return Response({'detail': 'Forbidden'},
                        status=http_status.HTTP_403_FORBIDDEN)
    qs = EducationCenter.objects.all().order_by('-created_at')
    status_filter = request.query_params.get('status')
    if status_filter:
        qs = qs.filter(status=status_filter)
    return Response(EducationCenterSerializer(qs, many=True).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def admin_approve_center(request, center_id):
    """POST /api/admin/centers/{id}/approve/ — Platform Admin only."""
    if not request.user.is_platform_admin:
        return Response({'detail': 'Forbidden'},
                        status=http_status.HTTP_403_FORBIDDEN)
    center = get_object_or_404(EducationCenter, pk=center_id)
    with transaction.atomic():
        center.status = EducationCenter.STATUS_APPROVED
        center.save(update_fields=['status'])
        # Promote owner membership too
        if center.owner_id:
            CenterMembership.objects.filter(
                user=center.owner, center=center,
                role=CenterMembership.ROLE_OWNER,
            ).update(status=CenterMembership.STATUS_APPROVED, approved_by=request.user)
            center.owner.add_role('owner')
    return Response(EducationCenterSerializer(center).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def admin_reject_center(request, center_id):
    """POST /api/admin/centers/{id}/reject/ — Platform Admin only."""
    if not request.user.is_platform_admin:
        return Response({'detail': 'Forbidden'},
                        status=http_status.HTTP_403_FORBIDDEN)
    center = get_object_or_404(EducationCenter, pk=center_id)
    with transaction.atomic():
        center.status = EducationCenter.STATUS_REJECTED
        center.save(update_fields=['status'])
        if center.owner_id:
            CenterMembership.objects.filter(
                user=center.owner, center=center,
                role=CenterMembership.ROLE_OWNER,
            ).update(status=CenterMembership.STATUS_REJECTED, approved_by=request.user)
    return Response(EducationCenterSerializer(center).data)
