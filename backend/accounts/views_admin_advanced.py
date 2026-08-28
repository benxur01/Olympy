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
from accounts.security_queries import (
    ADMIN_RISK_TIER_RANGES,
    annotate_admin_risk,
    churn_risk_filter,
    get_multi_account_user_ids,
    risk_tier_from_score,
)
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
    inactive_users = (
        User.objects.filter(churn_risk_filter())
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
# 7b. SHUBHALI FOYDALANUVCHILAR NAVBATI (birlashtirilgan signallar)
# ─────────────────────────────────────────────────────────────────────────────
# Ustuvorlik ballining qo'shimchalari. Xavf darajasining o'zi 0..100 shkalada
# (`annotate_admin_risk`), qo'shimchalar esa undan KICHIK: ular mustaqil
# ayblov emas, faqat navbatda yuqoriroq turishga asos.
MULTI_ACCOUNT_PRIORITY_BONUS = 30
CHURN_PRIORITY_BONUS = 20

# Navbat "tekshirish uchun ro'yxat", to'liq hisobot emas — `SHARED_IP_MAX_ROWS`
# bilan bir xil siyosat (admin bir o'tirishda ko'rib chiqadigan hajm).
SUSPICIOUS_QUEUE_MAX_ROWS = 100


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsPlatformAdmin])
def admin_suspicious_users_queue(request):
    """GET /api/admin/users/suspicious-queue/ — bitta birlashtirilgan navbat.

    Avval admin uchta alohida ekranni (xavf darajasi bo'yicha filtr, bir xil
    IP/qurilma ro'yxati, churn segmenti) qo'lda solishtirib chiqishi kerak
    edi. Bu endpoint uchala signalni bitta ustuvorlikka yig'adi:

        priority_score = risk_tier_score + 30 (ko'p-hisob) + 20 (churn)

    Ro'yxatga faqat KAMIDA BITTA signal bergan hisob tushadi: xavf darajasi
    'yuqori'/'kritik', yoki ko'p-hisob (IP/qurilma), yoki churn. Hech qanday
    chora ko'rilmaydi — boshqa xavfsizlik bloklaridagi bilan bir xil qoida,
    qaror adminniki.
    """
    now = timezone.now()
    ip_user_ids, device_user_ids = get_multi_account_user_ids()
    multi_account_ids = ip_user_ids | device_user_ids
    # 'yuqori' darajasining quyi chegarasi — nusxa emas, yagona manbadan
    # (`ADMIN_RISK_TIER_RANGES`) o'qiladi: chegara siljisa navbat ham siljiydi.
    high_risk_min_score = ADMIN_RISK_TIER_RANGES['yuqori'][0]

    qs = (
        annotate_admin_risk(User.objects.filter(is_active=True, is_platform_admin=False))
        .annotate(
            multi_account_bonus=models.Case(
                models.When(pk__in=multi_account_ids, then=models.Value(MULTI_ACCOUNT_PRIORITY_BONUS)),
                default=models.Value(0),
                output_field=models.IntegerField(),
            ),
            churn_bonus=models.Case(
                models.When(churn_risk_filter(), then=models.Value(CHURN_PRIORITY_BONUS)),
                default=models.Value(0),
                output_field=models.IntegerField(),
            ),
        )
        .annotate(
            priority_score=(
                models.F('risk_tier_score') + models.F('multi_account_bonus') + models.F('churn_bonus')
            ),
        )
        # Shart ANNOTATSIYALARGA emas, xom ustunlarga tayanadi (`pk__in`,
        # `churn_risk_filter`): faqat `risk_tier_score` agregatga bog'liq va
        # HAVING'ga tushadi, qolgani oddiy WHERE bo'lib qoladi.
        .filter(
            models.Q(risk_tier_score__gte=high_risk_min_score)
            | models.Q(pk__in=multi_account_ids)
            | churn_risk_filter()
        )
        # `id` — ikkinchi darajali tartib: bir xil ballli hisoblar kesib
        # olinganda (LIMIT) natija barqaror bo'lsin.
        .order_by('-priority_score', 'id')[:SUSPICIOUS_QUEUE_MAX_ROWS]
    )

    results = []
    for u in qs:
        risk_tier = risk_tier_from_score(u.risk_tier_score)
        multi_ip = u.id in ip_user_ids
        multi_device = u.id in device_user_ids
        is_churn = u.churn_bonus > 0
        days_inactive = (now - u.last_seen_at).days if u.last_seen_at else 0
        signals = []
        if u.risk_tier_score >= high_risk_min_score:
            signals.append(f'Xavf darajasi: {risk_tier}')
        if multi_ip:
            signals.append("Bir xil IP'dan bir nechta hisob")
        if multi_device:
            signals.append('Bir xil qurilmadan bir nechta hisob')
        if is_churn:
            signals.append(f'{days_inactive} kundan beri faol emas')
        results.append({
            'id': u.id,
            'full_name': u.full_name,
            'phone': u.phone,
            'risk_score': u.risk_tier_score,
            'risk_tier': risk_tier,
            'multi_account_ip': multi_ip,
            'multi_account_device': multi_device,
            # `admin_churn_risk_users` bilan bir xil so'zlashuv: daraja nomi
            # yoki signal yo'q bo'lsa `null`.
            'churn_risk': ('high' if days_inactive >= 14 else 'medium') if is_churn else None,
            'days_inactive': days_inactive,
            'priority_score': u.priority_score,
            'signals': signals,
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
    subject = (request.data.get('subject') or '').strip()
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
            subject=subject,
            status=CenterMembership.STATUS_APPROVED,
        )

        AuditLog.log(
            request,
            'admin_transfer_center',
            target=user,
            extra={'new_center_id': center.id, 'new_center_name': center.name, 'role': role, 'subject': subject},
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


# ─────────────────────────────────────────────────────────────────────────────
# 15. COLLUSION & GROUP CHEATING DETECTION
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['GET'])
@permission_classes([IsAuthenticated, IsPlatformAdmin])
def admin_collusion_detection(request):
    """Olimpiada ishtirokchilari o'rtasida guruh bo'lib ko'chirish va javoblar o'xshashligi tahlili."""
    from collections import defaultdict
    days = int(request.query_params.get('days') or 30)
    days = max(1, min(days, 180))
    min_similarity = float(request.query_params.get('min_similarity') or 75.0)
    olympiad_id = request.query_params.get('olympiad_id')
    center_id = request.query_params.get('center_id')

    since = timezone.now() - timedelta(days=days)
    attempts_qs = TestAttempt.objects.filter(submitted_at__gte=since).select_related('user', 'olympiad')
    if olympiad_id:
        attempts_qs = attempts_qs.filter(olympiad_id=olympiad_id)
    if center_id:
        attempts_qs = attempts_qs.filter(olympiad__center_id=center_id)

    by_olympiad = defaultdict(list)
    for att in attempts_qs.order_by('-submitted_at')[:350]:
        by_olympiad[att.olympiad_id].append(att)

    suspicious_pairs = []

    def check_pair(att1, att2):
        if att1.user_id == att2.user_id:
            return None
        ans1 = att1.answers or {}
        ans2 = att2.answers or {}
        common = set(ans1.keys()) & set(ans2.keys())
        if not common or len(common) < 3:
            return None

        matches = 0
        wrong_matches = 0
        for q in common:
            data1 = ans1[q]
            data2 = ans2[q]
            a1 = data1.get('answer') if isinstance(data1, dict) else data1
            a2 = data2.get('answer') if isinstance(data2, dict) else data2
            c1 = data1.get('is_correct') if isinstance(data1, dict) else None
            c2 = data2.get('is_correct') if isinstance(data2, dict) else None
            if str(a1).strip() == str(a2).strip() and str(a1).strip() != '':
                matches += 1
                if c1 is False and c2 is False:
                    wrong_matches += 1

        sim_pct = round((matches / len(common)) * 100, 1)
        if sim_pct < min_similarity and wrong_matches < 3:
            return None

        time_diff = None
        if att1.submitted_at and att2.submitted_at:
            time_diff = abs(int((att1.submitted_at - att2.submitted_at).total_seconds()))

        if (sim_pct >= 90 and (time_diff is None or time_diff < 900)) or wrong_matches >= 5:
            tier = 'critical'
        elif sim_pct >= 80 or wrong_matches >= 3 or (time_diff and time_diff < 300):
            tier = 'high'
        else:
            tier = 'medium'

        return {
            'olympiad_id': att1.olympiad_id,
            'olympiad_title': att1.olympiad.title,
            'user_a': {
                'id': att1.user_id,
                'full_name': att1.user.full_name,
                'phone': att1.user.phone,
                'score': att1.score,
                'submitted_at': att1.submitted_at.isoformat() if att1.submitted_at else None,
            },
            'user_b': {
                'id': att2.user_id,
                'full_name': att2.user.full_name,
                'phone': att2.user.phone,
                'score': att2.score,
                'submitted_at': att2.submitted_at.isoformat() if att2.submitted_at else None,
            },
            'similarity_pct': sim_pct,
            'common_questions': len(common),
            'matching_answers': matches,
            'identical_wrong_answers': wrong_matches,
            'time_diff_seconds': time_diff,
            'risk_tier': tier,
        }

    for _, att_list in by_olympiad.items():
        n = len(att_list)
        for i in range(n):
            for j in range(i + 1, min(n, i + 30)):
                res = check_pair(att_list[i], att_list[j])
                if res:
                    suspicious_pairs.append(res)

    suspicious_pairs.sort(
        key=lambda x: (
            0 if x['risk_tier'] == 'critical' else (1 if x['risk_tier'] == 'high' else 2),
            -x['similarity_pct'],
        )
    )

    return Response({
        'total_scanned_attempts': sum(len(v) for v in by_olympiad.values()),
        'detected_pairs_count': len(suspicious_pairs),
        'results': suspicious_pairs[:100],
    })


# ─────────────────────────────────────────────────────────────────────────────
# 16. ANOMALOUS ATTEMPTS & SPEEDRUN DETECTION
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['GET'])
@permission_classes([IsAuthenticated, IsPlatformAdmin])
def admin_anomalies_detection(request):
    """Tezlik (Speedrun) va Keskin o'sish (Score Jump) anomaliyalarini aniqlash."""
    from collections import defaultdict
    days = int(request.query_params.get('days') or 30)
    days = max(1, min(days, 180))
    since = timezone.now() - timedelta(days=days)

    attempts = list(
        TestAttempt.objects.filter(submitted_at__gte=since)
        .select_related('user', 'olympiad')
        .order_by('-submitted_at')[:400]
    )

    anomalies = []
    user_attempts_map = defaultdict(list)
    for att in attempts:
        user_attempts_map[att.user_id].append(att)

    for att in attempts:
        q_count = att.total_questions or (len(att.answers) if att.answers else 0) or 10
        time_per_q = round(att.time_spent / q_count, 1) if att.time_spent else 0

        # 1. Speedrun: Yuqori ball va har bir savolga 3.5 soniyadan kam vaqt
        if att.score >= 70 and 0 < time_per_q < 3.5:
            anomalies.append({
                'type': 'speedrun',
                'title': 'G‘ayritabiiy tezlik (Speedrun)',
                'risk_tier': 'critical' if time_per_q < 2.0 else 'high',
                'attempt_id': att.id,
                'user': {
                    'id': att.user.id,
                    'full_name': att.user.full_name,
                    'phone': att.user.phone,
                },
                'olympiad': {
                    'id': att.olympiad.id,
                    'title': att.olympiad.title,
                    'duration_minutes': att.olympiad.duration_minutes,
                },
                'score': att.score,
                'time_spent_seconds': att.time_spent,
                'total_questions': q_count,
                'time_per_question': time_per_q,
                'detail': f"{q_count} ta savolni {att.time_spent} soniyada (har savolga {time_per_q}s) yechib {att.score}% oldi.",
                'submitted_at': att.submitted_at.isoformat() if att.submitted_at else None,
            })

        # 2. Score Jump: Ilgari past (<45%) o'rtachaga ega bo'lib, to'satdan >=85% olish
        user_hist = user_attempts_map[att.user_id]
        if len(user_hist) >= 2 and att.score >= 85:
            past_scores = [
                h.score
                for h in user_hist
                if h.id != att.id and h.submitted_at and att.submitted_at and h.submitted_at < att.submitted_at
            ]
            if past_scores and len(past_scores) >= 2:
                avg_past = sum(past_scores) / len(past_scores)
                jump = att.score - avg_past
                if avg_past < 45 and jump >= 40:
                    anomalies.append({
                        'type': 'score_jump',
                        'title': 'Keskin natija o‘sishi (Score Jump)',
                        'risk_tier': 'critical' if jump >= 55 else 'high',
                        'attempt_id': att.id,
                        'user': {
                            'id': att.user.id,
                            'full_name': att.user.full_name,
                            'phone': att.user.phone,
                        },
                        'olympiad': {
                            'id': att.olympiad.id,
                            'title': att.olympiad.title,
                        },
                        'score': att.score,
                        'past_average': round(avg_past, 1),
                        'score_jump_delta': round(jump, 1),
                        'past_attempts_count': len(past_scores),
                        'detail': f"Oldingi {len(past_scores)} ta test o‘rtachasi {round(avg_past, 1)}% bo‘lgan, to‘satdan {att.score}% (+{round(jump, 1)}%) natija qayd etildi.",
                        'submitted_at': att.submitted_at.isoformat() if att.submitted_at else None,
                    })

    anomalies.sort(key=lambda x: (0 if x['risk_tier'] == 'critical' else 1, x.get('time_per_question', 999)))

    return Response({
        'count': len(anomalies),
        'results': anomalies[:100],
    })


