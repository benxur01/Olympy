"""Kengaytirilgan Admin Foydalanuvchi Nazorati API'lari (Advanced Admin User Control).

Ushbu modul quyidagi yangi imkoniyatlarni taqdim etadi:
1. Risk Score & Fraud Breakdown — foydalanuvchining xavf ko'rsatkichi va tahlili.
2. Live Proctoring & Force Terminate — jonli test monitoringi va to'xtatish.
3. Device Fingerprint Management & Ban — brauzer/apparat izlari va bloklash.
4. User Activity Timeline — to'liq hayotiy sikl xronologiyasi.
5. Activity Heatmap — hafta kunlari va soatlar kesimidagi faollik matritsasi.
6. AI Diagnostic Summary — Gemini / sun'iy intellekt xulosasi va tavsiyalari.
7. Churn Risk Predictor — tizimdan ketish xavfi yuqori foydalanuvchilar segmenti.
8. Center Transfer & Reassignment — o'quvchini boshqa markazga o'tkazish/chiqarish.
9. Custom Quotas & Discounts — shaxsiy AI kvotasi va chegirma belgilash.
10. Coin Transactions Audit — tangalar kirim-chiqimi to'liq jurnali.
11. Payment Refund & Subscription Rollback — to'lovni bekor qilish va qaytarish.
12. User Flash Modal Alerts — foydalanuvchiga shaxsiy modal xabar qoldirish.
13. Direct Telegram Bot Message — admin paneldan to'g'ridan-to'g'ri Telegram xabar.
14. Bulk User Import — Excel / CSV / JSON orqali ommaviy foydalanuvchi qo'shish.
"""
import csv
import io
import json
import logging
from datetime import timedelta

from django.conf import settings
from django.db import models, transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import (
    AuditLog,
    CoinTransaction,
    DeviceFingerprint,
    LoginEvent,
    RewardRedemption,
    User,
    UserAdminNote,
    UserFlashAlert,
)
from accounts.permissions import IsPlatformAdmin
from accounts.security_queries import annotate_admin_risk, risk_tier_from_score
from accounts.utils import normalize_phone
from attempts.models import TestAttempt, TestSession
from billing.models import PaymentTransaction, UserSubscription
from centers.models import CenterMembership, EducationCenter
from notifications.models import Notification

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# 1. RISK SCORE & FRAUD BREAKDOWN
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['GET'])
@permission_classes([IsAuthenticated, IsPlatformAdmin])
def admin_user_risk_score(request, user_id):
    """Foydalanuvchining firibgarlik/xavf ko'rsatkichini (Risk Score) qaytaradi.

    Hisob-kitob `accounts.views.compute_user_risk_profile` da — YAGONA
    formula. Avval bu endpoint o'z nusxasini yuritardi (chegaralar 20/40/70,
    inglizcha yorliqlar, diskvalifikatsiya `min(40, n*20)`, IP chegarasi
    `>=3`), shu sababli panel bitta ekranda ikki xil raqam ko'rsatardi:
    sarlavha `admin_user_detail` dan, pastdagi omillar ro'yxati esa shu
    yerdan kelardi va ular qo'shilmasdi.

    `risk_level` endi O'ZBEKCHA daraja ('past' | "o'rta" | 'yuqori' |
    'kritik') — ro'yxatdagi `risk_tier` va "Batafsil" oynasidagi
    `risk_level` bilan bir xil so'z.

    GET yon ta'siri YO'Q: avval bu yerda `User.risk_score` ustuniga yozilardi
    (admin "Batafsil" oynasini ochishi hisobni o'zgartirardi). Ustunning o'zi
    endi yo'q (migratsiya 0057) — ball har safar shu funksiyadan hisoblanadi.
    """
    from accounts.views import compute_user_risk_profile

    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return Response({'error': 'Foydalanuvchi topilmadi'}, status=status.HTTP_404_NOT_FOUND)

    profile = compute_user_risk_profile(user)
    return Response({
        'user_id': user.id,
        'risk_score': profile['risk_score'],
        'risk_level': profile['risk_level'],
        'factors': profile['factors'],
        'calculated_at': timezone.now().isoformat(),
    })


