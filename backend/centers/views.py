import secrets

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.db.models import Count, Q
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
    CreateManagerSerializer,
    CreateTeacherSerializer,
    EducationCenterSerializer,
    JoinRequestSerializer,
)
from .services import (
    create_pending_center_for_owner,
    decide_membership,
    user_can_approve_membership,
    user_can_manage_center,
)


def _annotate_center_counts(queryset):
    """Annotate students_count + olympiads_count to avoid N+1 in serializer."""
    return queryset.annotate(
        students_count=Count(
            'memberships',
            filter=Q(
                memberships__role=CenterMembership.ROLE_STUDENT,
                memberships__status=CenterMembership.STATUS_APPROVED,
            ),
            distinct=True,
        ),
        olympiads_count=Count('olympiads', distinct=True),
    )


def _make_approval_code():
    return secrets.token_hex(3).upper()


# ─── Public listing & registration ────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def centers_list_create(request):
    """GET /api/centers/  — list approved centers (public).
    POST /api/centers/    — register a new center; status starts pending.
    """
    if request.method == 'GET':
        queryset = (
            EducationCenter.objects
            .select_related('owner')
            .filter(status=EducationCenter.STATUS_APPROVED)
            .order_by('-created_at')
        )
        queryset = _annotate_center_counts(queryset)
        return Response(EducationCenterSerializer(queryset, many=True).data)

    if not request.user.is_authenticated:
        return Response({'detail': 'Authentication required'},
                        status=http_status.HTTP_401_UNAUTHORIZED)
    serializer = CenterRegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    with transaction.atomic():
        center = create_pending_center_for_owner(request.user, serializer.validated_data)
        # Note: do NOT add 'owner' to user.roles here. The owner role is
        # promoted only after Platform Admin approves the center
        # (see admin_approve_center).
    return Response(EducationCenterSerializer(center).data,
                    status=http_status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_centers(request):
    """GET /api/centers/mine/ — centers the current user owns.

    Includes pending and rejected rows so a director with multiple
    organizations can see each approval state in their panel.
    """
    queryset = (
        EducationCenter.objects
        .select_related('owner')
        .filter(
            Q(owner=request.user) |
            Q(memberships__user=request.user, memberships__role=CenterMembership.ROLE_OWNER)
        )
        .distinct()
        .order_by('-created_at')
    )
    queryset = _annotate_center_counts(queryset)
    return Response(EducationCenterSerializer(queryset, many=True).data)


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
            'approval_code': _make_approval_code(),
            'status': CenterMembership.STATUS_PENDING,
        },
    )
    if not membership.approval_code:
        membership.approval_code = _make_approval_code()
        membership.save(update_fields=['approval_code'])
    # Do NOT add the role to user.roles for pending memberships. The role
    # is added in _approve() once the membership is approved. user.roles
    # remains the source of truth ONLY for approved roles.
    if created and role == CenterMembership.ROLE_STUDENT:
        # Lazy import: avoid circular dependency at module load time.
        from notifications.services import send_student_join_request_notification
        managers = CenterMembership.objects.filter(
            center=center, role=CenterMembership.ROLE_MANAGER,
            status=CenterMembership.STATUS_APPROVED,
        ).select_related('user')
        for m in managers:
            send_student_join_request_notification(m.user, request.user, center, membership)
        if center.owner_id:
            send_student_join_request_notification(center.owner, request.user, center, membership)
    elif created and role in (CenterMembership.ROLE_TEACHER, CenterMembership.ROLE_MANAGER):
        # O'qituvchi/manager arizalari avval hech kimga xabar yuborilmasdi —
        # owner faqat panelda polling qilib bilishi mumkin edi. Endi push
        # xabarnoma yuboriladi va owner inline tugmalar bilan tasdiqlay
        # oladi.
        from notifications.services import send_staff_join_request_notification
        if center.owner_id:
            send_staff_join_request_notification(
                center.owner,
                request.user,
                center,
                role=role,
                subject=membership.subject or '',
                membership=membership,
            )
    return Response(CenterMembershipSerializer(membership).data,
                    status=http_status.HTTP_201_CREATED if created
                    else http_status.HTTP_200_OK)


# ─── Approval endpoints ───────────────────────────────────────────────────────

def _user_can_manage_center(user, center):
    return user_can_manage_center(user, center)


