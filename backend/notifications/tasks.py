"""Periodic background tasks for the notifications app."""
import logging
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from .models import Notification

logger = logging.getLogger(__name__)

# O'qilgan xabarnomalar shu muddatdan keyin saqlanmaydi. 90 kun — foydalanuvchi
# bell dropdown'ida faqat oxirgi xabarlarni ko'radi, undan eskisi esa faqat
# jadvalni (va `message` TextField bilan birga diskni) shishirib boradi.
NOTIFICATION_RETENTION_DAYS = 90


@shared_task(name='notifications.purge_old_notifications')
def purge_old_notifications(batch_size=2000, max_batches=50):
    """90 kundan eski O'QILGAN xabarnomalarni o'chiradi.

    NEGA KERAK: har bir ariza/tasdiq/olimpiada hodisasi HAR BIR qabul
    qiluvchiga bitta qator yozadi (fan-out: bitta nashr qilingan olimpiada —
    markazdagi barcha o'quvchilarga), va hech narsa ularni tozalamasdi.
    Jadval faqat o'sib borardi, `user`+`-created_at` indeksi bilan birga.

    O'QILMAGAN xabarnomalar tegilmaydi: ular foydalanuvchi hali ko'rmagan
    ma'lumot, muddatidan qat'i nazar saqlanadi.

    `accounts.flush_expired_jwt_tokens` bilan bir xil batch naqshi: bitta
    katta `DELETE` barcha PK'larni xotiraga yig'adi — kichik konteynerda bu
    xavfli. `max_batches` — bitta ishga tushishdagi yuqori chegara, qolgani
    keyingi kunga qoladi (task idempotent, takror ishga tushirish xavfsiz).
    """
    cutoff = timezone.now() - timedelta(days=NOTIFICATION_RETENTION_DAYS)
    total = 0

    for _ in range(max_batches):
        ids = list(
            Notification.objects
            .filter(is_read=True, created_at__lt=cutoff)
            .values_list('id', flat=True)[:batch_size]
        )
        if not ids:
            break
        deleted, _detail = Notification.objects.filter(id__in=ids).delete()
        total += deleted
        if len(ids) < batch_size:
            break

    if total:
        logger.info('purge_old_notifications: deleted %s rows', total)
    return {'deleted_rows': total}