# ─────────────────────────────────────────────────────────────────────────────
# 2. LIVE PROCTORING & FORCE TERMINATE
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['GET'])
@permission_classes([IsAuthenticated, IsPlatformAdmin])
def admin_live_proctoring_list(request):
    """Ayni paytda test topshirayotgan jonli sessiyalar ro'yxati."""
    now = timezone.now()
    two_hours_ago = now - timedelta(hours=2)

    active_sessions = list(
        TestSession.objects.filter(
            started_at__gte=two_hours_ago,
            status__in=[TestSession.STATUS_ACTIVE, TestSession.STATUS_PENDING_REVIEW],
        )
        .select_related('user', 'olympiad')
        .order_by('-started_at')[:50]
    )

    # Xavf ko'rsatkichi — YAGONA formulaning SQL variantidan
    # (`annotate_admin_risk`), sahifadagi foydalanuvchilar uchun BITTA
    # qo'shimcha so'rov. Avval bu yerda eskirgan `user.risk_score` USTUNI
    # o'qilardi: uni faqat "Batafsil" oynasi yozardi, ya'ni admin hali
    # ochmagan hisoblarda ustun har doim 0 edi va jonli imtihon paytida —
    # xavf eng kerak bo'lgan payt — ustun ma'nosiz nol ko'rsatardi.
    risk_scores = dict(
        annotate_admin_risk(User.objects.filter(pk__in={s.user_id for s in active_sessions}))
        .values_list('pk', 'risk_tier_score')
    )

    results = []
    for s in active_sessions:
        elapsed = int((now - s.started_at).total_seconds()) if s.started_at else 0
        total_duration = (s.olympiad.duration_minutes or 30) * 60
        remaining_seconds = max(0, total_duration - elapsed + (s.paused_seconds or 0))

        # Test Attempt bormi?
        attempt = TestAttempt.objects.filter(user=s.user, olympiad=s.olympiad).first()

        risk_score = risk_scores.get(s.user_id, 0)
        results.append({
            'session_id': s.id,
            'user': {
                'id': s.user.id,
                'full_name': s.user.full_name,
                'phone': s.user.phone,
                'is_premium': s.user.is_premium_active,
                'risk_score': risk_score,
                # Ball ro'yxat annotatsiyasidan (signallarning arzon qismi),
                # shuning uchun uni to'g'ri o'qish uchun daraja ham beriladi —
                # panel bir xil so'z bilan ranglashi mumkin bo'lsin.
                'risk_tier': risk_tier_from_score(risk_score),
            },
            'olympiad': {
                'id': s.olympiad.id,
                'title': s.olympiad.title,
                'subject': s.olympiad.subject,
                'duration_minutes': s.olympiad.duration_minutes,
            },
            'started_at': s.started_at.isoformat() if s.started_at else None,
            'elapsed_seconds': elapsed,
            'remaining_seconds': remaining_seconds,
            'status': s.status,
            'cheating_reason': s.cheating_reason,
            'last_device_id': s.last_device_id,
            'last_ping_at': s.last_ping_at.isoformat() if s.last_ping_at else None,
            'camera_consent': s.camera_consent_given,
            'microphone_consent': s.microphone_consent_given,
            'attempt_id': attempt.id if attempt else None,
        })

    return Response({
        'count': len(results),
        'results': results,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsPlatformAdmin])
def admin_live_proctoring_terminate(request, session_id):
    """Jonli imtihon sessiyasini admin tomondan to'xtatish va diskvalifikatsiya qilish."""
    try:
        session = TestSession.objects.select_related('user', 'olympiad').get(pk=session_id)
    except TestSession.DoesNotExist:
        return Response({'error': 'Sessiya topilmadi'}, status=status.HTTP_404_NOT_FOUND)

    reason = str(request.data.get('reason') or "Admin tomonidan jonli imtihon to'xtatildi (qoidabuzarlik)").strip()

    now = timezone.now()
    session.status = TestSession.STATUS_DISQUALIFIED
    session.cheating_reason = reason
    session.disqualified_at = now
    session.reviewed_by = request.user
    session.reviewed_at = now
    session.save(update_fields=['status', 'cheating_reason', 'disqualified_at', 'reviewed_by', 'reviewed_at'])

    # Agar TestAttempt mavjud bo'lsa uni ham DQ qilamiz
    attempt = TestAttempt.objects.filter(user=session.user, olympiad=session.olympiad).first()
    if attempt:
        attempt.disqualified = True
        attempt.save(update_fields=['disqualified'])

    # Audit log
    AuditLog.log(
        request,
        'admin_live_terminate',
        target=session.user,
        extra={
            'session_id': session.id,
            'olympiad_id': session.olympiad_id,
            'olympiad_title': session.olympiad.title,
            'reason': reason,
        },
    )

    # Foydalanuvchiga bildirishnoma
    Notification.objects.create(
        user=session.user,
        title="Imtihon to‘xtatildi",
        message=f"'{session.olympiad.title}' olimpiadasi admin tomonidan to‘xtatildi. Sabab: {reason}",
        type='system',
    )

    return Response({
        'ok': True,
        'message': f"{session.user.full_name} ning imtihoni muvaffaqiyatli to‘xtatildi va diskvalifikatsiya qilindi.",
    })