# ─────────────────────────────────────────────────────────────────────────────
# 17. STUDENT 360° COMPREHENSIVE PASSPORT
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['GET'])
@permission_classes([IsAuthenticated, IsPlatformAdmin])
def admin_user_passport(request, user_id):
    """Foydalanuvchining to'liq 360° pasporti (Akademik, Xavfsizlik, Moliyaviy va Intizomiy)."""
    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return Response({'error': 'Foydalanuvchi topilmadi'}, status=status.HTTP_404_NOT_FOUND)

    # 1. Akademik statistika
    attempts = list(TestAttempt.objects.filter(user=user).select_related('olympiad').order_by('-submitted_at'))
    total_attempts = len(attempts)
    completed_attempts = [a for a in attempts if not a.disqualified]
    avg_score = round(sum(a.score for a in completed_attempts) / len(completed_attempts), 1) if completed_attempts else 0
    max_score = max([a.score for a in completed_attempts], default=0)
    total_correct = sum(a.correct_count for a in completed_attempts)
    total_wrong = sum(a.wrong_count for a in completed_attempts)
    total_time_seconds = sum(a.time_spent for a in completed_attempts)

    # 2. Xavfsizlik va risk profili
    from accounts.views import compute_user_risk_profile
    risk_profile = compute_user_risk_profile(user)

    disqualified_count = len([a for a in attempts if a.disqualified])
    warnings = Notification.objects.filter(user=user, type=Notification.TYPE_ACCOUNT_WARNING).order_by('-created_at')
    admin_notes = UserAdminNote.objects.filter(user=user).select_related('author').order_by('-created_at')
    devices_count = DeviceFingerprint.objects.filter(user=user).count()
    login_events_count = LoginEvent.objects.filter(user=user).count()

    # 3. Moliya va obunalar
    subscriptions = list(UserSubscription.objects.filter(user=user).order_by('-created_at')[:5])
    total_paid_uzs = sum(
        t.amount for t in PaymentTransaction.objects.filter(user=user, status=PaymentTransaction.STATUS_SUCCESS)
    )
    coin_tx_count = CoinTransaction.objects.filter(user=user).count()
    reward_redemptions = list(RewardRedemption.objects.filter(user=user).select_related('product').order_by('-redeemed_at')[:5])

    # 4. Markazlar a'zoligi
    memberships = list(CenterMembership.objects.filter(user=user).select_related('center'))
    centers_data = [{
        'center_id': m.center_id,
        'center_name': m.center.name,
        'role': m.role,
        'status': m.status,
        'joined_at': m.joined_at.isoformat() if m.joined_at else None,
    } for m in memberships]

    recent_attempts = [{
        'id': a.id,
        'olympiad_id': a.olympiad_id,
        'olympiad_title': a.olympiad.title,
        'subject': a.olympiad.subject,
        'score': a.score,
        'correct_count': a.correct_count,
        'wrong_count': a.wrong_count,
        'time_spent': a.time_spent,
        'rank': a.rank,
        'disqualified': a.disqualified,
        'submitted_at': a.submitted_at.isoformat() if a.submitted_at else None,
    } for a in attempts[:15]]

    return Response({
        'passport_id': f"OLYMPY-PASS-{user.id:06d}",
        'generated_at': timezone.now().isoformat(),
        'user': {
            'id': user.id,
            'full_name': user.full_name,
            'phone': user.phone,
            'email': user.email,
            'username': user.username,
            'roles': user.roles,
            'is_active': user.is_active,
            'is_premium': user.is_premium_active,
            'is_exam_blocked': user.is_exam_blocked,
            'streak_count': user.streak_count,
            'longest_streak': user.longest_streak,
            'coins': user.coins,
            'admin_tags': user.admin_tags or [],
            'created_at': user.created_at.isoformat() if user.created_at else None,
            'last_seen_at': user.last_seen_at.isoformat() if user.last_seen_at else None,
        },
        'academic_summary': {
            'total_attempts': total_attempts,
            'completed_attempts': len(completed_attempts),
            'disqualified_attempts': disqualified_count,
            'average_score': avg_score,
            'highest_score': max_score,
            'total_correct_answers': total_correct,
            'total_wrong_answers': total_wrong,
            'accuracy_percentage': round((total_correct / (total_correct + total_wrong) * 100), 1) if (total_correct + total_wrong) > 0 else 0,
            'total_study_time_hours': round(total_time_seconds / 3600, 2),
            'subject_levels': user.subject_levels or {},
        },
        'security_integrity': {
            'risk_score': risk_profile['risk_score'],
            'risk_level': risk_profile['risk_level'],
            'risk_factors': risk_profile['factors'],
            'disqualified_count': disqualified_count,
            'warnings_count': warnings.count(),
            'devices_count': devices_count,
            'total_logins_count': login_events_count,
            'is_exam_ban_active': user.is_exam_blocked,
            'exam_block_reason': user.exam_block_reason,
            'exam_blocked_until': user.exam_blocked_until.isoformat() if user.exam_blocked_until else None,
        },
        'financials': {
            'total_paid_uzs': total_paid_uzs,
            'coins_balance': user.coins,
            'coin_transactions_count': coin_tx_count,
            'custom_discount_percent': user.custom_discount_percent,
            'custom_practice_quota': user.custom_practice_quota,
            'subscriptions': [{
                'id': s.id,
                'plan_name': s.plan_name,
                'is_active': s.is_active,
                'starts_at': s.starts_at.isoformat() if s.starts_at else None,
                'expires_at': s.expires_at.isoformat() if s.expires_at else None,
            } for s in subscriptions],
            'reward_redemptions': [{
                'id': r.id,
                'product_title': r.product.title,
                'coin_price': r.product.coin_price,
                'status': r.status,
                'created_at': r.created_at.isoformat() if r.created_at else None,
            } for r in reward_redemptions],
        },
        'centers': centers_data,
        'recent_attempts': recent_attempts,
        'admin_notes': [{
            'id': n.id,
            'author_name': n.author.full_name if n.author else 'Admin',
            'note': n.note,
            'created_at': n.created_at.isoformat() if n.created_at else None,
        } for n in admin_notes[:10]],
    })


