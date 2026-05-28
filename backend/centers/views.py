import io
import logging
import secrets

from django.conf import settings
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
    AdminEducationCenterSerializer,
    ApproveSerializer,
    ChangeRoleSerializer,
    CenterMembershipSerializer,
    CenterRegisterSerializer,
    CreateManagerSerializer,
    CreateTeacherSerializer,
    EducationCenterSerializer,
    JoinRequestSerializer,
)
from .services import (
    RoleChangeError,
    change_membership_role,
    create_pending_center_for_owner,
    decide_membership,
    user_can_approve_membership,
    user_can_manage_center,
)


logger = logging.getLogger(__name__)


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
        # Pagination: katta listlarda butun massivni bir response'da
        # qaytarmaymiz. DEFAULT_PAGINATION_CLASS settings'da o'rnatilgan.
        from rest_framework.pagination import PageNumberPagination
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(queryset, request)
        if page is not None:
            serializer = EducationCenterSerializer(page, many=True, context={'request': request})
            return paginator.get_paginated_response(serializer.data)
        return Response(EducationCenterSerializer(queryset, many=True, context={'request': request}).data)

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
    return Response(EducationCenterSerializer(center, context={'request': request}).data,
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
    return Response(EducationCenterSerializer(queryset, many=True, context={'request': request}).data)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def update_center(request, center_id):
    """PATCH /api/centers/{id}/ — owner yoki platform admin markaz
    metadata'sini o'zgartiradi (nom, manzil, fanlar, tashkilot turi)."""
    center = get_object_or_404(EducationCenter, pk=center_id)
    is_owner = center.owner_id == request.user.id
    if not (request.user.is_platform_admin or is_owner):
        return Response({'detail': 'Forbidden'}, status=http_status.HTTP_403_FORBIDDEN)

    data = request.data or {}
    allowed = {'name', 'organization_type', 'country', 'region', 'district', 'city', 'subjects'}
    payload = {k: v for k, v in data.items() if k in allowed}

    # Bo'sh payload — hech narsa o'zgartirmasdan butun model save'lashning
    # foydasi yo'q (signal'lar, timestamps, race) — 400 qaytaramiz.
    if not payload:
        return Response(
            {'detail': "Hech narsa o'zgartirilmadi"},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    if 'name' in payload:
        name = str(payload['name'] or '').strip()
        if not name:
            return Response({'name': "Nom bo'sh bo'lishi mumkin emas"},
                            status=http_status.HTTP_400_BAD_REQUEST)
        payload['name'] = name[:160]

    if 'organization_type' in payload:
        ot = str(payload['organization_type'] or '').strip()
        payload['organization_type'] = ot or "O'quv markaz"

    if 'country' in payload:
        c = str(payload['country'] or '').strip()
        payload['country'] = c or "O'zbekiston"

    for key in ('region', 'district'):
        if key in payload:
            payload[key] = str(payload[key] or '').strip()

    if 'city' in payload:
        payload['city'] = str(payload['city'] or '').strip()
    # Agar city berilmagan, lekin region/district o'zgargan bo'lsa — city
    # bo'sh bo'lib qolmasligi uchun district/region orqali to'ldiramiz.
    new_city = payload.get('city', center.city)
    new_district = payload.get('district', center.district)
    new_region = payload.get('region', center.region)
    if not new_city:
        new_city = new_district or new_region
    if not new_city:
        return Response({'district': "Tuman yoki shaharni tanlang"},
                        status=http_status.HTTP_400_BAD_REQUEST)
    payload['city'] = new_city

    if 'subjects' in payload:
        subs = payload['subjects']
        if not isinstance(subs, list):
            return Response({'subjects': "Fanlar ro'yxat bo'lishi kerak"},
                            status=http_status.HTTP_400_BAD_REQUEST)
        # Har bir fan nomi 80 belgidan oshmasin — DB'da har bir element
        # JSONField'ga tushadi va frontend chip ko'rinishida ko'rsatadi.
        payload['subjects'] = [str(s).strip()[:80] for s in subs if str(s).strip()]

    for key, value in payload.items():
        setattr(center, key, value)
    center.save(update_fields=list(payload.keys()) or None)

    # Annotated countlar response uchun
    center = _annotate_center_counts(
        EducationCenter.objects.filter(pk=center.pk)
    ).first()
    return Response(EducationCenterSerializer(center, context={'request': request}).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def update_center_image(request, center_id):
    """POST /api/centers/{id}/image/ — owner/manager uploads center image."""
    center = get_object_or_404(EducationCenter, pk=center_id)
    if not _user_can_manage_center(request.user, center):
        return Response({'detail': 'Forbidden'}, status=http_status.HTTP_403_FORBIDDEN)
    image = (
        request.FILES.get('image')
        or request.FILES.get('logo')
        or request.FILES.get('photo')
    )
    if not image:
        return Response({'detail': 'Rasm faylini yuboring'}, status=http_status.HTTP_400_BAD_REQUEST)
    if image.content_type and not image.content_type.startswith('image/'):
        return Response({'detail': 'Faqat rasm fayl qabul qilinadi'}, status=http_status.HTTP_400_BAD_REQUEST)
    max_bytes = getattr(settings, 'CENTER_IMAGE_MAX_BYTES', 5 * 1024 * 1024)
    if image.size and image.size > max_bytes:
        return Response(
            {'detail': f"Rasm juda katta. Limit: {max_bytes // (1024 * 1024)} MB"},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    # Magic byte tekshiruvi: content_type spoof qilinishi mumkin.
    # Decompression bomb himoyasi: Pillow default MAX_IMAGE_PIXELS juda
    # keng — markaz logosi uchun 50MP yetarli. `verify()` faqat header'ni
    # tekshiradi, to'liq dekompressiyaga `load()` ishlaydi va shu yerda
    # bomb DecompressionBombError otadi.
    try:
        from PIL import Image as PilImage
        PilImage.MAX_IMAGE_PIXELS = 50 * 1024 * 1024  # 50 MP limit
        img = PilImage.open(io.BytesIO(image.read()))
        img.load()
        image.seek(0)
    except Exception:
        return Response({'detail': 'Yaroqsiz rasm fayli'}, status=http_status.HTTP_400_BAD_REQUEST)
    center.image = image
    center.save(update_fields=['image'])
    return Response(EducationCenterSerializer(center, context={'request': request}).data)


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
    # O5: bir foydalanuvchi bir vaqtning o'zida faqat bitta markazga
    # student sifatida tasdiqlangan bo'lishi mumkin. Aks holda manager
    # dashboard'larda "asosiy markaz" tushunarsiz bo'lardi va center
    # competition ruxsatlari noaniq.
    if role == CenterMembership.ROLE_STUDENT:
        existing_approved = CenterMembership.objects.filter(
            user=request.user,
            role=CenterMembership.ROLE_STUDENT,
            status=CenterMembership.STATUS_APPROVED,
        ).exclude(center=center).select_related('center').first()
        if existing_approved:
            return Response(
                {
                    'detail': (
                        f"Siz allaqachon \"{existing_approved.center.name}\" markaziga "
                        "o'quvchi sifatida a'zosiz. Boshqa markazga a'zo bo'lish uchun "
                        "avval mavjud a'zolikni bekor qiling."
                    ),
                },
                status=http_status.HTTP_400_BAD_REQUEST,
            )
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
    # Y7: rad etilgan ariza uchun 24 soat cooldown — aks holda foydalanuvchi
    # cheksiz qayta ariza yuborib spam qilishi mumkin edi. Avval rejected
    # status'i pending'ga avtomatik qaytarilardi va manager har soatda yangi
    # arizalarni ko'rardi.
    if not created and membership.status == CenterMembership.STATUS_REJECTED:
        from datetime import timedelta
        from django.utils import timezone
        cooldown_until = (membership.updated_at or membership.created_at)
        if cooldown_until and timezone.now() < cooldown_until + timedelta(hours=24):
            wait_hours = max(1, int((
                (cooldown_until + timedelta(hours=24) - timezone.now())
                .total_seconds()
            ) // 3600))
            return Response(
                {'detail': f"Ariza yaqinda rad etilgan. {wait_hours} soatdan keyin qayta urinib ko'ring."},
                status=http_status.HTTP_429_TOO_MANY_REQUESTS,
            )
        membership.status = CenterMembership.STATUS_PENDING
        membership.subject = serializer.validated_data.get('subject', '') or membership.subject
        membership.approval_code = _make_approval_code()
        membership.approved_by = None
        membership.save(update_fields=['status', 'subject', 'approval_code', 'approved_by'])
        # Re-apply notification yuborish uchun "created" semantikasiga
        # o'xshash holat — quyidagi created shartiga to'g'ridan-to'g'ri
        # tushishi uchun bayroq qo'yamiz.
        created = True
    # Do NOT add the role to user.roles for pending memberships. The role
    # is added in _approve() once the membership is approved. user.roles
    # remains the source of truth ONLY for approved roles.
    if created and role == CenterMembership.ROLE_STUDENT:
        # Roster cache'dan avto-tasdiq tekshir — manager oldin PDF yuborgan
        # bo'lsa, o'quvchini darhol tasdiqlaymiz.
        try:
            from .ai_roster import try_auto_approve_from_roster
            if try_auto_approve_from_roster(center, membership):
                membership.refresh_from_db()
                return Response(
                    CenterMembershipSerializer(membership).data,
                    status=http_status.HTTP_201_CREATED if created else http_status.HTTP_200_OK,
                )
        except Exception as exc:
            # Avval bu joyda `except: pass` edi va auto-approve xatoligi
            # diagnostika qilib bo'lmasdi. Endi xato log qilinadi, lekin
            # join_center javobini buzmaslik uchun reraise qilinmaydi.
            logger.warning("auto_approve_from_roster failed: %s", exc)
        # Lazy import: avoid circular dependency at module load time.
        from notifications.services import send_student_join_request_notification
        managers = list(
            CenterMembership.objects.filter(
                center=center, role=CenterMembership.ROLE_MANAGER,
                status=CenterMembership.STATUS_APPROVED,
            ).select_related('user')
        )
        # Telegram API sekin bo'lsa (1-3 soniya har bir so'rov), avval
        # foydalanuvchi join_center javobini 20+ manager * 2s = 40+ soniya
        # kutib turardi. Endi xabarlarni daemon thread'ga ko'chiramiz —
        # foydalanuvchi darhol javob oladi. Celery yo'q, lekin Django
        # request thread'ini bloklamasligimiz uchun bu yetarli.
        manager_users = [m.user for m in managers]
        owner_user = center.owner if center.owner_id else None
        requester = request.user
        target_center = center
        target_membership = membership

        def _send_join_notifications():
            from django.db import close_old_connections
            close_old_connections()
            for manager_user in manager_users:
                try:
                    send_student_join_request_notification(
                        manager_user, requester, target_center, target_membership,
                    )
                except Exception:
                    pass
            if owner_user is not None:
                try:
                    send_student_join_request_notification(
                        owner_user, requester, target_center, target_membership,
                    )
                except Exception:
                    pass

        import threading
        # daemon=True — gunicorn worker shutdown'da thread yo'qoladi, lekin
        # bu request thread'ini bloklamaydi. daemon=False bo'lsa worker
        # graceful shutdown'da har bir thread tugashini kutardi va 50 ta
        # join × 3s = worker freeze. Telegram'da xabar yo'qotsa ham
        # in-app Notification baribir DB'ga yozilgan.
        threading.Thread(target=_send_join_notifications, daemon=True).start()
    elif created and role in (CenterMembership.ROLE_TEACHER, CenterMembership.ROLE_MANAGER):
        # O'qituvchi/manager arizalari avval hech kimga xabar yuborilmasdi —
        # owner faqat panelda polling qilib bilishi mumkin edi. Endi push
        # xabarnoma yuboriladi va owner inline tugmalar bilan tasdiqlay
        # oladi. Sinxron bo'lsa Telegram API kechikishi join_center javobini
        # bloklardi — alohida thread'da yuboramiz.
        from notifications.services import send_staff_join_request_notification
        if center.owner_id:
            owner_user = center.owner
            requester = request.user
            target_center = center
            staff_role = role
            staff_subject = membership.subject or ''
            target_membership = membership

            def _send_staff_notification():
                from django.db import close_old_connections
                close_old_connections()
                try:
                    send_staff_join_request_notification(
                        owner_user,
                        requester,
                        target_center,
                        role=staff_role,
                        subject=staff_subject,
                        membership=target_membership,
                    )
                except Exception:
                    pass

            import threading
            # daemon=True — worker shutdown'da bloklamaslik uchun.
            # In-app Notification baribir DB'ga yozilgan (yuqorida).
            threading.Thread(target=_send_staff_notification, daemon=True).start()
    return Response(CenterMembershipSerializer(membership).data,
                    status=http_status.HTTP_201_CREATED if created
                    else http_status.HTTP_200_OK)


# ─── Approval endpoints ───────────────────────────────────────────────────────

def _user_can_manage_center(user, center):
    return user_can_manage_center(user, center)


def _user_can_approve(user, center, role):
    """Return True if ``user`` may approve a ``role`` request at ``center``."""
    return user_can_approve_membership(user, center, role)


@transaction.atomic
def _approve(request, center_id, role):
    # transaction.atomic: decide_membership ichida membership status'i
    # yangilanadi va parallel ravishda notification yuboriladi/role beriladi.
    # Yarmida xatolik bo'lsa membership "approved" lekin notification yo'q
    # holati paydo bo'lardi — endi to'liq rollback.
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
        'user': UserSerializer(m.user, context={'request': request}).data,
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

    Approved holatdagi javobda har bir o'quvchi uchun shu markazdagi
    olimpiadalarda qatnashganlar soni va o'rtacha balli ham qaytariladi —
    ManagerDashboard'dagi "Tadbirlar" / "O'rt. ball" ustunlari shu yerdan
    keladi (avval doim 0 ko'rinardi).
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
    from attempts.models import TestAttempt
    from django.db.models import Avg, Count

    # Bir so'rov bilan barcha o'quvchilarning shu center'dagi attempt
    # statistikasini yig'amiz — N+1 dan saqlanish uchun.
    user_ids = [m.user_id for m in qs]
    stats_map = {}
    if user_ids:
        stats_qs = (
            TestAttempt.objects
            .filter(user_id__in=user_ids, olympiad__center=center)
            .values('user_id')
            .annotate(olympiads_count=Count('id'), avg_score=Avg('score'))
        )
        for row in stats_qs:
            stats_map[row['user_id']] = {
                'olympiads_count': row['olympiads_count'] or 0,
                'avg_score': round(row['avg_score'] or 0, 1),
            }

    data = [{
        'membership_id': m.id,
        'user': UserSerializer(m.user, context={'request': request}).data,
        'role': m.role,
        'subject': m.subject,
        'approval_code': m.approval_code,
        'status': m.status,
        'created_at': str(m.created_at),
        'olympiads_count': stats_map.get(m.user_id, {}).get('olympiads_count', 0),
        'avg_score': stats_map.get(m.user_id, {}).get('avg_score', 0),
    } for m in qs]
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def student_detail(request, membership_id):
    """GET /api/centers/students/{membership_id}/ — bitta o'quvchi profili.

    Manager/Owner/Admin uchun: profil maydonlari, attempt natijalari,
    yutuqlar. Avval ManagerDashboard'dagi "Ko'rish" tugmasi ulanmagan edi.
    """
    membership = get_object_or_404(
        CenterMembership.objects.select_related('user', 'center'),
        pk=membership_id,
        role=CenterMembership.ROLE_STUDENT,
    )
    if not _user_can_manage_center(request.user, membership.center):
        return Response({'detail': 'Forbidden'}, status=http_status.HTTP_403_FORBIDDEN)

    from accounts.serializers import UserSerializer
    from attempts.models import TestAttempt
    from django.db.models import Avg, Count, Max

    user = membership.user
    attempts_qs = (
        TestAttempt.objects
        .filter(user=user, olympiad__center=membership.center)
        .select_related('olympiad')
        .order_by('-submitted_at')
    )
    agg = attempts_qs.aggregate(
        total=Count('id'),
        avg=Avg('score'),
        best=Max('score'),
    )
    attempts_payload = [
        {
            'attempt_id': a.id,
            'olympiad_id': a.olympiad_id,
            'olympiad_title': a.olympiad.title if a.olympiad_id else '',
            'subject': a.olympiad.subject if a.olympiad_id else '',
            'score': a.score,
            'rank': a.rank,
            'correct_count': a.correct_count,
            'wrong_count': a.wrong_count,
            'total_questions': a.total_questions,
            'time_spent': a.time_spent,
            'submitted_at': a.submitted_at.isoformat() if a.submitted_at else '',
        }
        for a in attempts_qs[:50]
    ]
    return Response({
        'membership_id': membership.id,
        'user': UserSerializer(user, context={'request': request}).data,
        'subject': membership.subject or '',
        'status': membership.status,
        'approval_code': membership.approval_code,
        'joined_at': membership.created_at.isoformat() if membership.created_at else '',
        'center': {
            'id': membership.center_id,
            'name': membership.center.name,
        },
        'stats': {
            'total_attempts': agg['total'] or 0,
            'average_score': round(agg['avg'] or 0, 1),
            'best_score': agg['best'] or 0,
            'first_place_count': attempts_qs.filter(rank=1).count(),
        },
        'attempts': attempts_payload,
    })


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
        'user': UserSerializer(m.user, context={'request': request}).data,
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
            'user': UserSerializer(user, context={'request': request}).data,
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
            'user': UserSerializer(user, context={'request': request}).data,
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


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def remove_membership(request, center_id, membership_id):
    """DELETE /api/centers/{center_id}/memberships/{membership_id}/

    A'zolikni o'chiradi (markazdan chiqarish). Ruxsatlar:
    - Platform admin har qanday a'zolikni o'chira oladi.
    - Markaz egasi (owner) har qanday a'zolikni o'chira oladi (o'zinikidan tashqari).
    - Manager faqat student va teacher a'zoligini o'chira oladi.
    - Hech kim o'z a'zoligini bu endpoint orqali o'chira olmaydi.
    """
    center = get_object_or_404(EducationCenter, pk=center_id)
    membership = get_object_or_404(
        CenterMembership.objects.select_related('user'),
        pk=membership_id,
        center=center,
    )

    if membership.user_id == request.user.id:
        return Response({'detail': "O'z a'zoligingizni o'chira olmaysiz"},
                        status=http_status.HTTP_400_BAD_REQUEST)

    # Owner a'zoligini bu endpoint orqali o'chirishga ruxsat berilmaydi —
    # bu center'ning egasini almashtirish bo'lib qoladi.
    if membership.role == CenterMembership.ROLE_OWNER:
        return Response({'detail': "Owner a'zoligini bu yerda o'chirib bo'lmaydi"},
                        status=http_status.HTTP_400_BAD_REQUEST)

    is_admin = request.user.is_platform_admin
    is_owner = center.owner_id == request.user.id

    allowed = is_admin or is_owner

    if not allowed:
        return Response({'detail': 'Forbidden'}, status=http_status.HTTP_403_FORBIDDEN)

    user = membership.user
    role = membership.role
    membership.delete()

    # User.roles dan rolni olib tashlash: agar shu user'da boshqa markazda
    # ham xuddi shu rol bilan approved a'zolik bor bo'lsa — rolni saqlaymiz.
    try:
        has_other = CenterMembership.objects.filter(
            user=user, role=role, status=CenterMembership.STATUS_APPROVED,
        ).exists()
        if not has_other and hasattr(user, 'remove_role'):
            user.remove_role(role)
    except Exception:
        pass

    # Chiqarilgan foydalanuvchiga xabar (in-app + telegram). Avval bu yo'q
    # edi va foydalanuvchi qayerga ariza yuborganini bilolmay qolardi.
    try:
        from notifications.services import send_membership_removed_notification
        send_membership_removed_notification(user, center, role)
    except Exception:
        import logging
        logging.getLogger(__name__).exception('membership-removed notification failed')

    return Response(status=http_status.HTTP_204_NO_CONTENT)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_member_role(request, center_id, membership_id):
    """POST /api/centers/{id}/members/{membership_id}/change-role/

    Mavjud a'zolikning rolini (student/teacher/manager) o'zgartiradi.
    Faqat owner yoki platform admin chaqira oladi. Eski membership o'chiriladi,
    yangi approved membership yaratiladi va user.roles mos ravishda yangilanadi.
    """
    center = get_object_or_404(EducationCenter, pk=center_id)
    if not (request.user.is_platform_admin or center.owner_id == request.user.id):
        return Response({'detail': 'Forbidden'}, status=http_status.HTTP_403_FORBIDDEN)

    serializer = ChangeRoleSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    new_role = serializer.validated_data['role']

    try:
        membership = change_membership_role(
            center, membership_id, new_role, request.user,
        )
    except RoleChangeError as exc:
        return Response({'detail': exc.message}, status=exc.http_status)

    return Response(CenterMembershipSerializer(membership).data)


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
    # students_count + olympiads_count'ni annotate qilamiz — aks holda
    # AdminDashboard'dagi "O'quvchi" / "Olimpiada" ustunlari N+1 query
    # bilan to'planardi.
    qs = _annotate_center_counts(qs)
    return Response(AdminEducationCenterSerializer(qs, many=True, context={'request': request}).data)


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
    return Response(AdminEducationCenterSerializer(center, context={'request': request}).data)


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
    return Response(AdminEducationCenterSerializer(center, context={'request': request}).data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def center_ratings(request):
    """GET /api/centers/ratings/ — markazlarni o'rtacha ball bo'yicha reytinglash.

    Filter: ?region=, ?subject=, ?limit= (default 20, max 100).
    Hisoblash: markaz o'quvchilarining barcha attempts'idan Avg(score).
    Rating: average_score / 20 (0..5 oraliqda). EducationCenter.rating
    maydoni bulk_update orqali yangilanadi — keyingi list endpoint'da
    so'rov qilmasdan ko'rinadi.
    """
    from django.db.models import Avg, Count
    from attempts.models import TestAttempt
    from olympiads.models import Olympiad

    region = (request.query_params.get('region') or '').strip()
    subject = (request.query_params.get('subject') or '').strip()
    try:
        limit = int(request.query_params.get('limit') or 20)
    except (TypeError, ValueError):
        limit = 20
    limit = max(1, min(limit, 100))

    centers_qs = EducationCenter.objects.filter(status=EducationCenter.STATUS_APPROVED)
    if region:
        centers_qs = centers_qs.filter(region__icontains=region)

    # Attempts aggregate: faqat valid (diskvalifikatsiya bo'lmagan) attempts.
    attempts_qs = TestAttempt.objects.filter(
        disqualified=False,
        olympiad__is_deleted=False,
    )
    if subject:
        attempts_qs = attempts_qs.filter(olympiad__subject__iexact=subject)

    # Per-center aggregate — bitta query bilan.
    agg_rows = (
        attempts_qs
        .values('olympiad__center_id')
        .annotate(
            avg_score=Avg('score'),
            total_attempts=Count('id'),
        )
    )
    agg_map = {row['olympiad__center_id']: row for row in agg_rows if row['olympiad__center_id']}

    # Olympiad soni — markaz bo'yicha alohida aggregate.
    olympiads_count_rows = (
        Olympiad.objects.filter(is_deleted=False)
        .values('center_id')
        .annotate(total=Count('id'))
    )
    olympiads_count_map = {row['center_id']: row['total'] for row in olympiads_count_rows if row['center_id']}

    centers = list(centers_qs)
    enriched = []
    centers_to_update = []
    for c in centers:
        row = agg_map.get(c.id)
        if not row or not row.get('total_attempts'):
            # subject filter mavjud bo'lsa, qatnashmagan markazlarni o'tkazib yuboramiz.
            if subject:
                continue
            avg_score = 0
            total_attempts = 0
        else:
            avg_score = round(row.get('avg_score') or 0, 1)
            total_attempts = row.get('total_attempts') or 0
        # Rating: 0..100 ballni 0..5 reytingga o'tkazamiz, max 5.0.
        new_rating = round(min(5.0, (avg_score / 20.0)), 1) if avg_score else 0.0
        # EducationCenter.rating Decimal field — qiymat o'zgargan bo'lsa
        # update qilamiz (bulk_update keyin).
        if subject:
            # subject filterda barcha markazlarning rating'ini ishonchli
            # yangilab bo'lmaydi (faqat shu fan bo'yicha) — skip qilamiz.
            pass
        else:
            try:
                from decimal import Decimal
                if Decimal(str(new_rating)) != Decimal(str(c.rating or 0)):
                    c.rating = new_rating
                    centers_to_update.append(c)
            except Exception:
                pass
        enriched.append({
            'center_id': c.id,
            'center_name': c.name,
            'city': c.city,
            'region': c.region,
            'organization_type': c.organization_type,
            'average_score': avg_score,
            'total_attempts': total_attempts,
            'total_olympiads': olympiads_count_map.get(c.id, 0),
            'rating': new_rating,
        })

    # Bulk update rating maydonini — N+1 query yo'q.
    if centers_to_update:
        try:
            EducationCenter.objects.bulk_update(centers_to_update, ['rating'])
        except Exception:
            pass

    # Sort: avg_score desc, total_attempts desc (tie-breaker).
    enriched.sort(key=lambda x: (-x['average_score'], -x['total_attempts']))
    enriched = enriched[:limit]
    for i, row in enumerate(enriched):
        row['rank'] = i + 1
    return Response(enriched)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def center_ranking(request):
    """GET /api/centers/ranking/ — barcha tasdiqlangan markazlar reytingi.

    Har bir markaz uchun: center_id, center_name, total_attempts,
    average_score, top_score, student_count. Sortlash: average_score desc,
    keyin total_attempts desc tie-break.
    """
    from django.db.models import Avg, Count, Max
    from attempts.models import TestAttempt

    centers_qs = EducationCenter.objects.filter(status=EducationCenter.STATUS_APPROVED)

    # Per-center attempt agregati (faqat validlar).
    attempt_agg = (
        TestAttempt.objects
        .filter(disqualified=False, olympiad__is_deleted=False)
        .values('olympiad__center_id')
        .annotate(
            total_attempts=Count('id'),
            average_score=Avg('score'),
            top_score=Max('score'),
        )
    )
    attempt_map = {
        row['olympiad__center_id']: row
        for row in attempt_agg
        if row['olympiad__center_id']
    }

    # Per-center tasdiqlangan o'quvchilar soni.
    student_agg = (
        CenterMembership.objects
        .filter(role=CenterMembership.ROLE_STUDENT, status=CenterMembership.STATUS_APPROVED)
        .values('center_id')
        .annotate(total=Count('id'))
    )
    student_map = {row['center_id']: row['total'] for row in student_agg}

    rows = []
    for center in centers_qs:
        agg = attempt_map.get(center.id, {})
        avg = float(agg.get('average_score') or 0)
        rows.append({
            'center_id': center.id,
            'center_name': center.name,
            'organization_type': center.organization_type or '',
            'region': center.region or '',
            'district': center.district or '',
            'total_attempts': agg.get('total_attempts') or 0,
            'average_score': round(avg, 1),
            'top_score': agg.get('top_score') or 0,
            'student_count': student_map.get(center.id, 0),
        })

    rows.sort(key=lambda r: (-r['average_score'], -r['total_attempts']))
    for i, row in enumerate(rows):
        row['rank'] = i + 1
    return Response(rows)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def center_stats(request, center_id):
    """GET /api/centers/{id}/stats/ — markaz bo'yicha agregat statistika.

    Owner dashboard'da ko'rsatish uchun: nechta o'quvchi tasdiqlangan,
    nechta o'qituvchi/manager, nechta tadbir, jami attempts, o'rtacha
    reyting. Faqat owner/manager/teacher (yoki platform admin) ko'ra
    oladi.
    """
    center = get_object_or_404(EducationCenter, pk=center_id)
    if not (_user_can_manage_center(request.user, center)
            or request.user.is_platform_admin):
        return Response({'detail': 'Forbidden'},
                        status=http_status.HTTP_403_FORBIDDEN)

    from django.db.models import Avg, Count
    membership_counts = (
        CenterMembership.objects
        .filter(center=center, status=CenterMembership.STATUS_APPROVED)
        .values('role')
        .annotate(total=Count('id'))
    )
    counts_by_role = {row['role']: row['total'] for row in membership_counts}
    pending_count = CenterMembership.objects.filter(
        center=center, status=CenterMembership.STATUS_PENDING,
    ).count()

    from olympiads.models import Olympiad
    olympiads_qs = Olympiad.objects.filter(center=center, is_deleted=False)
    olympiads_total = olympiads_qs.count()
    olympiads_by_status = {
        row['status']: row['total']
        for row in olympiads_qs.values('status').annotate(total=Count('id'))
    }

    from attempts.models import TestAttempt
    attempt_aggregates = TestAttempt.objects.filter(
        olympiad__center=center,
        olympiad__is_deleted=False,
    ).aggregate(
        total_attempts=Count('id'),
        average_score=Avg('score'),
        unique_participants=Count('user', distinct=True),
    )

    return Response({
        'center_id': center.id,
        'name': center.name,
        'students_count': counts_by_role.get(CenterMembership.ROLE_STUDENT, 0),
        'teachers_count': counts_by_role.get(CenterMembership.ROLE_TEACHER, 0),
        'managers_count': counts_by_role.get(CenterMembership.ROLE_MANAGER, 0),
        'pending_requests': pending_count,
        'olympiads_total': olympiads_total,
        'olympiads_by_status': olympiads_by_status,
        'total_attempts': attempt_aggregates.get('total_attempts') or 0,
        'unique_participants': attempt_aggregates.get('unique_participants') or 0,
        'average_score': round(attempt_aggregates.get('average_score') or 0, 1),
    })
