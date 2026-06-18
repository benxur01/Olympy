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


def _notify_downgraded_centers(center_ids):
    """Obuna tugab bepul rejimga tushgan markaz egalariga ogohlantirish.

    Har bir markaz uchun yangi (bepul) limit va joriy o'quvchi/o'qituvchi sonini
    SubscriptionService orqali hisoblaydi. Limitdan oshgan bo'lsa — owner'ning
    Telegramiga "Obunangiz tugadi, X ta o'quvchi limitdan oshib turibdi"
    xabarini yuboradi. Hech narsa o'chirilmaydi.
    """
    from centers.models import EducationCenter
    from billing.services import SubscriptionService, UNLIMITED

    centers = (
        EducationCenter.objects
        .filter(id__in=set(center_ids))
        .select_related('owner')
    )
    for center in centers:
        try:
            svc = SubscriptionService(center)
            students = svc.current_students()
            student_limit = svc.student_limit
            teachers = svc.current_teachers()
            teacher_limit = svc.teacher_limit

            over_students = (
                student_limit != UNLIMITED and students > student_limit
            )
            over_teachers = (
                teacher_limit != UNLIMITED and teachers > teacher_limit
            )
            if not over_students and not over_teachers:
                continue

            lines = [
                f"⚠️ {center.name}: Premium obunangiz tugadi.",
                "",
                "Tashkilotingiz bepul rejimga qaytdi va joriy ma'lumotlar limitdan oshib turibdi:",
            ]
            if over_students:
                lines.append(f"• O'quvchilar: {students} ta (bepul limit: {student_limit})")
            if over_teachers:
                lines.append(f"• Ustozlar: {teachers} ta (bepul limit: {teacher_limit})")
            lines += [
                "",
                "Mavjud o'quvchilaringiz o'chirilmadi, lekin limit oshganligi sababli "
                "yangilarini qo'sha olmaysiz. Tarifni yangilang.",
            ]
            message = "\n".join(lines)

            owner = center.owner
            if not owner:
                continue
            from notifications.services import _send_telegram_to_user
            _send_telegram_to_user(owner, message)
        except Exception:
            logger.exception(
                'downgrade ogohlantirishi yuborilmadi center=%s', center.id,
            )


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
    # Obunasi yangi tugab organization premiumdan tushgan markazlar — ortiqcha
    # o'quvchi limitidan oshib turgan bo'lsa owner'ga ogohlantirish yuboramiz.
    downgraded_center_owner_ids = []
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
                # Faqat haqiqatan premiumdan tushganlarni (avval True bo'lgan)
                # ogohlantiramiz — allaqachon bepul bo'lganlarga takror xabar
                # yubormaslik uchun.
                downgraded_ids = list(
                    EducationCenter.objects
                    .filter(owner=u, is_premium=True)
                    .values_list('id', flat=True)
                )
                EducationCenter.objects.filter(owner=u).update(is_premium=False)
                downgraded_center_owner_ids.extend(downgraded_ids)

    # Limitdan oshib turgan markaz egalariga Telegram ogohlantirishi. O'quvchilar
    # AVTOMATIK O'CHIRILMAYDI (bu noto'g'ri bo'lardi) — faqat owner'ga tarifni
    # yangilash kerakligi haqida xabar beriladi.
    if downgraded_center_owner_ids:
        _notify_downgraded_centers(downgraded_center_owner_ids)

    # Premium sinov muddati tugaganlarni o'chirish. Sinovli foydalanuvchida
    # odatda UserSubscription yozuvi bo'lmaydi, shuning uchun ular yuqoridagi
    # obuna blokiga tushmaydi. Faqat sinovi tugagan VA amal qiluvchi obunasi
    # bo'lmagan foydalanuvchilarning flag'ini qaytaramiz (trial->obuna o'tgan
    # foydalanuvchini xato o'chirib qo'ymaslik uchun aktiv obuna tekshiriladi).
    trial_expired = User.objects.filter(
        is_premium=True,
        premium_trial_end__isnull=False,
        premium_trial_end__lte=now,
    )
    for u in trial_expired:
        has_active = UserSubscription.objects.filter(
            user=u, is_active=True, end_date__gt=now,
        ).exists()
        if not has_active:
            u.is_premium = False
            u.save(update_fields=['is_premium'])

    return f'{count} ta olimpiada yakunlandi va obunalar yangilandi'
