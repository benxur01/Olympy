import csv

from django.db.models import Avg, Count, F, Max, Min
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import status as http_status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Olympiad
from .serializers import OlympiadSerializer
from .services import event_readiness_errors, user_can_manage_center_event, visible_events_filter


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
        from django.db.models import Sum
        from django.db.models import Prefetch
        from questions.models import Question
        queryset = (
            Olympiad.objects
            .prefetch_related(
                Prefetch('questions', queryset=Question.objects.only('id')),
            )
            .select_related('center')
            .annotate(
                participants_count=Count('attempts', distinct=True),
                avg_score_value=Avg('attempts__score'),
                total_score=Sum('questions__score'),
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
    olympiad = serializer.save(
        created_by=request.user,
        status=Olympiad.STATUS_DRAFT,
    )
    if questions is not None:
        olympiad.questions.set(questions)
    return Response(OlympiadSerializer(olympiad).data,
                    status=http_status.HTTP_201_CREATED)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def olympiad_detail(request, olympiad_id):
    """PATCH /api/olympiads/{id}/ — update draft/inactive event fields/questions."""
    olympiad = get_object_or_404(Olympiad, pk=olympiad_id)
    if not user_can_manage_center_event(request.user, olympiad.center):
        return Response({'detail': 'Forbidden'},
                        status=http_status.HTTP_403_FORBIDDEN)
    if olympiad.status not in [Olympiad.STATUS_DRAFT, Olympiad.STATUS_INACTIVE]:
        return Response(
            {'detail': "Faqat draft yoki nofaol tadbirni tahrirlash mumkin"},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    serializer = OlympiadSerializer(olympiad, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    questions = serializer.validated_data.pop('questions', None)
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
    olympiad.status = Olympiad.STATUS_FINISHED
    olympiad.save(update_fields=['status'])
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
    from attempts.models import TestAttempt, TestSession
    # Avval olympiad inaktiv qilinganda hali test yechayotgan studentlarning
    # javoblari yo'qolar va bo'sh attempt bilan to'ldirilardi. Endi admin
    # oldindan ogohlantiriladi: hech bo'lmaganda bitta faol session bo'lsa
    # va `force=true` yuborilmagan bo'lsa, 400 qaytariladi. Force bilan
    # yuborilsa avvalgi xulq saqlanadi (aktiv sessionlar COMPLETED ga
    # o'tadi va bo'sh attempt yaratiladi).
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
    active_sessions = list(TestSession.objects.filter(
        olympiad=olympiad,
        status=TestSession.STATUS_ACTIVE,
    ).select_related('user'))
    TestSession.objects.filter(
        olympiad=olympiad,
        status=TestSession.STATUS_ACTIVE,
    ).update(status=TestSession.STATUS_COMPLETED)
    # Faol sessiyalarning egalari uchun mavjud bo'lmagan attempt'larni
    # bo'sh natija bilan to'ldiramiz — aks holda foydalanuvchi statistikasida
    # bu olimpiada umuman yo'q ko'rinardi. Mavjud attempt'lar tegmaydi.
    if active_sessions:
        existing_user_ids = set(TestAttempt.objects.filter(
            olympiad=olympiad,
            user_id__in=[s.user_id for s in active_sessions],
        ).values_list('user_id', flat=True))
        to_create = [
            TestAttempt(
                user=s.user,
                olympiad=olympiad,
                answers={},
                score=0,
                correct_count=0,
                wrong_count=0,
                total_questions=0,
                time_spent=0,
                rank=None,
            )
            for s in active_sessions
            if s.user_id not in existing_user_ids
        ]
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
