"""Analytics metrikalari uchun deterministik testlar.

Sun'iy foydalanuvchi/obuna/attempt yaratib, retention va conversion
hisob-kitoblari kutilgan natijani berishini tekshiramiz.
"""
import time
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase
from django.utils import timezone

from attempts.models import TestAttempt
from billing.models import SubscriptionPlan, UserSubscription
from centers.models import EducationCenter
from olympiads.models import Olympiad

from . import presence
from .metrics import compute_metrics

User = get_user_model()


def _set_created(user, dt):
    """auto_now_add bo'lgan created_at'ni testda majburan o'rnatamiz."""
    User.objects.filter(pk=user.pk).update(created_at=dt)
    user.refresh_from_db()


class RetentionMetricsTests(TestCase):
    def setUp(self):
        self.now = timezone.now()

    def test_d7_retention_counts_returned_user(self):
        # 10 kun oldin ro'yxatdan o'tgan, 8 kun oldin (created+7'dan keyin) faol.
        u = User.objects.create_user(phone='+998900000001', password='x', full_name='A')
        _set_created(u, self.now - timedelta(days=10))
        u.last_active_date = (self.now - timedelta(days=2)).date()
        u.save(update_fields=['last_active_date'])

        # 10 kun oldin ro'yxatdan o'tgan, lekin qaytmagan (faollik yo'q).
        u2 = User.objects.create_user(phone='+998900000002', password='x', full_name='B')
        _set_created(u2, self.now - timedelta(days=10))

        # Bugun ro'yxatdan o'tgan — D7 kohortasiga kirmaydi (yetuk emas).
        User.objects.create_user(phone='+998900000003', password='x', full_name='C')

        d7 = compute_metrics()['retention']['d7']
        self.assertEqual(d7['eligible'], 2)   # faqat 10 kunlik ikkita
        self.assertEqual(d7['returned'], 1)   # bittasi qaytgan
        self.assertEqual(d7['pct'], 50.0)

    def test_attempt_counts_as_return(self):
        # last_active_date yo'q, lekin created+1 kundan keyin attempt bor.
        u = User.objects.create_user(phone='+998900000010', password='x', full_name='D')
        _set_created(u, self.now - timedelta(days=5))
        center = EducationCenter.objects.create(name='C', city='Tashkent')
        oly = Olympiad.objects.create(center=center, title='T', subject='Math')
        att = TestAttempt.objects.create(user=u, olympiad=oly)
        TestAttempt.objects.filter(pk=att.pk).update(
            submitted_at=self.now - timedelta(days=1),
        )

        d1 = compute_metrics()['retention']['d1']
        self.assertEqual(d1['eligible'], 1)
        self.assertEqual(d1['returned'], 1)


class ConversionMetricsTests(TestCase):
    def setUp(self):
        self.now = timezone.now()

    def test_trial_to_paid_conversion(self):
        plan = SubscriptionPlan.objects.create(name='Pro', price=10000, duration_days=30)

        # Trial boshlagan va pullik planga o'tgan.
        paid = User.objects.create_user(phone='+998901000001', password='x', full_name='P')
        paid.premium_trial_end = self.now - timedelta(days=1)
        paid.save(update_fields=['premium_trial_end'])
        UserSubscription.objects.create(
            user=paid, plan=plan,
            start_date=self.now, end_date=self.now + timedelta(days=30),
        )

        # Trial boshlagan, lekin pul to'lamagan.
        trial_only = User.objects.create_user(phone='+998901000002', password='x', full_name='Q')
        trial_only.premium_trial_end = self.now + timedelta(days=10)
        trial_only.save(update_fields=['premium_trial_end'])

        conv = compute_metrics()['conversion']
        self.assertEqual(conv['trial_started'], 2)
        self.assertEqual(conv['trial_to_paid'], 1)
        self.assertEqual(conv['trial_to_paid_pct'], 50.0)
        self.assertEqual(conv['paid_total'], 1)


