import logging
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from .models import Olympiad

logger = logging.getLogger(__name__)


@shared_task
def send_olympiad_summary_task(olympiad_id):
    """Olimpiada yakunlangach markaz menejer/ustozlariga xulosa yuboradi.

    Telegram API call sinxron — request thread'ini bloklamaslik uchun shu
    asinxron task ichida bajariladi. Markazsiz (public) olimpiadalar uchun
    hech narsa qilmaydi.
    """
    try:
        olympiad = (
            Olympiad.objects.select_related('center', 'center__owner')
            .filter(pk=olympiad_id)
            .first()
        )
        if not olympiad or not olympiad.center_id:
            return
        from notifications.services import send_olympiad_summary_to_manager
        send_olympiad_summary_to_manager(olympiad, olympiad.center)
    except Exception:
        logger.exception('send_olympiad_summary_task failed olympiad=%s', olympiad_id)


@shared_task
def finish_expired_olympiads():
    """Periodik task: muddati o'tgan olimpiadalarni yopadi + rank yangilaydi.

    Render free tier'da Celery yo'q, lekin agar boshqa muhitda ishlatilsa
    bu task `_do_finish_olympiad` orqali rank'larni ham hisoblab beradi.
    """
    from .services import _do_finish_olympiad
    now = timezone.now()
    expired = Olympiad.objects.filter(
        status=Olympiad.STATUS_ACTIVE,
        start_datetime__isnull=False,
        duration_minutes__isnull=False,
    )
    count = 0
    for olympiad in expired:
        end_time = olympiad.start_datetime + timedelta(minutes=olympiad.duration_minutes)
        if now > end_time:
            _do_finish_olympiad(olympiad)
            count += 1
    return f'{count} ta olimpiada yakunlandi'
