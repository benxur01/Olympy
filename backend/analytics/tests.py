"""Analytics metrikalari uchun deterministik testlar.

Sun'iy foydalanuvchi/obuna/attempt yaratib, retention va conversion
hisob-kitoblari kutilgan natijani berishini tekshiramiz.
"""
import time
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import SimpleTestCase, TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from attempts.models import TestAttempt
from billing.models import SubscriptionPlan, UserSubscription
from centers.models import EducationCenter
from moderation.models import ModerationFlag
from notifications.models import Notification
from olympiads.models import Olympiad
from questions.models import Question

from . import presence
from .metrics import compute_metrics
from .views import (
    ABUSE_TREND_DAYS,
    CONTENT_BURST_MIN_QUESTIONS,
    WARNING_SERIES_KEY,
)

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
    """`presence` o'qish yo'llari ishlatadigan buyruqlar uchun yetarli."""

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

    def zrange(self, key, start, end):
        # Haqiqiy redis-py `decode_responses=False` bilan bytes qaytaradi —
        # `get_online_user_ids` shuni ham hazm qilishi kerak.
        members = sorted(self.client.zset.get(key, {}), key=lambda m: self.client.zset[key][m])
        self.results.append([str(m).encode() for m in members[start:(None if end == -1 else end + 1)]])
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

    def test_online_user_ids_returns_members(self):
        fake = _FakeRedis()
        with patch.object(presence, '_get_client', return_value=fake):
            presence.record_activity(1)
            presence.record_activity(7)
            # Oynadan chiqib ketgan yozuv sanoqdagi kabi o'qishda o'chadi.
            fake.zset[presence.ONLINE_KEY]['9'] = (
                time.time() - presence.ONLINE_WINDOW_SECONDS - 5
            )
            self.assertEqual(presence.get_online_user_ids(), {1, 7})

    def test_online_user_ids_none_when_redis_unavailable(self):
        # Bo'sh to'plam EMAS: "ma'lumot yo'q" != "hech kim onlayn emas".
        with self.settings(REDIS_CONFIGURED=False):
            self.assertIsNone(presence.get_online_user_ids())
        with patch.object(presence, '_get_client', return_value=_BrokenRedis()):
            self.assertIsNone(presence.get_online_user_ids())


# ─── /api/analytics/online/users/ (barcha foydalanuvchilar + holat) ──────────


class OnlineUsersDetailViewTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            phone='+998903000001', password='AdminPass123', full_name='Admin',
        )
        self.admin.is_platform_admin = True
        self.admin.save()
        self.other = User.objects.create_user(
            phone='+998903000002', password='UserPass123', full_name='Oddiy',
        )
        self.url = reverse('analytics-online-users')

    def _get(self, online_ids):
        self.client.force_authenticate(user=self.admin)
        with patch('analytics.views.get_online_user_ids', return_value=online_ids):
            return self.client.get(self.url)

    def test_requires_platform_admin(self):
        self.client.force_authenticate(user=self.other)
        self.assertEqual(self.client.get(self.url).status_code, 403)

    def test_lists_all_users_online_first(self):
        res = self._get({self.other.pk})
        self.assertEqual(res.status_code, 200)
        rows = res.data['results']
        # Platforma admini ham ro'yxatda (admin_users_list dan farqli o'laroq).
        self.assertEqual(res.data['count'], 2)
        self.assertEqual(rows[0]['user_id'], self.other.pk)
        self.assertIs(rows[0]['is_online'], True)
        self.assertIs(rows[1]['is_online'], False)
        self.assertEqual(rows[0]['full_name'], 'Oddiy')

    def test_is_online_null_when_redis_unavailable(self):
        # Hammani "oflayn" deb ko'rsatish yolg'on bo'lardi.
        res = self._get(None)
        self.assertEqual(res.status_code, 200)
        self.assertTrue(all(row['is_online'] is None for row in res.data['results']))

    def test_last_seen_at_is_returned(self):
        """Oflayn qator uchun "qachondan beri" — Redis'da bunday ma'lumot yo'q.

        Presence to'plami 3 daqiqalik oynadan chiqqan yozuvni o'chiradi,
        shuning uchun qiymat DB ustunidan (`User.touch_last_seen`) keladi va
        Redis holatiga bog'liq emas.
        """
        seen = timezone.now() - timedelta(hours=2)
        User.objects.filter(pk=self.other.pk).update(last_seen_at=seen)
        res = self._get(set())
        self.assertEqual(res.status_code, 200)
        rows = {row['user_id']: row for row in res.data['results']}
        self.assertEqual(rows[self.other.pk]['last_seen_at'], seen.isoformat())
        # Hech qachon so'rov yubormagan hisob — NULL (frontend "Hech qachon").
        self.assertIsNone(rows[self.admin.pk]['last_seen_at'])


