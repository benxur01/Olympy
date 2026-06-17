from datetime import timedelta

from django.db import transaction
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


def center_olympiad_limit_exceeded(center):
    """True agar bepul markaz joriy oyda olimpiada yaratish limitiga yetgan.

    Limit `settings.FREE_OLYMPIAD_MONTHLY_LIMIT` (default 2) dan olinadi.
    Faqat AKTIV (soft-delete qilinmagan, is_deleted=False) olimpiadalar
    hisoblanadi — o'chirilgan olimpiada markazga limitni "egallamasligi"
    kerak, aks holda admin xato olimpiadani o'chirib qayta yarata olmaydi.
    Premium markazlar uchun (kelajakda flag bilan) limit qo'llanilmaydi.
    """
    from django.conf import settings
    from django.utils import timezone

    # Premium markaz tushunchasi hozircha yo'q — barchasi bepul. Kelajakda
    # `getattr(center, 'is_premium', False)` shu yerda tekshiriladi.
    if getattr(center, 'is_premium', False):
        return False
    limit = getattr(settings, 'FREE_OLYMPIAD_MONTHLY_LIMIT', 2)
    now = timezone.now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    created_this_month = Olympiad.objects.filter(
        center=center,
        is_deleted=False,
        created_at__gte=month_start,
    ).count()
    return created_this_month >= limit


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
    # O3: olimpiada faol bo'lmasa qatnashish ham mumkin emas. Avval faqat
    # event_type va membership tekshirilardi va DRAFT/INACTIVE olimpiada
    # uchun ham True qaytardi — submit_attempt'ning ikkinchi qatlamida
    # status alohida tekshirilardi, lekin leaderboard kabi joylarda
    # (eslatma: leaderboard endpoint o'zi STATUS_ACTIVE/FINISHED filter
    # qiladi) status tekshirilmasdi. Bu yerda darhol rad etish to'g'riroq.
    if olympiad.status not in (Olympiad.STATUS_ACTIVE, Olympiad.STATUS_FINISHED):
        return False
    group_filter = (olympiad.group_filter or '').strip()
    if olympiad.event_type == Olympiad.EVENT_TYPE_OLYMPIAD:
        # Public olimpiada bo'lsa-da, guruh filtri qo'yilgan bo'lsa faqat
        # shu markazda mos `group_tag` ga ega o'quvchi qatnasha oladi.
        if not group_filter:
            return True
        return CenterMembership.objects.filter(
            user=user,
            center=olympiad.center,
            role=CenterMembership.ROLE_STUDENT,
            status=CenterMembership.STATUS_APPROVED,
            group_tag=group_filter,
        ).exists()
    membership_qs = CenterMembership.objects.filter(
        user=user,
        center=olympiad.center,
        role=CenterMembership.ROLE_STUDENT,
        status=CenterMembership.STATUS_APPROVED,
    )
    if group_filter:
        membership_qs = membership_qs.filter(group_tag=group_filter)
    return membership_qs.exists()


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


def recompute_olympiad_ranks(olympiad):
    """Olimpiada attempt'lariga rank beradi (score DESC, time_spent ASC).

    Eng yuqori ball + eng kam vaqt = rank 1. Sertifikat va leaderboard
    UI shu maydonga tayanadi (sertifikat ruxsati `attempt.rank == 1` ga
    bog'liq). Avval `submit` paytida hech qachon yangilanmasdi, natijada
    rank=None qolardi va sertifikatlar 403 qaytarardi.

    Diskvalifikatsiya qilingan attempt'lar (disqualified=True) ranking'ga
    kirmaydi va rank=None bilan qoldiriladi.
    """
    if not olympiad:
        return 0
    from attempts.models import TestAttempt
    attempts = list(
        TestAttempt.objects
        .filter(olympiad=olympiad, disqualified=False)
        .order_by('-score', 'time_spent', 'submitted_at')
        .only('id', 'rank')
    )
    to_update = []
    for index, attempt in enumerate(attempts, start=1):
        if attempt.rank != index:
            attempt.rank = index
            to_update.append(attempt)
    if to_update:
        TestAttempt.objects.bulk_update(to_update, ['rank'])
    # Disqualified attempt'larning rank'ini doim None'ga tushiramiz —
    # admin avval qo'lda submit qilgan, keyin diskval bo'lgan holatda
    # eski rank qolib ketmasin.
    TestAttempt.objects.filter(
        olympiad=olympiad,
        disqualified=True,
        rank__isnull=False,
    ).update(rank=None)
    return len(attempts)