# ─────────────────────────────────────────────────────────────────────────────
# 18. REAL-TIME PRESENCE & CONCURRENT SESSIONS KILL
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['GET'])
@permission_classes([IsAuthenticated, IsPlatformAdmin])
def admin_realtime_presence(request):
    """Hozirda platformada faol bo'lgan foydalanuvchilar (Presence & Online State)."""
    now = timezone.now()
    fifteen_mins_ago = now - timedelta(minutes=15)
    two_hours_ago = now - timedelta(hours=2)

    active_test_sessions = list(
        TestSession.objects.filter(
            started_at__gte=two_hours_ago,
            status__in=[TestSession.STATUS_ACTIVE, TestSession.STATUS_PENDING_REVIEW],
        ).select_related('user', 'olympiad')
    )
    test_session_user_ids = {s.user_id: s for s in active_test_sessions}

    recent_users = list(
        User.objects.filter(
            models.Q(last_seen_at__gte=fifteen_mins_ago) | models.Q(id__in=test_session_user_ids.keys())
        ).order_by('-last_seen_at')[:100]
    )

    user_ids = [u.id for u in recent_users]
    recent_logins = {}
    for ev in LoginEvent.objects.filter(user_id__in=user_ids).order_by('-created_at'):
        if ev.user_id not in recent_logins:
            recent_logins[ev.user_id] = ev

    presence_list = []
    for u in recent_users:
        in_exam = u.id in test_session_user_ids
        active_session = test_session_user_ids.get(u.id)
        last_login = recent_logins.get(u.id)

        last_seen_sec = int((now - u.last_seen_at).total_seconds()) if u.last_seen_at else 9999
        status_state = 'in_exam' if in_exam else ('online' if last_seen_sec <= 180 else 'idle')

        presence_list.append({
            'user_id': u.id,
            'full_name': u.full_name,
            'phone': u.phone,
            'roles': u.roles,
            'is_premium': u.is_premium_active,
            'status': status_state,
            'last_seen_at': u.last_seen_at.isoformat() if u.last_seen_at else None,
            'last_seen_seconds_ago': last_seen_sec,
            'ip_address': last_login.ip_address if last_login else None,
            'user_agent': last_login.user_agent if last_login else None,
            'active_exam': {
                'session_id': active_session.id,
                'olympiad_id': active_session.olympiad_id,
                'olympiad_title': active_session.olympiad.title,
                'started_at': active_session.started_at.isoformat() if active_session.started_at else None,
            } if active_session else None,
        })

    return Response({
        'online_count': len([p for p in presence_list if p['status'] == 'online']),
        'in_exam_count': len([p for p in presence_list if p['status'] == 'in_exam']),
        'idle_count': len([p for p in presence_list if p['status'] == 'idle']),
        'total_active': len(presence_list),
        'results': presence_list,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsPlatformAdmin])
