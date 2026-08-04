import json
import time
from datetime import timedelta
from unittest.mock import patch

import jwt

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import AuditLog, LoginEvent, PhoneVerification
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

    def test_login_records_login_event(self):
        """Muvaffaqiyatli kirish "Kirish tarixi" uchun yozuv qoldiradi."""
        self.client.post(reverse('login'), {
            'phone': self.phone,
            'password': self.password,
        }, format='json', HTTP_USER_AGENT='TestBrowser/1.0', REMOTE_ADDR='10.1.2.3')
        event = LoginEvent.objects.filter(user=self.user).first()
        self.assertIsNotNone(event)
        self.assertEqual(event.ip_address, '10.1.2.3')
        self.assertEqual(event.user_agent, 'TestBrowser/1.0')
        # jti aynan REFRESH tokenning jti'si bo'lishi kerak — ya'ni
        # `OutstandingToken` yozuvi bilan mos tushishi shart, aks holda
        # bitta seansni majburiy tugatish ishlamaydi.
        from rest_framework_simplejwt.token_blacklist.models import OutstandingToken

        self.assertTrue(event.jti)
        self.assertTrue(
            OutstandingToken.objects.filter(user=self.user, jti=event.jti).exists()
        )

    def test_failed_login_records_nothing(self):
        self.client.post(reverse('login'), {
            'phone': self.phone,
            'password': 'WrongPass999',
        }, format='json')
        self.assertFalse(LoginEvent.objects.filter(user=self.user).exists())