# ─── /api/analytics/abuse-stats/ (suiiste'mol signallari) ────────────────────


class AbuseStatsViewTests(APITestCase):
    """Bayroq dinamikasi, eng ko'p ogohlantirilganlar va kontent portlashi."""

    def setUp(self):
        # Blok `get_cached_block` orqali saqlanadi va LocMem cache testlar
        # orasida yashaydi — har testda toza hisobdan boshlaymiz.
        cache.clear()
        self.addCleanup(cache.clear)
        self.admin = User.objects.create_user(
            phone='+998904000001', password='AdminPass123', full_name='Admin',
        )
        self.admin.is_platform_admin = True
        self.admin.save()
        self.url = reverse('analytics-abuse-stats')

    def _warn(self, user, days_ago=0):
        note = Notification.objects.create(
            user=user, type=Notification.TYPE_ACCOUNT_WARNING,
            title='Ogohlantirish', message='Matn',
        )
        if days_ago:
            Notification.objects.filter(pk=note.pk).update(
                created_at=timezone.now() - timedelta(days=days_ago),
            )
        return note

    def _flag(self, flag_type, days_ago=0):
        flag = ModerationFlag.objects.create(flag_type=flag_type, reason='Sabab')
        if days_ago:
            ModerationFlag.objects.filter(pk=flag.pk).update(
                created_at=timezone.now() - timedelta(days=days_ago),
            )
        return flag

    def _questions(self, author, count, days_ago=0):
        center = EducationCenter.objects.create(name='Markaz', city='Tashkent')
        created = Question.objects.bulk_create([
            Question(
                center=center, subject='Matematika', text=f'Savol {i}',
                created_by=author,
            )
            for i in range(count)
        ])
        if days_ago:
            Question.objects.filter(pk__in=[q.pk for q in created]).update(
                created_at=timezone.now() - timedelta(days=days_ago),
            )

    def test_requires_platform_admin(self):
        outsider = User.objects.create_user(
            phone='+998904000009', password='UserPass123', full_name='Boshqa',
        )
        self.client.force_authenticate(user=outsider)
        self.assertEqual(self.client.get(self.url).status_code, 403)

    def test_flag_trend_is_bucketed_by_day_and_series(self):
        self._flag(ModerationFlag.FLAG_TYPE_SUSPICIOUS_IP)
        self._flag(ModerationFlag.FLAG_TYPE_SUSPICIOUS_IP)
        self._flag(ModerationFlag.FLAG_TYPE_QUESTION)
        self._warn(self.admin)
        # Oynadan tashqaridagi bayroq umuman ko'rinmasligi kerak.
        self._flag(ModerationFlag.FLAG_TYPE_QUESTION, days_ago=ABUSE_TREND_DAYS + 2)
        self.client.force_authenticate(user=self.admin)

        res = self.client.get(self.url)

        self.assertEqual(res.status_code, 200)
        # Seriyalar model choices'idan (qaysi tartibda bo'lsa) + ogohlantirish.
        self.assertEqual(
            [s['key'] for s in res.data['flag_series']],
            [key for key, _ in ModerationFlag.FLAG_TYPE_CHOICES] + [WARNING_SERIES_KEY],
        )
        trend = res.data['flag_trend']
        # Bo'sh kunlar ham qatorda (uzluksiz grafik).
        self.assertEqual(len(trend), ABUSE_TREND_DAYS)
        today = trend[-1]
        self.assertEqual(today['date'], timezone.localdate().isoformat())
        self.assertEqual(today[ModerationFlag.FLAG_TYPE_SUSPICIOUS_IP], 2)
        self.assertEqual(today[ModerationFlag.FLAG_TYPE_QUESTION], 1)
        self.assertEqual(today[WARNING_SERIES_KEY], 1)
        # Oynadan chetdagi bayroq hech bir kunda sanalmagan.
        self.assertEqual(
            sum(row[ModerationFlag.FLAG_TYPE_QUESTION] for row in trend), 1,
        )

    def test_top_warned_users_are_ranked_by_count(self):
        loud = User.objects.create_user(
            phone='+998904000002', password='UserPass123', full_name='Ko\'p',
        )
        quiet = User.objects.create_user(
            phone='+998904000003', password='UserPass123', full_name='Kam',
        )
        for _ in range(3):
            self._warn(loud)
        self._warn(quiet)
        # Oynadan tashqaridagi ogohlantirish sanalmaydi.
        self._warn(quiet, days_ago=400)
        self.client.force_authenticate(user=self.admin)

        rows = self.client.get(self.url).data['top_warned_users']

        self.assertEqual([r['user_id'] for r in rows], [loud.pk, quiet.pk])
        self.assertEqual(rows[0]['warnings'], 3)
        self.assertEqual(rows[0]['full_name'], "Ko'p")
        self.assertEqual(rows[0]['phone'], loud.normalized_phone)
        self.assertEqual(rows[1]['warnings'], 1)

    def test_content_outliers_only_above_threshold_and_inside_window(self):
        burst = User.objects.create_user(
            phone='+998904000004', password='UserPass123', full_name='Portlash',
        )
        normal = User.objects.create_user(
            phone='+998904000005', password='UserPass123', full_name='Oddiy',
        )
        old_burst = User.objects.create_user(
            phone='+998904000006', password='UserPass123', full_name='Eski',
        )
        self._questions(burst, CONTENT_BURST_MIN_QUESTIONS)
        # Chegaradan bitta kam — ro'yxatga tushmaydi.
        self._questions(normal, CONTENT_BURST_MIN_QUESTIONS - 1)
        # Chegaradan oshgan, lekin oynadan tashqarida (2 kun oldin).
        self._questions(old_burst, CONTENT_BURST_MIN_QUESTIONS, days_ago=2)
        self.client.force_authenticate(user=self.admin)

        res = self.client.get(self.url)

        rows = res.data['content_outliers']
        self.assertEqual([r['user_id'] for r in rows], [burst.pk])
        self.assertEqual(rows[0]['questions'], CONTENT_BURST_MIN_QUESTIONS)
        self.assertEqual(rows[0]['full_name'], 'Portlash')
        # Chegaralar javobda ham qaytadi — panel matni shu qiymatlardan quriladi.
        self.assertEqual(
            res.data['thresholds']['burst_min_questions'],
            CONTENT_BURST_MIN_QUESTIONS,
        )

    def test_empty_tables_return_empty_sections(self):
        self.client.force_authenticate(user=self.admin)

        res = self.client.get(self.url)

        self.assertEqual(res.data['top_warned_users'], [])
        self.assertEqual(res.data['content_outliers'], [])
        self.assertTrue(all(
            row[ModerationFlag.FLAG_TYPE_SUSPICIOUS_IP] == 0
            for row in res.data['flag_trend']
        ))
