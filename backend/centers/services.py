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

    # user.roles ni yangilash: eski rolni faqat boshqa markazda ham shu rol
    # bilan approved a'zolik bo'lmasagina olib tashlaymiz.
    has_other_old = CenterMembership.objects.filter(
        user=user, role=old_role, status=CenterMembership.STATUS_APPROVED,
    ).exists()
    if not has_other_old and hasattr(user, 'remove_role'):
        user.remove_role(old_role)
    if hasattr(user, 'add_role'):
        user.add_role(new_role)

    return new_membership


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
