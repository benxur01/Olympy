import csv

from django.db.models import Avg, Count, F, Max, Min
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status as http_status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Olympiad
from .serializers import OlympiadSerializer
from .services import (
    event_readiness_errors,
    recompute_olympiad_ranks,
    user_can_manage_center_event,
    visible_events_filter,
)


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def olympiads_list_create(request):
    """GET /api/olympiads/  — visible olympiads/competitions.
    POST /api/olympiads/    — create draft event (manager/owner/admin).
    """
    if request.method == 'GET':
        # Avval `prefetch_related('questions')` to'liq Question modelidagi
        # barcha maydonlarni yuklab olardi (text, options, image, va h.k.).
        # List javobida faqat `question_ids` (id'lar massivi) va `max_score`
        # (questions__score yig'indisi) kerak. Shu sababli:
        #  1) `total_score` ni annotate orqali aggregate qilamiz — har bir
        #     olimpiada uchun questions'larni Python'da iteratsiya qilmasdan
        #     bitta SQL aggregate'da olinadi (max_score serializer'i shundan
        #     foydalanadi).
        #  2) Prefetch'ni `only('id')` bilan cheklab, faqat ID'larni olamiz —
        #     question_ids field uchun yetarli, lekin behuda kolonkalar
        #     yuklanmaydi.
        from django.db.models import OuterRef, Prefetch, Subquery, Sum, IntegerField
        from django.db.models.functions import Coalesce
        from questions.models import Question
        # Y10: avval `Sum('questions__score')` to'g'ridan-to'g'ri annotate
        # qilinardi va bu boshqa annotate'lar (Count('attempts'),
        # Avg('attempts__score')) bilan JOIN multipication hosil qilardi —
        # natija nohaq (questions × attempts marta) bo'lishi mumkin edi.
        # Endi Subquery orqali hisoblanadi va annotate'lar bir-biriga
        # ta'sir qilmaydi. Prefetch hali ham kerak — `question_ids`
        # serializer'i `obj.questions.all()` chaqiradi.
        total_score_sq = (
            Question.objects
            .filter(olympiads=OuterRef('pk'))
            .values('olympiads')
            .annotate(s=Sum('score'))
            .values('s')
        )
        queryset = (
            Olympiad.objects
            .prefetch_related(
                Prefetch('questions', queryset=Question.objects.only('id')),
            )
            .select_related('center')
            .annotate(
                participants_count=Count('attempts', distinct=True),
                avg_score_value=Avg('attempts__score'),
                total_score=Coalesce(
                    Subquery(total_score_sq, output_field=IntegerField()),
                    0,
                ),
            )
            .order_by('-created_at')
        )
        qs = queryset.filter(visible_events_filter(request.user)).distinct()
        # Pagination: 500+ olimpiada bo'lishi mumkin, ayniqsa platform admin
        # uchun. Frontend grid'da hammasini bir martada ko'rsatish uchun
        # `?page_size=200` yuboradi — Default PageNumberPagination uni
        # e'tiborga olmasdi va 50 ta bilan chegaralanardi. LargePageNumberPagination
        # `page_size_query_param='page_size'` va `max_page_size=200` bilan
        # frontend so'rovini hurmat qiladi.
        from olympy_api.pagination import LargePageNumberPagination
        paginator = LargePageNumberPagination()
        page = paginator.paginate_queryset(qs, request)
        if page is not None:
            return paginator.get_paginated_response(OlympiadSerializer(page, many=True).data)
        return Response(OlympiadSerializer(qs, many=True).data)

    serializer = OlympiadSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    center = serializer.validated_data['center']
    questions = serializer.validated_data.pop('questions', None)
    if not user_can_manage_center_event(request.user, center):
        return Response({'detail': "Sizda bu markaz uchun tadbir yaratish huquqi yo'q"},
                        status=http_status.HTTP_403_FORBIDDEN)
    # O4: olimpiada yaratish va savollar biriktirish bitta transaction'da —
    # `serializer.save()` muvaffaqiyatli bo'lib, `questions.set()` xato bersa
    # (masalan, savol ID xato), olimpiada savollarsiz qolib ketardi.
    from django.db import transaction
    with transaction.atomic():
        olympiad = serializer.save(
            created_by=request.user,
            status=Olympiad.STATUS_DRAFT,
        )
        if questions is not None:
            olympiad.questions.set(questions)
    return Response(OlympiadSerializer(olympiad).data,
                    status=http_status.HTTP_201_CREATED)