# ─────────────────────────────────────────────────────────────────────────────
# 3. DEVICE FINGERPRINT & BAN
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['GET'])
@permission_classes([IsAuthenticated, IsPlatformAdmin])
def admin_user_devices(request, user_id):
    """Foydalanuvchining barcha qurilma izlari ro'yxati."""
    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return Response({'error': 'Foydalanuvchi topilmadi'}, status=status.HTTP_404_NOT_FOUND)

    devices = DeviceFingerprint.objects.filter(user=user).order_by('-last_seen_at')
    data = []
    for d in devices:
        data.append({
            'id': d.id,
            'fingerprint_hash': d.fingerprint_hash,
            'browser_name': d.browser_name,
            'os_name': d.os_name,
            'screen_resolution': d.screen_resolution,
            'ip_address': d.ip_address,
            'user_agent': d.user_agent,
            'is_banned': d.is_banned,
            'ban_reason': d.ban_reason,
            'banned_at': d.banned_at.isoformat() if d.banned_at else None,
            'last_seen_at': d.last_seen_at.isoformat() if d.last_seen_at else None,
            'created_at': d.created_at.isoformat() if d.created_at else None,
        })
    return Response({'results': data, 'count': len(data)})


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsPlatformAdmin])
def admin_ban_device(request):
    """Qurilma izini (Fingerprint) bloklash."""
    fingerprint_hash = str(request.data.get('fingerprint_hash') or '').strip()
    reason = str(request.data.get('reason') or "Qoidabuzarlik sababli qurilma bloklandi").strip()
    user_id = request.data.get('user_id')

    if not fingerprint_hash:
        return Response({'error': 'fingerprint_hash majburiy'}, status=status.HTTP_400_BAD_REQUEST)

    now = timezone.now()
    updated_count = DeviceFingerprint.objects.filter(fingerprint_hash=fingerprint_hash).update(
        is_banned=True,
        ban_reason=reason,
        banned_at=now,
    )

    if updated_count == 0:
        # Yangi yozuv yaratamiz
        target_user = User.objects.filter(pk=user_id).first() if user_id else None
        DeviceFingerprint.objects.create(
            user=target_user,
            fingerprint_hash=fingerprint_hash,
            is_banned=True,
            ban_reason=reason,
            banned_at=now,
        )

    target_user = User.objects.filter(pk=user_id).first() if user_id else None
    AuditLog.log(
        request,
        'admin_device_ban',
        target=target_user,
        extra={'fingerprint_hash': fingerprint_hash, 'reason': reason},
    )

    return Response({'ok': True, 'message': 'Qurilma muvaffaqiyatli bloklandi.'})


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsPlatformAdmin])
def admin_unban_device(request):
    """Qurilma izi blokini ochish."""
    fingerprint_hash = str(request.data.get('fingerprint_hash') or '').strip()
    if not fingerprint_hash:
        return Response({'error': 'fingerprint_hash majburiy'}, status=status.HTTP_400_BAD_REQUEST)

    DeviceFingerprint.objects.filter(fingerprint_hash=fingerprint_hash).update(
        is_banned=False,
        ban_reason='',
        banned_at=None,
    )

    AuditLog.log(
        request,
        'admin_device_unban',
        extra={'fingerprint_hash': fingerprint_hash},
    )

    return Response({'ok': True, 'message': 'Qurilma bloki bekor qilindi.'})


