"""Unit tests for Admin Revenue analytics and B2B Invoicing.
"""
from decimal import Decimal
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from billing.models import PaymentTransaction


@override_settings(SECURE_SSL_REDIRECT=False)
class AdminRevenueTestCase(APITestCase):

    def setUp(self):
        self.admin_user = User.objects.create_superuser(
            phone='+998901112233',
            password='AdminPassword123!',
            full_name='Platform Admin',
            is_platform_admin=True,
        )
        self.student = User.objects.create_user(
            phone='+998901000001',
            password='pw1',
            full_name='Aziz Rahimov',
        )

        PaymentTransaction.objects.create(
            user=self.student,
            provider='payme',
            amount=Decimal('150000.00'),
            status='success',
        )
        PaymentTransaction.objects.create(
            user=self.student,
            provider='click',
            amount=Decimal('200000.00'),
            status='success',
        )

        self.client.force_authenticate(user=self.admin_user)

    def test_revenue_analytics(self):
        resp = self.client.get('/api/billing/admin/revenue/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data['ok'])
        self.assertEqual(resp.data['metrics']['total_revenue'], 350000.0)
        self.assertEqual(resp.data['metrics']['success_count'], 2)
        self.assertEqual(len(resp.data['by_provider']), 2)

    def test_generate_b2b_invoice(self):
        resp = self.client.post(
            '/api/billing/admin/invoice/generate/',
            {
                'buyer_name': 'Everest O‘quv Markazi',
                'buyer_inn': '123456789',
                'amount': 5000000,
                'plan_name': 'Annual Center Pro',
            },
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data['ok'])
        self.assertIn('INV-', resp.data['invoice']['invoice_number'])
        self.assertEqual(resp.data['invoice']['amount'], 5000000.0)
