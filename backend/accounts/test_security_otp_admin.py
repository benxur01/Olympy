"""Xavfsizlik: OTP majburiy register + admin endpoint 403.

Bu testlar audit talablarini regressiya qilmaslik uchun yozilgan:
 - OTP tasdiqlanmagan telefon bilan register/org-register → 400
 - Muddati o'tgan OTP → 400
 - Iste'mol qilingan (ishlatilgan) OTP qayta ishlatib bo'lmasin
 - Oddiy o'quvchi /api/admin/* va analytics → 403
 - Platform admin → 200 (yoki endpoint bo'sh bo'lsa ham 403 emas)
"""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import PhoneVerification

User = get_user_model()


def _verified_phone(normalized_phone, *, minutes_ago=0):
    return PhoneVerification.objects.create(
        normalized_phone=normalized_phone,
        purpose=PhoneVerification.PURPOSE_REGISTRATION,
        verify_token='tok-' + normalized_phone.replace('+', '') + str(minutes_ago),
        verified_at=timezone.now() - timedelta(minutes=minutes_ago),
    )


class OtpRequiredRegistrationTests(APITestCase):
    def test_register_without_otp_is_400(self):
        url = reverse('register')
        r = self.client.post(url, {
            'full_name': 'No OTP',
            'phone': '+998901000001',
            'password': 'StrongPass123',
            'role': 'student',
        }, format='json')
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(User.objects.filter(normalized_phone='+998901000001').exists())
        detail = str(r.data.get('detail', r.data)).lower()
        self.assertTrue(
            'tasdiq' in detail or 'verif' in detail or 'phone' in detail,
            msg=f'unexpected detail: {r.data}',
        )

    def test_register_with_expired_otp_is_400(self):
        phone = '+998901000002'
        _verified_phone(phone, minutes_ago=30)  # 10 daqiqadan eski
        url = reverse('register')
        r = self.client.post(url, {
            'full_name': 'Expired OTP',
            'phone': phone,
            'password': 'StrongPass123',
            'role': 'student',
        }, format='json')
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(User.objects.filter(normalized_phone=phone).exists())

    def test_register_organization_without_otp_is_400(self):
        url = reverse('register-organization')
        r = self.client.post(url, {
            'full_name': 'Org No OTP',
            'phone': '+998901000003',
            'password': 'StrongPass123',
            'center': {
                'name': 'Test Markaz',
                'organization_type': "O'quv markaz",
                'region': 'Toshkent',
                'district': 'Chilonzor',
            },
        }, format='json')
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(User.objects.filter(normalized_phone='+998901000003').exists())

    def test_register_success_consumes_otp(self):
        """Bir marta ishlatilgan OTP bilan qayta register bo'lmasin."""
        phone = '+998901000004'
        v = _verified_phone(phone)
        url = reverse('register')
        r1 = self.client.post(url, {
            'full_name': 'First User',
            'phone': phone,
            'password': 'StrongPass123',
            'role': 'student',
            'age_confirmed': True,
        }, format='json')
        self.assertEqual(r1.status_code, status.HTTP_201_CREATED)

        # User allaqachon bor — duplicate 400. Lekin verification ham
        # iste'mol qilingan bo'lishi kerak (_recent_verified_phone topmasin).
        v.refresh_from_db()
        # Fallback consume: verified_at 30 daqiqa orqaga surilgan
        self.assertTrue(
            v.verified_at is None
            or v.verified_at < timezone.now() - timedelta(minutes=15)
            or (hasattr(v, 'consumed_at') and v.consumed_at is not None)
            or not PhoneVerification.objects.filter(pk=v.pk).exists()
        )

        # Boshqa telefon bilan o'xshash: consume qilingan verification
        # yangi user uchun ishlamasin — alohida holat yuqorida.
        phone2 = '+998901000005'
        v2 = _verified_phone(phone2)
        # sun'iy consume
        from accounts.views import _consume_phone_verification
        _consume_phone_verification(v2)
        r2 = self.client.post(url, {
            'full_name': 'Second',
            'phone': phone2,
            'password': 'StrongPass123',
            'role': 'student',
            'age_confirmed': True,
        }, format='json')
        self.assertEqual(r2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(User.objects.filter(normalized_phone=phone2).exists())


class AdminForbiddenForNonAdminTests(APITestCase):
    def setUp(self):
        self.student = User.objects.create_user(
            phone='+998902000001',
            password='StrongPass123',
            full_name='Student User',
        )
        self.student.roles = ['student']
        self.student.is_platform_admin = False
        self.student.save()

        self.admin = User.objects.create_user(
            phone='+998902000099',
            password='StrongPass123',
            full_name='Platform Admin',
        )
        self.admin.is_platform_admin = True
        self.admin.save()

    def _auth(self, user):
        self.client.force_authenticate(user=user)

    def test_student_admin_users_403(self):
        self._auth(self.student)
        r = self.client.get(reverse('admin-users-list'))
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

    def test_student_audit_log_403(self):
        self._auth(self.student)
        r = self.client.get(reverse('admin-audit-log'))
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

    def test_student_admin_user_detail_403(self):
        self._auth(self.student)
        r = self.client.get(reverse('admin-user-detail', args=[self.student.id]))
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

    def test_student_admin_user_billing_history_403(self):
        # O'z to'lovlari uchun /api/billing/history/ bor — admin varianti
        # boshqa foydalanuvchinikini ko'rsatadi, shuning uchun faqat admin.
        self._auth(self.student)
        r = self.client.get(reverse('admin-user-billing-history', args=[self.student.id]))
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

    def test_student_admin_user_login_history_403(self):
        self._auth(self.student)
        r = self.client.get(reverse('admin-user-login-history', args=[self.student.id]))
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

    def test_student_admin_reset_user_totp_403(self):
        # 2FA'ni o'chirish — boshqa hisobning xavfsizlik to'sig'ini olib
        # tashlaydi, shuning uchun faqat platforma admini.
        self._auth(self.student)
        r = self.client.post(reverse('admin-reset-user-totp', args=[self.student.id]))
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

    def test_student_admin_force_logout_403(self):
        self._auth(self.student)
        r = self.client.post(reverse('admin-force-logout-user', args=[self.student.id]))
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

    def test_student_admin_impersonate_403(self):
        # "Foydalanuvchi sifatida ko'rish" — boshqa hisobning huquqidagi
        # token beradi, shuning uchun faqat platforma admini.
        self._auth(self.student)
        r = self.client.post(reverse('admin-impersonate-user', args=[self.student.id]))
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

    def test_student_admin_users_export_403(self):
        # CSV eksport butun foydalanuvchilar bazasini (ism + telefon) beradi.
        self._auth(self.student)
        r = self.client.get(reverse('admin-users-export'))
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

    def test_student_admin_bulk_set_active_403(self):
        self._auth(self.student)
        r = self.client.post(
            reverse('admin-bulk-set-user-active'),
            {'user_ids': [self.student.id], 'is_active': False, 'reason': 'Spam'},
            format='json',
        )
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

    def test_student_admin_bulk_set_roles_403(self):
        self._auth(self.student)
        r = self.client.patch(
            reverse('admin-bulk-set-user-roles'),
            {'user_ids': [self.student.id], 'roles': ['teacher']},
            format='json',
        )
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

    def test_student_admin_merge_preview_403(self):
        # Birlashtirish quruq yurishi ham ikki hisobning to'liq raqamini va
        # progress hajmini ochib beradi — faqat platforma admini.
        self._auth(self.student)
        r = self.client.post(
            reverse('admin-merge-users-preview'),
            {'source_id': self.student.id, 'target_id': self.admin.id},
            format='json',
        )
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

    def test_student_admin_merge_commit_403(self):
        self._auth(self.student)
        r = self.client.post(
            reverse('admin-merge-users-commit'),
            {'source_id': self.student.id, 'target_id': self.admin.id},
            format='json',
        )
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

    def test_student_admin_centers_403(self):
        self._auth(self.student)
        r = self.client.get('/api/admin/centers/')
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

    def test_student_analytics_metrics_403(self):
        self._auth(self.student)
        r = self.client.get('/api/analytics/metrics/')
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_admin_users_401(self):
        r = self.client.get(reverse('admin-users-list'))
        self.assertIn(r.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_admin_can_list_users(self):
        self._auth(self.admin)
        r = self.client.get(reverse('admin-users-list'))
        self.assertEqual(r.status_code, status.HTTP_200_OK)

    def test_admin_can_list_centers(self):
        self._auth(self.admin)
        r = self.client.get('/api/admin/centers/')
        self.assertEqual(r.status_code, status.HTTP_200_OK)

    def test_student_cannot_create_subject(self):
        self._auth(self.student)
        r = self.client.post('/api/subjects/', {'name': 'Hack Fan'}, format='json')
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_create_subject(self):
        self._auth(self.admin)
        r = self.client.post('/api/subjects/', {'name': 'Yangi Fan XYZ'}, format='json')
        self.assertIn(r.status_code, (status.HTTP_200_OK, status.HTTP_201_CREATED))
