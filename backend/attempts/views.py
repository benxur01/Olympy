from datetime import timedelta

from django.db import IntegrityError, transaction
from django.db.models import Avg, Count, Max, Q
from django.db.models.functions import TruncMonth
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status as http_status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from centers.models import CenterMembership, EducationCenter
from olympiads.models import Olympiad
from olympiads.services import (
    maybe_finish_expired_olympiad,
    user_can_manage_center_event,
    user_can_participate_in_event,
)


# O10: `_recompute_center_rating` olib tashlandi — submit_attempt'da
# chaqirilmasdi (DB yukini kamaytirish uchun) va hech qaerda ham
# foydalanilmasdi. Markaz reytingi keyinroq cron orqali tiklash kerak
# bo'lsa, alohida `services.py` faylida qayta yoziladi.

from django.http import HttpResponse

from .certificates import render_certificate_png
from .models import TestAttempt, TestSession
from .serializers import SubmitAttemptSerializer, TestAttemptSerializer
from .session_utils import score_session_answers, session_is_expired


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([ScopedRateThrottle])
def submit_attempt(request):
    """POST /api/attempts/ — student submits answers, server scores them.

    Enforces event access rules: public olympiads accept any authenticated
    participant, center competitions require an approved student membership
    at the event center. The event must be active, and one user can only
    submit once per event.
    """
    serializer = SubmitAttemptSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    # Celery worker Render free tier'da ishlamasligi mumkin — lazy ravishda
    # muddati o'tgan olimpiadalarni yopib qo'yamiz. Bu atomic transaction
    # dan TASHQARIDA bo'lishi kerak, aks holda ichkarida olingan olimpiad
    # qatori bilan to'qnashuv yuzaga keladi.
    try:
        _peek_olympiad = Olympiad.objects.filter(
            pk=serializer.validated_data['olympiad'],
        ).first()
        maybe_finish_expired_olympiad(_peek_olympiad)
    except Exception:
        pass

    with transaction.atomic():
        # Olimpiad qatorini lock qilmaymiz — bu butun olimpiada bo'yicha
        # submit'larni navbatga qo'yardi (100+ student bir vaqtda submit
        # qilsa katta latency). Yagona-attempt cheklovi va sessiya
        # tutqichi (TestSession.select_for_update) yetarli.
        olympiad = get_object_or_404(
            Olympiad.objects,
            pk=serializer.validated_data['olympiad'],
        )

        if TestAttempt.objects.filter(user=request.user, olympiad=olympiad).exists():
            return Response(
                {'detail': "Siz bu olimpiadaga allaqachon qatnashgansiz"},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        if olympiad.status != Olympiad.STATUS_ACTIVE:
            return Response({'detail': "Olimpiada faol emas"},
                            status=http_status.HTTP_400_BAD_REQUEST)
        now = timezone.now()
        if olympiad.start_datetime and now < olympiad.start_datetime:
            return Response({'detail': 'Olimpiada hali boshlanmagan'},
                            status=http_status.HTTP_400_BAD_REQUEST)
        end_time = (
            olympiad.start_datetime + timedelta(minutes=olympiad.duration_minutes)
            if olympiad.start_datetime and olympiad.duration_minutes else None
        )
        if end_time and now > end_time:
            return Response({'detail': 'Olimpiada vaqti tugagan'},
                            status=http_status.HTTP_400_BAD_REQUEST)
        if not user_can_participate_in_event(request.user, olympiad):
            detail = (
                "Musobaqaga qatnashish uchun shu o'quv markaz tasdig'i kerak"
                if olympiad.event_type == Olympiad.EVENT_TYPE_COMPETITION
                else 'Forbidden'
            )
            return Response(
                {'detail': detail},
                status=http_status.HTTP_403_FORBIDDEN,
            )

        session = (
            TestSession.objects
            .select_for_update()
            .filter(user=request.user, olympiad=olympiad)
            .first()
        )
        if not session:
            return Response(
                {'detail': "Avval test savollarini boshlang"},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        if session.status == TestSession.STATUS_DISQUALIFIED:
            return Response(
                {'detail': "Siz cheating qildingiz. Olimpiada yakunlandi."},
                status=http_status.HTTP_403_FORBIDDEN,
            )
        if session_is_expired(session, olympiad):
            return Response({'detail': 'Test vaqti tugagan'},
                            status=http_status.HTTP_400_BAD_REQUEST)

        answers = serializer.validated_data.get('answers', {}) or {}
        scored = score_session_answers(session, olympiad, answers)
        total = scored['total']
        correct = scored['correct']
        wrong = scored['wrong']
        max_possible = scored['max_possible']
        score = scored['score']
        time_spent = max(0, int((timezone.now() - session.started_at).total_seconds()))
        if olympiad.duration_minutes:
            time_spent = min(time_spent, olympiad.duration_minutes * 60)

        # Savepoint (nested atomic) — outer transaction'ni abort qilmasdan
        # IntegrityError'ni catch qilamiz. Aks holda Django outer block'da
        # TransactionManagementError otadi va keyingi DB so'rovlari ishlamaydi.
        duplicate_existing = None
        try:
            with transaction.atomic():
                attempt = TestAttempt.objects.create(
                    user=request.user,
                    olympiad=olympiad,
                    answers=answers,
                    score=score,
                    correct_count=correct,
                    wrong_count=wrong,
                    total_questions=total,
                    time_spent=time_spent,
                    rank=None,
                )
        except IntegrityError:
            # Race condition: bir vaqtda ikkita so'rov yuborilsa yoki bir
            # foydalanuvchi tezda ikki marta bossa unique constraint
            # (user, olympiad) ishga tushadi. Mavjud attempt'ni qaytaramiz.
            duplicate_existing = TestAttempt.objects.filter(
                user=request.user, olympiad=olympiad,
            ).first()
            attempt = None

        if duplicate_existing is not None:
            # Sessionni ham COMPLETED ga o'tkazish kerak — aks holda
            # session_is_expired tekshiruvi keyingi marta bo'sh natija
            # qaytaradi va frontend "Test vaqti tugagan" xato ko'rsatardi.
            if session.status != TestSession.STATUS_COMPLETED:
                session.status = TestSession.STATUS_COMPLETED
                session.save(update_fields=['status'])
            data = TestAttemptSerializer(duplicate_existing).data
            data['max_score'] = max_possible
            data['blank_count'] = scored.get('blank', 0)
            data['answered_count'] = scored.get('answered', 0)
            data['detail'] = 'Siz allaqachon topshirgansiz'
            return Response(data, status=http_status.HTTP_200_OK)
        if attempt is None:
            return Response(
                {'detail': "Siz bu olimpiadaga allaqachon qatnashgansiz"},
                status=http_status.HTTP_409_CONFLICT,
            )

        # Re-rank submit paytida QILMAYMIZ — bu butun jadvalni bulk_update
        # qiladi va katta olimpiadalarda DB yukini ko'paytiradi (100+
        # student bir vaqtda topshirsa har biri butun jadvalni qayta
        # hisoblardi). Leaderboard endpoint o'zi `order_by('-score',
        # 'time_spent')` orqali tartiblab `i+1` ranklarini hisoblaydi —
        # bu yetarli. `rank` DB maydoni keyinroq foydali bo'lishi mumkin,
        # shu sababli o'chirilmaydi, faqat submit'da yangilanmaydi.
        session.status = TestSession.STATUS_COMPLETED
        session.save(update_fields=['status'])

        # Center rating recompute ham submit ichidan olib tashlandi —
        # bu N ta attempt bo'yicha katta AVG aggregate qilardi va submit
        # latency'ni oshirardi. Funksiyaning o'zi mavjud, kerak bo'lsa
        # cron yoki manager dashboard'ida chaqiriladi.

        data = TestAttemptSerializer(attempt).data
        data['max_score'] = max_possible
        # Yangi semantika: blank (javob berilmagan) va answered alohida
        # qaytariladi. Frontend "Sizning natijangiz" sahifasida 4 ta
        # sonni alohida ko'rsatishi mumkin: to'g'ri / noto'g'ri / bo'sh.
        data['blank_count'] = scored.get('blank', 0)
        data['answered_count'] = scored.get('answered', 0)
        # Y11: rank DB maydoni submit paytida yangilanmaydi (DB yukini
        # kamaytirish), shu sababli frontend'da '—' ko'rinardi. Hozirgi
        # joyni bitta COUNT query orqali hisoblab `position` field bilan
        # qaytaramiz. `disqualified=False` filtri bilan diskval bo'lganlarni
        # chetlaymiz.
        better_count = TestAttempt.objects.filter(
            olympiad=olympiad,
            disqualified=False,
        ).filter(
            Q(score__gt=score)
            | Q(score=score, time_spent__lt=time_spent),
        ).exclude(pk=attempt.pk).count()
        data['position'] = better_count + 1
        # Backward-compat: agar rank field hali None bo'lsa, position
        # qiymatini rank sifatida ham qaytaramiz — eski frontend kodlari
        # rank field'iga tayanadi.
        if data.get('rank') is None:
            data['rank'] = better_count + 1
        return Response(data, status=http_status.HTTP_201_CREATED)


submit_attempt.cls.throttle_scope = 'submit'


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def report_cheating(request):
    """POST /api/attempts/cheating/ — disqualify current user's test session."""
    olympiad_id = request.data.get('olympiad')
    reason = str(request.data.get('reason') or 'test_window_left')[:120]
    if not olympiad_id:
        return Response({'detail': 'olympiad majburiy'}, status=http_status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        olympiad = get_object_or_404(
            Olympiad.objects.select_for_update().select_related('center', 'center__owner'),
            pk=olympiad_id,
        )
        if not user_can_participate_in_event(request.user, olympiad):
            return Response({'detail': 'Forbidden'}, status=http_status.HTTP_403_FORBIDDEN)
        if TestAttempt.objects.filter(user=request.user, olympiad=olympiad).exists():
            return Response({'disqualified': False, 'detail': 'Attempt already submitted'})
        session = (
            TestSession.objects
            .select_for_update()
            .filter(user=request.user, olympiad=olympiad)
            .first()
        )
        if not session:
            return Response({'detail': "Test session topilmadi"}, status=http_status.HTTP_400_BAD_REQUEST)
        if session.status == TestSession.STATUS_COMPLETED:
            return Response({'disqualified': False, 'detail': 'Attempt already submitted'})
        notify = session.status != TestSession.STATUS_DISQUALIFIED
        session.status = TestSession.STATUS_DISQUALIFIED
        session.disqualified_at = session.disqualified_at or timezone.now()
        session.cheating_reason = session.cheating_reason or reason
        session.save(update_fields=['status', 'disqualified_at', 'cheating_reason'])

        # Diskvalifikatsiya bo'lgan student uchun ham attempt yaratamiz —
        # aks holda na leaderboard'da, na manager paneli statistikasida
        # ko'rinmasdi. score=0, disqualified=True bilan iz qoldiramiz.
        # Session boshlanganidan hozirgacha bo'lgan vaqtni time_spent qilamiz.
        time_spent = max(0, int(
            (timezone.now() - session.started_at).total_seconds()
        )) if session.started_at else 0
        if olympiad.duration_minutes:
            time_spent = min(time_spent, olympiad.duration_minutes * 60)
        try:
            TestAttempt.objects.create(
                user=request.user,
                olympiad=olympiad,
                answers={},
                score=0,
                correct_count=0,
                wrong_count=0,
                total_questions=0,
                time_spent=time_spent,
                rank=None,
                disqualified=True,
            )
        except IntegrityError:
            # Race: bir vaqtda submit bilan kelishi mumkin. E'tibor bermaymiz.
            pass

    if notify:
        try:
            from notifications.services import send_cheating_detected_notification

            send_cheating_detected_notification(request.user, olympiad, olympiad.center, reason)
        except Exception:
            import logging
            logging.getLogger(__name__).exception('cheating notification failed')
    return Response({
        'disqualified': True,
        'detail': "Siz cheating qildingiz. Olimpiada yakunlandi.",
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def attempt_detail(request, attempt_id):
    """GET /api/attempts/{attempt_id}/ — bitta attempt natijasi.

    Leaderboard "Ko'rish" tugmasi va shunga o'xshash sahifalar uchun.
    Ruxsatlar:
      - Attempt egasi (foydalanuvchining o'zi)
      - Platform admin
      - Olympiad markaziga tegishli owner/manager
    Boshqa hollarda 403 qaytariladi.
    """
    attempt = get_object_or_404(
        TestAttempt.objects.select_related('user', 'olympiad', 'olympiad__center'),
        pk=attempt_id,
    )
    is_owner = attempt.user_id == request.user.id
    is_admin = request.user.is_platform_admin
    can_view = is_owner or is_admin
    if not can_view and attempt.olympiad.center_id:
        can_view = (
            attempt.olympiad.center.owner_id == request.user.id
            or CenterMembership.objects.filter(
                user=request.user,
                center_id=attempt.olympiad.center_id,
                role__in=[CenterMembership.ROLE_MANAGER, CenterMembership.ROLE_OWNER],
                status=CenterMembership.STATUS_APPROVED,
            ).exists()
        )
    if not can_view:
        return Response({'detail': 'Forbidden'}, status=http_status.HTTP_403_FORBIDDEN)

    data = TestAttemptSerializer(attempt).data
    # Olimpiada ma'lumotini ham qo'shamiz — frontend bittagina so'rov bilan
    # to'liq sahifani chizishi mumkin.
    olympiad = attempt.olympiad
    data['olympiad_detail'] = {
        'id': olympiad.id,
        'title': olympiad.title,
        'subject': olympiad.subject,
        'event_type': olympiad.event_type,
        'test_level': olympiad.test_level,
        'test_type': olympiad.test_type,
        'duration_minutes': olympiad.duration_minutes,
        'start_datetime': olympiad.start_datetime.isoformat() if olympiad.start_datetime else None,
        'center_id': olympiad.center_id,
        'center_name': olympiad.center.name if olympiad.center_id else '',
    }
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_results(request):
    """GET /api/results/me/ — current user's attempt history.

    Pagination qo'llab-quvvatlanadi: `?page=`, `?page_size=` (default 50,
    max 200). Eski klientlar ham ishlashda davom etadi — birinchi page
    avtomatik qaytariladi. Avval qattiq `[:200]` cheklov edi va keyingi
    attempt'lar yashirin bo'lib qolardi.
    """
    qs = TestAttempt.objects.filter(user=request.user).select_related('olympiad')
    try:
        page = int(request.query_params.get('page') or 1)
    except (TypeError, ValueError):
        page = 1
    page = max(1, page)
    try:
        page_size = int(request.query_params.get('page_size') or 50)
    except (TypeError, ValueError):
        page_size = 50
    page_size = max(1, min(page_size, 200))
    total = qs.count()
    offset = (page - 1) * page_size
    rows = qs[offset:offset + page_size]
    data = TestAttemptSerializer(rows, many=True).data
    # Backward-compat: agar klient `?page=` yubormagan va `?page_size=` ham
    # yubormagan bo'lsa, javobni list ko'rinishida qaytaramiz (eski
    # StudentDashboard kodi shu formatga tayanadi). Aks holda standart
    # pagination dict.
    if not request.query_params.get('page') and not request.query_params.get('page_size'):
        return Response(data)
    return Response({
        'results': data,
        'pagination': {
            'page': page,
            'page_size': page_size,
            'total': total,
            'has_next': offset + len(data) < total,
        },
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_stats(request):
    """GET /api/results/me/stats/ — aggregated per-subject stats.

    Returns:
      {
        total_attempts, average_score, best_rank,
        subjects: [{subject, attempts, average_score}, ...]
      }
    """
    qs = TestAttempt.objects.filter(user=request.user).select_related('olympiad')
    attempts = list(qs)
    total = len(attempts)
    if total == 0:
        return Response({
            'total_attempts': 0,
            'average_score': 0,
            'best_rank': None,
            'subjects': [],
        })
    avg = round(sum(a.score for a in attempts) / total, 1)
    ranks = [a.rank for a in attempts if a.rank]
    best_rank = min(ranks) if ranks else None
    subject_buckets = {}
    for a in attempts:
        subj = a.olympiad.subject if a.olympiad else '—'
        bucket = subject_buckets.setdefault(subj, {'subject': subj, 'attempts': 0, 'total': 0})
        bucket['attempts'] += 1
        bucket['total'] += a.score
    subjects = [
        {
            'subject': b['subject'],
            'attempts': b['attempts'],
            'average_score': round(b['total'] / b['attempts'], 1) if b['attempts'] else 0,
        }
        for b in subject_buckets.values()
    ]
    subjects.sort(key=lambda x: -x['average_score'])
    return Response({
        'total_attempts': total,
        'average_score': avg,
        'best_rank': best_rank,
        'subjects': subjects,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def download_certificate(request, attempt_id):
    """GET /api/certificates/{attempt_id}/download/ — PNG sertifikat.

    Sertifikat alohida modelda saqlanmaydi: TestAttempt'dan har safar
    on-the-fly generatsiya qilinadi. Faqat 1-o'rin egasi sertifikat ola
    oladi — boshqa ishtirokchilar uchun 403.
    """
    attempt = get_object_or_404(
        TestAttempt.objects.select_related('user', 'olympiad', 'olympiad__center'),
        pk=attempt_id,
    )
    # Faqat o'z attempti yoki center managerlari/admin
    is_owner = attempt.user_id == request.user.id
    is_admin = request.user.is_platform_admin
    can_view = is_owner or is_admin
    if not can_view and attempt.olympiad.center_id:
        can_view = CenterMembership.objects.filter(
            user=request.user,
            center_id=attempt.olympiad.center_id,
            role__in=[CenterMembership.ROLE_MANAGER, CenterMembership.ROLE_OWNER],
            status=CenterMembership.STATUS_APPROVED,
        ).exists() or attempt.olympiad.center.owner_id == request.user.id
    if not can_view:
        return Response({'detail': 'Forbidden'}, status=http_status.HTTP_403_FORBIDDEN)
    # Faqat 1-o'rin egasi sertifikat ola oladi. Avval har qanday rank
    # uchun ruxsat berilardi — bu sertifikatni hammaga tarqatib yuborardi.
    if attempt.rank != 1:
        return Response(
            {'detail': "Sertifikat faqat 1-o'rin egasiga beriladi"},
            status=http_status.HTTP_403_FORBIDDEN,
        )
    try:
        png_bytes = render_certificate_png(attempt)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).exception('certificate render failed: %s', exc)
        return Response(
            {'detail': "Sertifikatni yaratib bo'lmadi"},
            status=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    response = HttpResponse(png_bytes, content_type='image/png')
    safe_title = ''.join(ch for ch in attempt.olympiad.title if ch.isalnum() or ch in (' ', '_', '-'))[:60].strip() or 'certificate'
    response['Content-Disposition'] = f'attachment; filename="olympy-{safe_title}-{attempt.id}.png"'
    return response


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def manager_stats(request):
    """GET /api/manager/stats/?center=<id> — center natijalarini umumlashtiradi.

    Manager/Owner/Admin uchun: o'rtacha ball, eng yuqori ball, qatnashuvchilar
    soni va tadbirlar bo'yicha breakdown. Hardcoded mock o'rniga real ma'lumot.
    """
    center_id = request.query_params.get('center')
    if not center_id:
        # Auto-pick: foydalanuvchining birinchi manager/owner centeri
        membership = (
            CenterMembership.objects
            .filter(
                user=request.user,
                role__in=[
                    CenterMembership.ROLE_MANAGER,
                    CenterMembership.ROLE_OWNER,
                ],
                status=CenterMembership.STATUS_APPROVED,
            )
            .order_by('-created_at')
            .first()
        )
        if not membership and not request.user.is_platform_admin:
            return Response(
                {'detail': "Center aniqlanmadi. ?center=<id> kiriting"},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        center_id = membership.center_id if membership else None
    if not center_id:
        return Response(
            {'detail': "Center aniqlanmadi"},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    center = get_object_or_404(EducationCenter, pk=center_id)
    # Auth check: faqat manager/owner/admin
    is_admin = request.user.is_platform_admin
    is_owner = center.owner_id == request.user.id
    is_manager = CenterMembership.objects.filter(
        user=request.user, center=center,
        role=CenterMembership.ROLE_MANAGER,
        status=CenterMembership.STATUS_APPROVED,
    ).exists()
    if not (is_admin or is_owner or is_manager):
        return Response({'detail': 'Forbidden'}, status=http_status.HTTP_403_FORBIDDEN)

    qs = TestAttempt.objects.filter(olympiad__center=center, olympiad__is_deleted=False)
    # Diskvalifitsiya bo'lganlar agregatga kirmaydi — aks holda o'rtacha
    # ball nohaq pasayardi. Lekin alohida hisob sifatida `disqualified_count`
    # ham qaytariladi.
    qs_valid = qs.filter(disqualified=False)
    agg = qs_valid.aggregate(
        avg=Avg('score'),
        best=Max('score'),
        participants=Count('user', distinct=True),
        total_attempts=Count('id'),
    )
    disqualified_count = qs.filter(disqualified=True).count()
    # Per-event breakdown — finished + active tadbirlar bo'yicha.
    # Avval har bir olimpiada uchun alohida aggregate query ishga tushar
    # (50 ta olimpiada bo'lsa 50 ta SQL). Endi bitta GROUP BY query orqali
    # barcha olimpiadalarning agregati olinadi, keyin Python'da olimpiada
    # meta-ma'lumotlari bilan birlashtiriladi.
    # Y9: pagination — `?page=`, `?page_size=` (default 50, max 200).
    # Jami events soni `events_total` orqali qaytariladi, agregat esa
    # butun markaz bo'yicha hisoblanadi (50 limit bilan emas) — bu
    # foydalanuvchi uchun aniqroq.
    olympiads_full_qs = Olympiad.objects.filter(center=center, is_deleted=False)
    events_total = olympiads_full_qs.count()
    try:
        events_page = int(request.query_params.get('page') or 1)
    except (TypeError, ValueError):
        events_page = 1
    events_page = max(1, events_page)
    try:
        events_page_size = int(request.query_params.get('page_size') or 50)
    except (TypeError, ValueError):
        events_page_size = 50
    events_page_size = max(1, min(events_page_size, 200))
    events_offset = (events_page - 1) * events_page_size
    olympiads_qs = list(
        olympiads_full_qs
        .order_by('-created_at')
        [events_offset:events_offset + events_page_size]
    )
    olympiad_ids = [o.id for o in olympiads_qs]
    per_event_aggs = {}
    if olympiad_ids:
        rows = (
            TestAttempt.objects
            .filter(olympiad_id__in=olympiad_ids)
            .values('olympiad_id')
            .annotate(
                avg=Avg('score'),
                best=Max('score'),
                participants=Count('user', distinct=True),
            )
        )
        per_event_aggs = {row['olympiad_id']: row for row in rows}
    events = []
    for o in olympiads_qs:
        sub_agg = per_event_aggs.get(o.id, {})
        events.append({
            'olympiad_id': o.id,
            'title': o.title,
            'subject': o.subject,
            'status': o.status,
            'event_type': o.event_type,
            'average_score': round(sub_agg.get('avg') or 0, 1),
            'best_score': sub_agg.get('best') or 0,
            'participants': sub_agg.get('participants') or 0,
        })
    return Response({
        'center_id': center.id,
        'center_name': center.name,
        'average_score': round(agg['avg'] or 0, 1),
        'best_score': agg['best'] or 0,
        'participants': agg['participants'] or 0,
        'total_attempts': agg['total_attempts'] or 0,
        'disqualified_count': disqualified_count,
        'events': events,
        'events_total': events_total,
        'events_page': events_page,
        'events_page_size': events_page_size,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_monthly_stats(request):
    """GET /api/results/me/monthly/?months=6 — so'nggi N oy o'rtacha ballari.

    Profile.jsx dagi "Natijalar dinamikasi" BarChart uchun. Hardcoded
    [72,81,87,83,91] o'rniga real oylik o'rtacha qiymat.
    """
    try:
        months = int(request.query_params.get('months') or 6)
    except (TypeError, ValueError):
        months = 6
    months = max(1, min(months, 24))

    now = timezone.now()
    # Hozirgi oyning birinchi kuni
    current_first = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # Boshlang'ich oyni hisoblaymiz: months-1 oy orqaga
    year = current_first.year
    month = current_first.month - (months - 1)
    while month <= 0:
        month += 12
        year -= 1
    range_start = current_first.replace(year=year, month=month)

    # Avval har oy uchun alohida aggregate query (N+1) edi. Endi bitta
    # TruncMonth bilan oylik aggregate olib, Python dict orqali bucket'larga
    # tarqatamiz.
    raw = (TestAttempt.objects
        .filter(user=request.user, submitted_at__gte=range_start)
        .annotate(month_bucket=TruncMonth('submitted_at'))
        .values('month_bucket')
        .annotate(avg=Avg('score'), count=Count('id'))
        .order_by('month_bucket'))
    by_key = {}
    for row in raw:
        mb = row['month_bucket']
        if mb is None:
            continue
        by_key[(mb.year, mb.month)] = row

    buckets = []
    for i in range(months - 1, -1, -1):
        y = current_first.year
        m = current_first.month - i
        while m <= 0:
            m += 12
            y -= 1
        row = by_key.get((y, m))
        buckets.append({
            'year': y,
            'month': m,
            'label': f'{m}-oy',
            'average_score': round((row['avg'] if row else 0) or 0, 1),
            'attempts': (row['count'] if row else 0) or 0,
        })
    return Response({'months': buckets})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def leaderboard(request):
    """GET /api/leaderboard/?olympiad=<id>  — ranked attempts.

    Without ``olympiad`` query param, returns the top scores within the
    visible events: public olympiads globally, center competitions for the
    user's approved centers.
    """
    # Diskvalifitsiya bo'lgan attempt'lar leaderboard'da ko'rinmaydi —
    # ular faqat manager statistikasi uchun yoziladi. Aks holda 0 balli
    # ko'p qator rank'ni chalkash qilardi.
    qs = (
        TestAttempt.objects
        .filter(disqualified=False)
        .select_related('user', 'olympiad', 'olympiad__center')
        .order_by('-score', 'time_spent', 'submitted_at')
    )
    olympiad_id = request.query_params.get('olympiad')
    if olympiad_id:
        olympiad = get_object_or_404(Olympiad.objects.select_related('center'), pk=olympiad_id)
        if not user_can_participate_in_event(request.user, olympiad):
            return Response({'detail': 'Forbidden'}, status=http_status.HTTP_403_FORBIDDEN)
        # Draft/inactive olimpiada leaderboard'i faqat manager/owner/admin
        # uchun ko'rinadi. Oddiy ishtirokchi DRAFT yoki INACTIVE tadbir
        # natijalarini ko'ra olmaydi — bu sizdirib qo'yiladigan ma'lumot.
        if olympiad.status not in (Olympiad.STATUS_ACTIVE, Olympiad.STATUS_FINISHED):
            if not user_can_manage_center_event(request.user, olympiad.center):
                return Response(
                    {'detail': 'Bu olimpiada leaderboard\'i hali ochilmagan'},
                    status=http_status.HTTP_403_FORBIDDEN,
                )
        qs = qs.filter(olympiad=olympiad)
    if not olympiad_id:
        allowed_center_ids = list(CenterMembership.objects.filter(
            user=request.user, status=CenterMembership.STATUS_APPROVED,
        ).values_list('center_id', flat=True))
        # Avval `qs.filter(...) | qs.filter(...)` orqali OR amali bajarilardi —
        # bu Django'da ikkita JOIN va katta order_by zanjirini hosil qilib,
        # query plan'ni murakkablashtirar va bir qator versiyalarda dublikat
        # qator qaytarardi. Yagona Q() bilan yaxshiroq.
        qs = qs.filter(
            Q(olympiad__event_type=Olympiad.EVENT_TYPE_OLYMPIAD)
            | Q(
                olympiad__event_type=Olympiad.EVENT_TYPE_COMPETITION,
                olympiad__center_id__in=allowed_center_ids,
            )
        )
        # Draft/inactive olimpiadalar global leaderboard'da ko'rinmasin —
        # faqat active yoki finished holatdagi tadbirlar ishtirokchilari.
        qs = qs.filter(
            olympiad__status__in=[Olympiad.STATUS_ACTIVE, Olympiad.STATUS_FINISHED]
        )
    # Pagination: `?page=` va `?page_size=` query parametrlari qo'llab-
    # quvvatlanadi. Default page_size=100, maksimum 500. Eski `?limit=`
    # parametri ham backward-compat uchun qabul qilinadi.
    try:
        page = int(request.query_params.get('page') or 1)
    except (TypeError, ValueError):
        page = 1
    page = max(1, page)
    try:
        page_size = int(
            request.query_params.get('page_size')
            or request.query_params.get('limit')
            or 100
        )
    except (TypeError, ValueError):
        page_size = 100
    page_size = max(1, min(page_size, 500))
    total_count = qs.count()
    offset = (page - 1) * page_size
    qs = qs[offset:offset + page_size]
    # Rank submit ichida yangilanmaydi (DB yukini kamaytirish uchun). Shu
    # sababli leaderboard'da har doim joriy tartiblash (`-score`,
    # `time_spent`, `submitted_at`) bo'yicha `i+1` o'rin beriladi. Bu
    # filter (masalan, faqat bitta olimpiada) uchun ham to'g'ri natija
    # qaytaradi, chunki tartiblash querysetda allaqachon qo'llanilgan.
    entries = [
        {
            'rank': offset + i + 1,
            'attempt_id': a.id,
            'user_id': a.user_id,
            'name': a.user.full_name,
            'center': a.olympiad.center.name,
            'organization_type': a.olympiad.center.organization_type,
            'country': a.olympiad.center.country,
            'region': a.olympiad.center.region,
            'district': a.olympiad.center.district,
            'subject': a.olympiad.subject,
            'olympiad_id': a.olympiad_id,
            'olympiad_title': a.olympiad.title,
            'olympiad_status': a.olympiad.status,
            'score': a.score,
            'time_spent': a.time_spent,
            'submitted_at': a.submitted_at.isoformat(),
        }
        for i, a in enumerate(qs)
    ]
    pagination_meta = {
        'page': page,
        'page_size': page_size,
        'total': total_count,
        'has_next': offset + len(entries) < total_count,
    }
    # Header info: tanlangan olympiad bo'lsa olympiad ma'lumoti, aks holda
    # eng ko'p kelgan olympiad nomi (frontend subtitle uchun).
    header = None
    if olympiad_id:
        olym = Olympiad.objects.select_related('center').filter(pk=olympiad_id).first()
        if olym:
            header = {
                'olympiad_id': olym.id,
                'olympiad_title': olym.title,
                'subject': olym.subject,
                'status': olym.status,
                'start_datetime': olym.start_datetime.isoformat() if olym.start_datetime else None,
            }
    elif entries:
        # Eng yaqinda topshirilgan attemptdan olympiad nomini olamiz
        latest = entries[0]
        header = {
            'olympiad_id': latest.get('olympiad_id'),
            'olympiad_title': latest.get('olympiad_title'),
            'subject': latest.get('subject'),
            'status': latest.get('olympiad_status'),
            'start_datetime': latest.get('submitted_at'),
        }
    return Response({
        'olympiad': header,
        'entries': entries,
        'pagination': pagination_meta,
    })
