"""B2B va o'sish (growth) funksiyalari uchun yangi endpointlar.

Barchasi `/api/me/...` ostida mount qilinadi (accounts/urls_me.py):

  * B2B markaz onboarding (Feature #1) — owner uchun.
  * O'qituvchi (teacher) roli endpointlari (Feature #3) — markazning
    o'quvchilari va olimpiadalari ro'yxati.
  * Referral tizimi (Feature #7) — o'z kodi va kodni ishlatish.

Har biri faqat autentifikatsiyalangan foydalanuvchining O'Z konteksti bilan
ishlaydi. Teacher endpointlari faqat tasdiqlangan o'qituvchi a'zoligini talab
qiladi.
"""
import secrets

from django.db import transaction
from django.db.models import Avg, Count
from rest_framework import status as http_status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from centers.models import CenterMembership, EducationCenter
from olympiads.models import Olympiad
from attempts.models import TestAttempt
from .models import ReferralCode


# ─── Feature #1: B2B markaz onboarding ───────────────────────────────────────


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def center_onboarding(request):
    """PATCH /api/me/center-onboarding/ — markaz onboarding sehrgarini tugatish.

    Owner B2B onboarding modalini tugatganda (yoki o'tkazib yuborganda)
    chaqiriladi: `onboarding_center_completed=True` qiladi. Idempotent —
    qayta chaqirilsa ham bir xil natija. Faqat shu maydonni yangilaymiz
    (save() ichidagi ortiqcha normalize logikasini chetlab).
    """
    user = request.user
    if not user.onboarding_center_completed:
        user.onboarding_center_completed = True
        user.save(update_fields=['onboarding_center_completed'])
    return Response({'onboarding_center_completed': True})


# ─── Feature #3: O'qituvchi (teacher) roli ───────────────────────────────────


