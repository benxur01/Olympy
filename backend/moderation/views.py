"""Admin paneldagi moderatsiya navbati endpointlari.

Barchasi `/api/admin/moderation/...` ostida mount qilinadi (olympy_api/urls.py)
va faqat platforma admini uchun ochiq.
"""
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.models import AuditLog
from accounts.permissions import IsPlatformAdmin
from olympy_api.pagination import LargePageNumberPagination
from questions.models import Question

from .models import ModerationFlag

# `?status=` bilan berilishi mumkin bo'lgan YAKUNIY holatlar. `pending` ga
# qaytarish yo'q: bayroq yopilgandan keyin uni qayta ochish emas, yangisini
# yaratish kerak (detektor keyingi ishga tushishida shuni qiladi).
RESOLVE_STATUSES = (ModerationFlag.STATUS_RESOLVED, ModerationFlag.STATUS_DISMISSED)

# `?status=` uchun maxsus qiymat: filtrsiz (barcha holatlar). Bo'sh satr
# "filtr yo'q" degani emas — default AYNAN `pending` (navbat shu uchun).
STATUS_FILTER_ALL = 'all'


def _flag_payload(flag):
    """Bitta bayroqning panel uchun ko'rinishi.

    `raised_by` NULL bo'lsa 'Tizim' — yorliq BACKENDDA beriladi, aynan audit
    jurnalidagidek (`accounts.views.audit_log_list`: `l.actor.full_name if
    l.actor else 'Tizim'`). Panel kelgan matnni shundayligicha ko'rsatadi,
    ya'ni "aktor yo'q" holatining nomi bitta joyda turadi.
    """
    return {
        'id': flag.id,
        # `flag_type`/`status` — xom kod (filtr uchun), `*_label` — o'zbekcha
        # ko'rinish (model choices'idan).
        'flag_type': flag.flag_type,
        'flag_type_label': flag.get_flag_type_display(),
        'target_type': flag.target_type,
        'target_id': flag.target_id,
        'reason': flag.reason,
        'raised_by': flag.raised_by.full_name if flag.raised_by else 'Tizim',
        'raised_by_id': flag.raised_by_id,
        'status': flag.status,
        'status_label': flag.get_status_display(),
        'resolved_by': flag.resolved_by.full_name if flag.resolved_by else None,
        'resolved_at': flag.resolved_at.isoformat() if flag.resolved_at else None,
        'resolution_note': flag.resolution_note,
        'extra': flag.extra,
        'created_at': flag.created_at.isoformat(),
    }


@api_view(['GET'])
@permission_classes([IsPlatformAdmin])
def admin_moderation_queue(request):
    """GET /api/admin/moderation/queue/?flag_type=&status=pending

    Tekshirilishi kerak bo'lgan bayroqlar. Default `status=pending` — navbat
    aynan ochiq ishlar uchun; `?status=all` esa tarixni (hal qilingan va rad
    etilganlarni) ham ko'rsatadi.

    Paginatsiya `LargePageNumberPagination` orqali (`?page=`/`?page_size=`,
    max 200) — boshqa o'sib boruvchi admin ro'yxatlaridagidek (audit
    jurnali). "Bir xil IP" ro'yxatidagi qat'iy `[:100]` kesimidan farqi
    shunda: u ro'yxat chegaradan oshgan IP'lar soni bilan tabiiy
    cheklangan, bayroqlar jadvali esa (soatlik detektor + kelgusidagi savol
    moderatsiyasi) cheksiz o'sadi va eski yozuvlarga yetib borish kerak.

    Noma'lum `flag_type`/`status` xato emas — shunchaki bo'sh ro'yxat
    qaytadi (filtr qiymatlari panelning tayyor variantlaridan keladi).
    """
    qs = ModerationFlag.objects.select_related('raised_by', 'resolved_by')

    flag_type = request.query_params.get('flag_type', '').strip()
    if flag_type:
        qs = qs.filter(flag_type=flag_type)

    status_filter = request.query_params.get('status', ModerationFlag.STATUS_PENDING).strip()
    if status_filter and status_filter != STATUS_FILTER_ALL:
        qs = qs.filter(status=status_filter)

    paginator = LargePageNumberPagination()
    page = paginator.paginate_queryset(qs, request)
    flags = page if page is not None else list(qs[:100])
    data = [_flag_payload(flag) for flag in flags]
    if page is not None:
        return paginator.get_paginated_response(data)
    return Response(data)


@api_view(['POST'])
@permission_classes([IsPlatformAdmin])
def admin_moderation_resolve(request, flag_id):
    """POST /api/admin/moderation/queue/<id>/resolve/  body: {"status", "note", "archive"}

    `status` — 'resolved' (chora ko'rildi) yoki 'dismissed' (yolg'on
    signal). Ikkalasi ham navbatdan olib tashlaydi, farqi faqat tarixda:
    qaysi bayroqlar haqiqiy muammo bo'lganini keyin shu ajratadi.

    `archive` — faqat savol bayrog'i uchun ixtiyoriy chora (pastga qarang).

    Allaqachon yopilgan bayroq 400 qaytaradi — ikkinchi admin birinchisining
    qarorini va `resolved_at` vaqtini bilmasdan qayta yozib yubormasin.
    """
    new_status = (request.data.get('status') or '').strip()
    if new_status not in RESOLVE_STATUSES:
        return Response(
            {'detail': "status faqat 'resolved' yoki 'dismissed' bo'lishi mumkin."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    flag = get_object_or_404(ModerationFlag, pk=flag_id)
    if flag.status != ModerationFlag.STATUS_PENDING:
        return Response(
            {'detail': "Bu bayroq allaqachon ko'rib chiqilgan."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    flag.status = new_status
    flag.resolved_by = request.user
    flag.resolved_at = timezone.now()
    flag.resolution_note = (request.data.get('note') or '').strip()[:255]
    flag.save(update_fields=['status', 'resolved_by', 'resolved_at', 'resolution_note'])

    # Turga xos yon ta'sir. Shubhali IP uchun chora (bloklash, ogohlantirish)
    # hamon "Foydalanuvchilar" tabida qo'lda ko'riladi; savol bayrog'ida esa
    # admin shu yerda savolni arxivlashi mumkin.
    #
    # Arxivlash AVTOMATIK EMAS — faqat `archive=true` so'ralganda va faqat
    # 'resolved' bilan ("rad etildi" degani muammo yo'q, savolga tegilmaydi).
    # Savolni bayroq qo'yilganda darhol yashirmaslik ataylab: u ketayotgan
    # imtihonda bir qism o'quvchiga allaqachon berilgan bo'lishi mumkin.
    archived = False
    if (flag.flag_type == ModerationFlag.FLAG_TYPE_QUESTION
            and new_status == ModerationFlag.STATUS_RESOLVED
            and request.data.get('archive')):
        # Savol shu orada o'chirilgan bo'lishi mumkin — bunda yon ta'sir
        # o'tkazib yuboriladi, bayroqning yopilishi esa baribir kuchda qoladi.
        question = Question.objects.filter(pk=flag.target_id).first()
        if question is not None:
            # `is_active=False` — o'chirish EMAS: savol bankidan va yangi
            # olimpiada tanlovidan yo'qoladi, mavjud natijalar saqlanadi
            # (questions.views.question_detail dagi arxivlash bilan bir xil).
            question.is_active = False
            question.save(update_fields=['is_active'])
            AuditLog.log(request, 'question_archive', target=question, extra={
                'center_id': question.center_id,
                'moderation_flag_id': flag.id,
            })
            archived = True

    return Response({**_flag_payload(flag), 'archived': archived})
