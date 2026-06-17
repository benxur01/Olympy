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
    (sinovi 3 kun ichida tugaydigan, is_premium=False, telegram bog'langan,
    eslatma hali yuborilmagan) bir martalik Telegram xabar yuborishini va
    `trial_reminder_sent_at`'ni o'rnatishini tekshiradi. `_send_telegram_message`
    mock qilinadi — haqiqiy Telegram chaqirilmaydi.
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

    @patch('accounts.views._send_telegram_message', return_value=True)
    def test_reminder_sent_for_ending_trial(self, mock_send):
        """Sinovi 2 kun ichida tugaydigan, telegram bog'langan, is_premium=False
        userga eslatma yuboriladi va trial_reminder_sent_at o'rnatiladi."""
        from accounts.tasks import send_trial_ending_reminders

        user = User.objects.create_user(
            phone='+998901119001', password='UserPass123', full_name='Trial User',
            is_premium=False,
        )
        user.premium_trial_end = timezone.now() + timedelta(days=2)
        user.telegram_chat_id = '123456'
        user.save()
        self._make_attempt(user, score=80, days_ago=2)

        result = send_trial_ending_reminders()

        self.assertEqual(result, {'sent': 1, 'skipped': 0})
        mock_send.assert_called_once()
        # Xabarda real statistika (test soni / o'rtacha ball) bo'lishi kerak.
        sent_text = mock_send.call_args.args[1]
        self.assertIn('1 ta test', sent_text)
        user.refresh_from_db()
        self.assertIsNotNone(user.trial_reminder_sent_at)

    @patch('accounts.views._send_telegram_message', return_value=True)
    def test_premium_user_skipped(self, mock_send):
        """is_premium=True (pullik obunaga o'tgan) userga yuborilmaydi."""
        from accounts.tasks import send_trial_ending_reminders

        user = User.objects.create_user(
            phone='+998901119002', password='UserPass123', full_name='Paid User',
            is_premium=True,
        )
        user.premium_trial_end = timezone.now() + timedelta(days=2)
        user.telegram_chat_id = '123457'
        user.save()

        result = send_trial_ending_reminders()

        self.assertEqual(result, {'sent': 0, 'skipped': 0})
        mock_send.assert_not_called()
        user.refresh_from_db()
        self.assertIsNone(user.trial_reminder_sent_at)

    @patch('accounts.views._send_telegram_message', return_value=True)
    def test_far_trial_skipped(self, mock_send):
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
        mock_send.assert_not_called()

    @patch('accounts.views._send_telegram_message', return_value=True)
    def test_already_reminded_not_resent(self, mock_send):
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
        mock_send.assert_not_called()
        user.refresh_from_db()
        # Eski vaqt o'zgarmasligi kerak.
        self.assertEqual(user.trial_reminder_sent_at, already)

    @patch('accounts.views._send_telegram_message', return_value=True)
    def test_no_telegram_skipped(self, mock_send):
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
        mock_send.assert_not_called()
        user.refresh_from_db()
        self.assertIsNone(user.trial_reminder_sent_at)

    @patch('accounts.views._send_telegram_message', return_value=True)
    def test_no_attempts_uses_generic_message(self, mock_send):
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
        sent_text = mock_send.call_args.args[1]
        # Statistika yo'q — "N ta test" iborasi bo'lmasligi kerak.
        self.assertNotIn('ta test ishladingiz', sent_text)
        user.refresh_from_db()
        self.assertIsNotNone(user.trial_reminder_sent_at)


