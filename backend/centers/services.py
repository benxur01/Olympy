import logging

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction

from .models import CenterMembership, EducationCenter


logger = logging.getLogger('centers.approvals')


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

    try:
        from notifications.services import send_membership_decision_notification

        send_membership_decision_notification(membership, is_approved)
    except Exception:
        logger.exception('membership decision notification failed')

    return membership
