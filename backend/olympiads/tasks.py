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
def send_olympiad_results_email_task(olympiad_id):
    """Olimpiada yakunlangach ishtirokchilarga natija email'ini yuboradi.

    DIQQAT: faqat olimpiada YAKUNLANGANDA bir marta chaqiriladi (har attempt'da
    emas) — `_do_finish_olympiad` ichidan `on_commit` orqali. Hozirgi User
    modelida `email` maydoni yo'q, shu sababli bu funksiya amalda no-op bo'ladi;
    User'ga email qo'shilsa avtomatik ishlay boshlaydi. Diskvalifikatsiya
    qilinganlar (disqualified=True) chetlab o'tiladi.
    """
    try:
        olympiad = Olympiad.objects.filter(pk=olympiad_id).first()
        if not olympiad:
            return
        from attempts.models import TestAttempt
        from accounts.email_utils import send_olympiad_result
        attempts = (
            TestAttempt.objects
            .filter(olympiad=olympiad, disqualified=False)
            .select_related('user')
        )
        for a in attempts:
            try:
                send_olympiad_result(a.user, olympiad.title, a.score, a.rank)
            except Exception:
                logger.exception(
                    'send_olympiad_result failed olympiad=%s attempt=%s',
                    olympiad_id, a.id,
                )
    except Exception:
        logger.exception('send_olympiad_results_email_task failed olympiad=%s', olympiad_id)


@shared_task
def finish_expired_olympiads():
    """Periodik task: muddati o'tgan olimpiadalarni yopadi + rank yangilaydi."""
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

    # Obunalarni fon rejimida yangilash
    from billing.models import UserSubscription
    from centers.models import EducationCenter
    from django.contrib.auth import get_user_model
    User = get_user_model()
    
    expired_subs = UserSubscription.objects.filter(is_active=True, end_date__lte=now)
    expired_users = list(expired_subs.values_list('user_id', flat=True).distinct())
    if expired_subs.exists():
        expired_subs.update(is_active=False)
        for uid in expired_users:
            u = User.objects.filter(pk=uid).first()
            if not u:
                continue
            has_active = UserSubscription.objects.filter(user=u, is_active=True, end_date__gt=now).exists()
            if not has_active:
                u.is_premium = False
                u.save(update_fields=['is_premium'])
            
            has_active_org = UserSubscription.objects.filter(
                user=u, is_active=True, plan__plan_type='organization', end_date__gt=now
            ).exists()
            if not has_active_org:
                EducationCenter.objects.filter(owner=u).update(is_premium=False)

    return f'{count} ta olimpiada yakunlandi va obunalar yangilandi'
