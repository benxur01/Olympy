"""Unit tests for Admin Promocodes and Marketing operations.
"""
from decimal import Decimal
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from billing.models import PromoCode, SubscriptionPlan


@override_settings(SECURE_SSL_REDIRECT=False)
class AdminPromoCodeTestCase(APITestCase):

    def setUp(self):
        self.admin_user = User.objects.create_superuser(
            phone='+998901112233',
            password='AdminPassword123!',
            full_name='Platform Admin',
            is_platform_admin=True,
        )
        self.student = User.objects.create_user(
            phone='+998901000001',
            password='password123',
            full_name='Ahmad Aliyev',
        )
        self.plan = SubscriptionPlan.objects.create(
            name='Standard Plan',
            plan_type='student',
            price=Decimal('100000.00'),
            duration_days=30,
        )
        self.client.force_authenticate(user=self.admin_user)

    def test_create_and_list_promocodes(self):
        # 1. Yaratish
        resp = self.client.post(
            '/api/billing/admin/promocodes/',
            {
                'code': 'OLYMPY2026',
                'description': 'Bahor aksiyasi',
                'discount_type': 'percent',
                'discount_value': '20',
                'max_uses': 50,
            },
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(PromoCode.objects.filter(code='OLYMPY2026').count(), 1)

        # 2. Ro'yxatni olish
        resp_list = self.client.get('/api/billing/admin/promocodes/')
        self.assertEqual(resp_list.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_list.data['count'], 1)

    def test_toggle_and_validate_promocode(self):
        promo = PromoCode.objects.create(
            code='SUPER50',
            discount_type='percent',
            discount_value=Decimal('50'),
            is_active=True,
        )

        # Student sifatida promokodni tekshirish
        self.client.force_authenticate(user=self.student)
        resp_val = self.client.post(
            '/api/billing/promocode/validate/',
            {'code': 'SUPER50', 'plan_id': self.plan.id},
            format='json',
        )
        self.assertEqual(resp_val.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_val.data['discount_amount'], 50000.0)
        self.assertEqual(resp_val.data['final_price'], 50000.0)

        # Admin sifatida uni nofaol qilish
        self.client.force_authenticate(user=self.admin_user)
        resp_toggle = self.client.post(f'/api/billing/admin/promocodes/{promo.id}/toggle/')
        self.assertEqual(resp_toggle.status_code, status.HTTP_200_OK)
        promo.refresh_from_db()
        self.assertFalse(promo.is_active)