class PremiumMetricsTests(TestCase):
    def test_active_premium_ratio(self):
        now = timezone.now()
        # is_premium flag orqali premium.
        p = User.objects.create_user(phone='+998902000001', password='x', full_name='R')
        User.objects.filter(pk=p.pk).update(is_premium=True)
        # trial orqali premium (flag yo'q).
        t = User.objects.create_user(phone='+998902000002', password='x', full_name='S')
        t.premium_trial_end = now + timedelta(days=5)
        t.save(update_fields=['premium_trial_end'])
        # oddiy foydalanuvchi.
        User.objects.create_user(phone='+998902000003', password='x', full_name='T')

        prem = compute_metrics()['premium']
        self.assertEqual(prem['total_users'], 3)
        self.assertEqual(prem['premium_active'], 2)  # flag + trial
        self.assertEqual(prem['paid_flag'], 1)
        self.assertEqual(prem['trial_only'], 1)


# ─── Onlayn foydalanuvchilar sanog'i (analytics.presence) ────────────────────


class _FakePipeline:
    """`presence.get_online_count` ishlatadigan ikki buyruq uchun yetarli."""

    def __init__(self, client):
        self.client = client
        self.results = []

    def zremrangebyscore(self, key, min_score, max_score):
        # presence.py faqat '-inf' .. '(<float>' shaklini yuboradi.
        cutoff = float(str(max_score).lstrip('('))
        members = self.client.zset.setdefault(key, {})
        for member in [m for m, score in members.items() if score < cutoff]:
            del members[member]
        self.results.append(None)
        return self

    def zcard(self, key):
        self.results.append(len(self.client.zset.get(key, {})))
        return self

    def execute(self):
        results, self.results = self.results, []
        return results


class _FakeRedis:
    """Redis sorted set'ining in-memory nusxasi (fakeredis bog'liqligisiz)."""

    def __init__(self):
        self.zset = {}

    def zadd(self, key, mapping):
        self.zset.setdefault(key, {}).update(mapping)

    def pipeline(self):
        return _FakePipeline(self)


class _BrokenRedis:
    """Ishlamayotgan Redis — har qanday buyruq ulanish xatosi bilan tugaydi."""

    def zadd(self, *args, **kwargs):
        raise ConnectionError('redis down')

    def pipeline(self):
        raise ConnectionError('redis down')


class PresenceTests(SimpleTestCase):
    def setUp(self):
        # Modul darajasidagi backoff holati testlar orasida sizib o'tmasin.
        presence._disabled_until = 0.0
        self.addCleanup(setattr, presence, '_disabled_until', 0.0)

    def test_record_then_count(self):
        fake = _FakeRedis()
        with patch.object(presence, '_get_client', return_value=fake):
            presence.record_activity(1)
            presence.record_activity(2)
            presence.record_activity(1)  # takroriy so'rov sonni oshirmaydi
            self.assertEqual(presence.get_online_count(), 2)

    def test_stale_entries_are_pruned_on_read(self):
        fake = _FakeRedis()
        with patch.object(presence, '_get_client', return_value=fake):
            presence.record_activity(1)
            # Oynadan chiqib ketgan yozuv — o'qish paytida o'chishi kerak.
            fake.zset[presence.ONLINE_KEY]['9'] = (
                time.time() - presence.ONLINE_WINDOW_SECONDS - 5
            )
            self.assertEqual(presence.get_online_count(), 1)
            self.assertNotIn('9', fake.zset[presence.ONLINE_KEY])

    def test_missing_redis_config_is_silent(self):
        with self.settings(REDIS_CONFIGURED=False):
            presence.record_activity(1)  # istisno ko'tarmasligi kerak
            self.assertIsNone(presence.get_online_count())

    def test_unreachable_redis_does_not_raise(self):
        with patch.object(presence, '_get_client', return_value=_BrokenRedis()):
            presence.record_activity(1)  # jimgina yutiladi
            # Xatodan keyin qisqa muddat umuman urinilmaydi.
            self.assertGreater(presence._disabled_until, 0)
            presence._disabled_until = 0.0  # o'qish yo'lini ham sinaymiz
            self.assertIsNone(presence.get_online_count())