def admin_kill_all_sessions(request, user_id):
    """Foydalanuvchining barcha faol sessiyalarini yakunlash va tokenlarini bekor qilish."""
    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return Response({'error': 'Foydalanuvchi topilmadi'}, status=status.HTTP_404_NOT_FOUND)

    user.token_version += 1
    user.save(update_fields=['token_version'])

    terminated_sessions = TestSession.objects.filter(
        user=user,
        status__in=[TestSession.STATUS_ACTIVE, TestSession.STATUS_PENDING_REVIEW],
    ).update(
        status=TestSession.STATUS_COMPLETED,
        cheating_reason="Admin tomonidan barcha seanslar majburiy yakunlandi",
    )

    AuditLog.log(
        request,
        'admin_force_logout',
        target=user,
        extra={'terminated_sessions': terminated_sessions, 'new_token_version': user.token_version},
    )

    return Response({
        'ok': True,
        'message': f"{user.full_name} ning barcha qurilmadagi sessiyalari yakunlandi va tokenlari bekor qilindi.",
        'terminated_test_sessions': terminated_sessions,
    })


# ─────────────────────────────────────────────────────────────────────────────
# 19. AUTO-MODERATION RULE ENGINE
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated, IsPlatformAdmin])
def admin_auto_moderation_rules(request):
    """Avtomatik moderatsiya va anti-cheat qoidalarini ko'rish va boshqarish."""
    from django.core.cache import cache

    DEFAULT_RULES = {
        'auto_flag_speedrun': True,
        'speedrun_seconds_threshold': 3.0,
        'auto_flag_score_jump': True,
        'score_jump_delta_threshold': 45,
        'auto_flag_tab_switches': True,
        'tab_switch_limit': 5,
        'auto_tag_shared_ip': True,
        'shared_ip_account_limit': 5,
    }

    rules = cache.get('olympy_auto_moderation_rules') or DEFAULT_RULES

    if request.method == 'POST':
        for key in DEFAULT_RULES:
            if key in request.data:
                val = request.data[key]
                if isinstance(DEFAULT_RULES[key], bool):
                    rules[key] = bool(val)
                elif isinstance(DEFAULT_RULES[key], (int, float)):
                    try:
                        rules[key] = float(val) if isinstance(DEFAULT_RULES[key], float) else int(val)
                    except (ValueError, TypeError):
                        pass

        cache.set('olympy_auto_moderation_rules', rules, timeout=86400 * 30)
        AuditLog.log(request, 'admin_sensitive_data_view', extra={'rules_updated': rules})
        return Response({'ok': True, 'message': 'Avtomatik moderatsiya qoidalari saqlandi.', 'rules': rules})

    return Response({'ok': True, 'rules': rules})


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsPlatformAdmin])
def admin_auto_moderation_run_check(request):
    """Avtomatik moderatsiya qoidalarini ayni paytda tekshiruvdan o'tkazish (Scan & Sweep)."""
    from django.core.cache import cache
    from accounts.security_queries import get_ip_account_ids, get_shared_ip_accounts

    rules = cache.get('olympy_auto_moderation_rules') or {
        'auto_flag_speedrun': True,
        'speedrun_seconds_threshold': 3.0,
        'auto_flag_score_jump': True,
        'score_jump_delta_threshold': 45,
        'auto_tag_shared_ip': True,
        'shared_ip_account_limit': 5,
    }

    actions_taken = []
    now = timezone.now()
    since = now - timedelta(days=7)

    # 1. Tag shared IP users as 'Shubhali'
    if rules.get('auto_tag_shared_ip'):
        shared_ips = get_shared_ip_accounts(min_accounts=rules.get('shared_ip_account_limit', 5), window_days=7)
        for row in shared_ips[:10]:
            u_ids = get_ip_account_ids(row['ip_address']).keys()
            for u in User.objects.filter(pk__in=u_ids):
                tags = list(u.admin_tags or [])
                if 'Shubhali' not in tags and 'Multi-Account' not in tags:
                    tags.append('Shubhali')
                    u.admin_tags = tags
                    u.save(update_fields=['admin_tags'])
                    actions_taken.append(f"{u.full_name} ({u.phone}) ga 'Shubhali' tegi berildi (IP: {row['ip_address']})")

    # 2. Tag speedrun attempts
    if rules.get('auto_flag_speedrun'):
        sec_thresh = rules.get('speedrun_seconds_threshold', 3.0)
        fast_attempts = TestAttempt.objects.filter(
            submitted_at__gte=since,
            score__gte=80,
            disqualified=False,
        ).select_related('user', 'olympiad')[:50]

        for att in fast_attempts:
            q_cnt = att.total_questions or 10
            if att.time_spent and (att.time_spent / q_cnt) < sec_thresh:
                tags = list(att.user.admin_tags or [])
                if 'Speedrunner' not in tags:
                    tags.append('Speedrunner')
                    att.user.admin_tags = tags
                    att.user.save(update_fields=['admin_tags'])
                    actions_taken.append(f"{att.user.full_name} ga 'Speedrunner' tegi biriktirildi ({att.olympiad.title})")

    return Response({
        'ok': True,
        'executed_at': now.isoformat(),
        'actions_count': len(actions_taken),
        'actions_taken': actions_taken,
        'message': f"Tekshiruv yakunlandi: {len(actions_taken)} ta avtomatik chora ko'rildi.",
    })


