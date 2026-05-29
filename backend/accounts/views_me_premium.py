"""O'quvchilar uchun yangi premium funksiyalar (O1–O7).

Barchasi `/api/me/...` ostida mount qilinadi (accounts/urls_me.py). Har biri
faqat autentifikatsiyalangan foydalanuvchining O'Z ma'lumotlari bilan ishlaydi.
Ba'zilari `is_premium` tekshiruvini talab qiladi (O7).
"""
from django.contrib.auth import get_user_model
from django.db.models import Avg, Count, Max, Sum
from django.shortcuts import get_object_or_404
from rest_framework import status as http_status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from attempts.models import TestAttempt
from .models import Achievement, ParentStudentLink, Rival

MAX_RIVALS = 3


def _premium_required():
    return Response(
        {
            'detail': "Bu funksiya premium o'quvchilar uchun. "
                      "Premium olish uchun markaz adminiga murojaat qiling.",
            'upgrade_required': True,
        },
        status=http_status.HTTP_403_FORBIDDEN,
    )


# ─── O1. Kundalik streak ─────────────────────────────────────────────────────


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_streak(request):
    """GET /api/me/streak/ — {streak_count, last_streak_date, longest_streak}."""
    u = request.user
    return Response({
        'streak_count': u.streak_count or 0,
        'last_streak_date': u.last_active_date.isoformat() if u.last_active_date else None,
        'longest_streak': u.longest_streak or 0,
    })


# ─── O2. Raqib tanlash ───────────────────────────────────────────────────────


