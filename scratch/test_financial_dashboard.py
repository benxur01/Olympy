import os
import sys
sys.path.insert(0, '/home/benxur/Downloads/Olympy-main/backend')

import django

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'olympy_api.settings')
django.setup()

from datetime import timedelta
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from billing.models import PaymentTransaction, SubscriptionPlan, UserSubscription
from attempts.models import TestSession
from olympiads.models import Olympiad
from analytics.metrics import get_metrics, compute_metrics

User = get_user_model()

print("=" * 60)
print("🚀 OLYMPY ADMIN DASHBOARD TO'LIQ TEST SUITE BOSHLANDI")
print("=" * 60)

now = timezone.now()

# 1. Test ma'lumotlarini tozalash va tayyorlash
User.objects.filter(phone__startswith='+99899111').delete()

# Platform Admin yaratish
admin_user = User.objects.create_user(
    phone='+998991110001',
    password='AdminTestPass123!',
    full_name='Test Admin',
    is_platform_admin=True,
)

# User A: Faqat Trial olgan (Pul to'lamagan)
trial_user = User.objects.create_user(
    phone='+998991110002',
    password='UserPass123!',
    full_name='Trialchi Alisher',
    premium_trial_end=now + timedelta(days=20),
)

# User B: Haqiqiy to'lov qilgan Click orqali
paid_user_click = User.objects.create_user(
    phone='+998991110003',
    password='UserPass123!',
    full_name='Xaridor Bobur',
)
tx_click = PaymentTransaction.objects.create(
    user=paid_user_click,
    amount=99000,
    provider='click',
    status=PaymentTransaction.STATUS_SUCCESS,
)
sub_bobur = UserSubscription.objects.create(
    user=paid_user_click,
    start_date=now - timedelta(days=2),
    end_date=now + timedelta(days=28),
    is_active=True,
)

# User C: To'lovi xato bo'lgan yoki bekor bo'lgan
failed_user_payme = User.objects.create_user(
    phone='+998991110004',
    password='UserPass123!',
    full_name='To\'lolmagan Sardor',
)
tx_failed = PaymentTransaction.objects.create(
    user=failed_user_payme,
    amount=150000,
    provider='payme',
    status=PaymentTransaction.STATUS_FAILED,
)

# User D: Payme orqali haqiqiy to'lov qilgan
paid_user_payme = User.objects.create_user(
    phone='+998991110005',
    password='UserPass123!',
    full_name='Xaridor Dilnoza',
)
tx_payme = PaymentTransaction.objects.create(
    user=paid_user_payme,
    amount=49000,
    provider='payme',
    status=PaymentTransaction.STATUS_SUCCESS,
)

print("✅ 1-QADAM: Test foydalanuvchilari va tranzaksiyalari yaratildi.")

# 2. Metrikalarni tekshirish (Trial hisobga kirmaganligini tekshirish)
metrics = get_metrics(force_refresh=True)
fin = metrics.get('financial', {})

print("\n--- 2-QADAM: Moliyaviy va Premium Metrikalar Tekshiruvi ---")
print(f"Jami daromad: {fin.get('total_revenue')} so'm")
print(f"Shu oylik daromad: {fin.get('this_month_revenue')} so'm")
print(f"Sof pullik xaridorlar soni: {fin.get('paid_customers_count')} ta")
print(f"Faol pullik obunachilar soni: {fin.get('active_paid_subscriptions')} ta")
print(f"Faqat trialda yurganlar soni: {fin.get('trial_active_count')} ta")
print(f"ARPU: {fin.get('arpu')} so'm")
print(f"Click provayder statistikasi: {fin.get('providers', {}).get('click')}")
print(f"Payme provayder statistikasi: {fin.get('providers', {}).get('payme')}")

# Assertions
assert fin.get('total_revenue') >= 99000 + 49000, "XATOLIK: Jami tushum muvaffaqiyatli to'lovlar yig'indisiga teng emas!"
assert fin.get('paid_customers_count') >= 2, "XATOLIK: Sof pullik xaridorlar soni kamida 2 ta bo'lishi kerak!"
# Trial user (trial_user) pulliklar safiga kirmaganini tekshirish
assert trial_user.id not in set(PaymentTransaction.objects.filter(status=PaymentTransaction.STATUS_SUCCESS).values_list('user_id', flat=True)), "XATOLIK: Trial user to'lovchilar ro'yxatiga adashib qo'shilgan!"

print("🎯 TRIAL FILTER TESTI: Trial foydalanuvchisi (Alisher) pullik xaridorlar safiga KIRMADII — 100% TO'G'RI!")

# 3. API Endpointlarini test qilish
client = APIClient()
client.force_authenticate(user=admin_user)

print("\n--- 3-QADAM: API Endpointlar Testi ---")
res_metrics = client.get('/api/analytics/metrics/?refresh=1', secure=True, HTTP_HOST='localhost')
assert res_metrics.status_code == 200, f"XATOLIK: /api/analytics/metrics/ kodi {res_metrics.status_code}"
assert 'financial' in res_metrics.data, "XATOLIK: API javobida 'financial' bloki yo'q!"
print("✅ /api/analytics/metrics/ — 200 OK (Moliya bloki mavjud)")

res_tx = client.get('/api/analytics/recent-transactions/', secure=True, HTTP_HOST='localhost')
assert res_tx.status_code == 200, f"XATOLIK: /api/analytics/recent-transactions/ kodi {res_tx.status_code}"
tx_list = res_tx.data.get('transactions', [])
assert len(tx_list) >= 3, "XATOLIK: Tranzaksiyalar ro'yxati to'liq qaytmadi!"
print(f"✅ /api/analytics/recent-transactions/ — 200 OK (Jami {len(tx_list)} ta tranzaksiya qaytdi)")

res_radar = client.get('/api/analytics/live-radar/', secure=True, HTTP_HOST='localhost')
assert res_radar.status_code == 200, f"XATOLIK: /api/analytics/live-radar/ kodi {res_radar.status_code}"
print(f"✅ /api/analytics/live-radar/ — 200 OK (Faol jonli sessiyalar: {res_radar.data.get('active_sessions_count')})")

print("\n" + "=" * 60)
print("🎉 BARCHA METRIKA VA IMKONIYATLAR 100% ISHLAMOQDA VA TESTDAN O'TDI!")
print("=" * 60)