class StaleCredentialTestCase(APITestCase):
    """Eskirgan kredensial AllowAny endpoint'larni bloklamasligi kerak.

    Frontend saqlangan access tokenni HAR bir so'rovga `Authorization: Bearer`
    sifatida qo'shadi (src/services/api.js), shu jumladan login va
    token/refresh ga. Access token 30 daqiqada eskiradi, shuning uchun qaytib
    kelgan foydalanuvchining har bir so'rovi eskirgan token bilan ketadi.
    Avval `OlympyJWTAuthentication` bu holatda 401 "Given token not valid for
    any token type" ko'tarardi (cookie uchun esa yo'q) va foydalanuvchi
    "Sessiya muddati tugadi. Iltimos, qayta kiring." xabariga qamalib qolardi.
    """

    def setUp(self):
        self.phone = '+998905550001'
        self.password = 'StrongPass123'
        self.user = User.objects.create_user(
            phone=self.phone, password=self.password, full_name='Stale Cred',
        )

    def _expired_access_token(self, user=None):
        from rest_framework_simplejwt.tokens import AccessToken
        token = AccessToken.for_user(user or self.user)
        token['token_version'] = (user or self.user).token_version
        token.set_exp(
            from_time=timezone.now() - timedelta(hours=2),
            lifetime=timedelta(minutes=30),
        )
        return str(token)

    def test_login_succeeds_with_expired_bearer_header(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self._expired_access_token()}')
        res = self.client.post(reverse('login'), {
            'phone': self.phone,
            'password': self.password,
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_login_succeeds_with_malformed_bearer_header(self):
        self.client.credentials(HTTP_AUTHORIZATION='Bearer not-a-real-token')
        res = self.client.post(reverse('login'), {
            'phone': self.phone,
            'password': self.password,
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_token_refresh_succeeds_with_expired_bearer_header(self):
        """Silent refresh: refresh token yaroqli, access token esa eskirgan."""
        from rest_framework_simplejwt.tokens import RefreshToken
        refresh = RefreshToken.for_user(self.user)
        refresh['token_version'] = self.user.token_version
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self._expired_access_token()}')
        res = self.client.post(
            reverse('token-refresh'), {'refresh': str(refresh)}, format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_protected_endpoint_still_rejects_expired_bearer_header(self):
        """Yumshoq muomala FAQAT AllowAny uchun — himoyalangan yo'l baribir 401."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self._expired_access_token()}')
        self.assertEqual(
            self.client.get(reverse('me')).status_code, status.HTTP_401_UNAUTHORIZED,
        )

    def test_invalid_bearer_header_does_not_fall_back_to_cookie(self):
        """Header bo'lsa cookie'ga qaytilmaydi (impersonatsiya xavfsizligi)."""
        login = self.client.post(reverse('login'), {
            'phone': self.phone,
            'password': self.password,
        }, format='json')
        self.assertEqual(login.status_code, status.HTTP_200_OK)
        self.assertIn('olympy_access', self.client.cookies)
        self.client.credentials(HTTP_AUTHORIZATION='Bearer not-a-real-token')
        self.assertEqual(
            self.client.get(reverse('me')).status_code, status.HTTP_401_UNAUTHORIZED,
        )


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
        """Natija yo'q — AI'ga umuman borilmaydi, darhol bo'sh reja qaytadi."""
        self.client.force_authenticate(user=self.plus_user)
        resp = self.client.post(reverse('me-study-plan'), {}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIsNone(resp.data.get('task_id'))

    def test_study_plan_with_results_returns_task_then_plan(self):
        """Natija bor — sekin Gemini chaqiruvi Celery task'ida bajariladi."""
        self._make_attempt(self.plus_user, subject='Fizika', score=30)
        self.client.force_authenticate(user=self.plus_user)
        with patch(
            'accounts.views_student._generate_study_plan_ai',
            return_value=['1. Fizikani takrorlang'],
        ) as mock_ai:
            resp = self.client.post(reverse('me-study-plan'), {}, format='json')
            self.assertEqual(resp.status_code, status.HTTP_202_ACCEPTED)
            mock_ai.assert_called_once()
        task_id = resp.data.get('task_id')
        self.assertTrue(task_id)

        status_resp = self.client.get(reverse('me-study-plan-status', args=[task_id]))
        self.assertEqual(status_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(status_resp.data.get('status'), 'COMPLETED')
        self.assertEqual(status_resp.data.get('plan'), ['1. Fizikani takrorlang'])
        self.assertEqual(status_resp.data.get('weak_subjects'), ['Fizika'])

    def test_study_plan_task_result_is_owner_scoped(self):
        self._make_attempt(self.plus_user, subject='Fizika', score=30)
        self.client.force_authenticate(user=self.plus_user)
        with patch(
            'accounts.views_student._generate_study_plan_ai',
            return_value=['1. Fizikani takrorlang'],
        ):
            start = self.client.post(reverse('me-study-plan'), {}, format='json')
        self.assertEqual(start.status_code, status.HTTP_202_ACCEPTED)
        self.client.force_authenticate(user=self.pro_user)
        resp = self.client.get(
            reverse('me-study-plan-status', args=[start.data['task_id']]),
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    # ── olympiad_prep_plan — Pro only ───────────────────────────────────────
    def test_prep_plan_plus_403(self):
        self.client.force_authenticate(user=self.plus_user)
        resp = self.client.post(reverse('me-olympiad-prep-plan'), {}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp.data.get('required_tier'), 'pro')

    def test_prep_plan_pro_202(self):
        """Pro tarifi task boshlaydi — Gemini chaqiruvi so'rov ichida emas.

        Test muhitida EAGER, ya'ni `delay()` task'ni sinxron bajaradi; AI
        kaliti yo'qligi uchun `_generate_prep_plan_ai` fallback reja qaytaradi.
        """
        olympiad, _ = self._make_attempt(self.pro_user)
        self.client.force_authenticate(user=self.pro_user)
        resp = self.client.post(
            reverse('me-olympiad-prep-plan'), {'olympiad_id': olympiad.id}, format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_202_ACCEPTED)
        task_id = resp.data.get('task_id')
        self.assertTrue(task_id)

        status_resp = self.client.get(
            reverse('me-olympiad-prep-plan-status', args=[task_id]),
        )
        self.assertEqual(status_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(status_resp.data.get('status'), 'COMPLETED')
        self.assertEqual(status_resp.data.get('olympiad_name'), olympiad.title)
        self.assertTrue(status_resp.data.get('daily_plan'))

    # ── ai_audio_analysis — Pro only ────────────────────────────────────────
    def test_ai_audio_plus_403(self):
        self.client.force_authenticate(user=self.plus_user)
        resp = self.client.post(reverse('me-ai-audio-analysis'), {}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp.data.get('required_tier'), 'pro')

    def test_ai_audio_pro_200(self):
        _, attempt = self._make_attempt(self.pro_user)
        self.client.force_authenticate(user=self.pro_user)
        with patch('accounts.tasks.send_ai_audio_analysis_task.delay') as mock_delay:
            resp = self.client.post(
                reverse('me-ai-audio-analysis'), {'attempt_id': attempt.id}, format='json',
            )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        # Telegram ulanmagan — no_telegram statusi (tashqi chaqiruv/task yo'q).
        self.assertEqual(resp.data.get('status'), 'no_telegram')
        mock_delay.assert_not_called()

    def test_ai_audio_with_telegram_returns_task_then_result(self):
        """Telegram ulangan — Gemini + sendVoice ishlari task'ga ko'chadi."""
        _, attempt = self._make_attempt(self.pro_user)
        self.pro_user.telegram_chat_id = '123456'
        self.pro_user.save(update_fields=['telegram_chat_id'])
        self.client.force_authenticate(user=self.pro_user)
        with (
            patch(
                'questions.ai_generation.analyze_attempt_ai',
                return_value='Tahlil matni',
            ),
            patch('accounts.views_me_premium._try_send_voice', return_value=True) as mock_voice,
        ):
            resp = self.client.post(
                reverse('me-ai-audio-analysis'), {'attempt_id': attempt.id}, format='json',
            )
            self.assertEqual(resp.status_code, status.HTTP_202_ACCEPTED)
            mock_voice.assert_called_once()
        task_id = resp.data.get('task_id')
        self.assertTrue(task_id)

        status_resp = self.client.get(
            reverse('me-ai-audio-analysis-status', args=[task_id]),
        )
        self.assertEqual(status_resp.status_code, status.HTTP_200_OK)
        # Polling konverti `status`ni egallaydi, yuborish holati `delivery_status`.
        self.assertEqual(status_resp.data.get('status'), 'COMPLETED')
        self.assertEqual(status_resp.data.get('delivery_status'), 'sent')

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


# Google'ning ochiq kalitini olish (yagona tarmoq nuqtasi) shu helper ichida:
# u `PyJWKClient` keshini ishlatadi va noma'lum `kid` uchun tarmoqqa chiqishni
# cheklaydi (izohi `accounts/views.py`). Testlar aynan shu chegarani mock
# qiladi — imzo/`aud`/`iss`/`exp` tekshiruvlari haqiqiy kod yo'lidan o'tadi.
GOOGLE_JWKS_PATCH = 'accounts.views._google_signing_key'


@override_settings(GOOGLE_CLIENT_ID=None)
class GoogleAuthTestCase(APITestCase):
    """POST /api/auth/google/ — Google Login tests.

    Google ID Token endi tarmoqqa chiqmasdan, mahalliy (kriptografik) tarzda
    tekshiriladi. Shu sababli testlar HAQIQIY RS256 token imzolaydi va faqat
    Google'ning ochiq kalitini olish (yagona tarmoq nuqtasi — JWKS) mock
    qilinadi: imzo/`aud`/`iss`/`exp` tekshiruvlari haqiqiy kod yo'lidan o'tadi.
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        from cryptography.hazmat.primitives.asymmetric import rsa
        # Kalit test klassi uchun BIR MARTA generatsiya qilinadi (RSA sekin).
        cls.rsa_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        cls.other_rsa_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    @staticmethod
    def _google_phone(sub):
        import hashlib
        return f"google_{hashlib.sha256(sub.encode('utf-8')).hexdigest()[:13]}"

    def _mock_token(self, mock_get_key, *, sign_with=None, **claims):
        """Haqiqiy imzolangan Google ID Token qaytaradi va JWKS kalitini mock qiladi."""
        import time
        from types import SimpleNamespace

        import jwt

        mock_get_key.return_value = SimpleNamespace(key=self.rsa_key.public_key())
        now = int(time.time())
        payload = {
            'iss': 'https://accounts.google.com',
            'aud': 'olympy-test.apps.googleusercontent.com',
            'iat': now,
            'exp': now + 3600,
            **claims,
        }
        return jwt.encode(payload, sign_with or self.rsa_key, algorithm='RS256')

    @patch(GOOGLE_JWKS_PATCH)
    def test_google_login_new_user_success(self, mock_get_key):
        token = self._mock_token(
            mock_get_key,
            sub='1234567890',
            email='newuser@gmail.com',
            email_verified=True,
            name='New Google User',
            given_name='New',
            family_name='User',
        )

        url = reverse('google-login')
        response = self.client.post(url, {'id_token': token, 'role': 'student'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('user', response.data)
        user = User.objects.get(phone=self._google_phone('1234567890'))
        self.assertEqual(user.full_name, 'New User')
        self.assertIn('student', user.roles)

    @patch(GOOGLE_JWKS_PATCH)
    def test_google_login_realistic_long_sub_and_email_fits_columns(self, mock_get_key):
        """Haqiqiy Google sub (~21 raqam) va uzun email DB ustunlariga sig'ishi
        kerak — aks holda PostgreSQL'da 'value too long' (500) yuzaga keladi."""
        long_sub = '117253846290381746255'  # 21 raqam, real Google formatida
        token = self._mock_token(
            mock_get_key,
            sub=long_sub,
            email='very.long.email.address.for.testing@somelongdomain.example.com',
            email_verified=True,
            name='Long Sub User',
        )

        url = reverse('google-login')
        response = self.client.post(url, {'id_token': token}, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(phone=self._google_phone(long_sub))
        self.assertLessEqual(len(user.phone), 20)
        self.assertLessEqual(len(user.normalized_phone), 20)
        self.assertLessEqual(len(user.username), 32)

    @patch(GOOGLE_JWKS_PATCH)
    def test_google_login_existing_user_reused(self, mock_get_key):
        """Bir xil sub bilan qayta login — yangi user yaratmasdan mavjudini qaytaradi."""
        token = self._mock_token(mock_get_key, sub='555000555', email='repeat@gmail.com', name='Repeat User')
        url = reverse('google-login')
        first = self.client.post(url, {'id_token': token}, format='json')
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)

        second = self.client.post(url, {'id_token': token}, format='json')
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(User.objects.filter(phone=self._google_phone('555000555')).count(), 1)

    def test_google_login_missing_token_bad_request(self):
        url = reverse('google-login')
        response = self.client.post(url, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch(GOOGLE_JWKS_PATCH)
    def test_google_login_bad_signature_rejected(self, mock_get_key):
        """Boshqa kalit bilan imzolangan token — 401 (imzo mahalliy tekshiriladi)."""
        token = self._mock_token(
            mock_get_key, sign_with=self.other_rsa_key, sub='777000777', email='forged@gmail.com',
        )
        url = reverse('google-login')
        response = self.client.post(url, {'id_token': token}, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertFalse(User.objects.filter(phone=self._google_phone('777000777')).exists())

    @patch(GOOGLE_JWKS_PATCH)
    def test_google_login_expired_token_rejected(self, mock_get_key):
        """Muddati o'tgan token — 401 (`exp` mahalliy tekshiriladi)."""
        import time
        now = int(time.time())
        token = self._mock_token(
            mock_get_key, sub='777000778', email='expired@gmail.com', iat=now - 7200, exp=now - 3600,
        )
        url = reverse('google-login')
        response = self.client.post(url, {'id_token': token}, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    @patch(GOOGLE_JWKS_PATCH)
    def test_google_login_jwks_unreachable_returns_503(self, mock_get_key):
        """Google JWKS'ga chiqib bo'lmasa — 503, 401 EMAS.

        Bu SERVER tomonidagi vaqtinchalik nosozlik (tarmoq/timeout), token
        bilan bog'liq emas. 401 qaytarilsa foydalanuvchiga "Google tokeningiz
        yaroqsiz" degan yolg'on sabab ko'rsatilardi va frontend buni qayta
        urinib ko'rilmaydigan yakuniy rad javobi deb bilardi.
        """
        import jwt as pyjwt

        token = self._mock_token(mock_get_key, sub='777000783', email='jwks-down@gmail.com')
        # Token o'zi mutlaqo yaroqli — faqat JWKS'ni olish qulaydi.
        mock_get_key.side_effect = pyjwt.PyJWKClientConnectionError(
            'Fail to fetch data from the url, err: "timed out"'
        )
        url = reverse('google-login')
        response = self.client.post(url, {'id_token': token}, format='json')
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertFalse(User.objects.filter(phone=self._google_phone('777000783')).exists())

    @patch(GOOGLE_JWKS_PATCH)
    def test_google_login_wrong_issuer_rejected(self, mock_get_key):
        """Google bo'lmagan `iss` — 401."""
        token = self._mock_token(
            mock_get_key, iss='https://evil.example.com', sub='777000779', email='evil@gmail.com',
        )
        url = reverse('google-login')
        response = self.client.post(url, {'id_token': token}, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    @override_settings(GOOGLE_CLIENT_ID='olympy-test.apps.googleusercontent.com')
    @patch(GOOGLE_JWKS_PATCH)
    def test_google_login_matching_audience_allowed(self, mock_get_key):
        """GOOGLE_CLIENT_ID sozlangan va `aud` mos — kirish muvaffaqiyatli."""
        token = self._mock_token(mock_get_key, sub='777000780', email='aud-ok@gmail.com', name='Aud Ok')
        url = reverse('google-login')
        response = self.client.post(url, {'id_token': token}, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    @override_settings(GOOGLE_CLIENT_ID='another-client.apps.googleusercontent.com')
    @patch(GOOGLE_JWKS_PATCH)
    def test_google_login_audience_mismatch_rejected(self, mock_get_key):
        """`aud` boshqa Client ID uchun bo'lsa — 401."""
        token = self._mock_token(mock_get_key, sub='777000781', email='aud-bad@gmail.com')
        url = reverse('google-login')
        response = self.client.post(url, {'id_token': token}, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data['detail'], "Google Client ID mos kelmadi.")

    @patch(GOOGLE_JWKS_PATCH)
    def test_google_login_without_client_id_skips_audience_check(self, mock_get_key):
        """GOOGLE_CLIENT_ID sozlanmagan muhitda audience tekshiruvi o'tkazib
        yuboriladi (eski tokeninfo-yondashuvidagi xatti-harakat saqlangan)."""
        token = self._mock_token(
            mock_get_key, aud='some-other-client.apps.googleusercontent.com',
            sub='777000782', email='no-client-id@gmail.com',
        )
        url = reverse('google-login')
        response = self.client.post(url, {'id_token': token}, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    @patch(GOOGLE_JWKS_PATCH)
    def test_google_login_student_then_owner_rejected(self, mock_get_key):
        """O'quvchi (student) sifatida ro'yxatdan o'tgan Gmail bilan tashkilot
        (owner) sifatida qayta kirishga urinish 400 bilan rad etiladi va owner
        roli qo'shilmaydi."""
        sub = '900100200'
        token = self._mock_token(mock_get_key, sub=sub, email='dual@gmail.com', name='Dual User')
        url = reverse('google-login')
        first = self.client.post(url, {'id_token': token, 'role': 'student'}, format='json')
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)

        second = self.client.post(url, {'id_token': token, 'role': 'owner'}, format='json')
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            second.data['detail'],
            "Siz bu Gmail orqali allaqachon o'quvchi sifatida ro'yxatdan o'tgansiz. "
            "Boshqa Gmail hisobidan tashkilot sifatida ro'yxatdan o'ting.",
        )
        user = User.objects.get(phone=self._google_phone(sub))
        self.assertIn('student', user.roles)
        self.assertNotIn('owner', user.roles)

    @patch(GOOGLE_JWKS_PATCH)
    def test_google_login_owner_then_student_rejected(self, mock_get_key):
        """Tashkilot (owner) sifatida ro'yxatdan o'tgan Gmail bilan o'quvchi
        (student) sifatida qayta kirishga urinish 400 bilan rad etiladi va
        student roli qo'shilmaydi."""
        sub = '900100201'
        token = self._mock_token(mock_get_key, sub=sub, email='org@gmail.com', name='Org User')
        url = reverse('google-login')
        first = self.client.post(url, {'id_token': token, 'role': 'owner'}, format='json')
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)

        second = self.client.post(url, {'id_token': token, 'role': 'student'}, format='json')
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            second.data['detail'],
            "Siz bu Gmail orqali allaqachon tashkilot sifatida ro'yxatdan o'tgansiz. "
            "Boshqa Gmail hisobidan o'quvchi sifatida ro'yxatdan o'ting.",
        )
        user = User.objects.get(phone=self._google_phone(sub))
        self.assertIn('owner', user.roles)
        self.assertNotIn('student', user.roles)

    @patch(GOOGLE_JWKS_PATCH)
    def test_google_login_student_relogin_as_student_allowed(self, mock_get_key):
        """O'quvchi qayta o'quvchi sifatida kirishi cheklanmaydi (200)."""
        sub = '900100202'
        token = self._mock_token(mock_get_key, sub=sub, email='again@gmail.com', name='Again User')
        url = reverse('google-login')
        self.client.post(url, {'id_token': token, 'role': 'student'}, format='json')

        second = self.client.post(url, {'id_token': token, 'role': 'student'}, format='json')
        self.assertEqual(second.status_code, status.HTTP_200_OK)

    @patch(GOOGLE_JWKS_PATCH)
    def test_google_login_owner_then_teacher_allowed(self, mock_get_key):
        """student/owner istisnosi boshqa rollarga (teacher) ta'sir qilmaydi —
        owner keyin teacher rolini olishi mumkin (200) va rol qo'shiladi."""
        sub = '900100203'
        token = self._mock_token(mock_get_key, sub=sub, email='mixed@gmail.com', name='Mixed User')
        url = reverse('google-login')
        self.client.post(url, {'id_token': token, 'role': 'owner'}, format='json')

        second = self.client.post(url, {'id_token': token, 'role': 'teacher'}, format='json')
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        user = User.objects.get(phone=self._google_phone(sub))
        self.assertIn('owner', user.roles)
        self.assertIn('teacher', user.roles)


@override_settings(GOOGLE_CLIENT_ID=None)
class GoogleJwksNetworkBudgetTestCase(APITestCase):
    """`/api/auth/google/` Google'ning JWKS'iga necha marta chiqadi?

    Bu view'dagi YAGONA tashqi tarmoq chaqiruvi va u so'rov thread'ini
    bloklaydi — web konteynerda esa jami 6 ta gunicorn thread bor. Shu sababli
    chiqishlar soni xulqning bir qismi hisoblanadi va shu yerda qulflanadi.

    Tuzatilgunga qadar `PyJWKClient` faqat MUVAFFAQIYATLI qidiruvni keshlardi:
    `kid`i mos kelmaydigan har bir token (soxta yoki skaner trafigi) JWKS'ni
    majburan qayta yuklatardi — o'lchov: 5 ta shunday so'rov → 5 ta bloklovchi
    HTTPS chiqishi.
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        from cryptography.hazmat.primitives.asymmetric import rsa
        cls.key_current = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        cls.key_rotated = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        cls.key_forged = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    @staticmethod
    def _jwks(keys):
        """`keys` ({kid: private_key}) dan Google JWKS javobini yasaydi."""
        import base64

        def b64(value):
            raw = value.to_bytes((value.bit_length() + 7) // 8, 'big')
            return base64.urlsafe_b64encode(raw).rstrip(b'=').decode()

        entries = []
        for kid, key in keys.items():
            numbers = key.public_key().public_numbers()
            entries.append({
                'kty': 'RSA', 'alg': 'RS256', 'use': 'sig', 'kid': kid,
                'n': b64(numbers.n), 'e': b64(numbers.e),
            })
        return {'keys': entries}

    def setUp(self):
        from accounts import views

        # Modul darajasidagi kesh testlar orasida saqlanadi — tozalaymiz.
        views._google_known_kids.clear()
        views._google_jwks_next_refresh_at = 0.0
        if views._google_jwks_client.jwk_set_cache is not None:
            views._google_jwks_client.jwk_set_cache.jwk_set_with_timestamp = None
        views._google_jwks_client.get_signing_key.cache_clear()

        self.url = reverse('google-login')
        self.published = self._jwks({'kid-current': self.key_current})
        self.fetches = 0

    def _patched_fetch(self):
        """`PyJWKClient.fetch_data` o'rniga — tarmoqqa chiqishlarni sanaydi."""
        from accounts import views

        def fetch_data():
            self.fetches += 1
            cache = views._google_jwks_client.jwk_set_cache
            if cache is not None:
                cache.put(self.published)
            return self.published

        return patch.object(views._google_jwks_client, 'fetch_data', fetch_data)

    def _warm_jwks(self):
        """JWKS keshini isitib, hisoblagich va oynani nolga qaytaradi.

        Production'dagi normal holat aynan shu: haqiqiy kirishlar keshni
        allaqachon to'ldirgan bo'ladi. Sovuq keshda esa noma'lum `kid` ikkita
        chiqishga tushadi (avval keshni to'ldirish, keyin majburiy refresh) —
        testlar aynan bir holatdan boshlashi uchun oldindan isitamiz.
        """
        from accounts import views

        self._login(self.key_current, 'kid-current', '555000')
        views._google_jwks_next_refresh_at = 0.0
        self.fetches = 0

    def _login(self, key, kid, sub):
        now = int(time.time())
        token = jwt.encode(
            {
                'iss': 'https://accounts.google.com',
                'aud': 'olympy-test.apps.googleusercontent.com',
                'iat': now, 'exp': now + 3600,
                'sub': sub, 'email': f'{sub}@gmail.com', 'name': 'Kid Probe',
            },
            key, algorithm='RS256', headers={'kid': kid},
        )
        response = self.client.post(self.url, {'id_token': token}, format='json')
        # Muvaffaqiyatli kirish cookie qoldiradi — keyingi so'rov o'sha cookie
        # bilan autentifikatsiya qilinmasin (bu qo'shimcha DB so'rovi bo'lardi).
        self.client.cookies.clear()
        return response

    def test_valid_kid_hits_network_once(self):
        """Haqiqiy `kid` — birinchi kirish JWKS'ni yuklaydi, qolganlari keshdan."""
        with self._patched_fetch():
            for i in range(5):
                response = self._login(self.key_current, 'kid-current', f'55500{i}')
                self.assertIn(
                    response.status_code,
                    (status.HTTP_200_OK, status.HTTP_201_CREATED),
                )
        self.assertEqual(self.fetches, 1)

    def test_unknown_kid_cannot_force_a_fetch_per_request(self):
        """Noma'lum `kid` — oynada eng ko'pi bilan BITTA tarmoq chiqishi.

        Regressiya himoyasi: avval bu 5 ta so'rov uchun 5 ta bloklovchi HTTPS
        chaqiruvi (har biri thread'ni band qilib) bo'lardi.
        """
        with self._patched_fetch():
            self._warm_jwks()
            before = User.objects.count()
            for i in range(5):
                response = self._login(self.key_forged, 'forged-kid', f'55510{i}')
                self.assertIn(
                    response.status_code,
                    (status.HTTP_401_UNAUTHORIZED, status.HTTP_503_SERVICE_UNAVAILABLE),
                )
        self.assertEqual(self.fetches, 1)
        self.assertEqual(User.objects.count(), before)

    def test_each_random_kid_cannot_force_its_own_fetch(self):
        """Har safar BOSHQA `kid` yuborilsa ham chegara oyna bo'yicha ushlanadi."""
        with self._patched_fetch():
            self._warm_jwks()
            for i in range(5):
                self._login(self.key_forged, f'random-kid-{i}', f'55520{i}')
        self.assertEqual(self.fetches, 1)

    def test_google_key_rotation_still_resolves(self):
        """Google yangi kalitga o'tsa kirish ishlashi SHART (fail-closed emas).

        Chegara faqat tarmoq chiqishlari CHASTOTASINI kamaytiradi; oyna ochiq
        bo'lganda yangi `kid` yuklab olinadi va keyin keshdan ishlaydi.
        """
        from accounts import views

        with self._patched_fetch():
            first = self._login(self.key_current, 'kid-current', '555300')
            self.assertEqual(first.status_code, status.HTTP_201_CREATED)

            # Google JWKS'ga yangi kalit qo'shdi va endi shu bilan imzolaydi.
            self.published = self._jwks({
                'kid-current': self.key_current,
                'kid-next': self.key_rotated,
            })
            views._google_jwks_next_refresh_at = 0.0  # oyna ochildi

            rotated = self._login(self.key_rotated, 'kid-next', '555301')
            self.assertEqual(rotated.status_code, status.HTTP_201_CREATED)
            fetches_after_rotation = self.fetches

            # Yangi kalit endi keshda — qo'shimcha chiqish bo'lmasin.
            again = self._login(self.key_rotated, 'kid-next', '555302')
            self.assertEqual(again.status_code, status.HTTP_201_CREATED)
            self.assertEqual(self.fetches, fetches_after_rotation)

            # Eski kalit bilan imzolangan tokenlar ham ishlayveradi.
            old = self._login(self.key_current, 'kid-current', '555303')
            self.assertEqual(old.status_code, status.HTTP_201_CREATED)

    def test_token_without_kid_is_rejected_without_network(self):
        """`kid` sarlavhasisiz token — 401 va tarmoqqa umuman chiqilmaydi."""
        with self._patched_fetch():
            now = int(time.time())
            token = jwt.encode(
                {
                    'iss': 'https://accounts.google.com', 'iat': now,
                    'exp': now + 3600, 'sub': '555400', 'email': 'nokid@gmail.com',
                },
                self.key_current, algorithm='RS256',
            )
            response = self.client.post(self.url, {'id_token': token}, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(self.fetches, 0)


class LiveQuizQuestionIsolationTestCase(APITestCase):
    """O'qituvchining shaxsiy Jonli Viktorina savoli o'quvchilarga chiqmaydi.

    `purpose=live_quiz` bankka yozilgan eski savollar o'quvchi ko'radigan
    hech bir oqimga tushmasligi kerak — kunlik savol generatori faqat umumiy
    (olimpiada) bankidan tanlaydi.
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



class AdminUserLoginHistoryTestCase(APITestCase):
    """GET /api/admin/users/<id>/login-history/ — "Batafsil" oynasidagi
    "Kirish tarixi" bloki."""

    def setUp(self):
        self.admin = User.objects.create_user(
            phone='+998903330001', password='AdminPass123', full_name='Admin',
        )
        self.admin.is_platform_admin = True
        self.admin.save()
        self.target = User.objects.create_user(
            phone='+998903330002', password='UserPass123', full_name='Target',
        )
        self.other = User.objects.create_user(
            phone='+998903330003', password='UserPass123', full_name='Other',
        )

    def _url(self, user_id):
        return reverse('admin-user-login-history', args=[user_id])

    def test_returns_only_target_user_events(self):
        LoginEvent.objects.create(
            user=self.target, ip_address='10.0.0.1', user_agent='Chrome',
        )
        LoginEvent.objects.create(
            user=self.other, ip_address='10.0.0.2', user_agent='Firefox',
        )
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self._url(self.target.id))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['user_id'], self.target.id)
        self.assertEqual(len(res.data['events']), 1)
        self.assertEqual(res.data['events'][0]['ip'], '10.0.0.1')
        self.assertEqual(res.data['events'][0]['user_agent'], 'Chrome')

    def test_user_without_logins_is_empty_not_error(self):
        # Funksiya joriy qilinishidan oldingi kirishlarni tiklab bo'lmaydi —
        # bo'sh ro'yxat normal holat (UI "hali ma'lumot yo'q" deb ko'rsatadi).
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self._url(self.target.id))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['events'], [])

    def test_capped_at_20_newest_first(self):
        now = timezone.now()
        for i in range(25):
            event = LoginEvent.objects.create(user=self.target, ip_address=f'10.0.1.{i}')
            # created_at — auto_now_add, shuning uchun aniq tartib uchun
            # yaratilgandan keyin qo'lda suramiz (i=0 eng yangisi).
            LoginEvent.objects.filter(pk=event.pk).update(created_at=now - timedelta(minutes=i))
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self._url(self.target.id))
        self.assertEqual(len(res.data['events']), 20)
        self.assertEqual(res.data['events'][0]['ip'], '10.0.1.0')

    def test_unknown_user_is_404(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self._url(99999))
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)


class AdminSuspensionTestCase(APITestCase):
    """POST /api/admin/users/<id>/set-active/ — sababli, muddatli bloklash."""

    def setUp(self):
        self.admin = User.objects.create_user(
            phone='+998904440001', password='AdminPass123', full_name='Admin',
        )
        self.admin.is_platform_admin = True
        self.admin.save()
        self.password = 'UserPass123'
        self.target = User.objects.create_user(
            phone='+998904440002', password=self.password, full_name='Target',
        )
        self.url = reverse('admin-set-user-active', args=[self.target.id])

    def test_block_without_reason_is_400(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(self.url, {'is_active': False}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.target.refresh_from_db()
        self.assertTrue(self.target.is_active)

    def test_block_with_duration_sets_reason_and_expiry(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(self.url, {
            'is_active': False,
            'reason': 'Imtihonda qoidabuzarlik',
            'duration_days': 7,
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.target.refresh_from_db()
        self.assertFalse(self.target.is_active)
        self.assertEqual(self.target.block_reason, 'Imtihonda qoidabuzarlik')
        self.assertIsNotNone(self.target.blocked_until)
        delta = self.target.blocked_until - timezone.now()
        self.assertGreater(delta, timedelta(days=6, hours=23))
        self.assertLess(delta, timedelta(days=7, minutes=1))

    def test_block_without_duration_is_permanent(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(self.url, {
            'is_active': False, 'reason': 'Spam',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.target.refresh_from_db()
        self.assertFalse(self.target.is_active)
        self.assertIsNone(self.target.blocked_until)

    def test_unsupported_duration_is_400(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(self.url, {
            'is_active': False, 'reason': 'Spam', 'duration_days': 3650,
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.target.refresh_from_db()
        self.assertTrue(self.target.is_active)

    def test_unblock_clears_reason_and_expiry(self):
        self.target.is_active = False
        self.target.block_reason = 'Spam'
        self.target.blocked_until = timezone.now() + timedelta(days=7)
        self.target.save()
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(self.url, {'is_active': True}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.target.refresh_from_db()
        self.assertTrue(self.target.is_active)
        self.assertEqual(self.target.block_reason, '')
        self.assertIsNone(self.target.blocked_until)

    def test_block_is_audit_logged_with_reason_and_expiry(self):
        self.client.force_authenticate(user=self.admin)
        self.client.post(self.url, {
            'is_active': False, 'reason': 'Spam', 'duration_days': 1,
        }, format='json')
        log = AuditLog.objects.filter(action='user_block', target_id=self.target.id).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.extra['reason'], 'Spam')
        self.assertIsNotNone(log.extra['blocked_until'])
        self.assertFalse(log.extra['is_active'])
        # Telefon avvalgidek maskalangan holda qoladi (naqsh buzilmadi).
        self.assertEqual(log.extra['phone'], mask_phone(self.target.normalized_phone))

    def test_expired_suspension_is_lifted_on_login(self):
        self.target.is_active = False
        self.target.block_reason = 'Spam'
        self.target.blocked_until = timezone.now() - timedelta(minutes=1)
        self.target.save()
        res = self.client.post(reverse('login'), {
            'phone': self.target.normalized_phone,
            'password': self.password,
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.target.refresh_from_db()
        self.assertTrue(self.target.is_active)
        self.assertEqual(self.target.block_reason, '')
        self.assertIsNone(self.target.blocked_until)

    def test_active_suspension_still_blocks_login(self):
        self.target.is_active = False
        self.target.block_reason = 'Spam'
        self.target.blocked_until = timezone.now() + timedelta(days=1)
        self.target.save()
        res = self.client.post(reverse('login'), {
            'phone': self.target.normalized_phone,
            'password': self.password,
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.target.refresh_from_db()
        self.assertFalse(self.target.is_active)

    def test_permanent_block_is_not_lifted_on_login(self):
        self.target.is_active = False
        self.target.block_reason = 'Spam'
        self.target.save()
        res = self.client.post(reverse('login'), {
            'phone': self.target.normalized_phone,
            'password': self.password,
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.target.refresh_from_db()
        self.assertFalse(self.target.is_active)

    def test_expire_stale_suspensions_task_releases_only_expired(self):
        from accounts.tasks import expire_stale_suspensions

        expired = self.target
        expired.is_active = False
        expired.block_reason = 'Spam'
        expired.blocked_until = timezone.now() - timedelta(hours=1)
        expired.save()
        permanent = User.objects.create_user(
            phone='+998904440003', password='UserPass123', full_name='Permanent',
        )
        permanent.is_active = False
        permanent.block_reason = 'Doimiy'
        permanent.save()
        soft_deleted = User.objects.create_user(
            phone='+998904440004', password='UserPass123', full_name='Deleted',
        )
        soft_deleted.is_active = False
        soft_deleted.deleted_at = timezone.now()
        soft_deleted.save()

        result = expire_stale_suspensions()
        self.assertEqual(result['released_users'], 1)
        expired.refresh_from_db()
        permanent.refresh_from_db()
        soft_deleted.refresh_from_db()
        self.assertTrue(expired.is_active)
        self.assertEqual(expired.block_reason, '')
        self.assertFalse(permanent.is_active)
        self.assertFalse(soft_deleted.is_active)

    def test_detail_exposes_reason_and_expiry(self):
        self.target.is_active = False
        self.target.block_reason = 'Spam'
        self.target.blocked_until = timezone.now() + timedelta(days=7)
        self.target.save()
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(reverse('admin-user-detail', args=[self.target.id]))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['block_reason'], 'Spam')
        self.assertIsNotNone(res.data['blocked_until'])


class AdminUserWarningTestCase(APITestCase):
    """POST /api/admin/users/<id>/warn/ + GET .../warnings/ — bloklashdan
    oldingi rasmiy ogohlantirish."""

    def setUp(self):
        self.admin = User.objects.create_user(
            phone='+998907770001', password='AdminPass123', full_name='Admin',
        )
        self.admin.is_platform_admin = True
        self.admin.save()
        self.target = User.objects.create_user(
            phone='+998907770002', password='UserPass123', full_name='Target',
        )
        self.other = User.objects.create_user(
            phone='+998907770003', password='UserPass123', full_name='Other',
        )
        self.url = reverse('admin-warn-user', args=[self.target.id])
        self.list_url = reverse('admin-user-warnings', args=[self.target.id])

    def test_warn_creates_notification_and_audit_row(self):
        from notifications.models import Notification

        self.client.force_authenticate(user=self.admin)
        res = self.client.post(self.url, {
            'reason': 'Imtihonda shubhali xatti-harakat',
            'message': "Iltimos, imtihon qoidalariga rioya qiling.",
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        note = Notification.objects.get(pk=res.data['id'])
        self.assertEqual(note.user_id, self.target.id)
        self.assertEqual(note.type, Notification.TYPE_ACCOUNT_WARNING)
        self.assertEqual(note.title, 'Ogohlantirish')
        self.assertEqual(note.message, "Iltimos, imtihon qoidalariga rioya qiling.")
        self.assertIsNone(note.center_id)
        log = AuditLog.objects.filter(action='admin_user_warn', target_id=self.target.id).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.extra['reason'], 'Imtihonda shubhali xatti-harakat')
        self.assertEqual(log.extra['phone'], mask_phone(self.target.normalized_phone))

    def test_warning_does_not_block_or_end_sessions(self):
        old_version = self.target.token_version
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(self.url, {
            'reason': 'Spam', 'message': 'Spam yubormang',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.target.refresh_from_db()
        self.assertTrue(self.target.is_active)
        self.assertEqual(self.target.token_version, old_version)
        self.assertEqual(self.target.block_reason, '')
        self.assertIsNone(self.target.blocked_until)

    def test_missing_reason_is_400(self):
        from notifications.models import Notification

        self.client.force_authenticate(user=self.admin)
        res = self.client.post(self.url, {'message': 'Matn'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Notification.objects.exists())

    def test_missing_message_is_400(self):
        from notifications.models import Notification

        self.client.force_authenticate(user=self.admin)
        res = self.client.post(self.url, {'reason': 'Spam', 'message': '   '}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Notification.objects.exists())

    def test_unknown_user_is_404(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(
            reverse('admin-warn-user', args=[99999]),
            {'reason': 'Spam', 'message': 'Matn'}, format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_non_admin_is_403(self):
        self.client.force_authenticate(user=self.target)
        res = self.client.post(self.url, {
            'reason': 'Spam', 'message': 'Matn',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        res = self.client.get(self.list_url)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_list_returns_newest_first_for_this_user_only(self):
        from notifications.models import Notification

        now = timezone.now()
        for i, text in enumerate(['Birinchi', 'Ikkinchi', 'Uchinchi']):
            note = Notification.objects.create(
                user=self.target,
                type=Notification.TYPE_ACCOUNT_WARNING,
                title='Ogohlantirish',
                message=text,
            )
            # created_at — auto_now_add, aniq tartib uchun qo'lda suramiz
            # (i=0 eng eskisi).
            Notification.objects.filter(pk=note.pk).update(created_at=now - timedelta(minutes=10 - i))
        # Boshqa foydalanuvchining ogohlantirishi va shu foydalanuvchining
        # boshqa turdagi xabarnomasi ro'yxatga tushmasligi kerak.
        Notification.objects.create(
            user=self.other, type=Notification.TYPE_ACCOUNT_WARNING,
            title='Ogohlantirish', message="Boshqa hisob",
        )
        Notification.objects.create(
            user=self.target, type=Notification.TYPE_OLYMPIAD_PUBLISHED,
            title='Yangi olimpiada', message="Olimpiada boshlandi",
        )
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self.list_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['user_id'], self.target.id)
        self.assertEqual(
            [w['message'] for w in res.data['warnings']],
            ['Uchinchi', 'Ikkinchi', 'Birinchi'],
        )
        self.assertFalse(res.data['warnings'][0]['is_read'])

    def test_list_is_empty_not_error_for_user_without_warnings(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self.list_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['warnings'], [])

    def test_warn_emails_the_message_but_never_the_internal_reason(self):
        from django.core import mail

        self.target.email = 'target@example.com'
        self.target.save(update_fields=['email'])
        self.client.force_authenticate(user=self.admin)

        res = self.client.post(self.url, {
            'reason': 'ICHKI: uchinchi shikoyat',
            'message': "Iltimos, imtihon qoidalariga rioya qiling.",
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(mail.outbox), 1)
        sent = mail.outbox[0]
        self.assertEqual(sent.to, ['target@example.com'])
        self.assertIn("Iltimos, imtihon qoidalariga rioya qiling.", sent.body)
        # `reason` — ichki izoh, faqat audit jurnalida qoladi.
        self.assertNotIn('ICHKI', sent.body)
        self.assertNotIn('ICHKI', str(sent.alternatives))

    def test_warn_without_email_still_creates_notification(self):
        from django.core import mail
        from notifications.models import Notification

        # Manzil IXTIYORIY va ko'pchilikda bo'sh — email jimgina o'tkazib
        # yuboriladi, ogohlantirishning o'zi baribir yetkaziladi.
        self.assertFalse(self.target.email)
        self.client.force_authenticate(user=self.admin)

        res = self.client.post(self.url, {
            'reason': 'Spam', 'message': 'Spam yubormang',
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(mail.outbox), 0)
        self.assertTrue(Notification.objects.filter(pk=res.data['id']).exists())

    def test_third_warning_in_window_raises_moderation_flag(self):
        from moderation.models import ModerationFlag
        from moderation.services import WARNING_STRIKE_THRESHOLD

        self.client.force_authenticate(user=self.admin)
        flag_ids = []
        for i in range(WARNING_STRIKE_THRESHOLD):
            res = self.client.post(self.url, {
                'reason': f'Sabab {i}', 'message': f'Ogohlantirish {i}',
            }, format='json')
            self.assertEqual(res.status_code, status.HTTP_201_CREATED)
            flag_ids.append(res.data['moderation_flag_id'])

        # Chegaraga yetgan AYNAN oxirgi chaqiruv bayroq ko'taradi.
        self.assertEqual(flag_ids[:-1], [None] * (WARNING_STRIKE_THRESHOLD - 1))
        self.assertIsNotNone(flag_ids[-1])
        flag = ModerationFlag.objects.get(pk=flag_ids[-1])
        self.assertEqual(flag.flag_type, ModerationFlag.FLAG_TYPE_WARNING_THRESHOLD)
        self.assertEqual(flag.target_id, self.target.id)
        self.assertEqual(flag.status, ModerationFlag.STATUS_PENDING)
        # Bayroq — faqat tekshiruv nomzodi: hisob bloklanmaydi.
        self.target.refresh_from_db()
        self.assertTrue(self.target.is_active)

    def test_further_warnings_do_not_duplicate_open_flag(self):
        from moderation.models import ModerationFlag
        from moderation.services import WARNING_STRIKE_THRESHOLD

        self.client.force_authenticate(user=self.admin)
        for i in range(WARNING_STRIKE_THRESHOLD + 2):
            res = self.client.post(self.url, {
                'reason': f'Sabab {i}', 'message': f'Ogohlantirish {i}',
            }, format='json')
            self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        self.assertEqual(ModerationFlag.objects.count(), 1)

    def test_list_unknown_user_is_404(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(reverse('admin-user-warnings', args=[99999]))
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)


class AdminUserSessionTestCase(APITestCase):
    """GET /api/admin/users/<id>/sessions/ + POST .../<event_id>/force-logout/
    — bitta seansni ko'rish va yakunlash (barcha qurilmalarni emas)."""

    def setUp(self):
        self.admin = User.objects.create_user(
            phone='+998907771001', password='AdminPass123', full_name='Admin',
        )
        self.admin.is_platform_admin = True
        self.admin.save()
        self.target = User.objects.create_user(
            phone='+998907771002', password='UserPass123', full_name='Target',
        )
        self.other = User.objects.create_user(
            phone='+998907771003', password='UserPass123', full_name='Other',
        )
        self.list_url = reverse('admin-user-sessions', args=[self.target.id])

    def _session(self, user, jti, *, expired=False, ip='10.0.0.1'):
        """LoginEvent + unga mos OutstandingToken juftligi (haqiqiy login kabi)."""
        from rest_framework_simplejwt.token_blacklist.models import OutstandingToken

        event = LoginEvent.objects.create(
            user=user, ip_address=ip, user_agent='Mozilla/5.0 Test', jti=jti,
        )
        outstanding = OutstandingToken.objects.create(
            user=user,
            jti=jti,
            token='not-a-real-token',
            created_at=timezone.now(),
            expires_at=timezone.now() + (timedelta(days=-1) if expired else timedelta(days=90)),
        )
        return event, outstanding

    def test_list_marks_live_token_active(self):
        event, _ = self._session(self.target, 'jti-live')
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self.list_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['user_id'], self.target.id)
        self.assertEqual(len(res.data['sessions']), 1)
        row = res.data['sessions'][0]
        self.assertEqual(row['login_event_id'], event.id)
        self.assertEqual(row['ip_address'], '10.0.0.1')
        self.assertEqual(row['user_agent'], 'Mozilla/5.0 Test')
        self.assertTrue(row['is_active'])
        self.assertIsNotNone(row['expires_at'])

    def test_list_marks_blacklisted_and_expired_tokens_inactive(self):
        from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken

        _, outstanding = self._session(self.target, 'jti-blacklisted')
        BlacklistedToken.objects.create(token=outstanding)
        self._session(self.target, 'jti-expired', expired=True)
        # Umuman OutstandingToken'siz yozuv (token tozalab yuborilgan).
        LoginEvent.objects.create(user=self.target, jti='jti-orphan')
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self.list_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data['sessions']), 3)
        self.assertTrue(all(s['is_active'] is False for s in res.data['sessions']))
        orphan = [s for s in res.data['sessions'] if s['expires_at'] is None]
        self.assertEqual(len(orphan), 1)

    def test_list_excludes_blank_jti_events_and_other_users(self):
        self._session(self.target, 'jti-mine')
        # `jti` maydoni qo'shilishidan oldingi kirish — alohida yakunlab
        # bo'lmaydi, shuning uchun ro'yxatga tushmaydi.
        LoginEvent.objects.create(user=self.target, ip_address='10.0.0.9', jti='')
        self._session(self.other, 'jti-theirs')
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self.list_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data['sessions']), 1)
        self.assertEqual(res.data['sessions'][0]['ip_address'], '10.0.0.1')

    def test_list_unknown_user_is_404(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(reverse('admin-user-sessions', args=[99999]))
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_force_logout_blacklists_token_and_writes_audit_row(self):
        from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken

        event, outstanding = self._session(self.target, 'jti-kill')
        old_version = self.target.token_version
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(
            reverse('admin-force-logout-session', args=[self.target.id, event.id]),
            {}, format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(res.data['is_active'])
        self.assertTrue(BlacklistedToken.objects.filter(token=outstanding).exists())
        log = AuditLog.objects.filter(
            action='admin_force_logout_session', target_id=self.target.id,
        ).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.extra['login_event_id'], event.id)
        self.assertEqual(log.extra['ip_address'], '10.0.0.1')
        # Boshqa qurilmalar tegilmaydi: bu "barchasidan chiqarish" emas.
        self.target.refresh_from_db()
        self.assertEqual(self.target.token_version, old_version)
        # Ro'yxat endi seansni tugagan deb ko'rsatadi.
        res = self.client.get(self.list_url)
        self.assertFalse(res.data['sessions'][0]['is_active'])

    def test_force_logout_twice_is_not_an_error(self):
        from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken

        event, outstanding = self._session(self.target, 'jti-twice')
        url = reverse('admin-force-logout-session', args=[self.target.id, event.id])
        self.client.force_authenticate(user=self.admin)
        self.assertEqual(self.client.post(url, {}, format='json').status_code,
                         status.HTTP_200_OK)
        self.assertEqual(self.client.post(url, {}, format='json').status_code,
                         status.HTTP_200_OK)
        self.assertEqual(BlacklistedToken.objects.filter(token=outstanding).count(), 1)

    def test_force_logout_blank_jti_session_is_400(self):
        from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken

        event = LoginEvent.objects.create(user=self.target, ip_address='10.0.0.9', jti='')
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(
            reverse('admin-force-logout-session', args=[self.target.id, event.id]),
            {}, format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(BlacklistedToken.objects.exists())

    def test_force_logout_without_outstanding_token_is_400(self):
        from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken

        event = LoginEvent.objects.create(user=self.target, jti='jti-gone')
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(
            reverse('admin-force-logout-session', args=[self.target.id, event.id]),
            {}, format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(BlacklistedToken.objects.exists())

    def test_force_logout_other_users_session_is_404(self):
        from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken

        event, _ = self._session(self.other, 'jti-not-yours')
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(
            # ID mavjud, lekin BOSHQA foydalanuvchiniki — yakunlanmasligi kerak.
            reverse('admin-force-logout-session', args=[self.target.id, event.id]),
            {}, format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(BlacklistedToken.objects.exists())

    def test_non_admin_is_403(self):
        event, _ = self._session(self.target, 'jti-guarded')
        self.client.force_authenticate(user=self.target)
        res = self.client.get(self.list_url)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        res = self.client.post(
            reverse('admin-force-logout-session', args=[self.target.id, event.id]),
            {}, format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


class AdminResetTotpTestCase(APITestCase):
    """POST /api/admin/users/<id>/reset-2fa/ — 2FA'ni majburan o'chirish."""

    def setUp(self):
        self.admin = User.objects.create_user(
            phone='+998905550001', password='AdminPass123', full_name='Admin',
        )
        self.admin.is_platform_admin = True
        self.admin.save()
        self.target = User.objects.create_user(
            phone='+998905550002', password='UserPass123', full_name='Target',
        )
        self.target.totp_enabled = True
        self.target.totp_secret = 'JBSWY3DPEHPK3PXP'
        self.target.save()
        self.url = reverse('admin-reset-user-totp', args=[self.target.id])

    def test_admin_clears_totp_and_bumps_token_version(self):
        old_version = self.target.token_version
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(self.url, {}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.target.refresh_from_db()
        self.assertFalse(self.target.totp_enabled)
        self.assertEqual(self.target.encrypted_totp_secret, '')
        self.assertEqual(self.target.token_version, old_version + 1)
        self.assertTrue(
            AuditLog.objects.filter(action='admin_totp_reset', target_id=self.target.id).exists()
        )

    def test_user_without_totp_is_400(self):
        self.target.totp_enabled = False
        self.target.save(update_fields=['totp_enabled'])
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(self.url, {}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_other_admin_is_400(self):
        self.target.is_platform_admin = True
        self.target.save(update_fields=['is_platform_admin'])
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(self.url, {}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.target.refresh_from_db()
        self.assertTrue(self.target.totp_enabled)

    def test_non_admin_is_403(self):
        self.client.force_authenticate(user=self.target)
        res = self.client.post(self.url, {}, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_unknown_user_is_404(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(reverse('admin-reset-user-totp', args=[99999]), {}, format='json')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)


class AdminForceLogoutTestCase(APITestCase):
    """POST /api/admin/users/<id>/force-logout/ — bloklamasdan chiqarish."""

    def setUp(self):
        self.admin = User.objects.create_user(
            phone='+998906660001', password='AdminPass123', full_name='Admin',
        )
        self.admin.is_platform_admin = True
        self.admin.save()
        self.target = User.objects.create_user(
            phone='+998906660002', password='UserPass123', full_name='Target',
        )
        self.url = reverse('admin-force-logout-user', args=[self.target.id])

    def test_bumps_token_version_without_blocking(self):
        old_version = self.target.token_version
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(self.url, {}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.target.refresh_from_db()
        self.assertEqual(self.target.token_version, old_version + 1)
        self.assertTrue(self.target.is_active)
        self.assertEqual(self.target.block_reason, '')
        self.assertTrue(
            AuditLog.objects.filter(action='admin_force_logout', target_id=self.target.id).exists()
        )

    def test_old_refresh_token_is_rejected_after_force_logout(self):
        login = self.client.post(reverse('login'), {
            'phone': self.target.normalized_phone,
            'password': 'UserPass123',
        }, format='json')
        self.assertEqual(login.status_code, status.HTTP_200_OK)
        refresh = login.cookies['olympy_refresh'].value
        self.client.force_authenticate(user=self.admin)
        self.client.post(self.url, {}, format='json')
        self.client.force_authenticate(user=None)
        self.client.cookies.clear()
        res = self.client.post(reverse('token-refresh'), {'refresh': refresh}, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_self_is_400(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(
            reverse('admin-force-logout-user', args=[self.admin.id]), {}, format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_non_admin_is_403(self):
        self.client.force_authenticate(user=self.target)
        res = self.client.post(self.url, {}, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


class AdminImpersonationTestCase(APITestCase):
    """POST /api/admin/users/<id>/impersonate/[end/] — "sifatida ko'rish".

    Eng nozik admin funksiyasi, shuning uchun testlar asosan CHEKLOVLARNI
    tekshiradi: kim maqsad bo'la olmaydi, token qanday huquq beradi (va
    bermaydi), qachon o'ladi va har ikkala hodisa jurnalga tushadimi.
    """

    def setUp(self):
        self.admin = User.objects.create_user(
            phone='+998907770001', password='AdminPass123', full_name='Admin',
        )
        self.admin.is_platform_admin = True
        self.admin.save()
        self.target = User.objects.create_user(
            phone='+998907770002', password='UserPass123', full_name='Target',
        )
        self.target.roles = ['student']
        self.target.save()
        self.url = reverse('admin-impersonate-user', args=[self.target.id])

    def _start(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(self.url, {}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Bearer token bilan ishlash uchun admin seansidan chiqamiz.
        self.client.force_authenticate(user=None)
        return res.data

    def test_start_returns_token_and_logs_audit(self):
        data = self._start()
        self.assertTrue(data['token'])
        self.assertTrue(data['jti'])
        self.assertEqual(data['user']['id'], self.target.id)
        # Refresh token HECH QACHON qaytmaydi — seansni uzaytirib bo'lmasin.
        self.assertNotIn('refresh', data)
        self.assertTrue(
            AuditLog.objects.filter(
                action='admin_impersonate_start',
                actor=self.admin,
                target_id=self.target.id,
            ).exists()
        )

    def test_token_lifetime_is_shorter_than_normal_session(self):
        from django.conf import settings
        from rest_framework_simplejwt.tokens import AccessToken

        data = self._start()
        token = AccessToken(data['token'])
        lifetime = token['exp'] - token['iat']
        self.assertEqual(lifetime, 15 * 60)
        self.assertEqual(data['expires_in'], 15 * 60)
        self.assertLess(
            lifetime, int(settings.SIMPLE_JWT['ACCESS_TOKEN_LIFETIME'].total_seconds()),
        )
        self.assertEqual(token['impersonated_by'], self.admin.id)
        # `user_id` — simplejwt uni satr sifatida yozadi.
        self.assertEqual(str(token['user_id']), str(self.target.id))

    def test_admin_session_cookies_are_untouched(self):
        # Javob auth cookie O'RNATMAYDI: adminning o'z HttpOnly seansi
        # buzilmasligi kerak (aks holda "qaytish" imkoni yo'qolardi).
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(self.url, {}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertNotIn('olympy_access', res.cookies)
        self.assertNotIn('olympy_refresh', res.cookies)

    def test_token_resolves_to_target_user(self):
        data = self._start()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {data['token']}")
        res = self.client.get(reverse('me'))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['id'], self.target.id)

    def test_token_cannot_reach_admin_endpoints(self):
        # Huquq oshirish yo'qligining asosiy testi: tokenni ADMIN bergan
        # bo'lsa ham, u maqsadli foydalanuvchi sifatida hal qilinadi.
        data = self._start()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {data['token']}")
        self.assertEqual(
            self.client.get(reverse('admin-users-list')).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.get(reverse('admin-audit-log')).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.post(
                reverse('admin-impersonate-user', args=[self.admin.id]), {}, format='json',
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_bearer_wins_over_admin_cookie_and_admin_session_survives(self):
        """Brauzerdagi haqiqiy holat: admin cookie'si VA impersonatsiya
        header'i bir vaqtda yuboriladi.

        Frontend butun oqimi shunga tayanadi: header cookie'dan ustun bo'lsa
        so'rov maqsadli foydalanuvchi sifatida ketadi, header olib tashlansa
        (= "Admin panelga qaytish") adminning o'z seansi joyida turadi.
        """
        login = self.client.post(reverse('login'), {
            'phone': self.admin.normalized_phone, 'password': 'AdminPass123',
        }, format='json')
        self.assertEqual(login.status_code, status.HTTP_200_OK)

        # Impersonatsiya adminning cookie seansi bilan boshlanadi.
        res = self.client.post(self.url, {}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        token = res.data['token']

        # Cookie (admin) + Bearer (maqsad) → maqsadli foydalanuvchi.
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        me = self.client.get(reverse('me'))
        self.assertEqual(me.status_code, status.HTTP_200_OK)
        self.assertEqual(me.data['id'], self.target.id)
        # Admin cookie'si so'rovda bo'lsa ham huquq oshmaydi.
        self.assertEqual(
            self.client.get(reverse('admin-users-list')).status_code,
            status.HTTP_403_FORBIDDEN,
        )

        # Header olib tashlandi — admin yana o'zi (cookie buzilmagan).
        self.client.credentials()
        me_admin = self.client.get(reverse('me'))
        self.assertEqual(me_admin.status_code, status.HTTP_200_OK)
        self.assertEqual(me_admin.data['id'], self.admin.id)
        self.assertEqual(
            self.client.get(reverse('admin-users-list')).status_code,
            status.HTTP_200_OK,
        )

    def test_token_cannot_be_exchanged_for_a_longer_session(self):
        """Impersonatsiya tokenini "yuvib", uzunroq seansga aylantirib
        bo'lmaydi — aks holda 15 daqiqalik oyna ma'nosini yo'qotardi."""
        data = self._start()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {data['token']}")
        # Refresh sifatida yaramaydi (access token, token_type mos emas).
        self.assertEqual(
            self.client.post(
                reverse('token-refresh'), {'refresh': data['token']}, format='json',
            ).status_code,
            status.HTTP_401_UNAUTHORIZED,
        )

    def test_end_revokes_token_and_logs_audit(self):
        data = self._start()
        self.client.force_authenticate(user=self.admin)
        end = self.client.post(
            reverse('admin-end-impersonation', args=[self.target.id]),
            {'jti': data['jti']}, format='json',
        )
        self.assertEqual(end.status_code, status.HTTP_200_OK)
        self.assertTrue(end.data['revoked'])
        self.assertTrue(
            AuditLog.objects.filter(
                action='admin_impersonate_end',
                actor=self.admin,
                target_id=self.target.id,
            ).exists()
        )
        # Token muddati tugamagan bo'lsa ham endi ishlamaydi.
        self.client.force_authenticate(user=None)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {data['token']}")
        self.assertEqual(
            self.client.get(reverse('me')).status_code, status.HTTP_401_UNAUTHORIZED,
        )

    def test_end_without_jti_still_logs(self):
        self._start()
        self.client.force_authenticate(user=self.admin)
        end = self.client.post(
            reverse('admin-end-impersonation', args=[self.target.id]), {}, format='json',
        )
        self.assertEqual(end.status_code, status.HTTP_200_OK)
        self.assertFalse(end.data['revoked'])
        self.assertTrue(
            AuditLog.objects.filter(action='admin_impersonate_end', target_id=self.target.id).exists()
        )

    def test_force_logout_invalidates_impersonation_token(self):
        # Token maqsadli foydalanuvchining `token_version`ini olib yuradi —
        # mavjud bekor qilish yo'llari (majburiy logout, bloklash, parol
        # tiklash) uni ham darhol o'ldiradi.
        data = self._start()
        self.client.force_authenticate(user=self.admin)
        self.client.post(
            reverse('admin-force-logout-user', args=[self.target.id]), {}, format='json',
        )
        self.client.force_authenticate(user=None)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {data['token']}")
        self.assertEqual(
            self.client.get(reverse('me')).status_code, status.HTTP_401_UNAUTHORIZED,
        )

    def test_self_is_400(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(
            reverse('admin-impersonate-user', args=[self.admin.id]), {}, format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_other_admin_is_400(self):
        self.target.is_platform_admin = True
        self.target.save(update_fields=['is_platform_admin'])
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(self.url, {}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(AuditLog.objects.filter(action='admin_impersonate_start').exists())

    def test_blocked_user_is_400(self):
        self.target.is_active = False
        self.target.save(update_fields=['is_active'])
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(self.url, {}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unknown_user_is_404(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(
            reverse('admin-impersonate-user', args=[99999]), {}, format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_non_admin_is_403(self):
        self.client.force_authenticate(user=self.target)
        self.assertEqual(
            self.client.post(self.url, {}, format='json').status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.post(
                reverse('admin-end-impersonation', args=[self.target.id]), {}, format='json',
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )


class AdminBulkUserActionsTestCase(APITestCase):
    """POST /api/admin/users/bulk-set-active/ va PATCH .../bulk-set-roles/.

    Asosiy talab: amal QISMAN bajarilishi mumkin — chetlab o'tilgan id butun
    so'rovni qulatmaydi, `failed` ro'yxatida sabab bilan qaytadi.
    """

    def setUp(self):
        self.admin = User.objects.create_user(
            phone='+998907770001', password='AdminPass123', full_name='Admin',
        )
        self.admin.is_platform_admin = True
        self.admin.save()
        self.other_admin = User.objects.create_user(
            phone='+998907770002', password='AdminPass123', full_name='Other admin',
        )
        self.other_admin.is_platform_admin = True
        self.other_admin.save()
        self.first = User.objects.create_user(
            phone='+998907770003', password='UserPass123', full_name='First',
        )
        self.second = User.objects.create_user(
            phone='+998907770004', password='UserPass123', full_name='Second',
        )
        self.active_url = reverse('admin-bulk-set-user-active')
        self.roles_url = reverse('admin-bulk-set-user-roles')

    def test_block_applies_to_every_target(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(self.active_url, {
            'user_ids': [self.first.id, self.second.id],
            'is_active': False,
            'reason': 'Spam',
            'duration_days': 7,
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(sorted(res.data['succeeded']), sorted([self.first.id, self.second.id]))
        self.assertEqual(res.data['failed'], [])
        for user in (self.first, self.second):
            user.refresh_from_db()
            self.assertFalse(user.is_active)
            self.assertEqual(user.block_reason, 'Spam')
            self.assertIsNotNone(user.blocked_until)

    def test_block_without_reason_is_400_and_changes_nothing(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(self.active_url, {
            'user_ids': [self.first.id], 'is_active': False,
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.first.refresh_from_db()
        self.assertTrue(self.first.is_active)

    def test_admin_self_and_unknown_ids_are_reported_not_fatal(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(self.active_url, {
            'user_ids': [self.first.id, self.admin.id, self.other_admin.id, 999999],
            'is_active': False,
            'reason': 'Spam',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['succeeded'], [self.first.id])
        failed_ids = {row['id'] for row in res.data['failed']}
        self.assertEqual(failed_ids, {self.admin.id, self.other_admin.id, 999999})
        # Muhimi: boshqa admin ommaviy amal bilan bloklanib qolmaydi.
        self.other_admin.refresh_from_db()
        self.admin.refresh_from_db()
        self.assertTrue(self.other_admin.is_active)
        self.assertTrue(self.admin.is_active)

    def test_unblock_clears_reason_and_expiry(self):
        for user in (self.first, self.second):
            user.is_active = False
            user.block_reason = 'Spam'
            user.blocked_until = timezone.now() + timedelta(days=7)
            user.save()
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(self.active_url, {
            'user_ids': [self.first.id, self.second.id], 'is_active': True,
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        for user in (self.first, self.second):
            user.refresh_from_db()
            self.assertTrue(user.is_active)
            self.assertEqual(user.block_reason, '')
            self.assertIsNone(user.blocked_until)

    def test_each_target_gets_its_own_audit_row(self):
        self.client.force_authenticate(user=self.admin)
        self.client.post(self.active_url, {
            'user_ids': [self.first.id, self.second.id],
            'is_active': False,
            'reason': 'Spam',
        }, format='json')
        for user in (self.first, self.second):
            log = AuditLog.objects.filter(action='user_block', target_id=user.id).first()
            self.assertIsNotNone(log)
            self.assertEqual(log.extra['reason'], 'Spam')
            self.assertTrue(log.extra['bulk'])
            self.assertEqual(log.extra['phone'], mask_phone(user.normalized_phone))

    def test_empty_user_ids_is_400(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(self.active_url, {
            'user_ids': [], 'is_active': False, 'reason': 'Spam',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_too_many_ids_is_400(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(self.active_url, {
            'user_ids': list(range(1, 502)), 'is_active': False, 'reason': 'Spam',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_roles_are_replaced_for_every_target(self):
        self.first.roles = ['student']
        self.first.save(update_fields=['roles'])
        self.client.force_authenticate(user=self.admin)
        res = self.client.patch(self.roles_url, {
            'user_ids': [self.first.id, self.second.id], 'roles': ['teacher'],
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(sorted(res.data['succeeded']), sorted([self.first.id, self.second.id]))
        for user in (self.first, self.second):
            user.refresh_from_db()
            self.assertEqual(user.roles, ['teacher'])

    def test_admin_role_key_is_ignored(self):
        # Platform admin huquqi ommaviy amalda berilmaydi (bitta
        # foydalanuvchilik `set-roles/` da qoladi).
        self.client.force_authenticate(user=self.admin)
        res = self.client.patch(self.roles_url, {
            'user_ids': [self.first.id], 'roles': ['admin', 'student'],
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.first.refresh_from_db()
        self.assertEqual(self.first.roles, ['student'])
        self.assertFalse(self.first.is_platform_admin)

    def test_roles_must_be_a_list(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.patch(self.roles_url, {
            'user_ids': [self.first.id], 'roles': 'student',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_role_change_skips_admins_and_logs_each_target(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.patch(self.roles_url, {
            'user_ids': [self.first.id, self.other_admin.id], 'roles': ['student'],
        }, format='json')
        self.assertEqual(res.data['succeeded'], [self.first.id])
        self.assertEqual(res.data['failed'][0]['id'], self.other_admin.id)
        self.other_admin.refresh_from_db()
        self.assertEqual(self.other_admin.roles, [])
        self.assertTrue(
            AuditLog.objects.filter(action='user_role_change', target_id=self.first.id).exists()
        )

    def test_non_admin_is_403(self):
        self.client.force_authenticate(user=self.first)
        res = self.client.post(self.active_url, {
            'user_ids': [self.second.id], 'is_active': False, 'reason': 'Spam',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        res = self.client.patch(self.roles_url, {
            'user_ids': [self.second.id], 'roles': ['teacher'],
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


class AdminUsersCsvExportTestCase(APITestCase):
    """GET /api/admin/users/export/ — filtrlangan ro'yxatning CSV eksporti."""

    def setUp(self):
        self.admin = User.objects.create_user(
            phone='+998908880001', password='AdminPass123', full_name='Admin',
        )
        self.admin.is_platform_admin = True
        self.admin.save()
        self.first = User.objects.create_user(
            phone='+998908880002', password='UserPass123', full_name='Ali Valiyev',
        )
        self.first.roles = ['student']
        self.first.is_premium = True
        self.first.save(update_fields=['roles', 'is_premium'])
        self.second = User.objects.create_user(
            phone='+998908880003', password='UserPass123', full_name='Vali Aliyev',
        )
        self.url = reverse('admin-users-export')

    def _rows(self, response):
        text = response.content.decode('utf-8-sig')
        return [line for line in text.splitlines() if line.strip()]

    def test_returns_csv_attachment_with_expected_columns(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res['Content-Type'].startswith('text/csv'))
        self.assertIn('attachment;', res['Content-Disposition'])
        rows = self._rows(res)
        self.assertEqual(rows[0].split(',')[0], 'ID')
        # Sarlavha + ikki foydalanuvchi (admin ro'yxatga kirmaydi).
        self.assertEqual(len(rows), 3)
        body = '\n'.join(rows[1:])
        self.assertIn('Ali Valiyev', body)
        self.assertIn(self.first.normalized_phone, body)
        self.assertIn('student', body)
        self.assertNotIn('Admin', body)

    def test_search_filter_matches_the_list_endpoint(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self.url, {'search': 'Ali Valiyev'})
        rows = self._rows(res)
        self.assertEqual(len(rows), 2)
        self.assertIn('Ali Valiyev', rows[1])
        # Bir xil filtr ro'yxat endpoint'ida ham bitta natija beradi.
        listed = self.client.get(reverse('admin-users-list'), {'search': 'Ali Valiyev'})
        self.assertEqual(listed.data['count'], 1)

    def test_phone_search_filter(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self.url, {'search': '+998908880003'})
        rows = self._rows(res)
        self.assertEqual(len(rows), 2)
        self.assertIn('Vali Aliyev', rows[1])

    def test_row_cap_sets_truncated_header(self):
        self.client.force_authenticate(user=self.admin)
        with patch('accounts.views.ADMIN_EXPORT_MAX_ROWS', 1):
            res = self.client.get(self.url)
        self.assertEqual(res['X-Export-Truncated'], '1')
        # Sarlavha + chegara bo'yicha bitta qator.
        self.assertEqual(len(self._rows(res)), 2)

    def test_no_truncated_header_when_under_cap(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self.url)
        self.assertNotIn('X-Export-Truncated', res)

    def test_formula_like_name_is_escaped(self):
        self.first.full_name = '=cmd|calc'
        self.first.save(update_fields=['full_name'])
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self.url)
        self.assertIn("'=cmd|calc", res.content.decode('utf-8-sig'))

    def test_non_admin_is_403(self):
        self.client.force_authenticate(user=self.first)
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_is_rejected(self):
        res = self.client.get(self.url)
        self.assertIn(
            res.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )


class AdminUserMergeTestCase(APITestCase):
    """POST /api/admin/users/merge/preview/ va .../commit/.

    Asosiy talablar: preview HECH NARSANI o'zgartirmaydi, commit atomik,
    manba hisob o'chirilmaydi (doimiy bloklanadi) va buxgalteriya /
    markaz a'zoligi / reyting ma'lumotlari TEGILMAY qoladi.
    """

    def setUp(self):
        from attempts.models import TestAttempt
        from centers.models import EducationCenter
        from olympiads.models import Olympiad

        self.admin = User.objects.create_user(
            phone='+998907780001', password='AdminPass123', full_name='Admin',
        )
        self.admin.is_platform_admin = True
        self.admin.save()
        # Eski (SIM yo'qolgan) hisob va yangi raqam bilan ochilgan hisob.
        self.old = User.objects.create_user(
            phone='+998907780002', password='UserPass123', full_name='Eski hisob',
        )
        self.old.coins = 120
        self.old.streak_count = 9
        self.old.longest_streak = 14
        self.old.save()
        self.new = User.objects.create_user(
            phone='+998907780003', password='UserPass123', full_name='Yangi hisob',
        )
        self.new.coins = 30
        self.new.streak_count = 4
        self.new.longest_streak = 4
        self.new.save()

        self.center = EducationCenter.objects.create(name='Markaz', city='Toshkent')
        self.olympiad = Olympiad.objects.create(
            center=self.center, title='Matematika', subject='Matematika',
            status='active',
            start_datetime=timezone.now() - timedelta(minutes=10),
            duration_minutes=60,
        )
        self.shared_olympiad = Olympiad.objects.create(
            center=self.center, title='Fizika', subject='Fizika',
            status='active',
            start_datetime=timezone.now() - timedelta(minutes=10),
            duration_minutes=60,
        )
        # Faqat eski hisobda bor — ko'chadi.
        TestAttempt.objects.create(user=self.old, olympiad=self.olympiad, score=90)
        # Ikkalasida ham bor — (user, olympiad) UNIQUE, ya'ni to'qnashuv.
        TestAttempt.objects.create(user=self.old, olympiad=self.shared_olympiad, score=40)
        TestAttempt.objects.create(user=self.new, olympiad=self.shared_olympiad, score=70)
        LoginEvent.objects.create(user=self.old, ip_address='10.0.0.1')
        LoginEvent.objects.create(user=self.old, ip_address='10.0.0.2')

        self.preview_url = reverse('admin-merge-users-preview')
        self.commit_url = reverse('admin-merge-users-commit')

    def _preview(self, source=None, target=None):
        return self.client.post(self.preview_url, {
            'source_id': (source or self.old).id,
            'target_id': (target or self.new).id,
        }, format='json')

    def _commit(self, source=None, target=None):
        return self.client.post(self.commit_url, {
            'source_id': (source or self.old).id,
            'target_id': (target or self.new).id,
        }, format='json')

    # ─── preview ──────────────────────────────────────────────────────────

    def test_preview_counts_moves_and_collisions(self):
        self.client.force_authenticate(user=self.admin)
        res = self._preview()
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data['can_merge'])
        moves = {row['model']: row for row in res.data['moves']}
        # Bitta urinish ko'chadi, bittasi to'qnashuv sababli qoladi.
        self.assertEqual(moves['attempts.TestAttempt']['move'], 1)
        self.assertEqual(moves['attempts.TestAttempt']['skip'], 1)
        self.assertEqual(moves['accounts.LoginEvent']['move'], 2)
        self.assertEqual(moves['accounts.LoginEvent']['skip'], 0)
        self.assertEqual(res.data['totals'], {'move': 3, 'skip': 1})

    def test_preview_computes_balances_without_saving(self):
        self.client.force_authenticate(user=self.admin)
        res = self._preview()
        self.assertEqual(res.data['balances']['coins']['result'], 150)
        self.assertEqual(res.data['balances']['streak_count']['result'], 9)
        self.assertEqual(res.data['balances']['longest_streak']['result'], 14)
        # Quruq yurish — DB tegilmagan bo'lishi kerak.
        self.old.refresh_from_db()
        self.new.refresh_from_db()
        self.assertEqual(self.old.coins, 120)
        self.assertEqual(self.new.coins, 30)
        self.assertTrue(self.old.is_active)

    def test_preview_does_not_move_any_row(self):
        from attempts.models import TestAttempt

        self.client.force_authenticate(user=self.admin)
        self._preview()
        self.assertEqual(TestAttempt.objects.filter(user=self.old).count(), 2)
        self.assertEqual(TestAttempt.objects.filter(user=self.new).count(), 1)
        self.assertFalse(AuditLog.objects.filter(action='admin_user_merge').exists())

    def test_preview_reports_untouched_billing_and_membership(self):
        from billing.models import SubscriptionPlan, UserSubscription
        from centers.models import CenterMembership

        plan = SubscriptionPlan.objects.create(
            name='Pro', price=10000, duration_days=30,
        )
        UserSubscription.objects.create(
            user=self.old, plan=plan, end_date=timezone.now() + timedelta(days=30),
        )
        CenterMembership.objects.create(
            user=self.old, center=self.center, role=CenterMembership.ROLE_STUDENT,
        )
        self.client.force_authenticate(user=self.admin)
        res = self._preview()
        untouched = {row['model']: row['count'] for row in res.data['untouched']}
        self.assertEqual(untouched['billing.UserSubscription'], 1)
        self.assertEqual(untouched['centers.CenterMembership'], 1)
        # Ko'chadigan modellar ro'yxatida bo'lmasligi kerak.
        self.assertNotIn(
            'billing.UserSubscription', {row['model'] for row in res.data['moves']},
        )

    # ─── commit ───────────────────────────────────────────────────────────

    def test_commit_moves_rows_and_keeps_target_row_on_collision(self):
        from attempts.models import TestAttempt

        self.client.force_authenticate(user=self.admin)
        res = self._commit()
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['moved']['attempts.TestAttempt'], 1)
        self.assertEqual(res.data['skipped']['attempts.TestAttempt'], 1)
        # Ko'chgan urinish endi yangi hisobda.
        self.assertEqual(
            TestAttempt.objects.get(olympiad=self.olympiad).user_id, self.new.id,
        )
        # To'qnashuvda maqsadli hisobning natijasi qoladi, manbadagi joyida.
        kept = TestAttempt.objects.filter(olympiad=self.shared_olympiad)
        self.assertEqual(kept.count(), 2)
        self.assertEqual(kept.get(user=self.new).score, 70)
        self.assertEqual(kept.get(user=self.old).score, 40)
        self.assertEqual(LoginEvent.objects.filter(user=self.new).count(), 2)
        self.assertEqual(LoginEvent.objects.filter(user=self.old).count(), 0)

    def test_commit_sums_coins_and_takes_best_streak(self):
        self.client.force_authenticate(user=self.admin)
        self._commit()
        self.new.refresh_from_db()
        self.old.refresh_from_db()
        self.assertEqual(self.new.coins, 150)
        self.assertEqual(self.new.streak_count, 9)
        self.assertEqual(self.new.longest_streak, 14)
        # Balans ko'chdi — manbada qolmasligi kerak (ikki marta sarflanmasin).
        self.assertEqual(self.old.coins, 0)

    def test_commit_blocks_source_permanently_without_deleting_it(self):
        self.client.force_authenticate(user=self.admin)
        before_version = self.old.token_version
        self._commit()
        self.old.refresh_from_db()
        self.assertTrue(User.objects.filter(pk=self.old.id).exists())
        self.assertFalse(self.old.is_active)
        self.assertIsNone(self.old.deleted_at)
        self.assertEqual(self.old.block_reason, f'#{self.new.id} hisobiga birlashtirildi')
        # Doimiy blok — muddati tugagan blokni ochish mexanizmi tegmasin.
        self.assertIsNone(self.old.blocked_until)
        self.assertGreater(self.old.token_version, before_version)

    def test_merged_source_cannot_log_in(self):
        self.client.force_authenticate(user=self.admin)
        self._commit()
        self.client.force_authenticate(user=None)
        res = self.client.post(reverse('login'), {
            'phone': '+998907780002', 'password': 'UserPass123',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_commit_leaves_billing_and_membership_on_source(self):
        from billing.models import SubscriptionPlan, UserSubscription
        from centers.models import CenterMembership

        plan = SubscriptionPlan.objects.create(
            name='Pro', price=10000, duration_days=30,
        )
        sub = UserSubscription.objects.create(
            user=self.old, plan=plan, end_date=timezone.now() + timedelta(days=30),
        )
        membership = CenterMembership.objects.create(
            user=self.old, center=self.center, role=CenterMembership.ROLE_STUDENT,
        )
        self.client.force_authenticate(user=self.admin)
        self._commit()
        sub.refresh_from_db()
        membership.refresh_from_db()
        self.assertEqual(sub.user_id, self.old.id)
        self.assertEqual(membership.user_id, self.old.id)
        # Premium ham ko'chirilmaydi — pullik huquq avtomatik o'tmasin.
        self.new.refresh_from_db()
        self.assertFalse(self.new.is_premium)

    def test_commit_writes_audit_rows_for_both_accounts(self):
        self.client.force_authenticate(user=self.admin)
        self._commit()
        merge_log = AuditLog.objects.get(action='admin_user_merge')
        self.assertEqual(merge_log.target_id, self.new.id)
        self.assertEqual(merge_log.extra['source_id'], self.old.id)
        self.assertEqual(merge_log.extra['coins_moved'], 120)
        self.assertEqual(merge_log.extra['moved']['attempts.TestAttempt'], 1)
        self.assertEqual(merge_log.extra['skipped']['attempts.TestAttempt'], 1)
        self.assertEqual(merge_log.extra['source_phone'], mask_phone(self.old.normalized_phone))
        # Manba hisob o'z tarixida bloklash yozuvini oladi.
        block_log = AuditLog.objects.get(action='user_block', target_id=self.old.id)
        self.assertEqual(
            block_log.extra['reason'], f'#{self.new.id} hisobiga birlashtirildi',
        )

    def test_old_audit_rows_keep_pointing_at_the_source_id(self):
        historical = AuditLog.objects.create(
            action='user_premium_toggle', target_id=self.old.id, target_type='User',
        )
        self.client.force_authenticate(user=self.admin)
        self._commit()
        historical.refresh_from_db()
        # Audit — tarixiy yozuv, birlashtirish uni qayta yozmaydi.
        self.assertEqual(historical.target_id, self.old.id)

    # ─── to'siqlar ────────────────────────────────────────────────────────

    def test_same_user_is_blocked(self):
        self.client.force_authenticate(user=self.admin)
        res = self._preview(source=self.old, target=self.old)
        self.assertFalse(res.data['can_merge'])
        commit = self._commit(source=self.old, target=self.old)
        self.assertEqual(commit.status_code, status.HTTP_400_BAD_REQUEST)

    def test_admin_account_cannot_be_merged(self):
        self.client.force_authenticate(user=self.admin)
        for source, target in ((self.admin, self.new), (self.old, self.admin)):
            res = self._commit(source=source, target=target)
            self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.is_active)

    def test_center_owner_cannot_be_merged(self):
        from centers.models import EducationCenter

        EducationCenter.objects.create(name='Egalik', city='Toshkent', owner=self.old)
        self.client.force_authenticate(user=self.admin)
        res = self._preview()
        self.assertFalse(res.data['can_merge'])
        self.assertTrue(any('markaz egasi' in b for b in res.data['blockers']))

    def test_soft_deleted_target_is_blocked(self):
        self.new.deleted_at = timezone.now()
        self.new.save(update_fields=['deleted_at'])
        self.client.force_authenticate(user=self.admin)
        res = self._commit()
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_second_merge_of_the_same_source_is_blocked(self):
        third = User.objects.create_user(
            phone='+998907780004', password='UserPass123', full_name='Uchinchi',
        )
        self.client.force_authenticate(user=self.admin)
        self.assertEqual(self._commit().status_code, status.HTTP_200_OK)
        res = self._commit(source=self.old, target=third)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unknown_user_is_404(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(self.commit_url, {
            'source_id': 999999, 'target_id': self.new.id,
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_non_numeric_ids_are_400(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(self.preview_url, {'source_id': 'x'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_non_admin_is_403(self):
        self.client.force_authenticate(user=self.old)
        self.assertEqual(self._preview().status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self._commit().status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_is_rejected(self):
        res = self._commit()
        self.assertIn(
            res.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )


class AdminDeleteUserTestCase(APITestCase):
    """POST /api/admin/users/<id>/delete/ — admin nomidan soft-delete."""

    def setUp(self):
        self.admin = User.objects.create_user(
            phone='+998907790001', password='AdminPass123', full_name='Admin',
        )
        self.admin.is_platform_admin = True
        self.admin.save()
        self.other_admin = User.objects.create_user(
            phone='+998907790002', password='AdminPass123', full_name='Boshqa admin',
        )
        self.other_admin.is_platform_admin = True
        self.other_admin.save()
        self.password = 'UserPass123'
        self.target = User.objects.create_user(
            phone='+998907790003', password=self.password, full_name='Target',
        )
        self.url = reverse('admin-delete-user', args=[self.target.id])

    def test_soft_deletes_and_revokes_sessions(self):
        before = self.target.token_version
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(self.url, {'reason': 'Foydalanuvchi so\'radi'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data['soft_deleted'])
        self.assertTrue(res.data['restorable_until'])
        self.target.refresh_from_db()
        self.assertFalse(self.target.is_active)
        self.assertIsNotNone(self.target.deleted_at)
        # Barcha qurilmalardagi JWT'lar bekor bo'lishi kerak.
        self.assertEqual(self.target.token_version, before + 1)

    def test_audit_log_records_reason(self):
        self.client.force_authenticate(user=self.admin)
        self.client.post(self.url, {'reason': 'Spam hisob'}, format='json')
        log = AuditLog.objects.get(action='admin_account_delete')
        self.assertEqual(log.target_id, self.target.id)
        self.assertEqual(log.actor_id, self.admin.id)
        self.assertEqual(log.extra['reason'], 'Spam hisob')
        self.assertEqual(log.extra['phone'], mask_phone(self.target.normalized_phone))

    def test_reason_is_optional(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(self.url, {}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIsNone(AuditLog.objects.get(action='admin_account_delete').extra['reason'])

    def test_user_can_restore_within_grace(self):
        # Admin o'chirgan hisob ham grace ichida foydalanuvchining o'zi
        # tomonidan tiklanadi — bu bloklash emas, "hisobimni yoping" javobi.
        self.client.force_authenticate(user=self.admin)
        self.client.post(self.url, {}, format='json')
        self.client.force_authenticate(user=None)
        res = self.client.post(reverse('restore-my-account'), {
            'phone': self.target.normalized_phone, 'password': self.password,
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.target.refresh_from_db()
        self.assertTrue(self.target.is_active)
        self.assertIsNone(self.target.deleted_at)

    def test_cannot_delete_self(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(reverse('admin-delete-user', args=[self.admin.id]), {}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.is_active)

    def test_cannot_delete_another_admin(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(
            reverse('admin-delete-user', args=[self.other_admin.id]), {}, format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.other_admin.refresh_from_db()
        self.assertTrue(self.other_admin.is_active)

    def test_center_owner_is_409(self):
        from centers.models import EducationCenter

        EducationCenter.objects.create(name='Markaz', city='Toshkent', owner=self.target)
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(self.url, {}, format='json')
        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)
        self.target.refresh_from_db()
        self.assertIsNone(self.target.deleted_at)

    def test_second_delete_is_400_and_keeps_first_deadline(self):
        self.client.force_authenticate(user=self.admin)
        self.client.post(self.url, {}, format='json')
        self.target.refresh_from_db()
        first_deleted_at = self.target.deleted_at
        res = self.client.post(self.url, {}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.target.refresh_from_db()
        self.assertEqual(self.target.deleted_at, first_deleted_at)

    def test_unknown_user_is_404(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(reverse('admin-delete-user', args=[99999]), {}, format='json')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_non_admin_is_403(self):
        self.client.force_authenticate(user=self.target)
        res = self.client.post(self.url, {}, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


class AdminUserContentTestCase(APITestCase):
    """Foydalanuvchi kontenti: tarix ro'yxati + bitta elementni o'chirish.

    GET /api/admin/users/<id>/content-history/ va
    DELETE /api/admin/users/<id>/content/<type>/<content_id>/.
    """

    def setUp(self):
        from attempts.models import TestAttempt
        from centers.models import EducationCenter
        from olympiads.models import Olympiad
        from questions.models import Question

        self.admin = User.objects.create_user(
            phone='+998907791001', password='AdminPass123', full_name='Admin',
        )
        self.admin.is_platform_admin = True
        self.admin.save()
        self.teacher = User.objects.create_user(
            phone='+998907791002', password='UserPass123', full_name='Ustoz',
        )
        self.other = User.objects.create_user(
            phone='+998907791003', password='UserPass123', full_name='Boshqa',
        )
        self.center = EducationCenter.objects.create(name='Markaz', city='Toshkent')
        self.question = Question.objects.create(
            center=self.center, subject='Matematika', text='2+2=?',
            options=['3', '4'], correct_answer=1, created_by=self.teacher,
        )
        self.other_question = Question.objects.create(
            center=self.center, subject='Fizika', text='Boshqaning savoli',
            options=['1', '2'], correct_answer=0, created_by=self.other,
        )
        self.olympiad = Olympiad.objects.create(
            center=self.center, title='Draft olimpiada', subject='Matematika',
            status=Olympiad.STATUS_DRAFT, created_by=self.teacher,
            start_datetime=timezone.now() + timedelta(days=1), duration_minutes=60,
        )
        self.active_olympiad = Olympiad.objects.create(
            center=self.center, title='Faol olimpiada', subject='Fizika',
            status=Olympiad.STATUS_ACTIVE, created_by=self.teacher,
            start_datetime=timezone.now() - timedelta(minutes=10), duration_minutes=60,
        )
        TestAttempt.objects.create(
            user=self.teacher, olympiad=self.active_olympiad, score=80,
        )
        self.history_url = reverse('admin-user-content-history', args=[self.teacher.id])

    def _delete_url(self, content_type, content_id, user_id=None):
        return reverse(
            'admin-delete-user-content',
            args=[user_id or self.teacher.id, content_type, content_id],
        )

    # ─── content-history ──────────────────────────────────────────────────

    def test_history_returns_only_this_user_content(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self.history_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['user_id'], self.teacher.id)
        self.assertEqual(res.data['totals'], {'questions': 1, 'olympiads': 2, 'attempts': 1})
        self.assertEqual([q['id'] for q in res.data['questions']], [self.question.id])
        self.assertEqual(res.data['questions'][0]['center_name'], 'Markaz')
        self.assertEqual(
            {o['id'] for o in res.data['olympiads']},
            {self.olympiad.id, self.active_olympiad.id},
        )
        self.assertEqual(res.data['attempts'][0]['olympiad_title'], 'Faol olimpiada')

    def test_history_is_capped_but_totals_are_exact(self):
        from questions.models import Question

        for i in range(25):
            Question.objects.create(
                center=self.center, subject='Matematika', text=f'Savol {i}',
                options=['1', '2'], correct_answer=0, created_by=self.teacher,
            )
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self.history_url)
        self.assertEqual(len(res.data['questions']), 20)
        self.assertEqual(res.data['totals']['questions'], 26)

    def test_history_unknown_user_is_404(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(reverse('admin-user-content-history', args=[99999]))
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_history_non_admin_is_403(self):
        self.client.force_authenticate(user=self.teacher)
        self.assertEqual(self.client.get(self.history_url).status_code,
                         status.HTTP_403_FORBIDDEN)

    # ─── content delete ───────────────────────────────────────────────────

    def test_unused_question_is_deleted_and_account_untouched(self):
        from questions.models import Question

        self.client.force_authenticate(user=self.admin)
        res = self.client.delete(self._delete_url('question', self.question.id))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(res.data['archived'])
        self.assertFalse(Question.objects.filter(pk=self.question.id).exists())
        # Hisobga tegilmasligi kerak.
        self.teacher.refresh_from_db()
        self.assertTrue(self.teacher.is_active)
        self.assertIsNone(self.teacher.deleted_at)

    def test_question_in_use_is_archived_not_deleted(self):
        from questions.models import Question

        # Faol olimpiadaga biriktirilgan savol — o'chirish tarixiy baholash
        # ma'lumotini yo'qotardi, shuning uchun arxivlanadi.
        self.active_olympiad.questions.add(self.question)
        self.client.force_authenticate(user=self.admin)
        res = self.client.delete(self._delete_url('question', self.question.id))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data['archived'])
        self.assertTrue(Question.objects.filter(pk=self.question.id).exists())
        self.question.refresh_from_db()
        self.assertFalse(self.question.is_active)

    def test_olympiad_is_soft_deleted(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.delete(self._delete_url('olympiad', self.olympiad.id))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.olympiad.refresh_from_db()
        self.assertTrue(self.olympiad.is_deleted)

    def test_active_olympiad_cannot_be_deleted(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.delete(self._delete_url('olympiad', self.active_olympiad.id))
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.active_olympiad.refresh_from_db()
        self.assertFalse(self.active_olympiad.is_deleted)

    def test_audit_log_targets_content_owner(self):
        self.client.force_authenticate(user=self.admin)
        self.client.delete(self._delete_url('question', self.question.id))
        log = AuditLog.objects.get(action='admin_content_delete')
        self.assertEqual(log.target_id, self.teacher.id)
        self.assertEqual(log.target_type, 'User')
        self.assertEqual(log.extra['content_type'], 'question')
        self.assertEqual(log.extra['content_id'], self.question.id)

    def test_content_of_another_user_is_404(self):
        from questions.models import Question

        self.client.force_authenticate(user=self.admin)
        res = self.client.delete(self._delete_url('question', self.other_question.id))
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(Question.objects.filter(pk=self.other_question.id).exists())

    def test_unknown_content_type_is_400(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.delete(self._delete_url('attempt', 1))
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_delete_non_admin_is_403(self):
        from questions.models import Question

        self.client.force_authenticate(user=self.teacher)
        res = self.client.delete(self._delete_url('question', self.question.id))
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(Question.objects.filter(pk=self.question.id).exists())


class BadgeQueryCountTestCase(APITestCase):
    """`User.get_badges()` — bitta so'rov (login javobining bir qismi).

    Nishonlar har bir `UserSerializer` chiqishida hisoblanadi, jumladan
    LOGIN javobida. Avval bu yerda ikkita alohida `COUNT(*)` so'rovi bor edi
    — masofadagi (managed) PostgreSQL'da bu keraksiz ikkinchi round-trip.
    Shartli agregatsiyaga o'tgach bitta so'rov qoldi; test shu holatni
    qotirib qo'yadi va chegaralar (3/10) o'zgarmaganini tekshiradi.
    """

    def setUp(self):
        from centers.models import EducationCenter

        self.user = User.objects.create_user(
            phone='+998907654321', password='StrongPass123', full_name='Nishon Test',
        )
        self.center = EducationCenter.objects.create(name='Nishon Markazi')
        self._made = 0

    def _add_attempt(self, score, disqualified=False):
        from attempts.models import TestAttempt
        from olympiads.models import Olympiad

        self._made += 1
        olympiad = Olympiad.objects.create(
            center=self.center,
            title=f'Olimpiada {self._made}',
            subject='Matematika',
        )
        TestAttempt.objects.create(
            user=self.user, olympiad=olympiad, score=score,
            disqualified=disqualified,
        )

    def _badge_ids(self):
        return {b['id'] for b in User.objects.get(pk=self.user.pk).get_badges()}

    def test_single_query_without_annotations(self):
        for _ in range(4):
            self._add_attempt(100)
        user = User.objects.get(pk=self.user.pk)
        with self.assertNumQueries(1):
            user.get_badges()

    def test_no_query_when_annotated(self):
        from django.db.models import Count, Q

        self._add_attempt(100)
        annotated = User.objects.annotate(
            attempts_100_count=Count(
                'attempts',
                filter=Q(attempts__score=100, attempts__disqualified=False),
                distinct=True,
            ),
            total_attempts_count=Count(
                'attempts',
                filter=Q(attempts__disqualified=False),
                distinct=True,
            ),
        ).get(pk=self.user.pk)
        with self.assertNumQueries(0):
            annotated.get_badges()

    def test_thresholds_and_disqualified_exclusion(self):
        self.assertEqual(self._badge_ids(), set())

        # Diskvalifikatsiya qilinganlar hech qaysi hisobga kirmaydi.
        for _ in range(12):
            self._add_attempt(100, disqualified=True)
        self.assertEqual(self._badge_ids(), set())

        # 3 ta 100% — "Mukammal Natija".
        for _ in range(3):
            self._add_attempt(100)
        self.assertEqual(self._badge_ids(), {'perfect_score'})

        # 10 ta urinish (100% bo'lmaganlari ham) — "Tajribali" qo'shiladi.
        for _ in range(7):
            self._add_attempt(50)
        self.assertEqual(self._badge_ids(), {'perfect_score', 'veteran'})

        # 10 ta 100% — "Matematika Qiroli" `perfect_score` o'rnini egallaydi.
        for _ in range(7):
            self._add_attempt(100)
        self.assertEqual(self._badge_ids(), {'math_king', 'veteran'})


class LastSeenTestCase(APITestCase):
    """`User.touch_last_seen()` — admin panelidagi "oxirgi ko'rilgan" ustuni.

    Metod HAR bir autentifikatsiyalangan so'rovda chaqiriladi
    (`OlympyJWTAuthentication.authenticate`), shuning uchun eng muhim shart —
    u har safar DB'ga YOZMASLIGI. Chegara tekshiruvi xotiradagi qiymatga
    tayanadi: qo'shimcha SELECT ham bo'lmasligi kerak.
    """

    def setUp(self):
        self.phone = '+998905550777'
        self.password = 'StrongPass123'
        self.user = User.objects.create_user(
            phone=self.phone, password=self.password, full_name='Oxirgi Faollik',
        )

    def test_first_touch_writes(self):
        self.assertIsNone(self.user.last_seen_at)
        self.assertTrue(self.user.touch_last_seen())
        self.user.refresh_from_db()
        self.assertIsNotNone(self.user.last_seen_at)

    def test_second_touch_within_interval_makes_no_query(self):
        self.user.touch_last_seen()
        with self.assertNumQueries(0):
            self.assertFalse(self.user.touch_last_seen())

    def test_touch_after_interval_writes_again(self):
        from accounts.models import LAST_SEEN_WRITE_INTERVAL_SECONDS

        stale = timezone.now() - timedelta(
            seconds=LAST_SEEN_WRITE_INTERVAL_SECONDS + 1,
        )
        User.objects.filter(pk=self.user.pk).update(last_seen_at=stale)
        self.user.refresh_from_db()
        self.assertTrue(self.user.touch_last_seen())
        self.user.refresh_from_db()
        self.assertGreater(self.user.last_seen_at, stale)

    def test_authenticated_request_records_last_seen(self):
        """Integratsiya: yozuv aynan JWT autentifikatsiyasida sodir bo'ladi.

        Login javobi tokenlarni HttpOnly cookie'ga qo'yadi (body'da faqat
        `JWT_EXPOSE_TOKENS_IN_BODY` bo'lsa) — test klienti cookie'ni saqlaydi,
        shuning uchun keyingi so'rov autentifikatsiyalangan bo'ladi.
        """
        login = self.client.post(reverse('login'), {
            'phone': self.phone,
            'password': self.password,
        }, format='json')
        self.assertEqual(login.status_code, status.HTTP_200_OK)
        # Login o'zi `authenticate()` dan o'tmaydi — belgi hali qo'yilmagan.
        self.user.refresh_from_db()
        self.assertIsNone(self.user.last_seen_at)
        self.assertEqual(self.client.get(reverse('me')).status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertIsNotNone(self.user.last_seen_at)