def _teacher_center_ids(user):
    """O'qituvchining tasdiqlangan teacher a'zoligi bo'lgan markaz ID'lari.

    Bir o'qituvchi bir nechta markazda teacher bo'lishi mumkin — barchasini
    qaytaramiz. Platforma admini ham (test/qo'llab-quvvatlash uchun) hech
    qanday markaz bilan cheklanmaydi, lekin teacher endpointlari rol-asosli
    bo'lgani uchun admin uchun ham faqat teacher a'zoliklari hisobga olinadi.
    """
    return list(
        CenterMembership.objects
        .filter(
            user=user,
            role=CenterMembership.ROLE_TEACHER,
            status=CenterMembership.STATUS_APPROVED,
        )
        .values_list('center_id', flat=True)
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def teacher_students(request):
    """GET /api/me/teacher/students/ — o'qituvchi markazidagi o'quvchilar.

    O'qituvchining tasdiqlangan teacher a'zoligi bo'lgan markaz(lar)dagi
    tasdiqlangan o'quvchilar ro'yxati: { id, full_name, phone, avg_score,
    attempts }. Ball — o'sha markaz olimpiadalaridagi o'rtacha natija.
    O'qituvchi a'zoligi bo'lmasa bo'sh ro'yxat (403 emas — panel toza ko'rinadi).
    """
    center_ids = _teacher_center_ids(request.user)
    if not center_ids:
        return Response({'count': 0, 'results': []})

    memberships = (
        CenterMembership.objects
        .filter(
            center_id__in=center_ids,
            role=CenterMembership.ROLE_STUDENT,
            status=CenterMembership.STATUS_APPROVED,
        )
        .select_related('user')
        .order_by('user__full_name')
    )

    student_ids = [m.user_id for m in memberships]
    # Per-student o'rtacha ball va urinishlar soni — markaz olimpiadalaridan,
    # bitta GROUP BY so'rovida (N+1 emas). Diskvalifikatsiyalar hisobga olinmaydi.
    score_rows = (
        TestAttempt.objects
        .filter(
            user_id__in=student_ids,
            olympiad__center_id__in=center_ids,
            olympiad__is_deleted=False,
            disqualified=False,
        )
        .values('user_id')
        .annotate(avg=Avg('score'), attempts=Count('id'))
    )
    score_map = {row['user_id']: row for row in score_rows}

    seen = set()
    results = []
    for m in memberships:
        # Bir o'quvchi bir nechta markazda bo'lsa dublikat bo'lmasin.
        if m.user_id in seen:
            continue
        seen.add(m.user_id)
        u = m.user
        agg = score_map.get(m.user_id, {})
        results.append({
            'id': u.id,
            'full_name': u.full_name or '',
            'phone': u.normalized_phone or u.phone or '',
            'avg_score': round(agg.get('avg') or 0, 1),
            'attempts': agg.get('attempts') or 0,
        })
    return Response({'count': len(results), 'results': results})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def teacher_olympiads(request):
    """GET /api/me/teacher/olympiads/ — o'qituvchi markazidagi olimpiadalar.

    { id, title, subject, status, event_type, start_datetime, participants }.
    `participants` — diskvalifikatsiya bo'lmagan distinct ishtirokchilar soni.
    O'qituvchi a'zoligi bo'lmasa bo'sh ro'yxat.
    """
    center_ids = _teacher_center_ids(request.user)
    if not center_ids:
        return Response({'count': 0, 'results': []})

    olympiads = list(
        Olympiad.objects
        .filter(center_id__in=center_ids, is_deleted=False)
        .order_by('-created_at')
    )
    olympiad_ids = [o.id for o in olympiads]
    # Ishtirokchilar soni — bitta GROUP BY so'rovida.
    part_rows = (
        TestAttempt.objects
        .filter(olympiad_id__in=olympiad_ids, disqualified=False)
        .values('olympiad_id')
        .annotate(participants=Count('user', distinct=True))
    )
    part_map = {row['olympiad_id']: row['participants'] for row in part_rows}

    results = []
    for o in olympiads:
        results.append({
            'id': o.id,
            'title': o.title,
            'subject': o.subject,
            'status': o.status,
            'event_type': o.event_type,
            'start_datetime': o.start_datetime.isoformat() if o.start_datetime else None,
            'participants': part_map.get(o.id, 0),
        })
    return Response({'count': len(results), 'results': results})


# ─── Feature #7: Referral tizimi ─────────────────────────────────────────────


REFERRAL_CODE_LENGTH = 8
# Chalkashtirmaslik uchun ko'rinishi o'xshash belgilar (0/O, 1/I) chiqarib
# tashlangan alifbo — kod og'zaki uzatilsa ham xato kam bo'ladi.
REFERRAL_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'


def _generate_unique_referral_code():
    """Bandlanmagan noyob 8 belgilik referral kodi yaratadi."""
    for _ in range(10):
        code = ''.join(secrets.choice(REFERRAL_ALPHABET) for _ in range(REFERRAL_CODE_LENGTH))
        if not ReferralCode.objects.filter(code=code).exists():
            return code
    # Juda kam ehtimol — 10 urinishda ham bandlanmagan kod topilmasa,
    # bandlanmagan kod topilguncha bir xil alifbodan davom etamiz.
    # (token_hex faqat 0-9A-F berardi, REFERRAL_ALPHABET bilan mos emasdi.)
    # `code` maydoni max_length=8 — fallback ham 8 belgi.
    code = ''.join(secrets.choice(REFERRAL_ALPHABET) for _ in range(REFERRAL_CODE_LENGTH))
    while ReferralCode.objects.filter(code=code).exists():
        code = ''.join(secrets.choice(REFERRAL_ALPHABET) for _ in range(REFERRAL_CODE_LENGTH))
    return code


def _get_or_create_referral(user):
    """Foydalanuvchining referral kodini oladi, yo'q bo'lsa yaratadi."""
    referral = ReferralCode.objects.filter(user=user).first()
    if referral:
        return referral
    code = _generate_unique_referral_code()
    # get_or_create bilan poyga (race) holatida ikki marta yaratilmasin.
    referral, _created = ReferralCode.objects.get_or_create(
        user=user, defaults={'code': code},
    )
    return referral


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_referral(request):
    """GET /api/me/referral/ — o'z referral kodi va statistikasi.

    Kod yo'q bo'lsa avtomatik yaratiladi. Javob:
    { code, bonus_coins, invited_count }.
    """
    referral = _get_or_create_referral(request.user)
    return Response({
        'code': referral.code,
        'bonus_coins': referral.bonus_coins,
        'invited_count': referral.used_by.count(),
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def use_referral(request):
    """POST /api/me/referral/use/ — boshqa foydalanuvchi kodini ishlatish.

    Body: { code }. Muvaffaqiyatda kod egasiga ham, joriy foydalanuvchiga
    ham `bonus_coins` (default 50) coin qo'shiladi. Cheklovlar:
      * o'zining kodini ishlatib bo'lmaydi;
      * bir foydalanuvchi har qanday referral kodni faqat bir marta ishlata
        oladi (avval birorta kod ishlatgan bo'lsa qayta bonus yo'q).
    """
    code = str((request.data or {}).get('code') or '').strip().upper()
    if not code:
        return Response(
            {'detail': "Referral kodini kiriting"},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    # Foydalanuvchi avval birorta referral kodni ishlatganmi? Bir martadan
    # ko'p bonus berilmaydi (o'zining kodi yaratilgani — `referral_code` —
    # bunga kirmaydi; faqat `used_referral_codes` hisobga olinadi).
    if request.user.used_referral_codes.exists():
        return Response(
            {'detail': "Siz allaqachon referral kodidan foydalangansiz"},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    referral = ReferralCode.objects.filter(code=code).select_related('user').first()
    if not referral:
        return Response(
            {'detail': "Bunday referral kod topilmadi"},
            status=http_status.HTTP_404_NOT_FOUND,
        )

    if referral.user_id == request.user.id:
        return Response(
            {'detail': "O'zingizning kodingizni ishlatib bo'lmaydi"},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    from django.contrib.auth import get_user_model
    User = get_user_model()
    bonus = referral.bonus_coins or 50

    with transaction.atomic():
        # M2M unique emas, shuning uchun qayta qo'shishni oldini olamiz.
        if referral.used_by.filter(pk=request.user.pk).exists():
            return Response(
                {'detail': "Bu kodni allaqachon ishlatgansiz"},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        referral.used_by.add(request.user)
        # Coinlarni lock bilan yangilaymiz (lost update'ni oldini olish).
        inviter = User.objects.select_for_update().get(pk=referral.user_id)
        invited = User.objects.select_for_update().get(pk=request.user.pk)
        inviter.coins = (inviter.coins or 0) + bonus
        invited.coins = (invited.coins or 0) + bonus
        inviter.save(update_fields=['coins'])
        invited.save(update_fields=['coins'])

    # Joriy request.user obyektini ham yangilab qo'yamiz (javobda to'g'ri coin).
    request.user.coins = invited.coins
    return Response({
        'detail': f"Tabriklaymiz! Siz va do'stingiz {bonus} coin oldingiz",
        'bonus_coins': bonus,
        'coins': invited.coins,
    })