def _do_finish_olympiad(olympiad):
    """Olympiadani FINISHED ga o'tkazadi va rank'larni qayta hisoblaydi.

    Bitta transaction ichida bajariladi — status va rank yangilanishlari
    atomic bo'lishi kerak. Qisqa bo'lishi uchun `select_for_update` ham
    qo'yamiz: bir vaqtda ikki marta chaqirilsa ikkilanmasdan.
    """
    with transaction.atomic():
        locked = (
            Olympiad.objects
            .select_for_update()
            .filter(pk=olympiad.pk)
            .first()
        )
        if not locked or locked.status == Olympiad.STATUS_FINISHED:
            return
        locked.status = Olympiad.STATUS_FINISHED
        locked.save(update_fields=['status'])
        recompute_olympiad_ranks(locked)
        # Markazga bog'liq olimpiada bo'lsa — yakuniy xulosani menejer/
        # ustozlarga yuboramiz. `on_commit` orqali: task DB'dagi yangilangan
        # (FINISHED) holatni va rank'larni ko'rishi kafolatlanadi. Status
        # tekshiruvi (yuqorida) tufayli xulosa har olimpiada uchun bir marta
        # yuboriladi.
        if locked.center_id:
            _queue_olympiad_summary(locked.pk)
        # Ishtirokchilarga natija email'ini transaction commit'dan keyin
        # yuboramiz — olimpiada har yakunlanganda BIR marta (yuqoridagi status
        # tekshiruvi takrorlanishni oldini oladi). Email maydoni bo'lmasa amalda
        # no-op.
        _queue_olympiad_results_email(locked.pk)


def _queue_olympiad_results_email(olympiad_id):
    """Olimpiada natija email task'ini transaction commit'dan keyin navbatga qo'yadi."""
    def _enqueue():
        try:
            from .tasks import send_olympiad_results_email_task
            send_olympiad_results_email_task.delay(olympiad_id)
        except Exception:
            import logging
            logging.getLogger(__name__).exception(
                'failed to queue olympiad results email task olympiad=%s', olympiad_id,
            )

    transaction.on_commit(_enqueue)


def _queue_olympiad_summary(olympiad_id):
    """Olimpiada xulosa task'ini transaction commit'dan keyin navbatga qo'yadi."""
    def _enqueue():
        try:
            from .tasks import send_olympiad_summary_task
            send_olympiad_summary_task.delay(olympiad_id)
        except Exception:
            import logging
            logging.getLogger(__name__).exception(
                'failed to queue olympiad summary task olympiad=%s', olympiad_id,
            )

    transaction.on_commit(_enqueue)


def maybe_finish_expired_olympiad(olympiad):
    """Celery worker yo'q muhitda lazy trigger — faqat SHU olimpiada.

    Render free tier'da alohida Celery worker ishlamaydi, shu sababli
    `finish_expired_olympiads` periodik task hech qachon bajarilmaydi.
    Buning o'rniga har bir submit/questions so'rovida olimpiada muddati
    o'tganmi tekshirib, o'tgan bo'lsa shu yerda yopib qo'yamiz.

    Avval butun `finish_expired_olympiads` chaqirilardi — har submit'da
    barcha ACTIVE olimpiadalar jadvalini aylanardi va N+1 yuk hosil
    qilardi. Endi faqat parametrda berilgan olimpiada tekshiriladi.

    Bu funksiya atomic transaction ICHIDA chaqirilmasligi kerak —
    aks holda lock muammosi tug'ilishi mumkin.
    """
    if not olympiad or olympiad.status != Olympiad.STATUS_ACTIVE:
        return
    if not olympiad.start_datetime or not olympiad.duration_minutes:
        return
    end_time = olympiad.start_datetime + timedelta(minutes=olympiad.duration_minutes)
    if timezone.now() <= end_time:
        return
    try:
        _do_finish_olympiad(olympiad)
    except Exception:
        import logging
        logging.getLogger(__name__).exception('maybe_finish_expired_olympiad failed')