# ─────────────────────────────────────────────────────────────────────────────
# 20. TARGETED FLASH ALERTS (BROADCAST MODAL)
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['POST'])
@permission_classes([IsAuthenticated, IsPlatformAdmin])
def admin_broadcast_flash_alert(request):
    """Segmentlangan guruhlarga shaxsiy modal ogohlantirish (Flash Alert) tarqatish."""
    title = str(request.data.get('title') or '').strip()
    message = str(request.data.get('message') or '').strip()
    level = str(request.data.get('level') or 'info').strip()
    target = str(request.data.get('target') or 'all').strip()

    if not title or not message:
        return Response({'error': 'Sarlavha va matn kiritilishi shart'}, status=status.HTTP_400_BAD_REQUEST)

    users_qs = User.objects.filter(is_active=True)
    if target == 'students':
        users_qs = users_qs.filter(roles__contains=['student'])
    elif target == 'teachers':
        users_qs = users_qs.filter(roles__contains=['teacher'])
    elif target == 'center_owners':
        users_qs = users_qs.filter(roles__contains=['owner'])
    elif target == 'shubhali':
        users_qs = users_qs.filter(admin_tags__contains=['Shubhali'])
    elif target == 'premium':
        users_qs = users_qs.filter(is_premium=True)

    level_map = {
        'info': UserFlashAlert.TYPE_INFO,
        'warning': UserFlashAlert.TYPE_WARNING,
        'critical': UserFlashAlert.TYPE_URGENT,
        'urgent': UserFlashAlert.TYPE_URGENT,
        'success': UserFlashAlert.TYPE_SUCCESS,
    }
    alert_type = level_map.get(level, UserFlashAlert.TYPE_INFO)

    target_users = list(users_qs[:1000])
    alerts_to_create = [
        UserFlashAlert(user=u, title=title, message=message, alert_type=alert_type, created_by=request.user)
        for u in target_users
    ]
    UserFlashAlert.objects.bulk_create(alerts_to_create)

    AuditLog.log(
        request,
        'admin_flash_alert',
        extra={'target': target, 'count': len(alerts_to_create), 'title': title, 'level': level},
    )

    return Response({
        'ok': True,
        'sent_count': len(alerts_to_create),
        'message': f"{len(alerts_to_create)} nafar foydalanuvchiga modal ogohlantirish yuborildi.",
    })

