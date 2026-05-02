from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from .models import Olympiad


@shared_task
def finish_expired_olympiads():
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
            olympiad.status = Olympiad.STATUS_FINISHED
            olympiad.save(update_fields=['status'])
            count += 1
    return f'{count} ta olimpiada yakunlandi'