# ─────────────────────────────────────────────────────────────────────────────
# 4. USER ACTIVITY TIMELINE
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['GET'])
@permission_classes([IsAuthenticated, IsPlatformAdmin])
def admin_user_timeline(request, user_id):
    """Foydalanuvchining butun hayotiy sikli xronologiyasi (Timeline)."""
    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return Response({'error': 'Foydalanuvchi topilmadi'}, status=status.HTTP_404_NOT_FOUND)

    timeline_items = []

    # 1. Ro'yxatdan o'tgan sana
    if user.created_at:
        timeline_items.append({
            'type': 'register',
            'title': 'Platformada ro‘yxatdan o‘tdi',
            'description': f"Telefon: {user.phone}, Ism: {user.full_name}",
            'timestamp': user.created_at.isoformat(),
            'icon': 'UserPlus',
            'color': 'primary',
        })

    # 2. Test topshirishlar (so'nggi 20 ta)
    attempts = TestAttempt.objects.filter(user=user).select_related('olympiad').order_by('-submitted_at')[:20]
    for att in attempts:
        status_text = 'Diskvalifikatsiya' if att.disqualified else f"Ball: {att.score}% ({att.correct_count}/{att.total_questions})"
        timeline_items.append({
            'type': 'attempt',
            'title': f"Olimpiada: {att.olympiad.title}",
            'description': status_text,
            'timestamp': att.submitted_at.isoformat(),
            'icon': 'Award',
            'color': 'error' if att.disqualified else ('success' if att.score >= 80 else 'warning'),
        })

    # 3. To'lovlar (PaymentTransaction)
    transactions = PaymentTransaction.objects.filter(user=user).select_related('plan').order_by('-created_at')[:15]
    for tx in transactions:
        plan_label = tx.plan.name if tx.plan else 'Premium obuna'
        timeline_items.append({
            'type': 'payment',
            'title': f"To‘lov: {tx.provider.upper()} ({int(tx.amount):,} so‘m)",
            'description': f"Holat: {tx.status.capitalize()} | Tarif: {plan_label}",
            'timestamp': tx.created_at.isoformat(),
            'icon': 'CreditCard',
            'color': 'success' if tx.status == 'success' else 'warning',
        })

    # 4. Sovrin xaridlari (RewardRedemption)
    rewards = RewardRedemption.objects.filter(user=user).select_related('product').order_by('-redeemed_at')[:10]
    for rew in rewards:
        timeline_items.append({
            'type': 'reward',
            'title': f"Sovrin buyurtma qilindi: {rew.product.title}",
            'description': f"Qiymati: {rew.product.coin_cost} tanga | Holat: {rew.get_status_display()}",
            'timestamp': rew.redeemed_at.isoformat(),
            'icon': 'Gift',
            'color': 'primary',
        })

    # 5. Ichki eslatmalar (UserAdminNote)
    notes = UserAdminNote.objects.filter(user=user).select_related('author').order_by('-created_at')[:15]
    for n in notes:
        timeline_items.append({
            'type': 'note',
            'title': f"Admin eslatmasi ({n.author.full_name if n.author else 'Admin'})",
            'description': n.text,
            'timestamp': n.created_at.isoformat(),
            'icon': 'FileText',
            'color': 'neutral',
        })

    # 6. Admin harakatlari (AuditLog target=user)
    audit_logs = AuditLog.objects.filter(target_id=user.id).select_related('actor').order_by('-created_at')[:25]
    for al in audit_logs:
        actor_name = al.actor.full_name if al.actor else 'Tizim'
        timeline_items.append({
            'type': 'audit',
            'title': f"Admin amali: {al.get_action_display()}",
            'description': f"Ijrochi: {actor_name}. {al.extra.get('reason', '')}",
            'timestamp': al.created_at.isoformat(),
            'icon': 'Shield',
            'color': 'error' if 'block' in al.action or 'ban' in al.action else 'warning',
        })

    # Vaqt bo'yicha saralash (eng yangisi tepada)
    timeline_items.sort(key=lambda x: x['timestamp'], reverse=True)

    return Response({
        'user_id': user.id,
        'count': len(timeline_items),
        'results': timeline_items[:60],
    })


# ─────────────────────────────────────────────────────────────────────────────
# 5. ACTIVITY HEATMAP
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['GET'])
@permission_classes([IsAuthenticated, IsPlatformAdmin])
def admin_user_activity_heatmap(request, user_id):
    """Foydalanuvchining hafta kunlari va soatlari bo'yicha faollik matritsasi."""
    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return Response({'error': 'Foydalanuvchi topilmadi'}, status=status.HTTP_404_NOT_FOUND)

    matrix = [[0 for _ in range(24)] for _ in range(7)]
    total_events = 0

    # Oxirgi 90 kundagi LoginEvent lar
    ninety_days_ago = timezone.now() - timedelta(days=90)
    login_events = LoginEvent.objects.filter(user=user, created_at__gte=ninety_days_ago)
    for evt in login_events:
        local_time = timezone.localtime(evt.created_at)
        day_idx = local_time.weekday()
        hour_idx = local_time.hour
        matrix[day_idx][hour_idx] += 1
        total_events += 1

    # Test topshirishlar
    attempts = TestAttempt.objects.filter(user=user, submitted_at__gte=ninety_days_ago)
    for att in attempts:
        local_time = timezone.localtime(att.submitted_at)
        day_idx = local_time.weekday()
        hour_idx = local_time.hour
        matrix[day_idx][hour_idx] += 2
        total_events += 2

    # Eng faol kun va soat
    max_count = 0
    peak_day = 0
    peak_hour = 0
    day_names = ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba', 'Yakshanba']

    for d in range(7):
        for h in range(24):
            if matrix[d][h] > max_count:
                max_count = matrix[d][h]
                peak_day = d
                peak_hour = h

    return Response({
        'matrix': matrix,
        'day_names': day_names,
        'total_events': total_events,
        'peak_day': day_names[peak_day],
        'peak_hour': f"{peak_hour:02d}:00",
        'period_days': 90,
    })


