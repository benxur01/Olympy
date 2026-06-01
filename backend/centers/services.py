import logging

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction

from .models import CenterMembership, EducationCenter


logger = logging.getLogger('centers.approvals')


def create_pending_center_for_owner(owner, center_data):
    center = EducationCenter.objects.create(
        name=center_data['name'],
        organization_type=center_data.get('organization_type', "O'quv markaz"),
        country=center_data.get('country', "O'zbekiston"),
        region=center_data.get('region', ''),
        district=center_data.get('district', ''),
        city=center_data['city'],
        subjects=center_data.get('subjects', []),
        owner=owner,
        status=EducationCenter.STATUS_PENDING,
    )
    CenterMembership.objects.create(
        user=owner,
        center=center,
        role=CenterMembership.ROLE_OWNER,
        status=CenterMembership.STATUS_PENDING,
    )
    from django.contrib.auth import get_user_model
    from notifications.services import send_center_approval_request_notification

    User = get_user_model()
    admins = User.objects.filter(is_platform_admin=True, is_active=True)
    for admin in admins:
        send_center_approval_request_notification(admin, owner, center)
    return center


def primary_center_for_user(user):
    """Foydalanuvchining asosiy markazini qaytaradi (log uchun).

    Avval owner bo'lgan markaz, keyin manager, keyin student a'zoligi
    bo'yicha. Topilmasa None. ManagerActivityLog.center majburiy bo'lgani
    uchun log yozishdan oldin shu yordamchi ishlatiladi.
    """
    try:
        # Rol ustuvorligi bo'yicha tanlash (owner > manager > teacher > student).
        memberships = list(
            CenterMembership.objects
            .filter(user=user, status=CenterMembership.STATUS_APPROVED)
            .select_related('center')
        )
        if not memberships:
            return None
        priority = {
            CenterMembership.ROLE_OWNER: 0,
            CenterMembership.ROLE_MANAGER: 1,
            CenterMembership.ROLE_TEACHER: 2,
            CenterMembership.ROLE_STUDENT: 3,
        }
        memberships.sort(key=lambda mm: priority.get(mm.role, 9))
        return memberships[0].center
    except Exception:
        return None


def log_manager_activity(center, manager, action_type, description='', target_user=None):
    """T5: Menejer faoliyatini ManagerActivityLog ga yozadi.

    Hech qachon exception otmaydi — logging asosiy oqimni buzmasligi kerak.
    `manager` platforma admini yoki owner bo'lsa ham yoziladi (kim amalni
    bajargani aniq bo'lsin).
    """
    try:
        from .models import ManagerActivityLog
        ManagerActivityLog.objects.create(
            center=center,
            manager=manager,
            action_type=action_type,
            description=(description or '')[:255],
            target_user=target_user,
        )
    except Exception:
        logger.exception('manager activity log write failed')


def user_can_manage_center(user, center):
    if not getattr(user, 'is_authenticated', False):
        return False
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


def user_can_approve_membership(user, center, role):
    if not getattr(user, 'is_authenticated', False):
        return False
    if user.is_platform_admin:
        return True
    if center.owner_id == user.id:
        return center.status == EducationCenter.STATUS_APPROVED
    if role == CenterMembership.ROLE_STUDENT:
        return CenterMembership.objects.filter(
            user=user,
            center=center,
            role=CenterMembership.ROLE_MANAGER,
            status=CenterMembership.STATUS_APPROVED,
        ).exists()
    return False


class RoleChangeError(Exception):
    """change_membership_role validatsiya xatosi. ``http_status`` bilan birga
    keladi — view shu kodni HTTP javobiga aylantiradi."""

    def __init__(self, message, http_status=400):
        super().__init__(message)
        self.message = message
        self.http_status = http_status


