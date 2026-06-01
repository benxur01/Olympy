from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import PhoneVerification

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
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(User.objects.filter(normalized_phone=phone).exists())


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