# ─────────────────────────────────────────────────────────────────────────────
# 6. AI DIAGNOSTIC SUMMARY
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['GET'])
@permission_classes([IsAuthenticated, IsPlatformAdmin])
def admin_user_ai_summary(request, user_id):
    """Foydalanuvchi profili bo'yicha tahliliy AI xulosasi va tavsiyalar.

    `risk_level` — YAGONA formuladan (`compute_user_risk_profile`). Avval bu
    yerda uchinchi mustaqil chegaralar to'plami (40/70) va o'z yorliqlari
    ('Juda yuqori (Firibgarlik shubhasi)') bor edi, ustiga u eskirgan
    `User.risk_score` USTUNINI o'qirdi — ya'ni admin "Batafsil" oynasini hech
    ochmagan hisob uchun daraja har doim 'Past' chiqardi.
    """
    from accounts.views import compute_user_risk_profile

    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return Response({'error': 'Foydalanuvchi topilmadi'}, status=status.HTTP_404_NOT_FOUND)

    total_attempts = TestAttempt.objects.filter(user=user).count()
    # `removed=False` — chiqarib yuborilgan urinish "diskvalifikatsiya" deb
    # zaif tomonlar ro'yxatiga tushmasin (u qoidabuzarlik emas).
    disqualified_count = TestAttempt.objects.filter(
        user=user, disqualified=True, removed=False,
    ).count()
    avg_score = TestAttempt.objects.filter(user=user, disqualified=False).aggregate(models.Avg('score'))['score__avg'] or 0
    total_payments = PaymentTransaction.objects.filter(user=user, status='success').count()
    total_spend = PaymentTransaction.objects.filter(user=user, status='success').aggregate(models.Sum('amount'))['amount__sum'] or 0

    days_since_seen = (timezone.now() - user.last_seen_at).days if user.last_seen_at else 999
    risk_level = compute_user_risk_profile(user)['risk_level']

    strengths = []
    weaknesses = []
    recommendations = []

    if user.streak_count >= 5:
        strengths.append(f"Yuqori intizom va faollik: {user.streak_count} kunlik ketma-ket streak.")
    if avg_score >= 80:
        strengths.append(f"A'lo akademik natijalar: o‘rtacha ball {avg_score:.1f}%.")
    elif avg_score < 50 and total_attempts > 0:
        weaknesses.append(f"Past o‘rtacha ko‘rsatkich ({avg_score:.1f}%). Qo‘shimcha mashq va motivatsiya zarur.")

    if days_since_seen > 14:
        weaknesses.append(f"Foydalanuvchi {days_since_seen} kundan beri platformaga kirmagan (Chiqib ketish xavfi).")
        recommendations.append("Telegram bot orqali shaxsiy taklifnoma yoki yangi olimpiada eslatmasi yuboring.")

    if disqualified_count > 0:
        weaknesses.append(f"{disqualified_count} ta testda diskvalifikatsiya qayd etilgan.")
        recommendations.append("Proktoring tekshiruvlarini kuchaytiring yoki keyingi testini jonli kuzating.")

    if not strengths:
        strengths.append("Yangi boshlovchi foydalanuvchi, asosiy faollik shakllanmoqda.")

    overview_text = (
        f"{user.full_name} ({user.phone}) platformada {user.created_at.strftime('%Y-%m-%d')} dan beri ro‘yxatda. "
        f"Jami {total_attempts} ta testda qatnashgan, o‘rtacha o‘zlashtirish ko‘rsatkichi {avg_score:.1f}%. "
        f"Jami to‘lovlar miqdori: {total_spend:,} so‘m ({total_payments} ta tranzaksiya)."
    )

    return Response({
        'user_id': user.id,
        'full_name': user.full_name,
        'overview': overview_text,
        'risk_level': risk_level,
        'strengths': strengths,
        'weaknesses': weaknesses,
        'recommendations': recommendations,
        'generated_at': timezone.now().isoformat(),
    })


# ─────────────────────────────────────────────────────────────────────────────
# 7. CHURN RISK PREDICTOR
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['GET'])
@permission_classes([IsAuthenticated, IsPlatformAdmin])
def admin_churn_risk_users(request):
    """Platformadan chiqib ketish xavfi (Churn Risk) yuqori bo'lgan foydalanuvchilar ro'yxati."""
    now = timezone.now()
    seven_days_ago = now - timedelta(days=7)
    thirty_days_ago = now - timedelta(days=30)

    inactive_users = (
        User.objects.filter(
            is_active=True,
            is_platform_admin=False,
            last_seen_at__lte=seven_days_ago,
            last_seen_at__gte=thirty_days_ago,
        )
        .order_by('last_seen_at')[:50]
    )

    results = []
    for u in inactive_users:
        days_inactive = (now - u.last_seen_at).days if u.last_seen_at else 0
        risk_level = 'high' if days_inactive >= 14 else 'medium'

        results.append({
            'id': u.id,
            'full_name': u.full_name,
            'phone': u.phone,
            'roles': u.roles,
            'is_premium': u.is_premium_active,
            'streak_count': u.streak_count,
            'longest_streak': u.longest_streak,
            'last_seen_at': u.last_seen_at.isoformat() if u.last_seen_at else None,
            'days_inactive': days_inactive,
            'churn_risk': risk_level,
        })

    return Response({
        'count': len(results),
        'results': results,
    })


