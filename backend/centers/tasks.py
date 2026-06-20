import logging

from celery import shared_task
from django.contrib.auth import get_user_model
from centers.models import EducationCenter, CenterMembership

User = get_user_model()
logger = logging.getLogger(__name__)


@shared_task
def send_student_join_notifications_task(requester_id, center_id, membership_id):
    """Notify all managers and owner of a center when a student requests to join."""
    from notifications.services import send_student_join_request_notification
    try:
        center = EducationCenter.objects.get(pk=center_id)
        requester = User.objects.get(pk=requester_id)
        membership = CenterMembership.objects.get(pk=membership_id)

        # Get all approved managers
        managers = list(
            CenterMembership.objects.filter(
                center=center,
                role=CenterMembership.ROLE_MANAGER,
                status=CenterMembership.STATUS_APPROVED
            ).select_related('user')
        )

        for m in managers:
            try:
                send_student_join_request_notification(m.user, requester, center, membership)
            except Exception:
                logger.exception(
                    "Failed to notify manager user_id=%s about student join "
                    "(center=%s, membership=%s)", m.user_id, center_id, membership_id,
                )

        if center.owner_id:
            try:
                send_student_join_request_notification(center.owner, requester, center, membership)
            except Exception:
                logger.exception(
                    "Failed to notify owner user_id=%s about student join "
                    "(center=%s, membership=%s)", center.owner_id, center_id, membership_id,
                )
        return f"Successfully sent join notifications for student {requester_id} in center {center_id}"
    except Exception as e:
        import logging
        logging.getLogger(__name__).exception("Failed to send student join notifications in celery task")
        return f"Error sending student join notifications: {str(e)}"


@shared_task
def send_staff_join_notification_task(requester_id, center_id, membership_id):
    """Notify center owner when a teacher or manager requests to join."""
    from notifications.services import send_staff_join_request_notification
    try:
        center = EducationCenter.objects.get(pk=center_id)
        requester = User.objects.get(pk=requester_id)
        membership = CenterMembership.objects.get(pk=membership_id)

        if center.owner_id:
            send_staff_join_request_notification(
                center.owner,
                requester,
                center,
                role=membership.role,
                subject=membership.subject or '',
                membership=membership
            )
        return f"Successfully sent staff join notification for user {requester_id} in center {center_id}"
    except Exception as e:
        import logging
        logging.getLogger(__name__).exception("Failed to send staff join notification in celery task")
        return f"Error sending staff join notification: {str(e)}"