@transaction.atomic
def change_membership_role(center, membership_id, new_role, actor):
    """Mavjud a'zolikning rolini boshqasiga o'zgartiradi.

    Eski membership o'chiriladi va yangi (approved) membership yaratiladi —
    `unique_user_center_role` constraint sababli bir xil (user, center, role)
    juftligi takrorlanmasligi kerak. user.roles ham mos ravishda yangilanadi.

    Xatoliklarda RoleChangeError otadi (view uni HTTP javobga aylantiradi).
    """
    valid_roles = {
        CenterMembership.ROLE_STUDENT,
        CenterMembership.ROLE_TEACHER,
        CenterMembership.ROLE_MANAGER,
    }
    if new_role not in valid_roles:
        raise RoleChangeError("Noto'g'ri rol tanlandi", http_status=400)

    membership = (
        CenterMembership.objects
        .select_for_update()
        .select_related('user')
        .filter(pk=membership_id, center=center)
        .first()
    )
    if membership is None:
        raise RoleChangeError("A'zolik topilmadi", http_status=404)

    old_role = membership.role

    # Owner a'zoligini o'zgartirib bo'lmaydi — bu markazning egasini
    # almashtirish bo'lib qoladi.
    if old_role == CenterMembership.ROLE_OWNER:
        raise RoleChangeError(
            "Owner a'zoligining rolini o'zgartirib bo'lmaydi",
            http_status=400,
        )

    if old_role == new_role:
        raise RoleChangeError("Yangi rol joriy rol bilan bir xil", http_status=400)

    user = membership.user

    # Yangi rol uchun shu (user, center, role) allaqachon mavjud bo'lsa —
    # 409 (konflikt). Aks holda eski membership'ni o'chirib yangisini
    # yaratganimizda unique constraint xato berardi.
    conflict = CenterMembership.objects.filter(
        user=user, center=center, role=new_role,
    ).exclude(pk=membership.pk).exists()
    if conflict:
        raise RoleChangeError(
            "Foydalanuvchida bu markazda ushbu rol allaqachon mavjud",
            http_status=409,
        )

    if new_role == CenterMembership.ROLE_STUDENT:
        try:
            check_student_limit(center)
        except ValidationError as exc:
            raise RoleChangeError(str(exc), http_status=400)

    old_subject = membership.subject
    membership.delete()

    new_membership = CenterMembership.objects.create(
        user=user,
        center=center,
        role=new_role,
        # Fan faqat o'qituvchi roli uchun mantiqiy — boshqa rollarda tozalaymiz.
        subject=old_subject if new_role == CenterMembership.ROLE_TEACHER else '',
        status=CenterMembership.STATUS_APPROVED,
        approved_by=actor,
    )

    # O'quvchining shu markazdagi boshqa barcha membershiplarini o'chiramiz —
    # faqat yangi yaratilgan membership va owner rolini qoldirib. Bu eski
    # student/teacher a'zoliklari ortda qolib ketmasligini ta'minlaydi.
    stale_qs = (
        CenterMembership.objects
        .filter(user=user, center=center)
        .exclude(pk=new_membership.pk)
        .exclude(role=CenterMembership.ROLE_OWNER)
    )
    # O'chiriladigan rollarni oldindan to'playmiz (eski rolni ham qamrab oladi),
    # keyin user.roles dan tozalashda foydalanamiz.
    removed_roles = set(stale_qs.values_list('role', flat=True))
    removed_roles.add(old_role)
    stale_qs.delete()

    # user.roles ni yangilash: o'chirilgan har bir rolni faqat boshqa markazda
    # ham shu rol bilan approved a'zolik bo'lmasagina olib tashlaymiz. Yangi rol
    # hech qachon olib tashlanmaydi.
    removed_roles.discard(new_role)
    if hasattr(user, 'remove_role'):
        for role in removed_roles:
            still_has = CenterMembership.objects.filter(
                user=user, role=role, status=CenterMembership.STATUS_APPROVED,
            ).exists()
            if not still_has:
                user.remove_role(role)
    if hasattr(user, 'add_role'):
        user.add_role(new_role)

    return new_membership


def check_student_limit(center):
    """Checks if the center has reached its student capacity limit based on subscription plan."""
    from billing.models import UserSubscription
    from django.utils import timezone
    
    # Get active student count of the center
    active_count = CenterMembership.objects.filter(
        center=center,
        role=CenterMembership.ROLE_STUDENT,
        status=CenterMembership.STATUS_APPROVED
    ).count()
    
    # Check active subscription
    now = timezone.now()
    active_sub = UserSubscription.objects.filter(
        user=center.owner,
        is_active=True,
        plan__plan_type='organization',
        end_date__gt=now
    ).select_related('plan').first()
    
    if active_sub:
        plan_name = active_sub.plan.name.lower()
        if 'standart' in plan_name or 'standard' in plan_name:
            limit = 50
        elif 'plus' in plan_name:
            limit = 200
        elif 'pro' in plan_name:
            limit = 999999
        else:
            limit = 50  # default fallback for any active subscription
    else:
        limit = 10  # Free tier limit
        
    if active_count >= limit:
        raise ValidationError(
            f"Tashkilotda o'quvchilar soni limitga yetgan (Maksimal {limit} ta). "
            "Qo'shimcha o'quvchilar qo'shish uchun tarifni premiumga yangilang."
        )


@transaction.atomic
def decide_membership(membership, actor, decision):
    membership = (
        CenterMembership.objects
        .select_for_update()
        .select_related('user', 'center')
        .get(pk=membership.pk)
    )
    if not user_can_approve_membership(actor, membership.center, membership.role):
        raise PermissionDenied('Forbidden')
    if membership.status != CenterMembership.STATUS_PENDING:
        raise ValidationError("Bu ariza allaqachon ko'rib chiqilgan")

    is_approved = decision in ('approve', 'approved')
    if is_approved and membership.role == CenterMembership.ROLE_STUDENT:
        check_student_limit(membership.center)

    membership.status = (
        CenterMembership.STATUS_APPROVED
        if is_approved else CenterMembership.STATUS_REJECTED
    )
    membership.approved_by = actor
    membership.save(update_fields=['status', 'approved_by'])
    if is_approved:
        membership.user.add_role(membership.role)

    # Y6: Telegram API transaction ichida emas, transaction.on_commit orqali
    # yuboriladi. Avval atomic blok ichida sinxron Telegram chaqirilardi —
    # API 3s kutsa DB lock'lar uzoq vaqt ushlanib qolardi. Endi commit'dan
    # keyin yangi (auto-commit) connection'da yuboriladi.
    captured_membership = membership
    captured_approved = is_approved

    def _send_notification():
        try:
            from notifications.services import send_membership_decision_notification
            send_membership_decision_notification(captured_membership, captured_approved)
        except Exception:
            logger.exception('membership decision notification failed')

    transaction.on_commit(_send_notification)
    return membership