# ─────────────────────────────────────────────────────────────────────────────
# 8. CENTER TRANSFER & REASSIGNMENT
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['POST'])
@permission_classes([IsAuthenticated, IsPlatformAdmin])
def admin_user_transfer_center(request, user_id):
    """O'quvchini boshqa markazga o'tkazish yoki markazdan chiqarish."""
    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return Response({'error': 'Foydalanuvchi topilmadi'}, status=status.HTTP_404_NOT_FOUND)

    new_center_id = request.data.get('center_id')
    role = request.data.get('role') or 'student'
    action_type = request.data.get('action') or 'transfer'

    with transaction.atomic():
        if action_type == 'remove':
            CenterMembership.objects.filter(user=user).delete()
            AuditLog.log(
                request,
                'admin_transfer_center',
                target=user,
                extra={'action': 'remove_all_centers'},
            )
            return Response({'ok': True, 'message': 'Foydalanuvchi barcha markazlardan muvaffaqiyatli chiqarildi.'})

        if not new_center_id:
            return Response({'error': 'center_id tanlanishi shart'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            center = EducationCenter.objects.get(pk=new_center_id)
        except EducationCenter.DoesNotExist:
            return Response({'error': 'Bunday o‘quv markazi topilmadi'}, status=status.HTTP_404_NOT_FOUND)

        CenterMembership.objects.filter(user=user).delete()
        CenterMembership.objects.create(
            user=user,
            center=center,
            role=role,
            status=CenterMembership.STATUS_APPROVED,
        )

        AuditLog.log(
            request,
            'admin_transfer_center',
            target=user,
            extra={'new_center_id': center.id, 'new_center_name': center.name, 'role': role},
        )

    return Response({
        'ok': True,
        'message': f"Foydalanuvchi muvaffaqiyatli '{center.name}' markaziga biriktirildi.",
    })


# ─────────────────────────────────────────────────────────────────────────────
# 9. CUSTOM QUOTAS & DISCOUNTS
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['POST'])
@permission_classes([IsAuthenticated, IsPlatformAdmin])
def admin_user_set_quota(request, user_id):
    """Foydalanuvchiga shaxsiy AI mashq kvotasi va shaxsiy chegirma belgilash."""
    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return Response({'error': 'Foydalanuvchi topilmadi'}, status=status.HTTP_404_NOT_FOUND)

    practice_quota = request.data.get('custom_practice_quota')
    discount_percent = request.data.get('custom_discount_percent')
    discount_days = request.data.get('discount_days')

    update_fields = []
    if practice_quota is not None:
        user.custom_practice_quota = max(0, int(practice_quota))
        update_fields.append('custom_practice_quota')

    if discount_percent is not None:
        user.custom_discount_percent = min(100, max(0, int(discount_percent)))
        update_fields.append('custom_discount_percent')

        if discount_days:
            user.custom_discount_until = timezone.now() + timedelta(days=int(discount_days))
            update_fields.append('custom_discount_until')
        elif int(discount_percent) == 0:
            user.custom_discount_until = None
            update_fields.append('custom_discount_until')

    if update_fields:
        user.save(update_fields=update_fields)

    AuditLog.log(
        request,
        'admin_set_quota',
        target=user,
        extra={
            'custom_practice_quota': user.custom_practice_quota,
            'custom_discount_percent': user.custom_discount_percent,
            'custom_discount_until': user.custom_discount_until.isoformat() if user.custom_discount_until else None,
        },
    )

    return Response({
        'ok': True,
        'custom_practice_quota': user.custom_practice_quota,
        'custom_discount_percent': user.custom_discount_percent,
        'custom_discount_until': user.custom_discount_until.isoformat() if user.custom_discount_until else None,
        'message': 'Imtiyoz va kvotalar muvaffaqiyatli saqlandi.',
    })


# ─────────────────────────────────────────────────────────────────────────────
# 10. COIN TRANSACTIONS AUDIT
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['GET'])
@permission_classes([IsAuthenticated, IsPlatformAdmin])
def admin_user_coin_transactions(request, user_id):
    """Foydalanuvchining tangalar (Coins) to'liq kirim-chiqim jurnali."""
    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return Response({'error': 'Foydalanuvchi topilmadi'}, status=status.HTTP_404_NOT_FOUND)

    txs = CoinTransaction.objects.filter(user=user).order_by('-created_at')[:50]
    data = []
    for t in txs:
        data.append({
            'id': t.id,
            'amount': t.amount,
            'balance_after': t.balance_after,
            'transaction_type': t.transaction_type,
            'transaction_type_display': t.get_transaction_type_display(),
            'description': t.description,
            'created_at': t.created_at.isoformat(),
        })

    return Response({
        'user_id': user.id,
        'current_coins': user.coins,
        'count': len(data),
        'results': data,
    })