def finalize_expired_active_olympiads():
    """Muddati o'tgan barcha ACTIVE olimpiadalarni FINISHED ga o'tkazadi.

    Celery worker yo'q muhitda (Render free tier) `finish_expired_olympiads`
    periodik task ishlamaydi, shu sababli vaqti tugagan olimpiada ACTIVE
    holatda osilib qolardi: studentlar uni "Faol" ro'yxatida ko'rib,
    ochmoqchi bo'lganda "Olimpiada yakunlangan" deb rad etilardi, lekin
    "Tugagan" tabiga hech qachon o'tmasdi.

    Bu funksiya olimpiadalar RO'YXATI so'ralganda (`olympiads_list_create`
    GET) chaqiriladi: ro'yxat qaytarilishidan oldin muddati o'tgan
    ACTIVE'larni yopadi, shunda foydalanuvchi doim to'g'ri status (active /
    finished) ko'radi.

    N+1 ni oldini olish uchun avval DB tomonida `end_time < now` shartiga
    mos faqat ID'larni tanlaymiz; faollashtirilishi kerak bo'lganlar odatda
    kam (0-3 ta) bo'ladi. Topilganlar `_do_finish_olympiad` orqali rank
    qayta hisoblanib, markaz xulosasi navbatga qo'yilib yopiladi.

    Atomic transaction ICHIDA chaqirilmasligi kerak (har bir yopish o'z
    `transaction.atomic()` blokига ega va `select_for_update` ishlatadi).

    Returns: yopilgan olimpiadalar soni.
    """
    now = timezone.now()
    # ACTIVE olimpiadalar soni odatda kam (o'nlab) — faqat muddatni
    # hisoblash uchun zarur 3 ta kolonkani yuklab, Python'da `end_time` ni
    # tekshiramiz. Avval DB tomonida `start_datetime + duration*interval`
    # qilingan edi, lekin bu SQLite (lokal/test) va PostgreSQL o'rtasida
    # turlicha ishlardi; Python'da hisoblash to'liq DB-agnostik va N+1
    # emas (qatorlar boshlang'ich querysetda yuklanadi).
    candidates = (
        Olympiad.objects
        .filter(
            status=Olympiad.STATUS_ACTIVE,
            start_datetime__isnull=False,
            duration_minutes__gt=0,
            is_deleted=False,
        )
        .only('id', 'start_datetime', 'duration_minutes')
    )
    expired_ids = [
        o.id for o in candidates
        if o.start_datetime + timedelta(minutes=o.duration_minutes) < now
    ]
    if not expired_ids:
        return 0
    count = 0
    # `_do_finish_olympiad` har olimpiada uchun `olympiad.center` va
    # `olympiad.attempts` ga murojaat qiladi — `select_related`/
    # `prefetch_related` bo'lmasa har iteratsiyada alohida SELECT (N+1).
    finalize_qs = (
        Olympiad.objects
        .filter(id__in=expired_ids)
        .select_related('center')
        .prefetch_related('attempts')
    )
    for olympiad in finalize_qs:
        try:
            _do_finish_olympiad(olympiad)
            count += 1
        except Exception:
            import logging
            logging.getLogger(__name__).exception(
                'finalize_expired_active_olympiads failed olympiad=%s', olympiad.pk,
            )
    return count


def event_readiness_errors(olympiad):
    errors = []
    if not (olympiad.title or '').strip():
        errors.append('Tadbir nomini kiriting')
    if not (olympiad.subject or '').strip():
        errors.append('Fanni tanlang')
    if not olympiad.start_datetime:
        errors.append('Boshlanish sanasi va vaqtini kiriting')
    elif olympiad.start_datetime < timezone.now():
        # Y4: aniq ko'rsatma — admin nima qilishi kerakligini bilsin.
        errors.append(
            "Boshlanish vaqti o'tib ketgan. Iltimos, vaqtni yangilang "
            "(kelajakdagi sana/vaqt kiriting)."
        )
    if not olympiad.duration_minutes or olympiad.duration_minutes <= 0:
        errors.append('Davomiylikni kiriting')
    if not olympiad.questions.exists():
        errors.append('Kamida bitta savol tayinlang')
    return errors