def _user_can_approve(user, center, role):
    """Return True if ``user`` may approve a ``role`` request at ``center``."""
    return user_can_approve_membership(user, center, role)


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
    decision = serializer.validated_data['decision']
    if not _user_can_approve(request.user, center, role):
        return Response({'detail': 'Forbidden'},
                        status=http_status.HTTP_403_FORBIDDEN)
    if membership.status != CenterMembership.STATUS_PENDING:
        return Response(
            {'detail': "Bu ariza allaqachon ko'rib chiqilgan"},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    try:
        membership = decide_membership(membership, request.user, decision)
    except PermissionDenied:
        return Response({'detail': 'Forbidden'},
                        status=http_status.HTTP_403_FORBIDDEN)
    except ValidationError as exc:
        detail = '; '.join(exc.messages) if hasattr(exc, 'messages') else str(exc)
        return Response({'detail': detail},
                        status=http_status.HTTP_400_BAD_REQUEST)
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
        'approval_code': m.approval_code,
        'created_at': str(m.created_at),
    } for m in qs]
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def students_memberships(request, center_id):
    """GET /api/centers/{id}/memberships/students/?status=approved|pending|rejected

    Returns student memberships for a center. Status filter defaults to
    approved. Manager/Owner/Admin only.
    """
    center = get_object_or_404(EducationCenter, pk=center_id)
    if not _user_can_manage_center(request.user, center):
        return Response({'detail': 'Forbidden'}, status=http_status.HTTP_403_FORBIDDEN)
    status_filter = request.query_params.get('status', CenterMembership.STATUS_APPROVED)
    qs = CenterMembership.objects.filter(
        center=center,
        role=CenterMembership.ROLE_STUDENT,
        status=status_filter,
    ).select_related('user').order_by('-created_at')
    from accounts.serializers import UserSerializer
    data = [{
        'membership_id': m.id,
        'user': UserSerializer(m.user).data,
        'role': m.role,
        'subject': m.subject,
        'approval_code': m.approval_code,
        'status': m.status,
        'created_at': str(m.created_at),
    } for m in qs]
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def staff_memberships(request, center_id):
    """GET approved managers/teachers for one center."""
    center = get_object_or_404(EducationCenter, pk=center_id)
    if not _user_can_manage_center(request.user, center):
        return Response({'detail': 'Forbidden'}, status=http_status.HTTP_403_FORBIDDEN)
    role = request.query_params.get('role')
    qs = CenterMembership.objects.filter(
        center=center,
        status=CenterMembership.STATUS_APPROVED,
        role__in=[CenterMembership.ROLE_MANAGER, CenterMembership.ROLE_TEACHER],
    ).select_related('user')
    if role:
        qs = qs.filter(role=role)
    from accounts.serializers import UserSerializer
    data = [{
        'membership_id': m.id,
        'user': UserSerializer(m.user).data,
        'role': m.role,
        'subject': m.subject,
        'status': m.status,
        'created_at': str(m.created_at),
    } for m in qs]
    return Response(data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_manager(request, center_id):
    """POST /api/centers/{id}/managers/create/ — owner creates manager login."""
    center = get_object_or_404(
        EducationCenter,
        pk=center_id,
        status=EducationCenter.STATUS_APPROVED,
    )
    if not (request.user.is_platform_admin or center.owner_id == request.user.id):
        return Response({'detail': 'Forbidden'}, status=http_status.HTTP_403_FORBIDDEN)

    serializer = CreateManagerSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    with transaction.atomic():
        from django.contrib.auth import get_user_model
        from accounts.serializers import UserSerializer

        user = get_user_model().objects.create_user(
            phone=serializer.validated_data['phone'],
            password=serializer.validated_data['password'],
            full_name=serializer.validated_data['full_name'],
        )
        user.add_role(CenterMembership.ROLE_MANAGER)
        membership = CenterMembership.objects.create(
            user=user,
            center=center,
            role=CenterMembership.ROLE_MANAGER,
            status=CenterMembership.STATUS_APPROVED,
            approved_by=request.user,
        )
    return Response(
        {
            'membership': CenterMembershipSerializer(membership).data,
            'user': UserSerializer(user).data,
        },
        status=http_status.HTTP_201_CREATED,
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_teacher(request, center_id):
    """POST /api/centers/{id}/teachers/create/ — owner creates teacher login."""
    center = get_object_or_404(
        EducationCenter,
        pk=center_id,
        status=EducationCenter.STATUS_APPROVED,
    )
    if not (request.user.is_platform_admin or center.owner_id == request.user.id):
        return Response({'detail': 'Forbidden'}, status=http_status.HTTP_403_FORBIDDEN)

    serializer = CreateTeacherSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    with transaction.atomic():
        from django.contrib.auth import get_user_model
        from accounts.serializers import UserSerializer

        user = get_user_model().objects.create_user(
            phone=serializer.validated_data['phone'],
            password=serializer.validated_data['password'],
            full_name=serializer.validated_data['full_name'],
        )
        user.add_role(CenterMembership.ROLE_TEACHER)
        membership = CenterMembership.objects.create(
            user=user,
            center=center,
            role=CenterMembership.ROLE_TEACHER,
            subject=serializer.validated_data.get('subject', ''),
            status=CenterMembership.STATUS_APPROVED,
            approved_by=request.user,
        )
    return Response(
        {
            'membership': CenterMembershipSerializer(membership).data,
            'user': UserSerializer(user).data,
        },
        status=http_status.HTTP_201_CREATED,
    )


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
            from notifications.services import send_center_decision_notification
            send_center_decision_notification(center.owner, center, approved=True)
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
            from notifications.services import send_center_decision_notification
            send_center_decision_notification(center.owner, center, approved=False)
    return Response(EducationCenterSerializer(center).data)
