from django.db.models import Q
from django.utils import timezone

from centers.models import CenterMembership, EducationCenter

from .models import Olympiad


def user_can_manage_center_event(user, center):
    """True if user can create/manage events for the center."""
    if not getattr(user, 'is_authenticated', False):
        return False
    if user.is_platform_admin:
        return True
    if center.owner_id == user.id:
        return center.status == EducationCenter.STATUS_APPROVED
    return CenterMembership.objects.filter(
        user=user,
        center=center,
        role__in=[
            CenterMembership.ROLE_OWNER,
            CenterMembership.ROLE_MANAGER,
            CenterMembership.ROLE_TEACHER,
        ],
        status=CenterMembership.STATUS_APPROVED,
    ).exists()


def approved_membership_rows(user):
    return list(
        CenterMembership.objects.filter(
            user=user,
            status=CenterMembership.STATUS_APPROVED,
        ).values_list('center_id', 'role')
    )


def staff_center_ids_from_memberships(rows):
    return [
        cid for cid, role in rows
        if role in (
            CenterMembership.ROLE_OWNER,
            CenterMembership.ROLE_MANAGER,
            CenterMembership.ROLE_TEACHER,
        )
    ]


def user_can_participate_in_event(user, olympiad):
    if not getattr(user, 'is_authenticated', False):
        return False
    if user.is_platform_admin:
        return True
    if olympiad.event_type == Olympiad.EVENT_TYPE_OLYMPIAD:
        return True
    return CenterMembership.objects.filter(
        user=user,
        center=olympiad.center,
        role=CenterMembership.ROLE_STUDENT,
        status=CenterMembership.STATUS_APPROVED,
    ).exists()


def visible_events_filter(user):
    if user.is_platform_admin:
        return Q()

    memberships = approved_membership_rows(user)
    center_ids = [cid for cid, _ in memberships]
    staff_center_ids = staff_center_ids_from_memberships(memberships)
    visible_statuses = [Olympiad.STATUS_ACTIVE, Olympiad.STATUS_FINISHED]

    public_events = Q(
        event_type=Olympiad.EVENT_TYPE_OLYMPIAD,
        status__in=visible_statuses,
    )
    center_competitions = Q(
        event_type=Olympiad.EVENT_TYPE_COMPETITION,
        center_id__in=center_ids,
        status__in=visible_statuses,
    )
    staff_events = Q(
        center_id__in=staff_center_ids,
    )
    return public_events | center_competitions | staff_events


def event_readiness_errors(olympiad):
    errors = []
    if not (olympiad.title or '').strip():
        errors.append('Tadbir nomini kiriting')
    if not (olympiad.subject or '').strip():
        errors.append('Fanni tanlang')
    if not olympiad.start_datetime:
        errors.append('Boshlanish sanasi va vaqtini kiriting')
    elif olympiad.start_datetime < timezone.now():
        errors.append("Boshlanish vaqti o'tib ketgan")
    if not olympiad.duration_minutes or olympiad.duration_minutes <= 0:
        errors.append('Davomiylikni kiriting')
    if not olympiad.questions.exists():
        errors.append('Kamida bitta savol tayinlang')
    return errors