@api_view(['PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def olympiad_detail(request, olympiad_id):
    """PATCH /api/olympiads/{id}/ — update draft/inactive event fields/questions.
    DELETE /api/olympiads/{id}/ — delete draft/inactive event.
    """
    olympiad = get_object_or_404(Olympiad, pk=olympiad_id)
    if not user_can_manage_center_event(request.user, olympiad.center):
        return Response({'detail': 'Forbidden'},
                        status=http_status.HTTP_403_FORBIDDEN)
    
    if olympiad.status not in [Olympiad.STATUS_DRAFT, Olympiad.STATUS_INACTIVE]:
        action_verb = "tahrirlash" if request.method == 'PATCH' else "o'chirish"
        return Response(
            {'detail': f"Faqat draft yoki nofaol tadbirni {action_verb} mumkin"},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    if request.method == 'DELETE':
        if olympiad.attempts.exists() or olympiad.test_sessions.exists():
            return Response(
                {'detail': "Ushbu tadbirda ishtirokchilar urinishlari bor, uni o'chirib bo'lmaydi"},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        olympiad.delete()
        return Response({'detail': "Tadbir muvaffaqiyatli o'chirildi"}, status=http_status.HTTP_200_OK)

    serializer = OlympiadSerializer(olympiad, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    questions = serializer.validated_data.pop('questions', None)
    # O4: PATCH ham atomic — savollar tugamasdan qisman saqlanish bo'lmasin.
    from django.db import transaction
    with transaction.atomic():
        olympiad = serializer.save()
        if questions is not None:
            olympiad.questions.set(questions)
    return Response(OlympiadSerializer(olympiad).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def publish_olympiad(request, olympiad_id):
    """POST /api/olympiads/{id}/publish/ — flip status to active and notify."""
    olympiad = get_object_or_404(Olympiad, pk=olympiad_id)
    if not user_can_manage_center_event(request.user, olympiad.center):
        return Response({'detail': 'Forbidden'},
                        status=http_status.HTTP_403_FORBIDDEN)
    if olympiad.status not in [Olympiad.STATUS_DRAFT, Olympiad.STATUS_INACTIVE]:
        return Response(
            {'detail': 'Faqat draft yoki nofaol tadbirni faollashtirish mumkin'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    readiness_errors = event_readiness_errors(olympiad)
    if readiness_errors:
        return Response(
            {'detail': 'Tadbir hali tayyor emas', 'errors': readiness_errors},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    # Avval xabar har gal publish'da yuborilardi — INACTIVE → ACTIVE qayta
    # nashr qilinganda ham. Endi faqat DRAFT'dan birinchi marta nashr
    # qilinayotganda xabar yuboriladi: studentlar ikki marta xabar olmaydi.
    is_first_publish = olympiad.status == Olympiad.STATUS_DRAFT
    olympiad.status = Olympiad.STATUS_ACTIVE
    olympiad.save(update_fields=['status'])

    if is_first_publish and olympiad.event_type in (
        Olympiad.EVENT_TYPE_COMPETITION,
        Olympiad.EVENT_TYPE_OLYMPIAD,
    ):
        # Lazy import: avoid circular dependency.
        from centers.models import CenterMembership
        from notifications.services import send_olympiad_published_bulk
        # Olimpiada (public) bo'lsa-da, push spam'ni oldini olish uchun
        # xabar faqat shu markazning approved studentlariga yuboriladi —
        # boshqa markaz a'zolari va platforma userlari uchun olimpiada
        # baribir feed/listda paydo bo'ladi.
        approved_students = CenterMembership.objects.filter(
            center=olympiad.center,
            role=CenterMembership.ROLE_STUDENT,
            status=CenterMembership.STATUS_APPROVED,
        ).select_related('user')
        try:
            send_olympiad_published_bulk(
                [m.user for m in approved_students],
                olympiad,
                olympiad.center,
            )
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning('Notification send failed: %s', e)
    return Response(OlympiadSerializer(olympiad).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def finish_olympiad(request, olympiad_id):
    """POST /api/olympiads/{id}/finish/ — flip status to finished."""
    olympiad = get_object_or_404(Olympiad, pk=olympiad_id)
    if not user_can_manage_center_event(request.user, olympiad.center):
        return Response({'detail': 'Forbidden'},
                        status=http_status.HTTP_403_FORBIDDEN)
    if olympiad.status != Olympiad.STATUS_ACTIVE:
        return Response({'detail': "Faqat faol tadbirni yakunlash mumkin"},
                        status=http_status.HTTP_400_BAD_REQUEST)
    from django.db import transaction
    with transaction.atomic():
        olympiad.status = Olympiad.STATUS_FINISHED
        olympiad.save(update_fields=['status'])
        # Rank'larni manualda yakunlashda ham qayta hisoblaymiz — submit
        # paytida yangilanmaydi (DB yukini kamaytirish), shu sababli
        # yakunlash paytida bir martalik bulk update kifoya.
        recompute_olympiad_ranks(olympiad)
    return Response(OlympiadSerializer(olympiad).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def deactivate_olympiad(request, olympiad_id):
    """POST /api/olympiads/{id}/deactivate/ — pause an active event for editing."""
    olympiad = get_object_or_404(Olympiad, pk=olympiad_id)
    if not user_can_manage_center_event(request.user, olympiad.center):
        return Response({'detail': 'Forbidden'},
                        status=http_status.HTTP_403_FORBIDDEN)
    if olympiad.status != Olympiad.STATUS_ACTIVE:
        return Response({'detail': 'Faqat faol tadbirni nofaollashtirish mumkin'},
                        status=http_status.HTTP_400_BAD_REQUEST)
    from django.db import transaction
    from attempts.models import TestAttempt, TestSession
    from attempts.session_utils import score_session_answers
    # Avval olympiad inaktiv qilinganda hali test yechayotgan studentlarning
    # javoblari yo'qolar va bo'sh attempt bilan to'ldirilardi. Endi admin
    # oldindan ogohlantiriladi: hech bo'lmaganda bitta faol session bo'lsa
    # va `force=true` yuborilmagan bo'lsa, 400 qaytariladi. Force bilan
    # yuborilsa session'dagi mavjud javoblar bo'yicha ball hisoblanadi
    # (bo'sh attempt o'rniga) — student haqiqiy javoblarini yo'qotmaydi.
    force = str(request.data.get('force') or '').lower() in ('1', 'true', 'yes')
    has_active_sessions = TestSession.objects.filter(
        olympiad=olympiad,
        status=TestSession.STATUS_ACTIVE,
    ).exists()
    if has_active_sessions and not force:
        return Response(
            {
                'detail': (
                    "Faol ishtirokchilar bor — olimpiadani to'xtatib bo'lmaydi. "
                    "Baribir to'xtatish uchun {\"force\": true} bilan qayta yuboring."
                ),
                'active_sessions': True,
            },
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    # Butun deaktivatsiya bloki atomic — yarmida xatolik bo'lsa session
    # COMPLETED bo'lib qoladi, lekin attempt yaratilmaydi degan
    # nomuvofiqlikni oldini olamiz.
    with transaction.atomic():
        active_sessions = list(TestSession.objects.filter(
            olympiad=olympiad,
            status=TestSession.STATUS_ACTIVE,
        ).select_related('user'))
        TestSession.objects.filter(
            olympiad=olympiad,
            status=TestSession.STATUS_ACTIVE,
        ).update(status=TestSession.STATUS_COMPLETED)
        # Faol sessiyalarning egalari uchun mavjud bo'lmagan attempt'larni
        # session'dagi javoblar bo'yicha hisoblangan natija bilan yaratamiz.
        # Sessionda javoblar saqlanmaydi (faqat question_order/option_orders),
        # shu sababli answers={} bilan keladi — bu holatda blank qoladi.
        # Lekin agar kelajakda sessionga answers qo'shilsa, shu kod
        # avtomatik foydalanadi.
        if active_sessions:
            existing_user_ids = set(TestAttempt.objects.filter(
                olympiad=olympiad,
                user_id__in=[s.user_id for s in active_sessions],
            ).values_list('user_id', flat=True))
            to_create = []
            for s in active_sessions:
                if s.user_id in existing_user_ids:
                    continue
                # Sessionda saqlangan javoblar yo'q — frontend localStorage'da
                # saqlaydi va submit'da yuboradi. Force deactivate'da bu javoblar
                # backend'ga yetib bormaydi, shu sababli boshlangan vaqtdan
                # hozirgacha bo'lgan time_spent ham yozamiz — student keyin
                # statistikada "qatnashgan" deb ko'rinadi.
                scored = score_session_answers(s, olympiad, {})
                time_spent = max(0, int(
                    (timezone.now() - s.started_at).total_seconds()
                )) if s.started_at else 0
                to_create.append(TestAttempt(
                    user=s.user,
                    olympiad=olympiad,
                    answers={},
                    score=scored.get('score', 0),
                    correct_count=scored.get('correct', 0),
                    wrong_count=scored.get('wrong', 0),
                    total_questions=scored.get('total', 0),
                    time_spent=time_spent,
                    rank=None,
                ))
            if to_create:
                TestAttempt.objects.bulk_create(to_create)
        olympiad.status = Olympiad.STATUS_INACTIVE
        olympiad.save(update_fields=['status'])
    return Response(OlympiadSerializer(olympiad).data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def export_results(request, olympiad_id):
    """GET /api/olympiads/{id}/export/ — CSV format natijalar fayli.

    Faqat center owner/manager/teacher va platform admin uchun.
    Frontend "Natijalarni yuklab olish" tugmasi shu endpoint'ga ulanadi.
    """
    olympiad = get_object_or_404(
        Olympiad.objects.select_related('center'),
        pk=olympiad_id,
    )
    if not user_can_manage_center_event(request.user, olympiad.center):
        return Response({'detail': 'Forbidden'},
                        status=http_status.HTTP_403_FORBIDDEN)

    # Avval attempts'larni rank tartibida olamiz. `select_related('user')`
    # — har bir qator uchun alohida SQL urinishidan saqlaydi.
    from attempts.models import TestAttempt
    attempts = (
        TestAttempt.objects
        .filter(olympiad=olympiad)
        .select_related('user')
        .order_by('rank', '-score', 'time_spent')
    )

    response = HttpResponse(content_type='text/csv; charset=utf-8')
    safe_title = ''.join(
        ch for ch in (olympiad.title or 'olimpiada')
        if ch.isalnum() or ch in (' ', '_', '-')
    )[:60].strip() or 'olimpiada'
    safe_title = safe_title.replace(' ', '_')
    response['Content-Disposition'] = (
        f'attachment; filename="olympy-{safe_title}-{olympiad.id}-results.csv"'
    )
    # UTF-8 BOM — Excel CSV ni avtomatik UTF-8 sifatida tan oladi.
    response.write('﻿')

    writer = csv.writer(response)
    writer.writerow([
        "O'rin",
        'Ism',
        'Telefon',
        'Ball',
        "To'g'ri javoblar",
        "Noto'g'ri javoblar",
        'Jami savollar',
        'Vaqt (soniya)',
        'Yuborilgan vaqt',
    ])
    for a in attempts:
        writer.writerow([
            a.rank or '',
            getattr(a.user, 'full_name', '') or '',
            getattr(a.user, 'normalized_phone', '') or getattr(a.user, 'phone', '') or '',
            a.score,
            a.correct_count,
            a.wrong_count,
            a.total_questions,
            a.time_spent,
            a.submitted_at.strftime('%Y-%m-%d %H:%M:%S') if a.submitted_at else '',
        ])
    return response


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def olympiad_stats(request, olympiad_id):
    """GET /api/olympiads/{id}/stats/ — agregat statistika.

    Owner/Manager dashboard'da ishlatiladi: ishtirokchilar soni, o'rtacha
    ball, eng yuqori/eng past ball, to'liq yechganlar foizi, o'rtacha
    sarflangan vaqt.
    """
    olympiad = get_object_or_404(
        Olympiad.objects.select_related('center'),
        pk=olympiad_id,
    )
    if not user_can_manage_center_event(request.user, olympiad.center):
        return Response({'detail': 'Forbidden'},
                        status=http_status.HTTP_403_FORBIDDEN)

    from attempts.models import TestAttempt
    aggregates = TestAttempt.objects.filter(olympiad=olympiad).aggregate(
        participants=Count('id'),
        avg_score=Avg('score'),
        max_score=Max('score'),
        min_score=Min('score'),
        avg_time=Avg('time_spent'),
        avg_correct=Avg('correct_count'),
    )
    participants = aggregates.get('participants') or 0
    # To'liq yechganlar = score == max_score yoki score >= 90 emas; aniq
    # ta'rif: barcha savollarga javob bergan attempts soni.
    full_complete = (
        TestAttempt.objects.filter(
            olympiad=olympiad,
            total_questions__gt=0,
        )
        .annotate(answered=F('correct_count') + F('wrong_count'))
        .filter(answered__gte=F('total_questions'))
        .count()
        if participants else 0
    )
    full_complete_pct = (
        round((full_complete / participants) * 100, 1) if participants else 0.0
    )
    return Response({
        'olympiad_id': olympiad.id,
        'title': olympiad.title,
        'participants': participants,
        'average_score': round(aggregates.get('avg_score') or 0, 1),
        'max_score': aggregates.get('max_score') or 0,
        'min_score': aggregates.get('min_score') or 0,
        'average_time_seconds': round(aggregates.get('avg_time') or 0, 1),
        'average_correct': round(aggregates.get('avg_correct') or 0, 1),
        'full_complete_count': full_complete,
        'full_complete_percent': full_complete_pct,
    })
