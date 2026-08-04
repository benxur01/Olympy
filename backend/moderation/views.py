"""Admin paneldagi moderatsiya navbati va IP bloki endpointlari.

Barchasi `/api/admin/moderation/...` ostida mount qilinadi (olympy_api/urls.py)
va faqat platforma admini uchun ochiq.
"""
import ipaddress
from datetime import timedelta

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.models import AuditLog
from accounts.permissions import IsPlatformAdmin
from olympy_api.pagination import LargePageNumberPagination
from olympy_api.security_logging import client_ip
from questions.models import Question

from .models import BlockedIP, ModerationFlag

# `?status=` bilan berilishi mumkin bo'lgan YAKUNIY holatlar. `pending` ga
# qaytarish yo'q: bayroq yopilgandan keyin uni qayta ochish emas, yangisini
# yaratish kerak (detektor keyingi ishga tushishida shuni qiladi).
RESOLVE_STATUSES = (ModerationFlag.STATUS_RESOLVED, ModerationFlag.STATUS_DISMISSED)

# `?status=` uchun maxsus qiymat: filtrsiz (barcha holatlar). Bo'sh satr
# "filtr yo'q" degani emas — default AYNAN `pending` (navbat shu uchun).
STATUS_FILTER_ALL = 'all'

# IP bloki muddati uchun ruxsat etilgan variantlar (kun) — foydalanuvchi
# blokidagi ro'yxat bilan AYNAN bir xil (accounts/views.py:
# BLOCK_DURATION_DAYS). Ataylab nusxa: `accounts.views` ni boshqa app'dan
# import qilish loyihada tavsiya etilmaydi (accounts/security_queries.py
# modul izohi — aylanma bog'liqlik va keraksiz DRF yuklamasi). Muddat
# berilmasa blok doimiy.
BLOCK_DURATION_DAYS = (1, 7, 14, 30)


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
    """POST /api/admin/moderation/queue/<id>/resolve/
    body: {"status", "note", "archive", "block_ip", "block_days"}

    `status` — 'resolved' (chora ko'rildi) yoki 'dismissed' (yolg'on
    signal). Ikkalasi ham navbatdan olib tashlaydi, farqi faqat tarixda:
    qaysi bayroqlar haqiqiy muammo bo'lganini keyin shu ajratadi.

    `archive` — faqat savol bayrog'i uchun ixtiyoriy chora (pastga qarang),
    `block_ip`/`block_days` — faqat shubhali IP bayrog'i uchun.

    Allaqachon yopilgan bayroq 400 qaytaradi — ikkinchi admin birinchisining
    qarorini va `resolved_at` vaqtini bilmasdan qayta yozib yubormasin.
    """
    new_status = (request.data.get('status') or '').strip()
    if new_status not in RESOLVE_STATUSES:
        return Response(
            {'detail': "status faqat 'resolved' yoki 'dismissed' bo'lishi mumkin."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    # Muddat bayroqqa TEGMASDAN OLDIN tekshiriladi: `block_days` da terish
    # xatosi bo'lsa bayroq yopilib, blok esa qo'yilmay qolmasin (yarim
    # bajarilgan amal — admin bayroqni "hal qilindi" deb ko'radi va chora
    # ko'rilganiga ishonadi).
    expires_at, error = _parse_block_duration(request.data.get('block_days'))
    if error:
        return Response({'detail': error}, status=status.HTTP_400_BAD_REQUEST)

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

    # Turga xos yon ta'sir: savol bayrog'ida savolni arxivlash, shubhali IP
    # bayrog'ida esa manzilni bloklash — ikkalasi ham bir xil qoidaga
    # bo'ysunadi (ixtiyoriy, faqat so'ralganda va faqat 'resolved' bilan).
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

    # "Bayroq → blok" bir bosishda. Manzil bayroqning `extra.ip_address`
    # kalitida turadi (`moderation.tasks.detect_suspicious_activity` shu
    # yerga yozadi) — admin uni qo'lda ko'chirib o'tirmaydi.
    #
    # Bayroq QO'YILGANDA avtomatik bloklash yo'q: bitta manzil ortidagi ko'p
    # hisob o'z-o'zicha qoidabuzarlik emas (markaz sinfxonasi, oila Wi-Fi'si,
    # operator NAT'i) — detektorning o'zi hech qachon chora ko'rmaydi.
    blocked_ip = None
    if (flag.flag_type == ModerationFlag.FLAG_TYPE_SUSPICIOUS_IP
            and new_status == ModerationFlag.STATUS_RESOLVED
            and request.data.get('block_ip')):
        blocked_ip = _block_ip_from_flag(request, flag, expires_at)

    return Response({
        **_flag_payload(flag),
        'archived': archived,
        'blocked_ip': _blocked_ip_payload(blocked_ip) if blocked_ip else None,
    })


def _block_ip_from_flag(request, flag, expires_at):
    """Bayroqdagi manzilni bloklaydi. Qaytadi: `BlockedIP` yoki None.

    Yon ta'sir hech qachon bayroqning yopilishini bekor qilmaydi (savolni
    arxivlash bilan bir xil qoida), shuning uchun bajarib bo'lmaydigan
    holatlarda jimgina None qaytadi:
      * bayroqda manzil yo'q yoki buzilgan (eski/qo'lda yaratilgan yozuv);
      * manzil allaqachon bloklangan (takror qator yaratilmaydi);
      * manzil adminning O'ZINIKI — bir bosishda o'zini saytdan quvib
        chiqarib yubormasin (`admin_blocked_ips` dagi bilan bir xil himoya).
    """
    ip_address, prefix_length, error = _parse_ip_address(flag.extra.get('ip_address'))
    if error:
        return None
    if _would_block_self(request, ip_address, prefix_length):
        return None
    if BlockedIP.match(ip_address) is not None:
        return None
    blocked = BlockedIP.objects.create(
        ip_address=ip_address,
        prefix_length=prefix_length,
        reason=flag.reason[:255],
        blocked_by=request.user,
        expires_at=expires_at,
    )
    AuditLog.log(request, 'admin_ip_block', target=blocked, extra={
        'ip_address': blocked.cidr,
        'expires_at': expires_at.isoformat() if expires_at else None,
        'moderation_flag_id': flag.id,
    })
    return blocked


def _would_block_self(request, ip_address, prefix_length):
    """Yangi blok so'rovni yuborayotgan adminning O'ZINI to'sib qo'yadimi.

    `admin_set_user_active` dagi "O'zingizni bloklab bo'lmaydi" himoyasining
    shu yerdagi ko'rinishi, lekin bu yerda u ancha muhimroq: IP bloki BUTUN
    saytga tegishli — Django admin sahifasi (`/olympy-mgmt-2025/`) ham shu
    middleware ortida. Ya'ni o'zini bloklagan admin blokni HTTP orqali
    umuman ololmasdi (yagona yo'l — bazaga to'g'ridan-to'g'ri kirish).

    Tarmoq ham tekshiriladi, faqat bitta manzil emas: eng xavfli terish
    xatosi aynan keng CIDR (`/16` o'rniga `/8`). Adminning manzili topilmasa
    (`client_ip` `-` qaytardi — lokal ishlab chiqish) tekshiruv o'tib
    ketadi: bunday muhitda blok baribir hech kimga tegmaydi.
    """
    candidate = BlockedIP(ip_address=ip_address, prefix_length=prefix_length)
    return candidate.matches(client_ip(request))


def _parse_ip_address(raw):
    """`"1.2.3.4"` yoki `"1.2.3.0/24"` ni ustunlarga ajratadi.

    Qaytadi: `(ip_address, prefix_length, error)`. `error` None bo'lmasa
    qolgan qiymatlar ma'nosiz (`_parse_suspension_payload` bilan bir xil
    naqsh).

    Admin BITTA maydonga yozadi — manzil ham, tarmoq ham. Ikkita alohida
    maydon panelda ham, API'da ham ortiqcha bo'lardi: CIDR yozuvi
    (`1.2.3.0/24`) allaqachon hamma biladigan standart shakl.

    Tarmoq `strict=False` bilan parse qilinadi va NORMALLASHTIRIB saqlanadi:
    admin `1.2.3.4/24` yozsa ham ustunga `1.2.3.0` tushadi, ya'ni bir xil
    tarmoq har doim bir xil ko'rinadi (takrorni aniqlash shunga tayanadi).
    To'liq prefiks (`/32`, `/128`) — bu bitta manzil, `prefix_length` NULL
    bo'lib qoladi: aks holda aynan bir xil blok jadvalda ikki xil ko'rinishda
    yotardi.
    """
    value = str(raw or '').strip()
    if not value:
        return None, None, 'IP manzilni kiriting'
    try:
        if '/' in value:
            network = ipaddress.ip_network(value, strict=False)
            if network.prefixlen != network.max_prefixlen:
                return str(network.network_address), network.prefixlen, None
            return str(network.network_address), None, None
        return str(ipaddress.ip_address(value)), None, None
    except ValueError:
        return None, None, "IP manzil yoki tarmoq noto'g'ri (masalan: 1.2.3.4 yoki 1.2.3.0/24)"


def _parse_block_duration(raw):
    """`block_days`/`duration_days` ni `expires_at` ga aylantiradi.

    Qaytadi: `(expires_at, error)`. Qiymat berilmasa `(None, None)` — blok
    DOIMIY (`User.blocked_until` bilan bir xil semantika: NULL = muddatsiz).
    """
    if raw in (None, ''):
        return None, None
    try:
        days = int(raw)
    except (TypeError, ValueError):
        days = None
    if days not in BLOCK_DURATION_DAYS:
        return None, "Blok muddati noto'g'ri (faqat 1, 7, 14 yoki 30 kun)"
    return timezone.now() + timedelta(days=days), None


def _blocked_ip_payload(blocked):
    """Bitta blokning panel uchun ko'rinishi.

    `blocked_by` NULL — blokni qo'ygan admin hisobi o'chirilgan
    (`_flag_payload.resolved_by` bilan bir xil qoida: 'Tizim' emas, None,
    chunki IP blokini hech qachon tizim qo'ymaydi).

    `is_active` — blok AYNAN HOZIR kuchdami. Muddati o'tgan qator jadvalda
    qoladi (izohi models.py da), shuning uchun panel "bloklangan" va
    "muddati o'tgan" ni ajrata olishi kerak.
    """
    return {
        'id': blocked.id,
        # Xom ustunlar (`ip_address`/`prefix_length`) ham, tayyor ko'rinish
        # (`cidr`) ham beriladi: panel matnni o'zi yig'ib o'tirmaydi.
        'ip_address': blocked.ip_address,
        'prefix_length': blocked.prefix_length,
        'cidr': blocked.cidr,
        'reason': blocked.reason,
        'blocked_by': blocked.blocked_by.full_name if blocked.blocked_by else None,
        'blocked_by_id': blocked.blocked_by_id,
        'expires_at': blocked.expires_at.isoformat() if blocked.expires_at else None,
        'is_active': not blocked.is_expired(),
        'created_at': blocked.created_at.isoformat(),
    }


@api_view(['GET', 'POST'])
@permission_classes([IsPlatformAdmin])
def admin_blocked_ips(request):
    """GET/POST /api/admin/moderation/blocked-ips/

    GET — barcha bloklar, yangisidan boshlab. Muddati o'tganlari ham
    qaytadi (`is_active: false`): ular hech nimani to'smaydi, lekin "bu
    manzil avval nega bloklangan edi" degan savolga javob beradi va admin
    ularni qaytadan qo'yishi yoki o'chirib tashlashi mumkin. Paginatsiya
    `LargePageNumberPagination` orqali — moderatsiya navbati bilan bir xil.

    POST body: {"ip_address": "1.2.3.4" | "1.2.3.0/24", "reason": "...",
    "duration_days": 1|7|14|30}. `reason` MAJBURIY va `duration_days`
    ixtiyoriy — foydalanuvchi blokidagi (`admin_set_user_active`) bilan
    AYNAN bir xil qoida: muddat berilmasa blok doimiy.
    """
    if request.method == 'GET':
        qs = BlockedIP.objects.select_related('blocked_by')
        paginator = LargePageNumberPagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(
            [_blocked_ip_payload(blocked) for blocked in page]
        )

    ip_address, prefix_length, error = _parse_ip_address(request.data.get('ip_address'))
    if error:
        return Response({'detail': error}, status=status.HTTP_400_BAD_REQUEST)
    reason = str(request.data.get('reason') or '').strip()
    if not reason:
        return Response({'detail': 'Bloklash sababini kiriting'},
                        status=status.HTTP_400_BAD_REQUEST)
    expires_at, error = _parse_block_duration(request.data.get('duration_days'))
    if error:
        return Response({'detail': error}, status=status.HTTP_400_BAD_REQUEST)

    if _would_block_self(request, ip_address, prefix_length):
        return Response({'detail': "O'z IP manzilingizni bloklab bo'lmaydi"},
                        status=status.HTTP_400_BAD_REQUEST)

    # Takror: AYNAN shu yozuv emas, balki manzilni ALLAQACHON to'sayotgan
    # kuchdagi blok qidiriladi (`/24` bloki ostidagi bitta manzilni ikkinchi
    # marta bloklashning ma'nosi yo'q). Muddati o'tgan qator to'smaydi —
    # ya'ni eski blokni qaytadan qo'yish mumkin.
    existing = BlockedIP.match(ip_address)
    if existing is not None:
        return Response(
            {'detail': f'Bu manzil allaqachon bloklangan ({existing.cidr})'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    blocked = BlockedIP.objects.create(
        ip_address=ip_address,
        prefix_length=prefix_length,
        reason=reason[:255],
        blocked_by=request.user,
        expires_at=expires_at,
    )
    AuditLog.log(request, 'admin_ip_block', target=blocked, extra={
        'ip_address': blocked.cidr,
        'expires_at': expires_at.isoformat() if expires_at else None,
    })
    return Response(_blocked_ip_payload(blocked), status=status.HTTP_201_CREATED)


@api_view(['DELETE'])
@permission_classes([IsPlatformAdmin])
def admin_blocked_ip_delete(request, blocked_ip_id):
    """DELETE /api/admin/moderation/blocked-ips/<id>/ — blokni olib tashlash.

    Qator butunlay o'chiriladi (soft-delete yo'q): blok "holat" emas, balki
    faol qoida — o'chirilgani bilan yo'qoladigan tarix yo'q, chunki qo'yilishi
    ham, olinishi ham audit jurnalida qoladi.
    """
    blocked = get_object_or_404(BlockedIP, pk=blocked_ip_id)
    # Audit yozuvi o'chirishdan OLDIN: keyin `pk` ham, `cidr` ham yo'qoladi
    # (`admin_delete_user_content` bilan bir xil sabab).
    AuditLog.log(request, 'admin_ip_unblock', target=blocked, extra={
        'ip_address': blocked.cidr,
    })
    payload = _blocked_ip_payload(blocked)
    blocked.delete()
    return Response(payload)