# ─────────────────────────────────────────────────────────────────────────────
# 11. PAYMENT REFUND & SUBSCRIPTION ROLLBACK
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['POST'])
@permission_classes([IsAuthenticated, IsPlatformAdmin])
def admin_payment_refund(request, transaction_id):
    """To'lovni bekor qilish / qaytarish (Refund) va Premium obunani to'xtatish."""
    try:
        tx = PaymentTransaction.objects.select_related('user').get(pk=transaction_id)
    except PaymentTransaction.DoesNotExist:
        return Response({'error': 'Tranzaksiya topilmadi'}, status=status.HTTP_404_NOT_FOUND)

    reason = str(request.data.get('reason') or "Admin tomonidan to'lov qaytarildi (Refund)").strip()

    with transaction.atomic():
        tx.status = 'cancelled'
        tx.save(update_fields=['status'])

        user = tx.user
        UserSubscription.objects.filter(user=user, is_active=True).update(is_active=False)

        if user.is_premium:
            user.is_premium = False
            user.save(update_fields=['is_premium'])

        amount_val = int(tx.amount) if tx.amount else 0
        AuditLog.log(
            request,
            'admin_payment_refund',
            target=user,
            extra={
                'transaction_id': tx.id,
                'amount': amount_val,
                'provider': tx.provider,
                'reason': reason,
            },
        )

        Notification.objects.create(
            user=user,
            title="To‘lov bekor qilindi",
            message=f"{amount_val:,} so‘mlik to‘lovingiz bekor qilindi va qaytarildi. Sabab: {reason}",
            type='system',
        )

    return Response({
        'ok': True,
        'message': f"{amount_val:,} so‘mlik to‘lov muvaffaqiyatli bekor qilindi.",
    })


