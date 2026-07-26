import json
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import AuditLog, PhoneVerification
from accounts.utils import mask_phone

User = get_user_model()


def _verified_phone(normalized_phone):
    """Helper: create a PhoneVerification row that counts as recently verified.

    register/register-organization views require a PhoneVerification that was
    verified in the last 10 minutes for the given normalized phone. Telegram
    chat_id is left blank so the views skip the Telegram link call entirely.
    """
    return PhoneVerification.objects.create(
        normalized_phone=normalized_phone,
        purpose=PhoneVerification.PURPOSE_REGISTRATION,
        verify_token='tok-' + normalized_phone,
        verified_at=timezone.now(),
    )


class RegistrationTestCase(APITestCase):
    """POST /api/auth/register/ — telefon-asosli ro'yxatdan o'tish."""

    def test_register_success_creates_user(self):
        phone = '+998901112233'
        _verified_phone(phone)
        url = reverse('register')
        response = self.client.post(url, {
            'full_name': 'Ali Valiyev',
            'phone': phone,
            'password': 'StrongPass123',
            'role': 'student',
            'age_confirmed': True,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('user', response.data)
        user = User.objects.get(normalized_phone=phone)
        self.assertEqual(user.full_name, 'Ali Valiyev')
        self.assertIn('student', user.roles)

    def test_register_requires_verified_phone(self):
        """Tasdiqlanmagan telefon bilan ro'yxatdan o'tish 400 qaytaradi."""
        url = reverse('register')
        response = self.client.post(url, {
            'full_name': 'Vali Aliyev',
            'phone': '+998901112244',
            'password': 'StrongPass123',
            'age_confirmed': True,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(User.objects.filter(normalized_phone='+998901112244').exists())

    def test_register_duplicate_phone_rejected(self):
        """Avval ro'yxatdan o'tgan telefon raqam bilan qayta ro'yxatdan o'tib bo'lmaydi."""
        phone = '+998901112255'
        User.objects.create_user(phone=phone, password='StrongPass123', full_name='Mavjud')
        _verified_phone(phone)
        url = reverse('register')
        response = self.client.post(url, {
            'full_name': 'Yangi',
            'phone': phone,
            'password': 'StrongPass123',
            'age_confirmed': True,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_register_weak_password_rejected(self):
        """Django parol validatori zaif parolni rad etadi."""
        phone = '+998901112266'
        _verified_phone(phone)
        url = reverse('register')
        response = self.client.post(url, {
            'full_name': 'Zaif Parol',
            'phone': phone,
            'password': '12345678',  # faqat raqam — Django rad etadi
            'age_confirmed': True,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(User.objects.filter(normalized_phone=phone).exists())

    def test_register_requires_age_confirmation(self):
        phone = '+998901112277'
        _verified_phone(phone)
        url = reverse('register')
        response = self.client.post(url, {
            'full_name': 'Yosh',
            'phone': phone,
            'password': 'StrongPass123',
            'age_confirmed': False,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class SoftDeleteRestoreTestCase(APITestCase):
    """Soft-delete + restore grace period."""

    def setUp(self):
        self.phone = '+998907778899'
        self.password = 'StrongPass123'
        self.user = User.objects.create_user(
            phone=self.phone, password=self.password, full_name='Soft Del',
        )

    def test_soft_delete_and_restore(self):
        self.client.force_authenticate(user=self.user)
        del_url = reverse('delete-my-account')
        response = self.client.delete(del_url, {'password': self.password}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data.get('soft_deleted'))
        self.user.refresh_from_db()
        self.assertFalse(self.user.is_active)
        self.assertIsNotNone(self.user.deleted_at)

        # Login blocked with restorable flag
        login_url = reverse('login')
        self.client.force_authenticate(user=None)
        bad = self.client.post(login_url, {
            'phone': self.phone, 'password': self.password,
        }, format='json')
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST)

        # Restore
        restore_url = reverse('restore-my-account')
        ok = self.client.post(restore_url, {
            'phone': self.phone, 'password': self.password,
        }, format='json')
        self.assertEqual(ok.status_code, status.HTTP_200_OK)
        self.assertTrue(ok.data.get('restored') or ok.data.get('user'))
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_active)
        self.assertIsNone(self.user.deleted_at)


class LoginLogoutTestCase(APITestCase):
    """POST /api/auth/login/ va /api/auth/logout/."""

    def setUp(self):
        self.phone = '+998905556677'
        self.password = 'StrongPass123'
        self.user = User.objects.create_user(
            phone=self.phone, password=self.password, full_name='Login User',
        )

    def test_login_success(self):
        url = reverse('login')
        response = self.client.post(url, {
            'phone': self.phone,
            'password': self.password,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('token', response.data)
        self.assertEqual(response.data['user']['normalized_phone'], self.phone)

    def test_login_wrong_password(self):
        url = reverse('login')
        response = self.client.post(url, {
            'phone': self.phone,
            'password': 'WrongPass999',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_login_inactive_account_blocked(self):
        self.user.is_active = False
        self.user.save(update_fields=['is_active'])
        url = reverse('login')
        response = self.client.post(url, {
            'phone': self.phone,
            'password': self.password,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_logout_returns_ok(self):
        self.client.force_authenticate(user=self.user)
        url = reverse('logout')
        response = self.client.post(url, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data.get('ok'))


class IsPremiumDefaultTestCase(APITestCase):
    """`is_premium` maydoni default False bo'lishi kerak."""

    def test_is_premium_defaults_to_false(self):
        user = User.objects.create_user(
            phone='+998907778899', password='StrongPass123', full_name='Premium Test',
        )
        self.assertFalse(user.is_premium)
        user.refresh_from_db()
        self.assertFalse(user.is_premium)


class ChangePasswordTestCase(APITestCase):
    """POST /api/auth/me/change-password/ — parolni almashtirish."""

    def setUp(self):
        self.old_password = 'OldStrongPass123'
        self.user = User.objects.create_user(
            phone='+998901230099', password=self.old_password, full_name='Pwd User',
        )
        self.client.force_authenticate(user=self.user)

    def test_change_password_success(self):
        url = reverse('change-my-password')
        new_password = 'NewStrongPass456'
        response = self.client.post(url, {
            'old_password': self.old_password,
            'new_password': new_password,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(new_password))
        self.assertFalse(self.user.check_password(self.old_password))

    def test_change_password_wrong_old(self):
        url = reverse('change-my-password')
        response = self.client.post(url, {
            'old_password': 'CompletelyWrong000',
            'new_password': 'NewStrongPass456',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(self.old_password))

    def test_change_password_same_as_old_rejected(self):
        url = reverse('change-my-password')
        response = self.client.post(url, {
            'old_password': self.old_password,
            'new_password': self.old_password,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class PasswordResetTestCase(APITestCase):
    """POST /api/auth/password-reset/confirm/ — Telegram OTP bilan parol tiklash."""

    def setUp(self):
        self.phone = '+998901234321'
        self.user = User.objects.create_user(
            phone=self.phone, password='OldStrongPass123', full_name='Reset User',
        )

    def test_password_reset_confirm_success(self):
        otp = '123456'
        PhoneVerification.objects.create(
            normalized_phone=self.phone,
            purpose=PhoneVerification.PURPOSE_PASSWORD_RESET,
            verify_token='reset-tok',
            otp_hash=make_password(otp),
            otp_expires_at=timezone.now() + timedelta(minutes=5),
        )
        url = reverse('confirm-password-reset')
        new_password = 'BrandNewPass789'
        response = self.client.post(url, {
            'phone': self.phone,
            'otp': otp,
            'password': new_password,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(new_password))


class EmailLinkTestCase(APITestCase):
    """POST /api/auth/email/link/{start,confirm}/ — hisobga email bog'lash."""

    def setUp(self):
        self.user = User.objects.create_user(
            phone='+998901230077', password='StrongPass123', full_name='Email User',
        )
        self.client.force_authenticate(user=self.user)

    def _start(self, email):
        return self.client.post(
            reverse('start-email-link'), {'email': email}, format='json',
        )

    def _confirm(self, otp):
        return self.client.post(
            reverse('confirm-email-link'), {'otp': otp}, format='json',
        )

    def test_link_email_success(self):
        with patch('accounts.views.send_email_verification_code') as sender:
            response = self._start('Owner@Example.COM')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        # Manzil kichik harfga keltiriladi va hali hisobga YOZILMAYDI.
        self.assertEqual(response.data['email'], 'owner@example.com')
        self.user.refresh_from_db()
        self.assertIsNone(self.user.email)

        otp = sender.call_args[0][2]
        response = self._confirm(otp)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, 'owner@example.com')
        self.assertIsNotNone(self.user.email_verified_at)
        self.assertTrue(self.user.email_verified)
        self.assertTrue(response.data['email_verified'])

    def test_confirm_wrong_otp_keeps_email_unlinked(self):
        with patch('accounts.views.send_email_verification_code'):
            self._start('owner@example.com')
        response = self._confirm('000000')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.user.refresh_from_db()
        self.assertIsNone(self.user.email)

    def test_start_rejects_email_of_another_account(self):
        other = User.objects.create_user(
            phone='+998901230078', password='StrongPass123', full_name='Other User',
        )
        other.email = 'taken@example.com'
        other.email_verified_at = timezone.now()
        other.save(update_fields=['email', 'email_verified_at'])

        with patch('accounts.views.send_email_verification_code') as sender:
            response = self._start('taken@example.com')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        sender.assert_not_called()

    def test_relink_replaces_previous_email_only_after_confirm(self):
        with patch('accounts.views.send_email_verification_code') as sender:
            self._start('first@example.com')
            self._confirm(sender.call_args[0][2])
            self._start('second@example.com')
        # Yangisi tasdiqlanmaguncha eski tiklash kanali o'z kuchida.
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, 'first@example.com')

        self._confirm(sender.call_args[0][2])
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, 'second@example.com')

    def test_link_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self._start('anon@example.com')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_multiple_users_without_email_allowed(self):
        """`email` unique, lekin NULL'lar to'qnashmaydi (Postgres/SQLite)."""
        User.objects.create_user(
            phone='+998901230079', password='StrongPass123', full_name='No Email 1',
        )
        User.objects.create_user(
            phone='+998901230080', password='StrongPass123', full_name='No Email 2',
        )
        self.assertEqual(User.objects.filter(email__isnull=True).count(), 3)


class AdminPremiumManagementTestCase(APITestCase):
    """Platform Admin tomonidan premium boshqarilishi testlari."""

    def setUp(self):
        self.admin_user = User.objects.create_superuser(
            phone='+998909999999', password='AdminPass123', full_name='Admin'
        )
        self.admin_user.is_platform_admin = True
        self.admin_user.save()

        self.target_user = User.objects.create_user(
            phone='+998901112233', password='UserPass123', full_name='Normal User'
        )

        from billing.models import SubscriptionPlan
        # Standart student va organization planlarini yaratamiz
        SubscriptionPlan.objects.create(
            name='Standart (1 oy)',
            plan_type='student',
            price=9999.00,
            duration_days=30,
            is_active=True
        )
        SubscriptionPlan.objects.create(
            name='Pro (1 oy)',
            plan_type='student',
            price=29999.00,
            duration_days=30,
            is_active=True
        )

    def test_admin_toggle_premium_duration_based(self):
        url = reverse('admin-toggle-user-premium', kwargs={'user_id': self.target_user.id})
        
        # 1. Tizimga kirmagan holda 401 olishi kerak
        response = self.client.post(url, {'duration': 30, 'plan_type': 'student'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        # 2. Oddiy foydalanuvchi sifatida 403 olishi kerak
        self.client.force_authenticate(user=self.target_user)
        response = self.client.post(url, {'duration': 30, 'plan_type': 'student'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # 3. Admin sifatida kirish
        self.client.force_authenticate(user=self.admin_user)

        # 1. 30 kunlik Student Premium berish
        response = self.client.post(url, {'duration': 30, 'plan_type': 'student'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        self.target_user.refresh_from_db()
        self.assertTrue(self.target_user.is_premium)
        self.assertTrue(self.target_user.subscriptions.filter(is_active=True, plan__plan_type='student').exists())

        # 2. Premium bekor qilish (-1)
        response = self.client.post(url, {'duration': -1}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        self.target_user.refresh_from_db()
        self.assertFalse(self.target_user.is_premium)
        self.assertFalse(self.target_user.subscriptions.filter(is_active=True).exists())

        # 3. Umrbod Premium berish (0)
        response = self.client.post(url, {'duration': 0, 'plan_type': 'organization'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        self.target_user.refresh_from_db()
        self.assertTrue(self.target_user.is_premium)

    def test_admin_toggle_premium_rejected_for_org_bound_roles(self):
        """O'qituvchi/manager hisobiga shaxsiy premium berib bo'lmaydi.

        Ularning premium funksiyalari `SubscriptionService(center)` orqali
        markaz obunasini o'qiydi — shaxsiy grant faqat chalg'ituvchi yozuv
        bo'lardi. Bekor qilish (-1) esa ta'sirsiz eski yozuvlarni tozalash
        uchun ochiq qoladi.
        """
        url = reverse('admin-toggle-user-premium', kwargs={'user_id': self.target_user.id})
        self.client.force_authenticate(user=self.admin_user)

        for roles in (['teacher'], ['manager'], ['teacher', 'manager']):
            self.target_user.roles = roles
            self.target_user.save(update_fields=['roles'])
            response = self.client.post(url, {'duration': 30, 'plan_type': 'student'}, format='json')
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, roles)
            self.target_user.refresh_from_db()
            self.assertFalse(self.target_user.is_premium)
            self.assertFalse(self.target_user.subscriptions.filter(is_active=True).exists())

        # Bekor qilish taqiqlanmaydi (eski, ta'sirsiz grantni tozalash).
        response = self.client.post(url, {'duration': -1}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # O'quvchi va direktor (owner) rollari uchun oldingidek ishlaydi:
        # owner'ga berilgan premium markazga ham tarqaladi.
        for roles in (['student'], ['teacher', 'student'], ['manager', 'owner']):
            self.target_user.roles = roles
            self.target_user.save(update_fields=['roles'])
            response = self.client.post(url, {'duration': 30, 'plan_type': 'student'}, format='json')
            self.assertEqual(response.status_code, status.HTTP_200_OK, roles)
            self.target_user.refresh_from_db()
            self.assertTrue(self.target_user.is_premium)

    def test_admin_toggle_premium_with_plan_name(self):
        url = reverse('admin-toggle-user-premium', kwargs={'user_id': self.target_user.id})
        self.client.force_authenticate(user=self.admin_user)

        # 1. Standart plan_name bilan premium berish
        response = self.client.post(url, {
            'duration': 30,
            'plan_type': 'student',
            'plan_name': 'Standart'
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        self.target_user.refresh_from_db()
        sub = self.target_user.subscriptions.filter(is_active=True).first()
        self.assertIsNotNone(sub)
        self.assertEqual(sub.plan.name, 'Standart (1 oy)')

        # 2. Pro plan_name bilan premium berish (eski obunani yopib yangi ochadi)
        response = self.client.post(url, {
            'duration': 30,
            'plan_type': 'student',
            'plan_name': 'Pro'
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        self.target_user.refresh_from_db()
        sub = self.target_user.subscriptions.filter(is_active=True).first()
        self.assertIsNotNone(sub)
        self.assertEqual(sub.plan.name, 'Pro (1 oy)')


class AdminAccountRecoveryTestCase(APITestCase):
    """Platform Admin qo'lda hisobni tiklash (parol / telefon raqam) testlari."""

    def setUp(self):
        self.admin_user = User.objects.create_superuser(
            phone='+998909999999', password='AdminPass123', full_name='Admin',
        )
        self.other_admin = User.objects.create_user(
            phone='+998908888888', password='AdminPass123', full_name='Other Admin',
            is_platform_admin=True,
        )
        self.target_user = User.objects.create_user(
            phone='+998901112233', password='UserPass123', full_name='Normal User',
        )

    # --- Parolni tiklash -------------------------------------------------

    def _reset_url(self, user):
        return reverse('admin-reset-user-password', kwargs={'user_id': user.id})

    def test_reset_password_requires_platform_admin(self):
        url = self._reset_url(self.target_user)
        response = self.client.post(url, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        self.client.force_authenticate(user=self.target_user)
        response = self.client.post(url, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_reset_password_self_blocked(self):
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(self._reset_url(self.admin_user), {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reset_password_other_admin_blocked(self):
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(self._reset_url(self.other_admin), {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reset_password_success(self):
        old_version = self.target_user.token_version
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(self._reset_url(self.target_user), {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        new_password = response.data['new_password']
        self.assertTrue(new_password)
        self.assertEqual(response.data['user']['id'], self.target_user.id)

        self.target_user.refresh_from_db()
        # Yangi parol haqiqatan o'rnatildi, eskisi ishlamaydi.
        self.assertTrue(self.target_user.check_password(new_password))
        self.assertFalse(self.target_user.check_password('UserPass123'))
        # Mavjud JWT sessiyalar bekor qilindi.
        self.assertEqual(self.target_user.token_version, old_version + 1)

        # Ochiq parol audit logga tushmasligi kerak.
        log = AuditLog.objects.filter(action='admin_password_reset').first()
        self.assertIsNotNone(log)
        self.assertEqual(log.target_id, self.target_user.id)
        self.assertNotIn(new_password, json.dumps(log.extra))

    # --- Telefon raqamni almashtirish ------------------------------------

    def _phone_url(self, user):
        return reverse('admin-change-user-phone', kwargs={'user_id': user.id})

    def test_change_phone_requires_platform_admin(self):
        url = self._phone_url(self.target_user)
        response = self.client.post(url, {'phone': '+998901230000'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        self.client.force_authenticate(user=self.target_user)
        response = self.client.post(url, {'phone': '+998901230000'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_change_phone_self_blocked(self):
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(
            self._phone_url(self.admin_user), {'phone': '+998901230000'}, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_change_phone_other_admin_blocked(self):
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(
            self._phone_url(self.other_admin), {'phone': '+998901230000'}, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_change_phone_invalid_number(self):
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(
            self._phone_url(self.target_user), {'phone': '123'}, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_change_phone_conflict_with_existing_user(self):
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(
            self._phone_url(self.target_user),
            {'phone': self.other_admin.normalized_phone},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.target_user.refresh_from_db()
        self.assertEqual(self.target_user.normalized_phone, '+998901112233')

    def test_change_phone_success(self):
        old_phone = self.target_user.normalized_phone
        old_version = self.target_user.token_version
        # Eski raqamda ochiq parol-tiklash sessiyasi — hisob ko'chgandan keyin
        # u bilan parolni almashtirib bo'lmasligi kerak.
        stale = PhoneVerification.objects.create(
            normalized_phone=old_phone,
            purpose=PhoneVerification.PURPOSE_PASSWORD_RESET,
            verify_token='stale-reset-token',
        )

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(
            self._phone_url(self.target_user), {'phone': '90 123 00 00'}, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.target_user.refresh_from_db()
        self.assertEqual(self.target_user.phone, '+998901230000')
        self.assertEqual(self.target_user.normalized_phone, '+998901230000')
        self.assertEqual(self.target_user.token_version, old_version + 1)
        self.assertFalse(PhoneVerification.objects.filter(pk=stale.pk).exists())

        # Audit logda faqat maskalangan raqamlar.
        log = AuditLog.objects.filter(action='admin_phone_change').first()
        self.assertIsNotNone(log)
        extra_text = json.dumps(log.extra)
        self.assertNotIn(old_phone, extra_text)
        self.assertNotIn('+998901230000', extra_text)
        self.assertEqual(log.extra['new_phone'], mask_phone('+998901230000'))


class StreakProtectionTestCase(APITestCase):
    """Streak protection logic tests for premium users."""

    def test_streak_protection(self):
        from django.utils import timezone
        from datetime import timedelta

        # 1. Normal user (non-premium)
        normal_user = User.objects.create_user(
            phone='+998901110011', password='UserPass123', full_name='Normal User'
        )
        normal_user.streak_count = 5
        # Set last active date to 3 days ago (gap > 1 day)
        normal_user.last_active_date = timezone.now().date() - timedelta(days=3)
        normal_user.save()

        # Update streak
        normal_user.update_streak()
        normal_user.refresh_from_db()
        # Normal user's streak should reset to 1
        self.assertEqual(normal_user.streak_count, 1)

        # 2. Premium user
        premium_user = User.objects.create_user(
            phone='+998901110022', password='UserPass123', full_name='Premium User',
            is_premium=True
        )
        premium_user.streak_count = 5
        premium_user.last_active_date = timezone.now().date() - timedelta(days=3)
        premium_user.save()

        # Update streak
        premium_user.update_streak()
        premium_user.refresh_from_db()
        # Premium user's streak should be protected (incremented from 5 to 6)
        self.assertEqual(premium_user.streak_count, 6)


class PremiumRewardLockedTestCase(APITestCase):
    """Premium locked reward store tests."""

    def setUp(self):
        self.normal_user = User.objects.create_user(
            phone='+998901110033', password='UserPass123', full_name='Normal User'
        )
        self.normal_user.coins = 1000
        self.normal_user.save()

        self.premium_user = User.objects.create_user(
            phone='+998901110044', password='UserPass123', full_name='Premium User',
            is_premium=True
        )
        self.premium_user.coins = 1000
        self.premium_user.save()

        from .models import RewardProduct
        self.premium_reward = RewardProduct.objects.create(
            title="Premium Badge",
            description="Excl premium badge",
            coin_cost=100,
            is_premium_only=True,
            stock=10,
            is_active=True
        )

    def test_list_rewards_premium_flag(self):
        self.client.force_authenticate(user=self.normal_user)
        response = self.client.get(reverse('rewards-list'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        products = response.data.get('products', [])
        found_reward = next((p for p in products if p['id'] == self.premium_reward.id), None)
        self.assertIsNotNone(found_reward)
        self.assertTrue(found_reward['is_premium_only'])

    def test_redeem_reward_premium_protection(self):
        url = reverse('rewards-redeem')
        
        # 1. Normal user should be blocked (403 Forbidden)
        self.client.force_authenticate(user=self.normal_user)
        response = self.client.post(url, {'product_id': self.premium_reward.id}, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data['detail'], "Ushbu mukofot faqat Premium o'quvchilar uchun")

        # 2. Premium user should purchase successfully (200 OK)
        self.client.force_authenticate(user=self.premium_user)
        response = self.client.post(url, {'product_id': self.premium_reward.id}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        self.premium_user.refresh_from_db()
        self.assertEqual(self.premium_user.coins, 900)


class GrowthAnalyticsTestCase(APITestCase):
    """O2: reyting tarixi (score-timeline) + eng zaif 3 mavzu (weakest-topics).

    Premium o'quvchi to'liq 30/90 kunlik tarix va real zaif mavzularni oladi;
    premium bo'lmagan o'quvchi cheklangan (7 kun, limited) tarix va locked
    (bo'sh) zaif mavzular ro'yxatini oladi.
    """

    def setUp(self):
        from django.core.cache import cache
        from centers.models import EducationCenter

        cache.clear()  # is_user_premium 60s cache — testlar orasida tozalaymiz
        self.center = EducationCenter.objects.create(name='Growth Academy', city='Toshkent')

        self.premium_user = User.objects.create_user(
            phone='+998901110055', password='UserPass123', full_name='Premium O',
            is_premium=True,
        )
        self.free_user = User.objects.create_user(
            phone='+998901110066', password='UserPass123', full_name='Free O',
        )

        # Premium o'quvchiga ikki fanda bir nechta urinish — biri yangi (3 kun
        # oldin), biri eski (40 kun oldin). 7 kunlik (free) oynaga faqat
        # yangisi tushadi.
        self._make_olympiad_attempt(
            self.premium_user, subject='Matematika', score=40,
            correct=4, wrong=6, total=10, days_ago=3,
        )
        self._make_olympiad_attempt(
            self.premium_user, subject='Fizika', score=80,
            correct=8, wrong=2, total=10, days_ago=40,
        )
        self._make_olympiad_attempt(
            self.premium_user, subject='Ona tili', score=20,
            correct=2, wrong=8, total=10, days_ago=5,
        )

    def _make_olympiad_attempt(self, user, subject, score, correct, wrong, total, days_ago):
        from attempts.models import TestAttempt
        from olympiads.models import Olympiad

        olympiad = Olympiad.objects.create(
            center=self.center,
            title=f'{subject} Olimpiadasi {days_ago}',
            subject=subject,
            status='active',
            event_type=Olympiad.EVENT_TYPE_OLYMPIAD,
            start_datetime=timezone.now() - timedelta(days=days_ago, minutes=10),
            duration_minutes=60,
        )
        attempt = TestAttempt.objects.create(
            user=user, olympiad=olympiad, score=score,
            correct_count=correct, wrong_count=wrong, total_questions=total,
        )
        # submitted_at auto_now_add — testda o'tmishga ko'chiramiz.
        TestAttempt.objects.filter(pk=attempt.pk).update(
            submitted_at=timezone.now() - timedelta(days=days_ago),
        )
        return attempt

    def test_timeline_premium_full_window(self):
        self.client.force_authenticate(user=self.premium_user)
        resp = self.client.get(reverse('me-score-timeline'), {'days': 90})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data['premium'])
        self.assertFalse(resp.data['limited'])
        self.assertEqual(resp.data['days'], 90)
        # 90 kun ichida 3 urinishning hammasi (3, 40, 5 kun oldin).
        self.assertEqual(len(resp.data['points']), 3)
        # Eskidan yangiga tartiblangan bo'lishi kerak.
        dates = [p['date'] for p in resp.data['points']]
        self.assertEqual(dates, sorted(dates))

    def test_timeline_free_user_limited_to_7_days(self):
        self.client.force_authenticate(user=self.free_user)
        # Free user uchun premium urinishlar emas — o'ziga 1 ta yangi urinish.
        self._make_olympiad_attempt(
            self.free_user, subject='Kimyo', score=50,
            correct=5, wrong=5, total=10, days_ago=2,
        )
        self._make_olympiad_attempt(
            self.free_user, subject='Tarix', score=30,
            correct=3, wrong=7, total=10, days_ago=20,
        )
        resp = self.client.get(reverse('me-score-timeline'), {'days': 90})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertFalse(resp.data['premium'])
        self.assertTrue(resp.data['limited'])
        self.assertEqual(resp.data['days'], 7)       # oyna 7 kunga qisqargan
        self.assertEqual(resp.data['full_days'], 90)  # so'ralgan oyna saqlangan
        # Faqat 7 kun ichidagi urinish (2 kun oldin) — 20 kunlik chiqib ketadi.
        self.assertEqual(len(resp.data['points']), 1)

    def test_weakest_topics_premium(self):
        self.client.force_authenticate(user=self.premium_user)
        resp = self.client.get(reverse('me-weakest-topics'))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data['premium'])
        self.assertFalse(resp.data['locked'])
        topics = resp.data['topics']
        self.assertEqual(len(topics), 3)
        # Eng zaif (eng past foiz) birinchi: Ona tili (20%) < Matematika (40%) < Fizika (80%).
        self.assertEqual(topics[0]['subject'], 'Ona tili')
        self.assertEqual(topics[0]['pct'], 20)
        self.assertLessEqual(topics[0]['pct'], topics[1]['pct'])

    def test_weakest_topics_free_locked(self):
        self.client.force_authenticate(user=self.free_user)
        resp = self.client.get(reverse('me-weakest-topics'))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertFalse(resp.data['premium'])
        self.assertTrue(resp.data['locked'])
        self.assertEqual(resp.data['topics'], [])


class TrialEndingRemindersTestCase(APITestCase):
    """P4: Premium sinovi tugayotgan foydalanuvchilarga konversiya eslatmasi.

    `send_trial_ending_reminders` task'i faqat kerakli foydalanuvchilarga
    (sinovi 3 kun ichida tugaydigan, aktiv, telegram bog'langan, eslatma hali
    yuborilmagan) bir martalik Telegram xabar yuborishini va
    `trial_reminder_sent_at`'ni o'rnatishini tekshiradi. Trial davrida user
    `is_premium=True` bo'lgani uchun (ro'yxatdan o'tishda shunday qo'yiladi)
    tanlash aynan `premium_trial_end` maydoniga qarab amalga oshadi.

    Haqiqiy yuborish endi `select_for_update()` qulfi tashqarisida, alohida
    `send_telegram_otp_task` Celery subtask'iga ko'chirilgan (lock contention
    oldini olish uchun) — shu sabab `_send_telegram_message`ni emas, aynan
    shu subtask'ning `.delay()` chaqiruvini mock qilamiz. Eslatma: token yo'q
    muhitda (CI) `_send_telegram_message`ni to'g'ridan-to'g'ri mock qilish
    ishlamaydi — `send_telegram_otp_task` ichida `_telegram_bot_token()`
    tekshiruvi ishlamay qolgan tokendan oldinroq `no_token` bilan chiqib
    ketadi va mock hech qachon chaqirilmaydi.
    """

    def _make_attempt(self, user, score, days_ago=2):
        from attempts.models import TestAttempt
        from centers.models import EducationCenter
        from olympiads.models import Olympiad

        center = EducationCenter.objects.create(name='Trial Academy', city='Toshkent')
        olympiad = Olympiad.objects.create(
            center=center,
            title=f'Trial Olimpiada {user.id}-{days_ago}-{score}',
            subject='Matematika',
            status='active',
            event_type=Olympiad.EVENT_TYPE_OLYMPIAD,
            start_datetime=timezone.now() - timedelta(days=days_ago, minutes=10),
            duration_minutes=60,
        )
        attempt = TestAttempt.objects.create(
            user=user, olympiad=olympiad, score=score,
            correct_count=score // 10, wrong_count=10 - score // 10, total_questions=10,
        )
        TestAttempt.objects.filter(pk=attempt.pk).update(
            submitted_at=timezone.now() - timedelta(days=days_ago),
        )
        return attempt

    @patch('accounts.tasks.send_telegram_otp_task.delay')
    def test_reminder_sent_for_ending_trial(self, mock_delay):
        """Sinovi 2 kun ichida tugaydigan, telegram bog'langan, aktiv trial
        userga eslatma yuboriladi va trial_reminder_sent_at o'rnatiladi.
        Trial davrida user is_premium=True bo'ladi — aynan shu holat avval
        noto'g'ri is_premium=False filteri tufayli hech qachon tanlanmas edi."""
        from accounts.tasks import send_trial_ending_reminders

        user = User.objects.create_user(
            phone='+998901119001', password='UserPass123', full_name='Trial User',
            is_premium=True,
        )
        user.premium_trial_end = timezone.now() + timedelta(days=2)
        user.telegram_chat_id = '123456'
        user.save()
        self._make_attempt(user, score=80, days_ago=2)

        result = send_trial_ending_reminders()

        self.assertEqual(result, {'sent': 1, 'skipped': 0})
        mock_delay.assert_called_once()
        # Xabarda real statistika (test soni / o'rtacha ball) bo'lishi kerak.
        sent_text = mock_delay.call_args.args[1]
        self.assertIn('1 ta test', sent_text)
        user.refresh_from_db()
        self.assertIsNotNone(user.trial_reminder_sent_at)

    @patch('accounts.tasks.send_telegram_otp_task.delay')
    def test_no_trial_user_skipped(self, mock_delay):
        """Trial muddati yo'q (premium_trial_end IS NULL) userga yuborilmaydi —
        eslatma faqat amal qiluvchi trial muddatiga bog'lanadi, sof pullik /
        oddiy userlarga emas."""
        from accounts.tasks import send_trial_ending_reminders

        user = User.objects.create_user(
            phone='+998901119002', password='UserPass123', full_name='Paid User',
            is_premium=True,
        )
        # premium_trial_end o'rnatilmaydi (NULL) — faqat pullik obuna.
        user.telegram_chat_id = '123457'
        user.save()

        result = send_trial_ending_reminders()

        self.assertEqual(result, {'sent': 0, 'skipped': 0})
        mock_delay.assert_not_called()
        user.refresh_from_db()
        self.assertIsNone(user.trial_reminder_sent_at)

    @patch('accounts.tasks.send_telegram_otp_task.delay')
    def test_inactive_user_skipped(self, mock_delay):
        """is_active=False (bloklangan/o'chirilgan) userga yuborilmaydi."""
        from accounts.tasks import send_trial_ending_reminders

        user = User.objects.create_user(
            phone='+998901119007', password='UserPass123', full_name='Inactive User',
            is_premium=True,
        )
        user.premium_trial_end = timezone.now() + timedelta(days=2)
        user.telegram_chat_id = '123461'
        user.is_active = False
        user.save()

        result = send_trial_ending_reminders()

        self.assertEqual(result, {'sent': 0, 'skipped': 0})
        mock_delay.assert_not_called()
        user.refresh_from_db()
        self.assertIsNone(user.trial_reminder_sent_at)

    @patch('accounts.tasks.send_telegram_otp_task.delay')
    def test_far_trial_skipped(self, mock_delay):
        """Sinovi 10 kundan keyin tugaydigan userga hali yuborilmaydi."""
        from accounts.tasks import send_trial_ending_reminders

        user = User.objects.create_user(
            phone='+998901119003', password='UserPass123', full_name='Far Trial',
            is_premium=False,
        )
        user.premium_trial_end = timezone.now() + timedelta(days=10)
        user.telegram_chat_id = '123458'
        user.save()

        result = send_trial_ending_reminders()

        self.assertEqual(result, {'sent': 0, 'skipped': 0})
        mock_delay.assert_not_called()

    @patch('accounts.tasks.send_telegram_otp_task.delay')
    def test_already_reminded_not_resent(self, mock_delay):
        """trial_reminder_sent_at allaqachon o'rnatilgan userga qayta yuborilmaydi."""
        from accounts.tasks import send_trial_ending_reminders

        already = timezone.now() - timedelta(days=1)
        user = User.objects.create_user(
            phone='+998901119004', password='UserPass123', full_name='Reminded User',
            is_premium=False,
        )
        user.premium_trial_end = timezone.now() + timedelta(days=2)
        user.telegram_chat_id = '123459'
        user.trial_reminder_sent_at = already
        user.save()

        result = send_trial_ending_reminders()

        self.assertEqual(result, {'sent': 0, 'skipped': 0})
        mock_delay.assert_not_called()
        user.refresh_from_db()
        # Eski vaqt o'zgarmasligi kerak.
        self.assertEqual(user.trial_reminder_sent_at, already)

    @patch('accounts.tasks.send_telegram_otp_task.delay')
    def test_no_telegram_skipped(self, mock_delay):
        """telegram_chat_id bo'sh user — yuborilmaydi (skip)."""
        from accounts.tasks import send_trial_ending_reminders

        user = User.objects.create_user(
            phone='+998901119005', password='UserPass123', full_name='No TG User',
            is_premium=False,
        )
        user.premium_trial_end = timezone.now() + timedelta(days=2)
        user.telegram_chat_id = ''
        user.save()

        result = send_trial_ending_reminders()

        self.assertEqual(result, {'sent': 0, 'skipped': 0})
        mock_delay.assert_not_called()
        user.refresh_from_db()
        self.assertIsNone(user.trial_reminder_sent_at)

    @patch('accounts.tasks.send_telegram_otp_task.delay')
    def test_no_attempts_uses_generic_message(self, mock_delay):
        """Bu oy test ishlamagan userga umumiy (soxta raqamsiz) matn yuboriladi."""
        from accounts.tasks import send_trial_ending_reminders

        user = User.objects.create_user(
            phone='+998901119006', password='UserPass123', full_name='Quiet User',
            is_premium=False,
        )
        user.premium_trial_end = timezone.now() + timedelta(days=1)
        user.telegram_chat_id = '123460'
        user.save()

        result = send_trial_ending_reminders()

        self.assertEqual(result, {'sent': 1, 'skipped': 0})
        sent_text = mock_delay.call_args.args[1]
        # Statistika yo'q — "N ta test" iborasi bo'lmasligi kerak.
        self.assertNotIn('ta test ishladingiz', sent_text)
        user.refresh_from_db()
        self.assertIsNotNone(user.trial_reminder_sent_at)


class ExpireStalePremiumTestCase(APITestCase):
    """`expire_stale_premium` task'i: muddati tugagan premiumni toplu tozalash.

    `/me` dagi lazy-expiry faqat foydalanuvchi so'rov yuborganda ishlaydi —
    qaytmagan foydalanuvchida `is_premium` bazada True bo'lib qolardi. Task
    o'sha mantiqni kunda bir marta batch tarzda takrorlaydi.

    Eslatma: `UserSubscription.save()` → `sync_premium_status()` obunani
    saqlashda bayroqlarni o'zi sinxronlaydi, shuning uchun "muddati o'tgan,
    lekin hali aktiv" holatni yaratish uchun obuna kelajakdagi sana bilan
    yaratilib, keyin `.update()` (save()'siz) orqali o'tmishga suriladi —
    aynan production'dagi eskirgan yozuv holati.
    """

    def setUp(self):
        from billing.models import SubscriptionPlan

        self.student_plan = SubscriptionPlan.objects.create(
            name='Pro (1 oy)', plan_type='student', price=29999.00,
            duration_days=30, is_active=True,
        )
        self.org_plan = SubscriptionPlan.objects.create(
            name='Plus (1 oy)', plan_type='organization', price=99999.00,
            duration_days=30, is_active=True,
        )

    def _sub(self, user, plan, days):
        """`days` kundan keyin/oldin tugaydigan aktiv obuna yaratadi.

        Manfiy `days` — muddati o'tgan, lekin `is_active=True` bo'lib qolgan
        yozuv (sync_premium_status ishlab ketmasligi uchun `.update()` bilan).
        """
        from billing.models import UserSubscription

        sub = UserSubscription.objects.create(
            user=user, plan=plan, start_date=timezone.now() - timedelta(days=60),
            end_date=timezone.now() + timedelta(days=abs(days)), is_active=True,
        )
        if days < 0:
            UserSubscription.objects.filter(pk=sub.pk).update(
                end_date=timezone.now() + timedelta(days=days),
            )
        return sub

    def _user(self, phone, **kwargs):
        user = User.objects.create_user(
            phone=phone, password='UserPass123', full_name='Premium User',
        )
        if kwargs:
            User.objects.filter(pk=user.pk).update(**kwargs)
            user.refresh_from_db()
        return user

    def test_expired_trial_without_subscription_is_cleared(self):
        """Sinovi tugagan va obunasi yo'q userda bayroq o'chadi."""
        from accounts.tasks import expire_stale_premium

        user = self._user(
            '+998901118001', is_premium=True,
            premium_trial_end=timezone.now() - timedelta(days=1),
        )

        result = expire_stale_premium()

        user.refresh_from_db()
        self.assertFalse(user.is_premium)
        self.assertEqual(result['cleared_users'], 1)

    def test_active_trial_or_subscription_is_untouched(self):
        """Sinovi yoki obunasi hali amal qiladigan userlar tegilmaydi."""
        from accounts.tasks import expire_stale_premium

        trial_user = self._user(
            '+998901118002', is_premium=True,
            premium_trial_end=timezone.now() + timedelta(days=3),
        )
        sub_user = self._user('+998901118003', is_premium=True)
        self._sub(sub_user, self.student_plan, days=10)
        # Sinovi tugagan, lekin pullik obunaga o'tgan user ham premium qoladi —
        # ikki manba mustaqil, faqat IKKALASI ham tugaganda bayroq o'chadi.
        converted_user = self._user(
            '+998901118004', is_premium=True,
            premium_trial_end=timezone.now() - timedelta(days=5),
        )
        self._sub(converted_user, self.student_plan, days=20)

        result = expire_stale_premium()

        for user in (trial_user, sub_user, converted_user):
            user.refresh_from_db()
            self.assertTrue(user.is_premium)
        self.assertEqual(result['cleared_users'], 0)

    def test_expired_subscription_rows_are_deactivated(self):
        """Muddati o'tgan obuna yozuvi `is_active=False` ga o'tadi."""
        from accounts.tasks import expire_stale_premium

        user = self._user('+998901118005', is_premium=True)
        expired = self._sub(user, self.student_plan, days=-2)
        still_valid = self._sub(self._user('+998901118006'), self.student_plan, days=5)

        result = expire_stale_premium()

        expired.refresh_from_db()
        still_valid.refresh_from_db()
        self.assertFalse(expired.is_active)
        self.assertTrue(still_valid.is_active)
        self.assertEqual(result['expired_subscriptions'], 1)
        user.refresh_from_db()
        self.assertFalse(user.is_premium)

    def test_center_premium_cleared_when_org_subscription_expired(self):
        """Egasining tashkilot obunasi tugagan markaz premiumdan chiqadi,
        amal qiluvchi obunali markaz esa tegilmaydi."""
        from accounts.tasks import expire_stale_premium
        from centers.models import EducationCenter

        lapsed_owner = self._user('+998901118007', is_premium=True)
        self._sub(lapsed_owner, self.org_plan, days=-1)
        lapsed_center = EducationCenter.objects.create(
            name='Lapsed Academy', city='Toshkent', owner=lapsed_owner,
            status=EducationCenter.STATUS_APPROVED, is_premium=True,
        )

        paying_owner = self._user('+998901118008', is_premium=True)
        self._sub(paying_owner, self.org_plan, days=15)
        paying_center = EducationCenter.objects.create(
            name='Paying Academy', city='Samarqand', owner=paying_owner,
            status=EducationCenter.STATUS_APPROVED, is_premium=True,
        )

        result = expire_stale_premium()

        lapsed_center.refresh_from_db()
        paying_center.refresh_from_db()
        self.assertFalse(lapsed_center.is_premium)
        self.assertTrue(paying_center.is_premium)
        self.assertEqual(result['cleared_centers'], 1)

    def test_admin_granted_center_premium_is_preserved(self):
        """Obunasiz (platforma admini qo'lda bergan) markaz premiumi saqlanadi.

        `SubscriptionService` bunday markazni "lifetime/admin premium —
        limitsiz" deb qabul qiladi; sweep uni o'chirsa markaz bepul limitlarga
        tushib qolardi. `/me` ham bunday markazga tegmaydi.
        """
        from accounts.tasks import expire_stale_premium
        from centers.models import EducationCenter

        owner = self._user('+998901118009', is_premium=True)
        # Faqat SHAXSIY (student) obunasi tugaydi — markaz premiumi tashkilot
        # obunasidan kelmagan, shuning uchun unga daxl qilinmaydi.
        self._sub(owner, self.student_plan, days=-3)
        center = EducationCenter.objects.create(
            name='Lifetime Academy', city='Buxoro', owner=owner,
            status=EducationCenter.STATUS_APPROVED, is_premium=True,
        )

        result = expire_stale_premium()

        center.refresh_from_db()
        self.assertTrue(center.is_premium)
        self.assertEqual(result['cleared_centers'], 0)

    def test_task_is_idempotent(self):
        """Takroriy ishga tushirishda hech narsa qayta ishlanmaydi."""
        from accounts.tasks import expire_stale_premium

        user = self._user(
            '+998901118010', is_premium=True,
            premium_trial_end=timezone.now() - timedelta(days=1),
        )
        self._sub(user, self.student_plan, days=-4)

        first = expire_stale_premium()
        second = expire_stale_premium()

        self.assertEqual(first['cleared_users'], 1)
        self.assertEqual(first['expired_subscriptions'], 1)
        self.assertEqual(
            second,
            {'expired_subscriptions': 0, 'cleared_users': 0, 'cleared_centers': 0},
        )


class StudentTierGatingTestCase(APITestCase):
    """Tier-ga asoslangan gating: competitor/study-plan (Plus), prep-plan/
    ai-audio (Pro), score-timeline (Pro 365), va Standart baseline endpointlar."""

    def setUp(self):
        from django.core.cache import cache
        from billing.models import SubscriptionPlan, UserSubscription
        from centers.models import EducationCenter

        cache.clear()  # is_user_premium 60s cache — testlar orasida tozalaymiz
        self.center = EducationCenter.objects.create(name='Gating Academy', city='Toshkent')
        SubscriptionPlan.objects.filter(plan_type='student').delete()
        self._Sub = UserSubscription
        self.standart_plan = SubscriptionPlan.objects.create(
            name='Standart (1 oy)', plan_type='student', price=9999.00,
            duration_days=30, is_active=True,
        )
        self.plus_plan = SubscriptionPlan.objects.create(
            name='Plus (1 oy)', plan_type='student', price=19999.00,
            duration_days=30, is_active=True,
        )
        self.pro_plan = SubscriptionPlan.objects.create(
            name='Pro (1 oy)', plan_type='student', price=29999.00,
            duration_days=30, is_active=True,
        )
        self.standart_user = self._make('+998903000001', self.standart_plan)
        self.plus_user = self._make('+998903000002', self.plus_plan)
        self.pro_user = self._make('+998903000003', self.pro_plan)

    def _make(self, phone, plan):
        user = User.objects.create_user(phone=phone, password='UserPass123', is_premium=True)
        self._Sub.objects.create(
            user=user, plan=plan, is_active=True,
            end_date=timezone.now() + timedelta(days=30),
        )
        return user

    def _make_attempt(self, user, subject='Matematika', score=40, days_ago=2):
        from attempts.models import TestAttempt
        from olympiads.models import Olympiad
        olympiad = Olympiad.objects.create(
            center=self.center, title=f'{subject} Olimpiadasi',
            subject=subject, status='active',
            event_type=Olympiad.EVENT_TYPE_OLYMPIAD,
            start_datetime=timezone.now() - timedelta(days=days_ago, minutes=10),
            duration_minutes=60,
        )
        a = TestAttempt.objects.create(
            user=user, olympiad=olympiad, score=score,
            correct_count=4, wrong_count=6, total_questions=10,
        )
        TestAttempt.objects.filter(pk=a.pk).update(
            submitted_at=timezone.now() - timedelta(days=days_ago),
        )
        return olympiad, a

    # ── competitor_analysis — Plus+ ─────────────────────────────────────────
    def test_competitor_standart_403(self):
        self.client.force_authenticate(user=self.standart_user)
        resp = self.client.get(reverse('me-competitor-analysis'))
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp.data.get('required_tier'), 'plus')

    def test_competitor_plus_200(self):
        self.client.force_authenticate(user=self.plus_user)
        resp = self.client.get(reverse('me-competitor-analysis'))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    # ── study_plan — Plus+ ──────────────────────────────────────────────────
    def test_study_plan_standart_403(self):
        self.client.force_authenticate(user=self.standart_user)
        resp = self.client.post(reverse('me-study-plan'), {}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp.data.get('required_tier'), 'plus')

    def test_study_plan_plus_200(self):
        self.client.force_authenticate(user=self.plus_user)
        resp = self.client.post(reverse('me-study-plan'), {}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    # ── olympiad_prep_plan — Pro only ───────────────────────────────────────
    def test_prep_plan_plus_403(self):
        self.client.force_authenticate(user=self.plus_user)
        resp = self.client.post(reverse('me-olympiad-prep-plan'), {}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp.data.get('required_tier'), 'pro')

    def test_prep_plan_pro_200(self):
        olympiad, _ = self._make_attempt(self.pro_user)
        self.client.force_authenticate(user=self.pro_user)
        resp = self.client.post(
            reverse('me-olympiad-prep-plan'), {'olympiad_id': olympiad.id}, format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    # ── ai_audio_analysis — Pro only ────────────────────────────────────────
    def test_ai_audio_plus_403(self):
        self.client.force_authenticate(user=self.plus_user)
        resp = self.client.post(reverse('me-ai-audio-analysis'), {}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp.data.get('required_tier'), 'pro')

    def test_ai_audio_pro_200(self):
        _, attempt = self._make_attempt(self.pro_user)
        self.client.force_authenticate(user=self.pro_user)
        resp = self.client.post(
            reverse('me-ai-audio-analysis'), {'attempt_id': attempt.id}, format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        # Telegram ulanmagan — no_telegram statusi (tashqi chaqiruv yo'q).
        self.assertEqual(resp.data.get('status'), 'no_telegram')

    # ── score_timeline — 365 faqat Pro uchun ────────────────────────────────
    def test_timeline_plus_365_clamped_to_90(self):
        self.client.force_authenticate(user=self.plus_user)
        resp = self.client.get(reverse('me-score-timeline'), {'days': 365})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        # Plus 365 so'rasa 90 ga tushadi (xato emas).
        self.assertEqual(resp.data['days'], 90)
        self.assertEqual(resp.data['full_days'], 90)

    def test_timeline_pro_gets_365(self):
        self.client.force_authenticate(user=self.pro_user)
        resp = self.client.get(reverse('me-score-timeline'), {'days': 365})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['days'], 365)
        self.assertEqual(resp.data['full_days'], 365)

    # ── Standart baseline endpointlar 200 bo'lib qolishi kerak ──────────────
    def test_standart_baseline_endpoints_still_200(self):
        self.client.force_authenticate(user=self.standart_user)
        for name in ('me-history-chart', 'me-readiness', 'me-weakest-topics'):
            url = reverse(name)
            if name == 'me-readiness':
                olympiad, _ = self._make_attempt(self.standart_user)
                resp = self.client.get(url, {'olympiad_id': olympiad.id})
            else:
                resp = self.client.get(url)
            self.assertEqual(resp.status_code, status.HTTP_200_OK,
                             msg=f'{name} Standart uchun 200 bo\'lishi kerak')


class DailyPracticeSetTestCase(APITestCase):
    """Feature 1: Kunlik AI mashq to'plami (Daily AI Practice Set).

    Standart+ gate; kuniga bir marta generatsiya (repeat → saqlangan to'plam,
    AI qayta chaqirilmaydi); eng zaif fan tanlash mantig'i. generate_questions
    patch qilinadi — haqiqiy Gemini chaqiruvi bo'lmaydi.
    """

    _FAKE_QUESTIONS = [
        {
            'subject': 'Matematika', 'text': f"Test savol {i}?",
            'options': ['A', 'B', 'C', 'D'], 'correct_answer': i % 4,
            'score': 3, 'difficulty': 'medium', 'source': 'ai',
        }
        for i in range(5)
    ]

    def setUp(self):
        from django.core.cache import cache
        from billing.models import SubscriptionPlan, UserSubscription
        from centers.models import EducationCenter

        cache.clear()  # is_user_premium 60s cache + throttle keshi
        self.center = EducationCenter.objects.create(name='Daily Academy', city='Toshkent')
        SubscriptionPlan.objects.filter(plan_type='student').delete()
        self._Sub = UserSubscription
        self.standart_plan = SubscriptionPlan.objects.create(
            name='Standart (1 oy)', plan_type='student', price=9999.00,
            duration_days=30, is_active=True,
        )
        self.free_user = User.objects.create_user(
            phone='+998905000000', password='UserPass123', is_premium=False,
        )
        self.standart_user = self._make_standart('+998905000001')

    def _make_standart(self, phone):
        user = User.objects.create_user(phone=phone, password='UserPass123', is_premium=True)
        self._Sub.objects.create(
            user=user, plan=self.standart_plan, is_active=True,
            end_date=timezone.now() + timedelta(days=30),
        )
        return user

    def _make_attempt(self, user, subject, correct, total):
        from attempts.models import TestAttempt
        from olympiads.models import Olympiad
        olympiad = Olympiad.objects.create(
            center=self.center, title=f'{subject} Olimpiadasi',
            subject=subject, status='active',
            event_type=Olympiad.EVENT_TYPE_OLYMPIAD,
            start_datetime=timezone.now() - timedelta(days=2, minutes=10),
            duration_minutes=60,
        )
        return TestAttempt.objects.create(
            user=user, olympiad=olympiad, score=correct * 10,
            correct_count=correct, wrong_count=total - correct, total_questions=total,
        )

    def test_free_user_403(self):
        self.client.force_authenticate(user=self.free_user)
        resp = self.client.get(reverse('me-daily-practice'))
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp.data.get('required_tier'), 'standart')

    @patch('questions.ai_generation.generate_questions')
    def test_standart_user_200_five_questions(self, mock_gen):
        mock_gen.return_value = {'ok': True, 'questions': self._FAKE_QUESTIONS, 'error': ''}
        self.client.force_authenticate(user=self.standart_user)
        resp = self.client.get(reverse('me-daily-practice'))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data['questions']), 5)
        mock_gen.assert_called_once()

    @patch('questions.ai_generation.generate_questions')
    def test_repeat_same_day_uses_cached_set(self, mock_gen):
        mock_gen.return_value = {'ok': True, 'questions': self._FAKE_QUESTIONS, 'error': ''}
        self.client.force_authenticate(user=self.standart_user)
        first = self.client.get(reverse('me-daily-practice'))
        second = self.client.get(reverse('me-daily-practice'))
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        # Ikkinchi so'rov aynan saqlangan to'plamni qaytaradi.
        self.assertEqual(first.data['questions'], second.data['questions'])
        # AI faqat bir marta chaqirilishi kerak (kuniga bitta generatsiya).
        mock_gen.assert_called_once()

    @patch('questions.ai_generation.generate_questions')
    def test_weakest_subject_selected(self, mock_gen):
        mock_gen.return_value = {'ok': True, 'questions': self._FAKE_QUESTIONS, 'error': ''}
        # Fizika kuchli (90%), Kimyo zaif (20%) → eng zaif Kimyo tanlanishi kerak.
        self._make_attempt(self.standart_user, 'Fizika', correct=9, total=10)
        self._make_attempt(self.standart_user, 'Kimyo', correct=2, total=10)
        self.client.force_authenticate(user=self.standart_user)
        resp = self.client.get(reverse('me-daily-practice'))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['subject'], 'Kimyo')
        self.assertEqual(mock_gen.call_args.kwargs.get('subject'), 'Kimyo')

    @patch('questions.ai_generation.generate_questions')
    def test_ai_failure_does_not_cache_broken_row(self, mock_gen):
        from accounts.models import DailyPracticeSet
        mock_gen.return_value = {'ok': False, 'questions': [], 'error': 'AI xato'}
        self.client.force_authenticate(user=self.standart_user)
        resp = self.client.get(reverse('me-daily-practice'))
        self.assertEqual(resp.status_code, status.HTTP_502_BAD_GATEWAY)
        # Buzuq (bo'sh) to'plam saqlanmasligi kerak.
        self.assertEqual(DailyPracticeSet.objects.filter(user=self.standart_user).count(), 0)

    @patch('questions.ai_generation.generate_questions')
    def test_submit_persists_and_marks_completed(self, mock_gen):
        # Topshirilgan javoblar saqlanadi va keyingi GET "bajarilgan" holatni
        # qaytaradi — kun davomida qayta ochilganda mashq qaytadan chiqmaydi.
        mock_gen.return_value = {'ok': True, 'questions': self._FAKE_QUESTIONS, 'error': ''}
        self.client.force_authenticate(user=self.standart_user)
        self.client.get(reverse('me-daily-practice'))  # to'plamni generatsiya

        submit = self.client.post(
            reverse('me-daily-practice-submit'),
            {'answers': {'0': 1, '1': 2}}, format='json',
        )
        self.assertEqual(submit.status_code, status.HTTP_200_OK)
        self.assertTrue(submit.data['submitted'])
        self.assertEqual(submit.data['answers'], {'0': 1, '1': 2})

        # Keyingi GET topshirilgan holatni qaytaradi.
        again = self.client.get(reverse('me-daily-practice'))
        self.assertTrue(again.data['submitted'])
        self.assertEqual(again.data['answers'], {'0': 1, '1': 2})

    @patch('questions.ai_generation.generate_questions')
    def test_submit_is_idempotent(self, mock_gen):
        # Ikkinchi topshirish birinchi javoblarni qayta yozmaydi.
        mock_gen.return_value = {'ok': True, 'questions': self._FAKE_QUESTIONS, 'error': ''}
        self.client.force_authenticate(user=self.standart_user)
        self.client.get(reverse('me-daily-practice'))
        self.client.post(reverse('me-daily-practice-submit'),
                         {'answers': {'0': 1}}, format='json')
        second = self.client.post(reverse('me-daily-practice-submit'),
                                  {'answers': {'0': 3}}, format='json')
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(second.data['answers'], {'0': 1})

    def test_submit_without_set_404(self):
        self.client.force_authenticate(user=self.standart_user)
        resp = self.client.post(reverse('me-daily-practice-submit'),
                                {'answers': {'0': 1}}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_submit_free_user_403(self):
        self.client.force_authenticate(user=self.free_user)
        resp = self.client.post(reverse('me-daily-practice-submit'),
                                {'answers': {'0': 1}}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_throttle_scope_is_dedicated_not_shared_ai(self):
        # Passiv, dashboard'da avtomatik so'raladigan widget umumiy 'ai' scope'ini
        # (explain_question/explain_all_mistakes/study_plan bilan bo'linadigan)
        # ISHLATMASLIGI kerak — aks holda boshqa AI tugmalari bucket'ni tugatib
        # bu widget 429 qaytarardi. Alohida 'ai_daily_practice' scope.
        from accounts.views_student import daily_practice_set
        self.assertEqual(daily_practice_set.cls.throttle_scope, 'ai_daily_practice')


class CustomAITestTestCase(APITestCase):
    """Feature 3: Shaxsiy AI test generatori (Custom AI Test Builder).

    Plus+ gate; har so'rov bir martalik generatsiya (saqlanmaydi). subject/topic
    majburiy. generate_questions patch qilinadi — haqiqiy Gemini chaqiruvi yo'q.
    """

    _FAKE_QUESTIONS = [
        {
            'subject': 'Matematika', 'text': f"Test savol {i}?",
            'options': ['A', 'B', 'C', 'D'], 'correct_answer': i % 4,
            'score': 3, 'difficulty': 'medium', 'source': 'ai',
        }
        for i in range(10)
    ]

    def setUp(self):
        from django.core.cache import cache
        from billing.models import SubscriptionPlan, UserSubscription

        cache.clear()  # is_user_premium 60s cache + throttle keshi
        SubscriptionPlan.objects.filter(plan_type='student').delete()
        self._Sub = UserSubscription
        self.standart_plan = SubscriptionPlan.objects.create(
            name='Standart (1 oy)', plan_type='student', price=9999.00,
            duration_days=30, is_active=True,
        )
        self.plus_plan = SubscriptionPlan.objects.create(
            name='Plus (1 oy)', plan_type='student', price=19999.00,
            duration_days=30, is_active=True,
        )
        self.standart_user = self._make('+998906000001', self.standart_plan)
        self.plus_user = self._make('+998906000002', self.plus_plan)

    def _make(self, phone, plan):
        user = User.objects.create_user(phone=phone, password='UserPass123', is_premium=True)
        self._Sub.objects.create(
            user=user, plan=plan, is_active=True,
            end_date=timezone.now() + timedelta(days=30),
        )
        return user

    def test_standart_user_403(self):
        self.client.force_authenticate(user=self.standart_user)
        resp = self.client.post(
            reverse('me-custom-test'),
            {'subject': 'Matematika', 'topic': 'Kvadrat tenglamalar'},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp.data.get('required_tier'), 'plus')

    @patch('questions.ai_generation.generate_questions')
    def test_plus_user_200_ten_questions(self, mock_gen):
        mock_gen.return_value = {'ok': True, 'questions': self._FAKE_QUESTIONS, 'error': ''}
        self.client.force_authenticate(user=self.plus_user)
        resp = self.client.post(
            reverse('me-custom-test'),
            {'subject': 'Matematika', 'topic': 'Kvadrat tenglamalar', 'difficulty': 'hard'},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data['questions']), 10)
        mock_gen.assert_called_once()
        kwargs = mock_gen.call_args.kwargs
        self.assertEqual(kwargs.get('subject'), 'Matematika')
        self.assertEqual(kwargs.get('topic'), 'Kvadrat tenglamalar')
        self.assertEqual(kwargs.get('count'), 10)
        self.assertEqual(kwargs.get('difficulty'), 'hard')

    @patch('questions.ai_generation.generate_questions')
    def test_missing_subject_400(self, mock_gen):
        self.client.force_authenticate(user=self.plus_user)
        resp = self.client.post(
            reverse('me-custom-test'), {'topic': 'Kvadrat tenglamalar'}, format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        mock_gen.assert_not_called()

    @patch('questions.ai_generation.generate_questions')
    def test_missing_topic_400(self, mock_gen):
        self.client.force_authenticate(user=self.plus_user)
        resp = self.client.post(
            reverse('me-custom-test'), {'subject': 'Matematika'}, format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        mock_gen.assert_not_called()

    def test_throttle_scope_is_ai_question(self):
        from accounts.views_student import custom_ai_test
        self.assertEqual(custom_ai_test.cls.throttle_scope, 'ai_question')


class WeeklyReportPdfTestCase(APITestCase):
    """Haftalik PDF hisobot: generator bytes qaytaradi, endpoint Plus+ gated."""

    def setUp(self):
        from django.core.cache import cache
        from billing.models import SubscriptionPlan, UserSubscription

        cache.clear()
        SubscriptionPlan.objects.filter(plan_type='student').delete()
        self.standart_plan = SubscriptionPlan.objects.create(
            name='Standart (1 oy)', plan_type='student', price=9999.00,
            duration_days=30, is_active=True,
        )
        self.plus_plan = SubscriptionPlan.objects.create(
            name='Plus (1 oy)', plan_type='student', price=19999.00,
            duration_days=30, is_active=True,
        )
        self.standart_user = self._make('+998904000001', self.standart_plan)
        self.plus_user = self._make('+998904000002', self.plus_plan)

    def _make(self, phone, plan):
        from billing.models import UserSubscription
        user = User.objects.create_user(
            phone=phone, password='UserPass123', full_name='Test User', is_premium=True,
        )
        UserSubscription.objects.create(
            user=user, plan=plan, is_active=True,
            end_date=timezone.now() + timedelta(days=30),
        )
        return user

    def test_generator_returns_bytes(self):
        from accounts.reports import generate_weekly_report_pdf
        pdf = generate_weekly_report_pdf(self.plus_user)
        self.assertIsInstance(pdf, bytes)
        self.assertTrue(len(pdf) > 0)

    def test_endpoint_standart_403(self):
        self.client.force_authenticate(user=self.standart_user)
        resp = self.client.get(reverse('me-weekly-report'))
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp.data.get('required_tier'), 'plus')

    def test_endpoint_plus_200_pdf(self):
        self.client.force_authenticate(user=self.plus_user)
        resp = self.client.get(reverse('me-weekly-report'))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp['Content-Type'], 'application/pdf')


class WeeklyContestHistoryTestCase(APITestCase):
    """Feature 2 — Haftalik musobaqa tarixi (Standart+): gating va o'rin trendi."""

    def setUp(self):
        from django.core.cache import cache
        from billing.models import SubscriptionPlan

        cache.clear()  # is_user_premium 60s cache — testlar orasida tozalaymiz
        SubscriptionPlan.objects.filter(plan_type='student').delete()
        self.standart_plan = SubscriptionPlan.objects.create(
            name='Standart (1 oy)', plan_type='student', price=9999.00,
            duration_days=30, is_active=True,
        )
        self.free_user = self._make('+998905000001', plan=None)
        self.standart_user = self._make('+998905000002', plan=self.standart_plan)

    def _make(self, phone, plan):
        from billing.models import UserSubscription
        user = User.objects.create_user(
            phone=phone, password='UserPass123', full_name='Test User',
            is_premium=plan is not None,
        )
        if plan is not None:
            UserSubscription.objects.create(
                user=user, plan=plan, is_active=True,
                end_date=timezone.now() + timedelta(days=30),
            )
        return user

    def _seed_week(self, user, weeks_ago, rank):
        """`weeks_ago` hafta oldin yakunlangan musobaqa + foydalanuvchi natijasi."""
        from accounts.models import WeeklyContest, WeeklyContestResult
        today = timezone.now().date()
        monday = today - timedelta(days=today.weekday() + 7 * weeks_ago)
        contest = WeeklyContest.objects.create(
            week_start=monday, week_end=monday + timedelta(days=6),
            status=WeeklyContest.STATUS_FINISHED,
        )
        WeeklyContestResult.objects.create(
            contest=contest, user=user, score=max(0, 100 - rank), rank=rank,
        )
        return contest

    def test_free_user_403(self):
        self.client.force_authenticate(user=self.free_user)
        resp = self.client.get(reverse('weekly-contest-history'))
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp.data.get('required_tier'), 'standart')

    def test_standart_user_200(self):
        self.client.force_authenticate(user=self.standart_user)
        resp = self.client.get(reverse('weekly-contest-history'))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIsInstance(resp.data, list)

    def test_trend_across_weeks(self):
        # Eng eskidan yangiga: rank 5 -> 3 -> 6 -> 6.
        self._seed_week(self.standart_user, weeks_ago=3, rank=5)  # w1 (eng eski)
        self._seed_week(self.standart_user, weeks_ago=2, rank=3)  # w2
        self._seed_week(self.standart_user, weeks_ago=1, rank=6)  # w3
        self._seed_week(self.standart_user, weeks_ago=0, rank=6)  # w4 (eng yangi)

        self.client.force_authenticate(user=self.standart_user)
        resp = self.client.get(reverse('weekly-contest-history'))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.data
        self.assertEqual(len(data), 4)
        # Javob -week_start bo'yicha: [w4, w3, w2, w1].
        self.assertEqual(data[0]['my_entry']['rank'], 6)
        self.assertEqual(data[0]['my_entry']['trend'], 'flat')   # w4 vs w3 (6==6)
        self.assertEqual(data[1]['my_entry']['trend'], 'down')   # w3 vs w2 (6>3)
        self.assertEqual(data[2]['my_entry']['trend'], 'up')     # w2 vs w1 (3<5)
        self.assertIsNone(data[3]['my_entry']['trend'])          # w1 — oldingi hafta yo'q


class PortfolioPDFTestCase(APITestCase):
    """Feature 5: Yutuqlar portfoliosi PDF (Pro tier) + lazy UUID to'ldirish."""

    def setUp(self):
        from django.core.cache import cache
        from billing.models import SubscriptionPlan, UserSubscription
        from centers.models import EducationCenter

        cache.clear()
        self.center = EducationCenter.objects.create(name='Portfolio Academy', city='Toshkent')
        SubscriptionPlan.objects.filter(plan_type='student').delete()
        self._Sub = UserSubscription
        self.plus_plan = SubscriptionPlan.objects.create(
            name='Plus (1 oy)', plan_type='student', price=19999.00,
            duration_days=30, is_active=True,
        )
        self.pro_plan = SubscriptionPlan.objects.create(
            name='Pro (1 oy)', plan_type='student', price=29999.00,
            duration_days=30, is_active=True,
        )
        self.plus_user = self._make('+998904000001', self.plus_plan)
        self.pro_user = self._make('+998904000002', self.pro_plan, full_name='Ali Valiyev')

    def _make(self, phone, plan, full_name=''):
        user = User.objects.create_user(
            phone=phone, password='UserPass123', is_premium=True, full_name=full_name,
        )
        self._Sub.objects.create(
            user=user, plan=plan, is_active=True,
            end_date=timezone.now() + timedelta(days=30),
        )
        return user

    def _make_attempt(self, user, subject='Matematika', score=80):
        from attempts.models import TestAttempt
        from olympiads.models import Olympiad
        olympiad = Olympiad.objects.create(
            center=self.center, title=f'{subject} Olimpiadasi',
            subject=subject, status='active',
            event_type=Olympiad.EVENT_TYPE_OLYMPIAD,
            start_datetime=timezone.now() - timedelta(days=2, minutes=10),
            duration_minutes=60,
        )
        return TestAttempt.objects.create(
            user=user, olympiad=olympiad, score=score,
            correct_count=8, wrong_count=2, total_questions=10,
        )

    def test_portfolio_plus_403(self):
        self.client.force_authenticate(user=self.plus_user)
        resp = self.client.get(reverse('me-portfolio'))
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp.data.get('required_tier'), 'pro')

    def test_portfolio_pro_200_pdf(self):
        self._make_attempt(self.pro_user)
        self.client.force_authenticate(user=self.pro_user)
        resp = self.client.get(reverse('me-portfolio'))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp['Content-Type'], 'application/pdf')
        body = b''.join(resp.streaming_content) if resp.streaming else resp.content
        self.assertTrue(body.startswith(b'%PDF'))

    def test_portfolio_uuid_lazy_filled(self):
        # Yangi Pro user — portfolio_uuid NULL bo'lishi mumkin; birinchi yuklab
        # olishda to'ldirilishini tekshiramiz.
        User.objects.filter(pk=self.pro_user.pk).update(portfolio_uuid=None)
        self.pro_user.refresh_from_db()
        self.assertIsNone(self.pro_user.portfolio_uuid)

        self.client.force_authenticate(user=self.pro_user)
        resp = self.client.get(reverse('me-portfolio'))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        self.pro_user.refresh_from_db()
        self.assertIsNotNone(self.pro_user.portfolio_uuid)


class PortfolioVerifyTestCase(APITestCase):
    """Feature 5: Public (auth talab qilmaydi) portfolio verifikatsiyasi."""

    def setUp(self):
        import uuid
        from centers.models import EducationCenter

        self.center = EducationCenter.objects.create(name='Verify Academy', city='Toshkent')
        self.student = User.objects.create_user(
            phone='+998905000001', password='UserPass123', full_name='Guli Karimova',
        )
        self.student.portfolio_uuid = uuid.uuid4()
        self.student.save(update_fields=['portfolio_uuid'])

    def _make_attempt(self, subject='Fizika', score=75):
        from attempts.models import TestAttempt
        from olympiads.models import Olympiad
        olympiad = Olympiad.objects.create(
            center=self.center, title=f'{subject} Olimpiadasi',
            subject=subject, status='active',
            event_type=Olympiad.EVENT_TYPE_OLYMPIAD,
            start_datetime=timezone.now() - timedelta(days=2, minutes=10),
            duration_minutes=60,
        )
        return TestAttempt.objects.create(
            user=self.student, olympiad=olympiad, score=score,
            correct_count=6, wrong_count=2, total_questions=8,
        )

    def test_verify_valid_no_auth(self):
        self._make_attempt()
        # Auth header YO'Q — public endpoint.
        self.client.force_authenticate(user=None)
        url = reverse('portfolio-verify', kwargs={'portfolio_uuid': self.student.portfolio_uuid})
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data['valid'])
        self.assertEqual(resp.data['student_name'], 'Guli Karimova')
        self.assertEqual(resp.data['total_olympiads'], 1)

    def test_verify_unmatched_uuid_not_found(self):
        import uuid
        self.client.force_authenticate(user=None)
        url = reverse('portfolio-verify', kwargs={'portfolio_uuid': uuid.uuid4()})
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(resp.data['valid'])
        self.assertEqual(resp.data['reason'], 'not_found')


class GoogleAuthTestCase(APITestCase):
    """POST /api/auth/google/ — Google Login tests."""

    @staticmethod
    def _google_phone(sub):
        import hashlib
        return f"google_{hashlib.sha256(sub.encode('utf-8')).hexdigest()[:13]}"

    def _mock_token(self, mock_urlopen, **claims):
        import io
        import json
        mock_response = io.BytesIO(json.dumps(claims).encode('utf-8'))
        mock_urlopen.return_value.__enter__.return_value = mock_response

    @patch('urllib.request.urlopen')
    def test_google_login_new_user_success(self, mock_urlopen):
        self._mock_token(
            mock_urlopen,
            sub='1234567890',
            email='newuser@gmail.com',
            email_verified='true',
            name='New Google User',
            given_name='New',
            family_name='User',
        )

        url = reverse('google-login')
        response = self.client.post(url, {'id_token': 'fake_google_id_token', 'role': 'student'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('user', response.data)
        user = User.objects.get(phone=self._google_phone('1234567890'))
        self.assertEqual(user.full_name, 'New User')
        self.assertIn('student', user.roles)

    @patch('urllib.request.urlopen')
    def test_google_login_realistic_long_sub_and_email_fits_columns(self, mock_urlopen):
        """Haqiqiy Google sub (~21 raqam) va uzun email DB ustunlariga sig'ishi
        kerak — aks holda PostgreSQL'da 'value too long' (500) yuzaga keladi."""
        long_sub = '117253846290381746255'  # 21 raqam, real Google formatida
        self._mock_token(
            mock_urlopen,
            sub=long_sub,
            email='very.long.email.address.for.testing@somelongdomain.example.com',
            email_verified='true',
            name='Long Sub User',
        )

        url = reverse('google-login')
        response = self.client.post(url, {'id_token': 'tok'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(phone=self._google_phone(long_sub))
        self.assertLessEqual(len(user.phone), 20)
        self.assertLessEqual(len(user.normalized_phone), 20)
        self.assertLessEqual(len(user.username), 32)

    @patch('urllib.request.urlopen')
    def test_google_login_existing_user_reused(self, mock_urlopen):
        """Bir xil sub bilan qayta login — yangi user yaratmasdan mavjudini qaytaradi."""
        self._mock_token(mock_urlopen, sub='555000555', email='repeat@gmail.com', name='Repeat User')
        url = reverse('google-login')
        first = self.client.post(url, {'id_token': 'tok'}, format='json')
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)

        self._mock_token(mock_urlopen, sub='555000555', email='repeat@gmail.com', name='Repeat User')
        second = self.client.post(url, {'id_token': 'tok'}, format='json')
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(User.objects.filter(phone=self._google_phone('555000555')).count(), 1)

    def test_google_login_missing_token_bad_request(self):
        url = reverse('google-login')
        response = self.client.post(url, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch('urllib.request.urlopen')
    def test_google_login_student_then_owner_rejected(self, mock_urlopen):
        """O'quvchi (student) sifatida ro'yxatdan o'tgan Gmail bilan tashkilot
        (owner) sifatida qayta kirishga urinish 400 bilan rad etiladi va owner
        roli qo'shilmaydi."""
        sub = '900100200'
        self._mock_token(mock_urlopen, sub=sub, email='dual@gmail.com', name='Dual User')
        url = reverse('google-login')
        first = self.client.post(url, {'id_token': 'tok', 'role': 'student'}, format='json')
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)

        self._mock_token(mock_urlopen, sub=sub, email='dual@gmail.com', name='Dual User')
        second = self.client.post(url, {'id_token': 'tok', 'role': 'owner'}, format='json')
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            second.data['detail'],
            "Siz bu Gmail orqali allaqachon o'quvchi sifatida ro'yxatdan o'tgansiz. "
            "Boshqa Gmail hisobidan tashkilot sifatida ro'yxatdan o'ting.",
        )
        user = User.objects.get(phone=self._google_phone(sub))
        self.assertIn('student', user.roles)
        self.assertNotIn('owner', user.roles)

    @patch('urllib.request.urlopen')
    def test_google_login_owner_then_student_rejected(self, mock_urlopen):
        """Tashkilot (owner) sifatida ro'yxatdan o'tgan Gmail bilan o'quvchi
        (student) sifatida qayta kirishga urinish 400 bilan rad etiladi va
        student roli qo'shilmaydi."""
        sub = '900100201'
        self._mock_token(mock_urlopen, sub=sub, email='org@gmail.com', name='Org User')
        url = reverse('google-login')
        first = self.client.post(url, {'id_token': 'tok', 'role': 'owner'}, format='json')
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)

        self._mock_token(mock_urlopen, sub=sub, email='org@gmail.com', name='Org User')
        second = self.client.post(url, {'id_token': 'tok', 'role': 'student'}, format='json')
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            second.data['detail'],
            "Siz bu Gmail orqali allaqachon tashkilot sifatida ro'yxatdan o'tgansiz. "
            "Boshqa Gmail hisobidan o'quvchi sifatida ro'yxatdan o'ting.",
        )
        user = User.objects.get(phone=self._google_phone(sub))
        self.assertIn('owner', user.roles)
        self.assertNotIn('student', user.roles)

    @patch('urllib.request.urlopen')
    def test_google_login_student_relogin_as_student_allowed(self, mock_urlopen):
        """O'quvchi qayta o'quvchi sifatida kirishi cheklanmaydi (200)."""
        sub = '900100202'
        self._mock_token(mock_urlopen, sub=sub, email='again@gmail.com', name='Again User')
        url = reverse('google-login')
        self.client.post(url, {'id_token': 'tok', 'role': 'student'}, format='json')

        self._mock_token(mock_urlopen, sub=sub, email='again@gmail.com', name='Again User')
        second = self.client.post(url, {'id_token': 'tok', 'role': 'student'}, format='json')
        self.assertEqual(second.status_code, status.HTTP_200_OK)

    @patch('urllib.request.urlopen')
    def test_google_login_owner_then_teacher_allowed(self, mock_urlopen):
        """student/owner istisnosi boshqa rollarga (teacher) ta'sir qilmaydi —
        owner keyin teacher rolini olishi mumkin (200) va rol qo'shiladi."""
        sub = '900100203'
        self._mock_token(mock_urlopen, sub=sub, email='mixed@gmail.com', name='Mixed User')
        url = reverse('google-login')
        self.client.post(url, {'id_token': 'tok', 'role': 'owner'}, format='json')

        self._mock_token(mock_urlopen, sub=sub, email='mixed@gmail.com', name='Mixed User')
        second = self.client.post(url, {'id_token': 'tok', 'role': 'teacher'}, format='json')
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        user = User.objects.get(phone=self._google_phone(sub))
        self.assertIn('owner', user.roles)
        self.assertIn('teacher', user.roles)


class LiveQuizQuestionIsolationTestCase(APITestCase):
    """O'qituvchining shaxsiy Jonli Viktorina savoli o'quvchilarga chiqmaydi.

    `purpose=live_quiz` savol faqat o'qituvchining o'z jonli viktorina xonasida
    ishlatiladi. Duel (Brain Battles) savol tanlash va kunlik savol generatori
    umumiy (olimpiada) bankidan tashqariga chiqmasligi kerak.
    """

    def setUp(self):
        from centers.models import EducationCenter
        from questions.models import Question

        self.center = EducationCenter.objects.create(
            name='Live Quiz Academy', city='Toshkent',
            status=EducationCenter.STATUS_APPROVED,
        )
        self.teacher = User.objects.create_user(
            phone='+998901550001', password='StrongPass123', full_name='Ustoz',
        )
        # Umumiy bank: 3 ta olimpiada savoli.
        self.olympiad_questions = [
            Question.objects.create(
                center=self.center, subject='Matematika',
                text=f'Olimpiada savoli {i}', options=['1', '2'],
                correct_answer=0, score=5,
            )
            for i in range(3)
        ]
        # O'qituvchining shaxsiy viktorina savoli — hech bir o'quvchi
        # yuzasiga chiqmasligi kerak.
        self.live_quiz_question = Question.objects.create(
            center=self.center, subject='Matematika',
            text='Viktorina savoli', options=['1', '2'],
            correct_answer=0, score=5,
            created_by=self.teacher,
            purpose=Question.QUESTION_PURPOSE_LIVE_QUIZ,
        )

    def test_duel_question_pick_skips_live_quiz(self):
        from accounts.views_duel import _pick_duel_questions

        picked = _pick_duel_questions('')
        picked_ids = {q.id for q in picked}
        self.assertEqual(picked_ids, {q.id for q in self.olympiad_questions})
        self.assertNotIn(self.live_quiz_question.id, picked_ids)

    def test_duel_question_pick_by_subject_skips_live_quiz(self):
        """Fan bo'yicha tanlash tarmog'ida ham viktorina savoli chiqmaydi.

        `Fizika`da 10 ta umumiy savol bor — shu sababli fan bo'yicha
        toraytirish tarmog'i ishga tushadi (subject_qs >= 10).
        """
        from questions.models import Question

        from accounts.views_duel import DUEL_QUESTION_COUNT, _pick_duel_questions

        physics_ids = {
            Question.objects.create(
                center=self.center, subject='Fizika',
                text=f'Fizika savoli {i}', options=['1', '2'],
                correct_answer=0, score=5,
            ).id
            for i in range(DUEL_QUESTION_COUNT)
        }
        live_quiz_physics = Question.objects.create(
            center=self.center, subject='Fizika',
            text='Fizika viktorina savoli', options=['1', '2'],
            correct_answer=0, score=5, created_by=self.teacher,
            purpose=Question.QUESTION_PURPOSE_LIVE_QUIZ,
        )

        picked_ids = {q.id for q in _pick_duel_questions('Fizika')}
        self.assertEqual(picked_ids, physics_ids)
        self.assertNotIn(live_quiz_physics.id, picked_ids)

    def test_daily_question_generator_skips_live_quiz(self):
        from accounts.models import DailyQuestion
        from accounts.tasks import generate_daily_questions

        # 4 ta savol so'raymiz, lekin umumiy bankda faqat 3 tasi bor —
        # viktorina savoli bo'shliqni to'ldirish uchun ham olinmaydi.
        generate_daily_questions(count=4)
        today = timezone.now().date()
        chosen_ids = set(
            DailyQuestion.objects
            .filter(date=today)
            .values_list('question_id', flat=True)
        )
        self.assertEqual(chosen_ids, {q.id for q in self.olympiad_questions})
        self.assertNotIn(self.live_quiz_question.id, chosen_ids)