def _user_avg_and_rank(user_id):
    """Foydalanuvchining global o'rtacha balli va taxminiy reytingi.

    Reyting: shu foydalanuvchidan yuqori o'rtacha ballga ega foydalanuvchilar
    soni + 1. Faqat valid (diskvalifikatsiya bo'lmagan) attempts hisoblanadi.
    """
    my_avg = (
        TestAttempt.objects
        .filter(user_id=user_id, disqualified=False, olympiad__is_deleted=False)
        .aggregate(avg=Avg('score'))['avg']
    )
    if my_avg is None:
        return 0.0, None
    my_avg = round(my_avg, 1)
    # Har foydalanuvchining o'rtacha balli (GROUP BY) — mendan yuqorilarni
    # sanaymiz. Katta bazada bu og'irroq, lekin reyting aniq bo'lishi uchun
    # zarur; natija frontend'da kamdan-kam (faqat raqiblar sahifasida) so'raladi.
    higher = 0
    rows = (
        TestAttempt.objects
        .filter(disqualified=False, olympiad__is_deleted=False)
        .values('user_id')
        .annotate(avg=Avg('score'))
    )
    for r in rows:
        if (r['avg'] or 0) > my_avg:
            higher += 1
    return my_avg, higher + 1


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def rivals(request):
    """GET/POST /api/me/rivals/ — raqiblar ro'yxati / raqib qo'shish.

    GET: [{rival_id, full_name, my_score, rival_score, my_rank, rival_rank}]
    POST: body {rival_id} — yangi raqib qo'shish (max 3 ta).
    """
    if request.method == 'POST':
        rival_id = (request.data or {}).get('rival_id')
        if not rival_id:
            return Response({'detail': 'rival_id majburiy'}, status=http_status.HTTP_400_BAD_REQUEST)
        try:
            rival_id = int(rival_id)
        except (TypeError, ValueError):
            return Response({'detail': "rival_id son bo'lishi kerak"}, status=http_status.HTTP_400_BAD_REQUEST)
        if rival_id == request.user.id:
            return Response({'detail': "O'zingizni raqib qila olmaysiz"}, status=http_status.HTTP_400_BAD_REQUEST)
        User = get_user_model()
        rival_user = User.objects.filter(pk=rival_id, is_active=True).first()
        if not rival_user:
            return Response({'detail': 'Foydalanuvchi topilmadi'}, status=http_status.HTTP_404_NOT_FOUND)
        current_count = Rival.objects.filter(user=request.user).count()
        if Rival.objects.filter(user=request.user, rival_user=rival_user).exists():
            return Response({'detail': "Bu foydalanuvchi allaqachon raqib"}, status=http_status.HTTP_400_BAD_REQUEST)
        if current_count >= MAX_RIVALS:
            return Response(
                {'detail': f"Maksimum {MAX_RIVALS} ta raqib qo'shish mumkin"},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        Rival.objects.create(user=request.user, rival_user=rival_user)
        return Response(
            {'rival_id': rival_user.id, 'full_name': rival_user.full_name or '—'},
            status=http_status.HTTP_201_CREATED,
        )

    # GET — raqiblar ro'yxati + taqqoslash.
    rival_links = (
        Rival.objects.filter(user=request.user)
        .select_related('rival_user')
        .order_by('-created_at')
    )
    my_score, my_rank = _user_avg_and_rank(request.user.id)
    data = []
    for link in rival_links:
        ru = link.rival_user
        r_score, r_rank = _user_avg_and_rank(ru.id)
        data.append({
            'rival_id': ru.id,
            'full_name': ru.full_name or '—',
            'avatar_url': (ru.avatar.url if ru.avatar else ''),
            'my_score': my_score,
            'rival_score': r_score,
            'my_rank': my_rank,
            'rival_rank': r_rank,
        })
    return Response(data)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def remove_rival(request, rival_id):
    """DELETE /api/me/rivals/<rival_id>/ — raqibni o'chirish."""
    link = Rival.objects.filter(user=request.user, rival_user_id=rival_id).first()
    if not link:
        return Response({'detail': 'Raqib topilmadi'}, status=http_status.HTTP_404_NOT_FOUND)
    link.delete()
    return Response(status=http_status.HTTP_204_NO_CONTENT)


# ─── O3. Mavzu (fan) tayyor indikatori ───────────────────────────────────────


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def subject_readiness(request):
    """GET /api/me/subject-readiness/ — fan bo'yicha tayyorlik indikatori.

    Javob: [{subject, readiness_percent, attempts_count, recommendation}]
    Tayyorlik = shu fandagi o'rtacha to'g'rilik foizi.
    """
    attempts = (
        TestAttempt.objects
        .filter(user=request.user, disqualified=False, olympiad__is_deleted=False)
        .select_related('olympiad')
    )
    buckets = {}
    for a in attempts:
        subject = (a.olympiad.subject if a.olympiad else '') or '—'
        b = buckets.setdefault(subject, {'correct': 0, 'total': 0, 'attempts': 0})
        answered = (a.correct_count or 0) + (a.wrong_count or 0)
        b['correct'] += a.correct_count or 0
        b['total'] += a.total_questions or answered
        b['attempts'] += 1

    result = []
    for subject, b in buckets.items():
        pct = round((b['correct'] / b['total']) * 100) if b['total'] else 0
        if pct >= 80:
            rec = 'Tayyor!'
        elif pct >= 60:
            rec = 'Yaxshi ketmoqda'
        else:
            rec = "Ko'proq mashq qiling"
        result.append({
            'subject': subject,
            'readiness_percent': pct,
            'attempts_count': b['attempts'],
            'recommendation': rec,
        })
    result.sort(key=lambda x: -x['readiness_percent'])
    return Response(result)


# ─── O5. Yutuqlar (achievements) ─────────────────────────────────────────────


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_achievements(request):
    """GET /api/me/achievements/ — foydalanuvchining barcha yutuqlari."""
    from .achievements import achievement_payload

    items = Achievement.objects.filter(user=request.user).order_by('-achieved_at')
    return Response([achievement_payload(a) for a in items])


# ─── O6. Ota-onaga haftalik xulosa (endpoint varianti) ───────────────────────


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def weekly_summary(request):
    """GET /api/me/weekly-summary/?student_id=<id>

    Ota-ona uchun farzandning oxirgi 7 kundagi xulosasi. `student_id`
    berilmasa va foydalanuvchining o'zi student bo'lsa — o'z xulosasini
    qaytaradi. Faqat tasdiqlangan ota-ona-farzand bog'lanishi uchun.
    Javob: {full_name, olympiads_count, average_score, streak, best_score}
    """
    from datetime import timedelta
    from django.utils import timezone

    student_id = request.query_params.get('student_id')
    if student_id:
        try:
            student_id = int(student_id)
        except (TypeError, ValueError):
            return Response({'detail': "student_id son bo'lishi kerak"}, status=http_status.HTTP_400_BAD_REQUEST)
        # Faqat tasdiqlangan bog'lanish bo'lsa ko'rsatamiz.
        link_ok = ParentStudentLink.objects.filter(
            parent=request.user, student_id=student_id, is_confirmed=True,
        ).exists()
        if not link_ok:
            return Response(
                {'detail': "Ruxsat berilmagan yoki farzand bog'lanmagan"},
                status=http_status.HTTP_403_FORBIDDEN,
            )
        User = get_user_model()
        student = get_object_or_404(User, pk=student_id)
    else:
        student = request.user

    week_ago = timezone.now() - timedelta(days=7)
    qs = TestAttempt.objects.filter(
        user=student, disqualified=False, submitted_at__gte=week_ago,
    )
    agg = qs.aggregate(avg=Avg('score'), best=Max('score'), total=Count('id'))
    return Response({
        'full_name': student.full_name or '—',
        'olympiads_count': agg['total'] or 0,
        'average_score': round(agg['avg'] or 0, 1),
        'streak': student.streak_count or 0,
        'best_score': agg['best'] or 0,
    })


# ─── O7. Olimpiada tavsiyasi ─────────────────────────────────────────────────


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def recommended_olympiads(request):
    """GET /api/me/recommended-olympiads/ — zaif fanlar bo'yicha tavsiya.

    Foydalanuvchining past balli fanlarini aniqlab, shu fanlardagi
    boshlanmagan (upcoming) olimpiadalarni tavsiya qiladi. Premium uchun.
    Javob: [{olympiad_id, name, subject, starts_at, reason}]
    """
    from django.utils import timezone
    from olympiads.models import Olympiad

    if not getattr(request.user, 'is_premium', False):
        return _premium_required()

    # Fan kesimida o'rtacha ball.
    subject_rows = (
        TestAttempt.objects
        .filter(user=request.user, disqualified=False, olympiad__is_deleted=False)
        .values('olympiad__subject')
        .annotate(avg=Avg('score'))
    )
    subject_avg = {
        (r['olympiad__subject'] or '').strip(): round(r['avg'] or 0, 1)
        for r in subject_rows if (r['olympiad__subject'] or '').strip()
    }
    # Zaif fanlar: o'rtacha ball < 70. Tarix bo'lmasa bo'sh set.
    weak_subjects = {s for s, avg in subject_avg.items() if avg < 70}

    now = timezone.now()
    # "upcoming" = active/draft holatdagi, start_datetime kelajakda bo'lgan
    # olimpiadalar. Modelда alohida 'upcoming' status yo'q — start_datetime
    # bo'yicha aniqlaymiz.
    upcoming_qs = (
        Olympiad.objects
        .filter(is_deleted=False, start_datetime__gt=now)
        .filter(status__in=[Olympiad.STATUS_ACTIVE, Olympiad.STATUS_DRAFT, Olympiad.STATUS_INACTIVE])
        .select_related('center')
        .order_by('start_datetime')
    )

    # Foydalanuvchi allaqachon qatnashgan olimpiadalarni chiqarib tashlaymiz.
    attempted_ids = set(
        TestAttempt.objects.filter(user=request.user).values_list('olympiad_id', flat=True)
    )

    recommended = []
    fallback = []
    for o in upcoming_qs:
        if o.id in attempted_ids:
            continue
        subject = (o.subject or '').strip()
        item = {
            'olympiad_id': o.id,
            'name': o.title,
            'subject': subject,
            'starts_at': o.start_datetime.isoformat() if o.start_datetime else None,
            'center_name': o.center.name if o.center_id else '',
        }
        if subject in weak_subjects:
            item['reason'] = f"{subject} bo'yicha ko'proq mashq kerak"
            recommended.append(item)
        else:
            item['reason'] = 'Yangi olimpiada'
            fallback.append(item)
        if len(recommended) >= 10:
            break

    # Zaif fan bo'yicha yetarli tavsiya bo'lmasa — qolgan upcoming'lar bilan
    # to'ldiramiz (lekin 10 tadan oshmaydi).
    if len(recommended) < 10:
        recommended.extend(fallback[: 10 - len(recommended)])
    return Response(recommended)
