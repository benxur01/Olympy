"""Kengaytirilgan Admin Foydalanuvchi Nazorati testlari (tests_admin_advanced.py)."""
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import (
    AuditLog,
    CoinTransaction,
    DeviceFingerprint,
    LoginEvent,
    User,
    UserFlashAlert,
)
from attempts.models import TestAttempt, TestSession
from billing.models import PaymentTransaction, UserSubscription
from centers.models import CenterMembership, EducationCenter
from olympiads.models import Olympiad


@override_settings(SECURE_SSL_REDIRECT=False)
class AdminAdvancedUserControlTestCase(APITestCase):
    def setUp(self):
        self.admin_user = User.objects.create_superuser(
            phone='+998901111111',
            password='AdminPassword123!',
            full_name='Platform Admin',
        )
        self.student = User.objects.create_user(
            phone='+998902222222',
            password='StudentPass123!',
            full_name='Ali Valiyev',
            roles=['student'],
        )
        self.center = EducationCenter.objects.create(
            name='Registon O‘quv Markazi',
            owner=self.admin_user,
        )
        self.olympiad = Olympiad.objects.create(
            center=self.center,
            title='Matematika Bahor 2025',
            subject='Matematika',
            duration_minutes=30,
            status=Olympiad.STATUS_ACTIVE,
        )
        self.client.force_authenticate(user=self.admin_user)

    def test_risk_score_calculation(self):
        """Risk score endpoint hisoblashni to'g'ri qaytarishi kerak."""
        # 1 ta disqualified attempt yaratamiz
        TestAttempt.objects.create(
            user=self.student,
            olympiad=self.olympiad,
            score=0,
            disqualified=True,
        )
        url = f'/api/admin/users/{self.student.id}/risk-score/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('risk_score', response.data)
        self.assertGreaterEqual(response.data['risk_score'], 20)
        self.assertIn('factors', response.data)

    def test_live_proctoring_and_termination(self):
        """Jonli test sessiyasi monitoringi va uni to'xtatish."""
        session = TestSession.objects.create(
            user=self.student,
            olympiad=self.olympiad,
            status=TestSession.STATUS_ACTIVE,
        )
        # List
        resp_list = self.client.get('/api/admin/security/live-proctoring/')
        self.assertEqual(resp_list.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(resp_list.data['count'], 1)

        # Terminate
        resp_term = self.client.post(
            f'/api/admin/security/live-proctoring/{session.id}/terminate/',
            {'reason': 'Anticheat buzilishi'},
            format='json',
        )
        self.assertEqual(resp_term.status_code, status.HTTP_200_OK)
        session.refresh_from_db()
        self.assertEqual(session.status, TestSession.STATUS_DISQUALIFIED)
        self.assertIn('Anticheat buzilishi', session.cheating_reason)

    def test_device_fingerprint_and_ban(self):
        """Qurilma izini ro'yxatdan o'tkazish va bloklash."""
        dev = DeviceFingerprint.objects.create(
            user=self.student,
            fingerprint_hash='hash123456789',
            browser_name='Chrome 120',
            os_name='Windows 11',
            ip_address='192.168.1.1',
        )
        # Get devices
        resp = self.client.get(f'/api/admin/users/{self.student.id}/devices/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data['results']), 1)

        # Ban device
        resp_ban = self.client.post(
            '/api/admin/security/devices/ban/',
            {'fingerprint_hash': 'hash123456789', 'reason': 'Spam qurilma'},
            format='json',
        )
        self.assertEqual(resp_ban.status_code, status.HTTP_200_OK)
        dev.refresh_from_db()
        self.assertTrue(dev.is_banned)

        # Unban
        resp_unban = self.client.post(
            '/api/admin/security/devices/unban/',
            {'fingerprint_hash': 'hash123456789'},
            format='json',
        )
        self.assertEqual(resp_unban.status_code, status.HTTP_200_OK)
        dev.refresh_from_db()
        self.assertFalse(dev.is_banned)

    def test_user_timeline_and_heatmap(self):
        """Timeline va Heatmap ma'lumotlari to'g'ri qaytishi kerak."""
        resp_tl = self.client.get(f'/api/admin/users/{self.student.id}/timeline/')
        self.assertEqual(resp_tl.status_code, status.HTTP_200_OK)
        self.assertIn('results', resp_tl.data)

        resp_hm = self.client.get(f'/api/admin/users/{self.student.id}/heatmap/')
        self.assertEqual(resp_hm.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp_hm.data['matrix']), 7)
        self.assertEqual(len(resp_hm.data['matrix'][0]), 24)

    def test_ai_summary(self):
        """AI Diagnostic Summary qaytishi kerak."""
        resp = self.client.get(f'/api/admin/users/{self.student.id}/ai-summary/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn('overview', resp.data)
        self.assertIn('recommendations', resp.data)

    def test_center_transfer(self):
        """O'quvchini markazga biriktirish / ko'chirish."""
        resp = self.client.post(
            f'/api/admin/users/{self.student.id}/transfer-center/',
            {'center_id': self.center.id, 'role': 'student', 'action': 'transfer'},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(
            CenterMembership.objects.filter(user=self.student, center=self.center).exists()
        )

        # Remove from centers
        resp_rem = self.client.post(
            f'/api/admin/users/{self.student.id}/transfer-center/',
            {'action': 'remove'},
            format='json',
        )
        self.assertEqual(resp_rem.status_code, status.HTTP_200_OK)
        self.assertFalse(
            CenterMembership.objects.filter(user=self.student).exists()
        )

    def test_custom_quota_and_discount(self):
        """Maxsus AI kvota va chegirma belgilash."""
        resp = self.client.post(
            f'/api/admin/users/{self.student.id}/set-quota/',
            {
                'custom_practice_quota': 50,
                'custom_discount_percent': 20,
                'discount_days': 14,
            },
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.student.refresh_from_db()
        self.assertEqual(self.student.custom_practice_quota, 50)
        self.assertEqual(self.student.custom_discount_percent, 20)
        self.assertIsNotNone(self.student.custom_discount_until)

    def test_coin_transactions_log(self):
        """Tangalar jurnali to'g'ri ro'yxatga olinishi."""
        CoinTransaction.objects.create(
            user=self.student,
            amount=100,
            balance_after=100,
            transaction_type=CoinTransaction.TYPE_STREAK,
            description='7 kunlik streak mukofoti',
        )
        resp = self.client.get(f'/api/admin/users/{self.student.id}/coin-transactions/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['count'], 1)

    def test_payment_refund(self):
        """To'lovni bekor qilish / refund."""
        tx = PaymentTransaction.objects.create(
            user=self.student,
            amount=99000,
            provider='click',
            status='success',
        )
        self.student.is_premium = True
        self.student.save()

        resp = self.client.post(
            f'/api/admin/billing/transactions/{tx.id}/refund/',
            {'reason': 'Foydalanuvchi iltimosiga ko‘ra'},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        tx.refresh_from_db()
        self.assertEqual(tx.status, 'cancelled')
        self.student.refresh_from_db()
        self.assertFalse(self.student.is_premium)

    def test_flash_alerts(self):
        """Admin foydalanuvchiga modal xabar yuborishi va foydalanuvchi uni o'qishi."""
        # Create alert
        resp = self.client.post(
            f'/api/admin/users/{self.student.id}/flash-alerts/',
            {'title': 'Muhim xabar', 'message': 'Ertaga imtihon bor', 'alert_type': 'urgent'},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        alert_id = resp.data['id']

        # Student o'ziga kelgan alertni ko'radi
        self.client.force_authenticate(user=self.student)
        resp_my = self.client.get('/api/me/flash-alert/')
        self.assertEqual(resp_my.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(resp_my.data['alert'])
        self.assertEqual(resp_my.data['alert']['title'], 'Muhim xabar')

        # Read alert
        resp_read = self.client.post(f'/api/me/flash-alert/{alert_id}/read/', format='json')
        self.assertEqual(resp_read.status_code, status.HTTP_200_OK)

        # Qayta so'raganda None bo'lishi kerak
        resp_my2 = self.client.get('/api/me/flash-alert/')
        self.assertIsNone(resp_my2.data['alert'])

    def test_bulk_user_import(self):
        """Ommaviy foydalanuvchilar import qilish."""
        payload = {
            'users': [
                {
                    'full_name': 'Jasur Karimov',
                    'phone': '+998903333333',
                    'role': 'student',
                    'center_id': self.center.id,
                },
                {
                    'full_name': 'Dilnoza Salimova',
                    'phone': '+998904444444',
                    'role': 'teacher',
                },
            ]
        }
        resp = self.client.post('/api/admin/users/bulk-import/', payload, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['created_count'], 2)
        self.assertTrue(User.objects.filter(normalized_phone='+998903333333').exists())
        self.assertTrue(User.objects.filter(normalized_phone='+998904444444').exists())