# ─────────────────────────────────────────────────────────────────────────────
# 12. USER FLASH MODAL ALERTS
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated, IsPlatformAdmin])
def admin_user_flash_alerts(request, user_id):
    """Foydalanuvchiga shaxsiy modal xabar qoldirish yoki ro'yxatini ko'rish."""
    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return Response({'error': 'Foydalanuvchi topilmadi'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'POST':
        title = str(request.data.get('title') or '').strip()
        message = str(request.data.get('message') or '').strip()
        alert_type = str(request.data.get('alert_type') or 'info').strip()

        if not title or not message:
            return Response({'error': 'Sarlavha va xabar matni kiritilishi shart'}, status=status.HTTP_400_BAD_REQUEST)

        alert = UserFlashAlert.objects.create(
            user=user,
            title=title,
            message=message,
            alert_type=alert_type,
            created_by=request.user,
        )

        AuditLog.log(
            request,
            'admin_flash_alert',
            target=user,
            extra={'alert_id': alert.id, 'title': title, 'alert_type': alert_type},
        )

        return Response({
            'ok': True,
            'id': alert.id,
            'title': alert.title,
            'message': alert.message,
            'alert_type': alert.alert_type,
            'created_at': alert.created_at.isoformat(),
        }, status=status.HTTP_201_CREATED)

    alerts = UserFlashAlert.objects.filter(user=user).order_by('-created_at')[:20]
    data = [{
        'id': a.id,
        'title': a.title,
        'message': a.message,
        'alert_type': a.alert_type,
        'is_active': a.is_active,
        'is_read': a.is_read,
        'read_at': a.read_at.isoformat() if a.read_at else None,
        'created_by': a.created_by.full_name if a.created_by else 'Admin',
        'created_at': a.created_at.isoformat(),
    } for a in alerts]

    return Response({'results': data, 'count': len(data)})


@api_view(['DELETE'])
@permission_classes([IsAuthenticated, IsPlatformAdmin])
def admin_delete_flash_alert(request, alert_id):
    """Shaxsiy modal xabarni o'chirish."""
    try:
        alert = UserFlashAlert.objects.get(pk=alert_id)
    except UserFlashAlert.DoesNotExist:
        return Response({'error': 'Xabar topilmadi'}, status=status.HTTP_404_NOT_FOUND)

    alert.delete()
    return Response({'ok': True, 'message': 'Xabar o‘chirildi.'})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_flash_alert(request):
    """Foydalanuvchi saytga kirganda unga atalgan eng so'nggi faol o'qilmagan xabarni oladi."""
    alert = UserFlashAlert.objects.filter(
        user=request.user,
        is_active=True,
        is_read=False,
    ).order_by('-created_at').first()

    if not alert:
        return Response({'alert': None})

    return Response({
        'alert': {
            'id': alert.id,
            'title': alert.title,
            'message': alert.message,
            'alert_type': alert.alert_type,
            'created_at': alert.created_at.isoformat(),
        }
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def my_flash_alert_read(request, alert_id):
    """Foydalanuvchi modal xabarni o'qiganini tasdiqlaydi."""
    UserFlashAlert.objects.filter(pk=alert_id, user=request.user).update(
        is_read=True,
        read_at=timezone.now(),
    )
    return Response({'ok': True})


# ─────────────────────────────────────────────────────────────────────────────
# 13. DIRECT TELEGRAM BOT MESSAGE
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['POST'])
@permission_classes([IsAuthenticated, IsPlatformAdmin])
def admin_user_send_telegram(request, user_id):
    """Foydalanuvchining Telegram akkauntiga bot nomidan xabar yuborish."""
    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return Response({'error': 'Foydalanuvchi topilmadi'}, status=status.HTTP_404_NOT_FOUND)

    if not user.telegram_chat_id:
        return Response({'error': 'Foydalanuvchiga Telegram ulanmagan (chat_id yo‘q)'}, status=status.HTTP_400_BAD_REQUEST)

    message_text = str(request.data.get('message') or '').strip()
    if not message_text:
        return Response({'error': 'Xabar matni kiritilishi shart'}, status=status.HTTP_400_BAD_REQUEST)

    from accounts.utils import send_telegram_message
    success = send_telegram_message(user.telegram_chat_id, f"🔔 <b>Olympy Ma’muriyatidan xabar:</b>\n\n{message_text}")

    AuditLog.log(
        request,
        'admin_send_telegram',
        target=user,
        extra={'message': message_text, 'success': bool(success)},
    )

    if not success:
        return Response({'error': 'Telegram bot orqali xabar yetkazib berilmadi'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    return Response({'ok': True, 'message': 'Telegram orqali xabar muvaffaqiyatli yuborildi.'})


# ─────────────────────────────────────────────────────────────────────────────
# 14. BULK USER IMPORT (EXCEL / CSV / JSON)
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['POST'])
@permission_classes([IsAuthenticated, IsPlatformAdmin])
def admin_bulk_import_users(request):
    """Foydalanuvchilarni ommaviy import qilish (CSV matn yoki JSON array)."""
    users_data = request.data.get('users')
    csv_text = request.data.get('csv_text')

    items_to_import = []
    if isinstance(users_data, list):
        items_to_import = users_data
    elif csv_text:
        reader = csv.DictReader(io.StringIO(csv_text))
        for row in reader:
            items_to_import.append(row)

    if not items_to_import:
        return Response({'error': 'Import qilish uchun foydalanuvchilar ma‘lumoti topilmadi'}, status=status.HTTP_400_BAD_REQUEST)

    created_users = []
    errors = []

    for idx, item in enumerate(items_to_import):
        full_name = str(item.get('full_name') or item.get('name') or '').strip()
        phone = str(item.get('phone') or '').strip()
        role = str(item.get('role') or 'student').strip().lower()
        password = str(item.get('password') or 'Olympy2025!').strip()
        center_id = item.get('center_id')

        norm_phone = normalize_phone(phone)
        if not norm_phone:
            errors.append(f"Qator {idx+1}: Telefon raqam noto‘g‘ri ({phone})")
            continue

        if not full_name:
            errors.append(f"Qator {idx+1}: Ism-familiya bo‘sh")
            continue

        if User.objects.filter(normalized_phone=norm_phone).exists():
            errors.append(f"Qator {idx+1}: Bu telefon raqam avval ro‘yxatdan o‘tgan ({norm_phone})")
            continue

        try:
            with transaction.atomic():
                roles_list = [role] if role in ['student', 'teacher', 'manager', 'owner'] else ['student']
                new_user = User.objects.create_user(
                    phone=norm_phone,
                    password=password,
                    full_name=full_name,
                    roles=roles_list,
                )

                if center_id:
                    center = EducationCenter.objects.filter(pk=center_id).first()
                    if center:
                        CenterMembership.objects.create(
                            user=new_user,
                            center=center,
                            role=role,
                            status=CenterMembership.STATUS_APPROVED,
                        )

                created_users.append({
                    'id': new_user.id,
                    'full_name': new_user.full_name,
                    'phone': new_user.phone,
                    'roles': new_user.roles,
                })
        except Exception as e:
            errors.append(f"Qator {idx+1} ({full_name}): Xatolik - {str(e)}")

    AuditLog.log(
        request,
        'admin_bulk_import_users',
        extra={'created_count': len(created_users), 'errors_count': len(errors)},
    )

    return Response({
        'ok': True,
        'created_count': len(created_users),
        'errors_count': len(errors),
        'created_users': created_users,
        'errors': errors,
    })
