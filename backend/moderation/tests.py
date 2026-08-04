"""Moderatsiya navbati: avtomatik detektor + admin ko'rib chiqish endpointlari.

Detektor HECH QANDAY chora ko'rmaydi — testlar aynan shu chegarani qotiradi:
u faqat qator yaratadi, takrorlamaydi va yopilgan bayroqni qayta ochmaydi.
"""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import AuditLog, LoginEvent
from centers.models import EducationCenter
from moderation.middleware import BLOCKED_DETAIL
from moderation.models import BlockedIP, ModerationFlag
from moderation.services import (
    WARNING_STRIKE_THRESHOLD,
    WARNING_STRIKE_WINDOW_DAYS,
    maybe_flag_warning_threshold,
)
from moderation.tasks import detect_suspicious_activity
from notifications.models import Notification
from questions.models import Question

User = get_user_model()


class DetectSuspiciousActivityTestCase(APITestCase):
    """`moderation.detect_suspicious_activity` — soatlik detektor."""

    def _user(self, suffix):
        return User.objects.create_user(
            phone=f'+99890777{suffix}', password='UserPass123', full_name='Foydalanuvchi',
        )

    def _fill_ip(self, ip, count, *, prefix='1', days_ago=0):
        """`count` ta TURLI hisob shu IP'dan kirgan holatni yasaydi."""
        for i in range(count):
            event = LoginEvent.objects.create(
                user=self._user(f'{prefix}{i:03d}'), ip_address=ip, user_agent='Test',
            )
            if days_ago:
                LoginEvent.objects.filter(pk=event.pk).update(
                    created_at=timezone.now() - timedelta(days=days_ago),
                )

    def test_creates_one_flag_per_qualifying_ip(self):
        self._fill_ip('10.1.0.1', 5, prefix='1')
        self._fill_ip('10.1.0.2', 6, prefix='2')
        # Chegaradan past IP — bayroq olmaydi.
        self._fill_ip('10.1.0.3', 4, prefix='3')

        detect_suspicious_activity()

        flags = ModerationFlag.objects.order_by('extra__ip_address')
        self.assertEqual(flags.count(), 2)
        self.assertEqual(
            [f.extra['ip_address'] for f in flags],
            ['10.1.0.1', '10.1.0.2'],
        )
        flag = flags[0]
        self.assertEqual(flag.flag_type, ModerationFlag.FLAG_TYPE_SUSPICIOUS_IP)
        self.assertEqual(flag.status, ModerationFlag.STATUS_PENDING)
        self.assertEqual(flag.target_type, 'ip_address')
        self.assertIsNone(flag.target_id)
        # Detektor tizim nomidan yozadi — aktor yo'q.
        self.assertIsNone(flag.raised_by)
        self.assertEqual(flag.extra['distinct_users'], 5)
        self.assertIn('5 ta hisob', flag.reason)

    def test_logins_outside_one_day_window_are_ignored(self):
        # Qo'lda ko'riladigan ro'yxat 30 kunlik oynada ishlaydi, AVTOMATIK
        # detektor esa 1 kunlik oynada — 2 kun oldingi burst bayroq olmaydi.
        self._fill_ip('10.1.1.1', 5, days_ago=2)
        detect_suspicious_activity()
        self.assertEqual(ModerationFlag.objects.count(), 0)

    def test_second_run_does_not_duplicate_open_flag(self):
        self._fill_ip('10.1.2.1', 5)
        detect_suspicious_activity()
        detect_suspicious_activity()
        self.assertEqual(ModerationFlag.objects.count(), 1)

    def test_resolved_flag_is_raised_again(self):
        """Yopilgan bayroq qayta ochilmaydi — YANGISI yaratiladi.

        Admin "tekshirdim" deganidan keyin ham o'sha IP'dan kirishlar davom
        etsa, bu yangi hodisa: navbatda yana ko'rinishi kerak.
        """
        self._fill_ip('10.1.3.1', 5)
        detect_suspicious_activity()
        ModerationFlag.objects.update(
            status=ModerationFlag.STATUS_RESOLVED, resolved_at=timezone.now(),
        )

        detect_suspicious_activity()

        self.assertEqual(ModerationFlag.objects.count(), 2)
        self.assertEqual(
            ModerationFlag.objects.filter(status=ModerationFlag.STATUS_PENDING).count(), 1,
        )

    def test_dismissed_flag_is_raised_again(self):
        self._fill_ip('10.1.4.1', 5)
        detect_suspicious_activity()
        ModerationFlag.objects.update(
            status=ModerationFlag.STATUS_DISMISSED, resolved_at=timezone.now(),
        )

        detect_suspicious_activity()

        self.assertEqual(ModerationFlag.objects.count(), 2)

    def test_open_flag_for_other_ip_does_not_block_new_one(self):
        """Takror tekshiruvi AYNAN IP bo'yicha — turi bo'yicha emas."""
        ModerationFlag.objects.create(
            flag_type=ModerationFlag.FLAG_TYPE_SUSPICIOUS_IP,
            target_type='ip_address',
            reason='Boshqa manzil',
            extra={'ip_address': '10.9.9.9'},
        )
        self._fill_ip('10.1.5.1', 5)

        detect_suspicious_activity()

        self.assertTrue(
            ModerationFlag.objects.filter(extra__ip_address='10.1.5.1').exists(),
        )


class WarningThresholdFlagTestCase(APITestCase):
    """`moderation.services.maybe_flag_warning_threshold` — ogohlantirish chegarasi.

    Detektor bilan bir xil chegara: qator qo'yiladi, chora KO'RILMAYDI.
    """

    def setUp(self):
        self.user = User.objects.create_user(
            phone='+998907740001', password='UserPass123', full_name='Ogohlantirilgan',
        )

    def _warn(self, count=1, *, user=None, days_ago=0):
        for _ in range(count):
            note = Notification.objects.create(
                user=user or self.user,
                type=Notification.TYPE_ACCOUNT_WARNING,
                title='Ogohlantirish',
                message='Qoidalarga rioya qiling',
            )
            if days_ago:
                # `created_at` — auto_now_add, oynani sinash uchun qo'lda suramiz.
                Notification.objects.filter(pk=note.pk).update(
                    created_at=timezone.now() - timedelta(days=days_ago),
                )

    def test_below_threshold_raises_nothing(self):
        self._warn(WARNING_STRIKE_THRESHOLD - 1)

        self.assertIsNone(maybe_flag_warning_threshold(self.user))
        self.assertEqual(ModerationFlag.objects.count(), 0)

    def test_threshold_raises_system_flag_targeting_the_user(self):
        self._warn(WARNING_STRIKE_THRESHOLD)

        flag = maybe_flag_warning_threshold(self.user)

        self.assertIsNotNone(flag)
        self.assertEqual(flag.flag_type, ModerationFlag.FLAG_TYPE_WARNING_THRESHOLD)
        self.assertEqual(flag.status, ModerationFlag.STATUS_PENDING)
        self.assertEqual(flag.target_type, 'User')
        self.assertEqual(flag.target_id, self.user.id)
        # Chegarani tizim hisoblaydi — aktor yo'q (detektordagi bilan bir xil).
        self.assertIsNone(flag.raised_by)
        self.assertEqual(flag.extra['warning_count'], WARNING_STRIKE_THRESHOLD)
        self.assertEqual(flag.extra['window_days'], WARNING_STRIKE_WINDOW_DAYS)
        self.assertEqual(flag.extra['threshold'], WARNING_STRIKE_THRESHOLD)

    def test_flag_does_not_touch_the_account(self):
        """Bayroq — faqat nomzod: hisob bloklanmaydi, seanslar tegilmaydi."""
        self._warn(WARNING_STRIKE_THRESHOLD)
        old_version = self.user.token_version

        maybe_flag_warning_threshold(self.user)

        self.user.refresh_from_db()
        self.assertTrue(self.user.is_active)
        self.assertEqual(self.user.token_version, old_version)
        self.assertIsNone(self.user.blocked_until)

    def test_warnings_outside_window_are_ignored(self):
        self._warn(WARNING_STRIKE_THRESHOLD, days_ago=WARNING_STRIKE_WINDOW_DAYS + 1)

        self.assertIsNone(maybe_flag_warning_threshold(self.user))
        self.assertEqual(ModerationFlag.objects.count(), 0)

    def test_other_notification_types_do_not_count(self):
        Notification.objects.create(
            user=self.user, type=Notification.TYPE_OLYMPIAD_PUBLISHED,
            title='Yangi olimpiada', message='Boshlandi',
        )
        self._warn(WARNING_STRIKE_THRESHOLD - 1)

        self.assertIsNone(maybe_flag_warning_threshold(self.user))

    def test_other_users_warnings_do_not_count(self):
        other = User.objects.create_user(
            phone='+998907740002', password='UserPass123', full_name='Boshqa',
        )
        self._warn(WARNING_STRIKE_THRESHOLD, user=other)
        self._warn(1)

        self.assertIsNone(maybe_flag_warning_threshold(self.user))

    def test_open_flag_is_not_duplicated(self):
        self._warn(WARNING_STRIKE_THRESHOLD)
        maybe_flag_warning_threshold(self.user)

        self._warn(1)

        self.assertIsNone(maybe_flag_warning_threshold(self.user))
        self.assertEqual(ModerationFlag.objects.count(), 1)

    def test_closed_flag_is_raised_again(self):
        """Admin yopgandan keyin ogohlantirish davom etsa — bu yangi hodisa."""
        self._warn(WARNING_STRIKE_THRESHOLD)
        maybe_flag_warning_threshold(self.user)
        ModerationFlag.objects.update(
            status=ModerationFlag.STATUS_RESOLVED, resolved_at=timezone.now(),
        )

        self._warn(1)

        self.assertIsNotNone(maybe_flag_warning_threshold(self.user))
        self.assertEqual(ModerationFlag.objects.count(), 2)
        self.assertEqual(
            ModerationFlag.objects.filter(status=ModerationFlag.STATUS_PENDING).count(), 1,
        )


class AdminModerationQueueTestCase(APITestCase):
    """GET /api/admin/moderation/queue/"""

    def setUp(self):
        self.admin = User.objects.create_user(
            phone='+998907770001', password='AdminPass123', full_name='Admin',
        )
        self.admin.is_platform_admin = True
        self.admin.save()
        self.url = reverse('admin-moderation-queue')

    def _flag(self, **overrides):
        params = {
            'flag_type': ModerationFlag.FLAG_TYPE_SUSPICIOUS_IP,
            'reason': 'Sabab',
        }
        params.update(overrides)
        return ModerationFlag.objects.create(**params)

    def test_defaults_to_pending_only(self):
        pending = self._flag()
        self._flag(status=ModerationFlag.STATUS_RESOLVED)
        self._flag(status=ModerationFlag.STATUS_DISMISSED)
        self.client.force_authenticate(user=self.admin)

        res = self.client.get(self.url)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual([r['id'] for r in res.data['results']], [pending.id])

    def test_status_all_returns_every_flag(self):
        self._flag()
        self._flag(status=ModerationFlag.STATUS_RESOLVED)
        self.client.force_authenticate(user=self.admin)

        res = self.client.get(self.url, {'status': 'all'})

        self.assertEqual(res.data['count'], 2)

    def test_filters_by_status_and_flag_type(self):
        resolved = self._flag(status=ModerationFlag.STATUS_RESOLVED)
        question = self._flag(flag_type=ModerationFlag.FLAG_TYPE_QUESTION, target_id=7)
        self.client.force_authenticate(user=self.admin)

        res = self.client.get(self.url, {'status': ModerationFlag.STATUS_RESOLVED})
        self.assertEqual([r['id'] for r in res.data['results']], [resolved.id])

        res = self.client.get(self.url, {'flag_type': ModerationFlag.FLAG_TYPE_QUESTION})
        self.assertEqual([r['id'] for r in res.data['results']], [question.id])

        # Noma'lum qiymat xato emas — shunchaki bo'sh ro'yxat.
        res = self.client.get(self.url, {'flag_type': 'nomalum'})
        self.assertEqual(res.data['results'], [])

    def test_system_flag_actor_is_labeled_tizim(self):
        self._flag()
        self._flag(raised_by=self.admin, flag_type=ModerationFlag.FLAG_TYPE_QUESTION)
        self.client.force_authenticate(user=self.admin)

        res = self.client.get(self.url)

        by_type = {r['flag_type']: r for r in res.data['results']}
        self.assertEqual(by_type[ModerationFlag.FLAG_TYPE_SUSPICIOUS_IP]['raised_by'], 'Tizim')
        self.assertEqual(by_type[ModerationFlag.FLAG_TYPE_QUESTION]['raised_by'], 'Admin')
        self.assertEqual(
            by_type[ModerationFlag.FLAG_TYPE_SUSPICIOUS_IP]['flag_type_label'], 'Shubhali IP',
        )

    def test_non_admin_is_forbidden(self):
        outsider = User.objects.create_user(
            phone='+998907770009', password='UserPass123', full_name='Boshqa',
        )
        self.client.force_authenticate(user=outsider)
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonymous_is_denied(self):
        res = self.client.get(self.url)
        self.assertIn(
            res.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )


class AdminModerationResolveTestCase(APITestCase):
    """POST /api/admin/moderation/queue/<id>/resolve/"""

    def setUp(self):
        self.admin = User.objects.create_user(
            phone='+998907760001', password='AdminPass123', full_name='Admin',
        )
        self.admin.is_platform_admin = True
        self.admin.save()
        self.flag = ModerationFlag.objects.create(
            flag_type=ModerationFlag.FLAG_TYPE_SUSPICIOUS_IP,
            target_type='ip_address',
            reason='Sabab',
            extra={'ip_address': '10.2.0.1'},
        )
        self.url = reverse('admin-moderation-resolve', args=[self.flag.id])

    def test_resolve_sets_actor_time_and_note(self):
        self.client.force_authenticate(user=self.admin)

        res = self.client.post(
            self.url, {'status': 'resolved', 'note': 'Markaz sinfxonasi'}, format='json',
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['status'], 'resolved')
        self.assertEqual(res.data['resolved_by'], 'Admin')
        self.flag.refresh_from_db()
        self.assertEqual(self.flag.status, ModerationFlag.STATUS_RESOLVED)
        self.assertEqual(self.flag.resolved_by, self.admin)
        self.assertIsNotNone(self.flag.resolved_at)
        self.assertEqual(self.flag.resolution_note, 'Markaz sinfxonasi')

    def test_dismiss_without_note_is_allowed(self):
        self.client.force_authenticate(user=self.admin)

        res = self.client.post(self.url, {'status': 'dismissed'}, format='json')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.flag.refresh_from_db()
        self.assertEqual(self.flag.status, ModerationFlag.STATUS_DISMISSED)
        self.assertEqual(self.flag.resolution_note, '')

    def test_invalid_status_is_rejected(self):
        self.client.force_authenticate(user=self.admin)

        for value in ('pending', 'approved', ''):
            res = self.client.post(self.url, {'status': value}, format='json')
            self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.flag.refresh_from_db()
        self.assertEqual(self.flag.status, ModerationFlag.STATUS_PENDING)

    def test_already_closed_flag_is_rejected(self):
        self.client.force_authenticate(user=self.admin)
        self.client.post(self.url, {'status': 'resolved', 'note': 'Birinchi'}, format='json')

        res = self.client.post(
            self.url, {'status': 'dismissed', 'note': 'Ikkinchi'}, format='json',
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.flag.refresh_from_db()
        self.assertEqual(self.flag.resolution_note, 'Birinchi')

    def test_unknown_flag_returns_404(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(
            reverse('admin-moderation-resolve', args=[self.flag.id + 999]),
            {'status': 'resolved'}, format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_non_admin_is_forbidden(self):
        outsider = User.objects.create_user(
            phone='+998907760009', password='UserPass123', full_name='Boshqa',
        )
        self.client.force_authenticate(user=outsider)

        res = self.client.post(self.url, {'status': 'resolved'}, format='json')

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.flag.refresh_from_db()
        self.assertEqual(self.flag.status, ModerationFlag.STATUS_PENDING)


class AdminModerationResolveQuestionArchiveTestCase(APITestCase):
    """Savol bayrog'ini yopishdagi ixtiyoriy yon ta'sir: savolni arxivlash."""

    def setUp(self):
        self.admin = User.objects.create_user(
            phone='+998907750001', password='AdminPass123', full_name='Admin',
        )
        self.admin.is_platform_admin = True
        self.admin.save()
        self.center = EducationCenter.objects.create(
            name='Moder Academy', city='Toshkent',
            status=EducationCenter.STATUS_APPROVED,
        )
        self.question = Question.objects.create(
            center=self.center, subject='Matematika', text='2 + 2 = ?',
            options=['3', '4'], correct_answer=1, score=5,
        )
        self.flag = ModerationFlag.objects.create(
            flag_type=ModerationFlag.FLAG_TYPE_QUESTION,
            target_type='Question',
            target_id=self.question.id,
            reason='Javob xato',
            extra={'question_id': self.question.id, 'text': '2 + 2 = ?'},
        )
        self.url = reverse('admin-moderation-resolve', args=[self.flag.id])
        self.client.force_authenticate(user=self.admin)

    def test_resolve_with_archive_hides_question(self):
        res = self.client.post(
            self.url, {'status': 'resolved', 'archive': True}, format='json',
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data['archived'])
        self.question.refresh_from_db()
        self.assertFalse(self.question.is_active)
        self.assertTrue(AuditLog.objects.filter(
            action='question_archive', target_id=self.question.id,
        ).exists())

    def test_resolve_without_archive_leaves_question_untouched(self):
        res = self.client.post(self.url, {'status': 'resolved'}, format='json')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(res.data['archived'])
        self.question.refresh_from_db()
        self.assertTrue(self.question.is_active)
        self.flag.refresh_from_db()
        self.assertEqual(self.flag.status, ModerationFlag.STATUS_RESOLVED)

    def test_dismiss_never_archives(self):
        """'Rad etildi' — yolg'on signal, savolga chora ko'rilmaydi."""
        res = self.client.post(
            self.url, {'status': 'dismissed', 'archive': True}, format='json',
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(res.data['archived'])
        self.question.refresh_from_db()
        self.assertTrue(self.question.is_active)

    def test_deleted_question_does_not_break_resolution(self):
        self.question.delete()

        res = self.client.post(
            self.url, {'status': 'resolved', 'archive': True}, format='json',
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(res.data['archived'])
        self.flag.refresh_from_db()
        self.assertEqual(self.flag.status, ModerationFlag.STATUS_RESOLVED)

    def test_archive_ignored_for_non_question_flag(self):
        ip_flag = ModerationFlag.objects.create(
            flag_type=ModerationFlag.FLAG_TYPE_SUSPICIOUS_IP,
            target_type='ip_address',
            # Savol ID'siga to'g'ri keladigan `target_id` bo'lsa ham, boshqa
            # turdagi bayroq savolni arxivlamaydi.
            target_id=self.question.id,
            reason='Shubhali IP',
        )

        res = self.client.post(
            reverse('admin-moderation-resolve', args=[ip_flag.id]),
            {'status': 'resolved', 'archive': True}, format='json',
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(res.data['archived'])
        self.question.refresh_from_db()
        self.assertTrue(self.question.is_active)


class BlockedIPMatchTestCase(APITestCase):
    """`BlockedIP.match` — middleware ham, endpointlar ham shunga tayanadi."""

    def test_single_address_matches_only_itself(self):
        BlockedIP.objects.create(ip_address='203.0.113.5', reason='Sabab')
        self.assertIsNotNone(BlockedIP.match('203.0.113.5'))
        self.assertIsNone(BlockedIP.match('203.0.113.6'))

    def test_cidr_range_matches_every_member(self):
        BlockedIP.objects.create(ip_address='203.0.113.0', prefix_length=24, reason='Sabab')
        for ip in ('203.0.113.0', '203.0.113.7', '203.0.113.255'):
            self.assertIsNotNone(BlockedIP.match(ip), ip)
        self.assertIsNone(BlockedIP.match('203.0.114.1'))

    def test_expired_block_never_matches(self):
        BlockedIP.objects.create(
            ip_address='203.0.113.9', reason='Sabab',
            expires_at=timezone.now() - timedelta(minutes=1),
        )
        self.assertIsNone(BlockedIP.match('203.0.113.9'))

    def test_future_expiry_still_matches(self):
        BlockedIP.objects.create(
            ip_address='203.0.113.11', reason='Sabab',
            expires_at=timezone.now() + timedelta(days=1),
        )
        self.assertIsNotNone(BlockedIP.match('203.0.113.11'))

    def test_invalid_or_empty_address_never_matches(self):
        """Manzil noma'lum bo'lsa bloklash yo'q — hech qanday DB so'rovisiz.

        `security_logging.client_ip` IP topilmasa `-` qaytaradi; header
        umuman spoof qilingan axlat bo'lishi ham mumkin.
        """
        BlockedIP.objects.create(ip_address='203.0.113.0', prefix_length=24, reason='Sabab')
        for value in ('', '-', 'unknown', None, '999.1.1.1'):
            self.assertIsNone(BlockedIP.match(value), value)

    def test_ipv6_is_compared_as_an_address_not_as_text(self):
        """`::1` va `0:0:0:0:0:0:0:1` — bir xil manzilning ikki yozuvi."""
        BlockedIP.objects.create(ip_address='2001:db8::1', reason='Sabab')
        self.assertIsNotNone(BlockedIP.match('2001:0db8:0000::0001'))

    def test_ipv4_address_is_not_caught_by_an_ipv6_range(self):
        BlockedIP.objects.create(ip_address='::', prefix_length=0, reason='Sabab')
        self.assertIsNone(BlockedIP.match('203.0.113.5'))


class BlockedIPMiddlewareTestCase(APITestCase):
    """Bloklangan manzil view'ga UMUMAN yetib bormaydi.

    Tekshiruv aynan haqiqiy endpoint orqali: middleware settings'ga ulanganini
    va ruxsat/throttle qatlamlaridan OLDIN ishlashini birga qotiradi. Nishon
    sifatida admin endpointi olingan — u normal holatda 200 qaytaradi, ya'ni
    403 faqat blokdan kelishi mumkin.
    """

    def setUp(self):
        self.admin = User.objects.create_user(
            phone='+998907740001', password='AdminPass123', full_name='Admin',
        )
        self.admin.is_platform_admin = True
        self.admin.save()
        self.url = reverse('admin-moderation-blocked-ips')
        self.client.force_authenticate(user=self.admin)

    def test_blocked_ip_is_rejected_with_403(self):
        BlockedIP.objects.create(ip_address='203.0.113.5', reason='Abuse')

        res = self.client.get(self.url, REMOTE_ADDR='203.0.113.5')

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(res.json()['detail'], BLOCKED_DETAIL)

    def test_other_ip_passes_through(self):
        BlockedIP.objects.create(ip_address='203.0.113.5', reason='Abuse')

        res = self.client.get(self.url, REMOTE_ADDR='203.0.113.6')

        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_empty_blocklist_does_not_touch_anything(self):
        res = self.client.get(self.url, REMOTE_ADDR='203.0.113.5')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_expired_block_does_not_reject(self):
        BlockedIP.objects.create(
            ip_address='203.0.113.5', reason='Abuse',
            expires_at=timezone.now() - timedelta(seconds=1),
        )

        res = self.client.get(self.url, REMOTE_ADDR='203.0.113.5')

        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_cidr_range_rejects_every_member(self):
        BlockedIP.objects.create(ip_address='203.0.113.0', prefix_length=24, reason='Abuse')

        self.assertEqual(
            self.client.get(self.url, REMOTE_ADDR='203.0.113.77').status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.get(self.url, REMOTE_ADDR='203.0.114.77').status_code,
            status.HTTP_200_OK,
        )

    def test_forwarded_for_last_hop_is_the_client(self):
        """Proxy ortida haqiqiy manzil X-Forwarded-For ning OXIRGI elementi."""
        BlockedIP.objects.create(ip_address='198.51.100.7', reason='Abuse')

        res = self.client.get(
            self.url, REMOTE_ADDR='10.0.0.1',
            HTTP_X_FORWARDED_FOR='203.0.113.5, 198.51.100.7',
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_spoofed_forwarded_for_prefix_does_not_block_an_innocent_client(self):
        """Mijoz o'zi qo'shgan (birinchi) qiymat hech narsani hal qilmaydi.

        Aks holda hujumchi begona IP'ni header'ga yozib, boshqa birovni
        bloklangandek ko'rsatib qo'yishi mumkin edi.
        """
        BlockedIP.objects.create(ip_address='203.0.113.5', reason='Abuse')

        res = self.client.get(
            self.url, REMOTE_ADDR='10.0.0.1',
            HTTP_X_FORWARDED_FOR='203.0.113.5, 198.51.100.7',
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_missing_ip_data_never_blocks(self):
        """Lokal ishlab chiqish / noto'g'ri sozlangan proxy saytni yopmasin."""
        BlockedIP.objects.create(ip_address='203.0.113.0', prefix_length=24, reason='Abuse')

        res = self.client.get(self.url, REMOTE_ADDR='')

        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_block_applies_to_anonymous_requests_too(self):
        """Blok autentifikatsiyadan OLDIN — bloklangan manzil login ham qila olmaydi."""
        BlockedIP.objects.create(ip_address='203.0.113.5', reason='Abuse')
        self.client.force_authenticate(user=None)

        res = self.client.post(
            reverse('login'), {'phone': '+998907740001', 'password': 'AdminPass123'},
            format='json', REMOTE_ADDR='203.0.113.5',
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(res.json()['detail'], BLOCKED_DETAIL)


class AdminBlockedIPListCreateTestCase(APITestCase):
    """GET/POST /api/admin/moderation/blocked-ips/"""

    def setUp(self):
        self.admin = User.objects.create_user(
            phone='+998907730001', password='AdminPass123', full_name='Admin',
        )
        self.admin.is_platform_admin = True
        self.admin.save()
        self.url = reverse('admin-moderation-blocked-ips')
        self.client.force_authenticate(user=self.admin)

    def _post(self, payload):
        # Adminning o'z manzili (REMOTE_ADDR) bloklanayotgan qiymatdan farq
        # qilishi kerak — aks holda "o'zini bloklash" himoyasi ishga tushadi.
        return self.client.post(self.url, payload, format='json', REMOTE_ADDR='10.0.0.1')

    def test_create_single_ip(self):
        res = self._post({'ip_address': '203.0.113.5', 'reason': 'Ko\'p hisob'})

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['cidr'], '203.0.113.5')
        self.assertIsNone(res.data['prefix_length'])
        self.assertIsNone(res.data['expires_at'])
        self.assertTrue(res.data['is_active'])
        self.assertEqual(res.data['blocked_by'], 'Admin')
        blocked = BlockedIP.objects.get()
        self.assertEqual(blocked.ip_address, '203.0.113.5')
        self.assertEqual(blocked.blocked_by, self.admin)
        self.assertTrue(AuditLog.objects.filter(
            action='admin_ip_block', target_id=blocked.id,
        ).exists())

    def test_create_cidr_range_is_normalized(self):
        """Admin `1.2.3.4/24` yozsa ham ustunda tarmoq manzili turadi."""
        res = self._post({'ip_address': '203.0.113.77/24', 'reason': 'Botnet'})

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['cidr'], '203.0.113.0/24')
        self.assertEqual(res.data['ip_address'], '203.0.113.0')
        self.assertEqual(res.data['prefix_length'], 24)

    def test_full_prefix_is_stored_as_a_single_address(self):
        """`/32` — bu tarmoq emas, bitta manzil: jadvalda bir xil ko'rinsin."""
        res = self._post({'ip_address': '203.0.113.5/32', 'reason': 'Abuse'})

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(res.data['prefix_length'])
        self.assertEqual(res.data['cidr'], '203.0.113.5')

    def test_create_with_duration_sets_expiry(self):
        res = self._post({'ip_address': '203.0.113.5', 'reason': 'Abuse', 'duration_days': 7})

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        blocked = BlockedIP.objects.get()
        self.assertIsNotNone(blocked.expires_at)
        delta = blocked.expires_at - timezone.now()
        self.assertGreater(delta, timedelta(days=6, hours=23))
        self.assertLess(delta, timedelta(days=7, minutes=1))

    def test_invalid_duration_is_rejected(self):
        res = self._post({'ip_address': '203.0.113.5', 'reason': 'Abuse', 'duration_days': 3650})

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(BlockedIP.objects.count(), 0)

    def test_invalid_address_is_rejected(self):
        for value in ('', '999.1.1.1', 'nomalum', '203.0.113.0/99'):
            res = self._post({'ip_address': value, 'reason': 'Abuse'})
            self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST, value)
        self.assertEqual(BlockedIP.objects.count(), 0)

    def test_reason_is_required(self):
        res = self._post({'ip_address': '203.0.113.5', 'reason': '   '})

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(BlockedIP.objects.count(), 0)

    def test_cannot_block_your_own_address(self):
        res = self.client.post(
            self.url, {'ip_address': '203.0.113.5', 'reason': 'Abuse'},
            format='json', REMOTE_ADDR='203.0.113.5',
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(BlockedIP.objects.count(), 0)

    def test_cannot_block_a_range_containing_your_own_address(self):
        """Eng xavfli terish xatosi — o'zini ham qamrab oladigan keng CIDR.

        IP bloki Django admin sahifasiga ham tegishli, ya'ni bunday blokni
        keyin HTTP orqali olib bo'lmasdi.
        """
        res = self.client.post(
            self.url, {'ip_address': '203.0.0.0/8', 'reason': 'Abuse'},
            format='json', REMOTE_ADDR='203.0.113.5',
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(BlockedIP.objects.count(), 0)

    def test_already_blocked_address_is_rejected(self):
        self._post({'ip_address': '203.0.113.0/24', 'reason': 'Botnet'})

        # Tarmoq ostidagi bitta manzilni qayta bloklashning ma'nosi yo'q.
        res = self._post({'ip_address': '203.0.113.5', 'reason': 'Abuse'})

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(BlockedIP.objects.count(), 1)

    def test_expired_block_can_be_created_again(self):
        BlockedIP.objects.create(
            ip_address='203.0.113.5', reason='Eski',
            expires_at=timezone.now() - timedelta(days=1),
        )

        res = self._post({'ip_address': '203.0.113.5', 'reason': 'Yangi'})

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(BlockedIP.objects.count(), 2)

    def test_list_returns_expired_rows_flagged_as_inactive(self):
        BlockedIP.objects.create(ip_address='203.0.113.5', reason='Doimiy')
        BlockedIP.objects.create(
            ip_address='203.0.113.6', reason='Eski',
            expires_at=timezone.now() - timedelta(days=1),
        )

        res = self.client.get(self.url, REMOTE_ADDR='10.0.0.1')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['count'], 2)
        by_ip = {r['ip_address']: r for r in res.data['results']}
        self.assertTrue(by_ip['203.0.113.5']['is_active'])
        self.assertFalse(by_ip['203.0.113.6']['is_active'])

    def test_non_admin_is_forbidden(self):
        outsider = User.objects.create_user(
            phone='+998907730009', password='UserPass123', full_name='Boshqa',
        )
        self.client.force_authenticate(user=outsider)

        self.assertEqual(
            self.client.get(self.url, REMOTE_ADDR='10.0.0.1').status_code,
            status.HTTP_403_FORBIDDEN,
        )
        res = self._post({'ip_address': '203.0.113.5', 'reason': 'Abuse'})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(BlockedIP.objects.count(), 0)

    def test_anonymous_is_denied(self):
        self.client.force_authenticate(user=None)

        res = self.client.get(self.url, REMOTE_ADDR='10.0.0.1')

        self.assertIn(
            res.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )


class AdminBlockedIPDeleteTestCase(APITestCase):
    """DELETE /api/admin/moderation/blocked-ips/<id>/"""

    def setUp(self):
        self.admin = User.objects.create_user(
            phone='+998907720001', password='AdminPass123', full_name='Admin',
        )
        self.admin.is_platform_admin = True
        self.admin.save()
        self.blocked = BlockedIP.objects.create(
            ip_address='203.0.113.5', reason='Abuse', blocked_by=self.admin,
        )
        self.url = reverse('admin-moderation-blocked-ip-delete', args=[self.blocked.id])
        self.client.force_authenticate(user=self.admin)

    def test_delete_removes_the_row_and_stops_blocking(self):
        res = self.client.delete(self.url, REMOTE_ADDR='10.0.0.1')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['cidr'], '203.0.113.5')
        self.assertFalse(BlockedIP.objects.exists())
        self.assertIsNone(BlockedIP.match('203.0.113.5'))
        self.assertTrue(AuditLog.objects.filter(action='admin_ip_unblock').exists())

    def test_unknown_id_returns_404(self):
        res = self.client.delete(
            reverse('admin-moderation-blocked-ip-delete', args=[self.blocked.id + 999]),
            REMOTE_ADDR='10.0.0.1',
        )
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_non_admin_is_forbidden(self):
        outsider = User.objects.create_user(
            phone='+998907720009', password='UserPass123', full_name='Boshqa',
        )
        self.client.force_authenticate(user=outsider)

        res = self.client.delete(self.url, REMOTE_ADDR='10.0.0.1')

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(BlockedIP.objects.exists())


class AdminModerationResolveBlockIPTestCase(APITestCase):
    """Shubhali IP bayrog'ini yopishdagi ixtiyoriy yon ta'sir: manzilni bloklash."""

    def setUp(self):
        self.admin = User.objects.create_user(
            phone='+998907710001', password='AdminPass123', full_name='Admin',
        )
        self.admin.is_platform_admin = True
        self.admin.save()
        self.flag = ModerationFlag.objects.create(
            flag_type=ModerationFlag.FLAG_TYPE_SUSPICIOUS_IP,
            target_type='ip_address',
            reason="Bir xil IP'dan 6 ta hisob (oxirgi 1 kun)",
            extra={'ip_address': '203.0.113.5', 'distinct_users': 6},
        )
        self.url = reverse('admin-moderation-resolve', args=[self.flag.id])
        self.client.force_authenticate(user=self.admin)

    def _resolve(self, payload):
        return self.client.post(self.url, payload, format='json', REMOTE_ADDR='10.0.0.1')

    def test_resolve_with_block_ip_creates_the_block(self):
        res = self._resolve({'status': 'resolved', 'block_ip': True})

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['blocked_ip']['cidr'], '203.0.113.5')
        blocked = BlockedIP.objects.get()
        # Sabab bayroqdan ko'chiriladi — admin qayta yozib o'tirmaydi.
        self.assertEqual(blocked.reason, self.flag.reason)
        self.assertEqual(blocked.blocked_by, self.admin)
        self.assertIsNone(blocked.expires_at)
        self.assertIsNotNone(BlockedIP.match('203.0.113.5'))

    def test_block_days_makes_it_temporary(self):
        res = self._resolve({'status': 'resolved', 'block_ip': True, 'block_days': 14})

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        blocked = BlockedIP.objects.get()
        self.assertIsNotNone(blocked.expires_at)
        self.assertLess(blocked.expires_at - timezone.now(), timedelta(days=14, minutes=1))

    def test_invalid_block_days_leaves_the_flag_open(self):
        """Yarim bajarilgan amal bo'lmasin: bayroq ham yopilmaydi."""
        res = self._resolve({'status': 'resolved', 'block_ip': True, 'block_days': 3650})

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(BlockedIP.objects.count(), 0)
        self.flag.refresh_from_db()
        self.assertEqual(self.flag.status, ModerationFlag.STATUS_PENDING)

    def test_resolve_without_block_ip_blocks_nothing(self):
        res = self._resolve({'status': 'resolved'})

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIsNone(res.data['blocked_ip'])
        self.assertEqual(BlockedIP.objects.count(), 0)

    def test_dismiss_never_blocks(self):
        """'Rad etildi' — yolg'on signal, manzilga chora ko'rilmaydi."""
        res = self._resolve({'status': 'dismissed', 'block_ip': True})

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIsNone(res.data['blocked_ip'])
        self.assertEqual(BlockedIP.objects.count(), 0)

    def test_block_ip_ignored_for_question_flag(self):
        question_flag = ModerationFlag.objects.create(
            flag_type=ModerationFlag.FLAG_TYPE_QUESTION,
            target_type='Question',
            reason='Javob xato',
            extra={'ip_address': '203.0.113.5'},
        )

        res = self.client.post(
            reverse('admin-moderation-resolve', args=[question_flag.id]),
            {'status': 'resolved', 'block_ip': True}, format='json', REMOTE_ADDR='10.0.0.1',
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIsNone(res.data['blocked_ip'])
        self.assertEqual(BlockedIP.objects.count(), 0)

    def test_flag_without_ip_still_resolves(self):
        """Yon ta'sir hech qachon bayroqning yopilishini bekor qilmaydi."""
        empty = ModerationFlag.objects.create(
            flag_type=ModerationFlag.FLAG_TYPE_SUSPICIOUS_IP,
            target_type='ip_address', reason='Manzilsiz',
        )

        res = self.client.post(
            reverse('admin-moderation-resolve', args=[empty.id]),
            {'status': 'resolved', 'block_ip': True}, format='json', REMOTE_ADDR='10.0.0.1',
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIsNone(res.data['blocked_ip'])
        self.assertEqual(BlockedIP.objects.count(), 0)
        empty.refresh_from_db()
        self.assertEqual(empty.status, ModerationFlag.STATUS_RESOLVED)

    def test_admins_own_address_is_not_blocked_by_one_click(self):
        res = self.client.post(
            self.url, {'status': 'resolved', 'block_ip': True},
            format='json', REMOTE_ADDR='203.0.113.5',
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIsNone(res.data['blocked_ip'])
        self.assertEqual(BlockedIP.objects.count(), 0)

    def test_already_blocked_address_is_not_duplicated(self):
        BlockedIP.objects.create(ip_address='203.0.113.0', prefix_length=24, reason='Botnet')

        res = self._resolve({'status': 'resolved', 'block_ip': True})

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIsNone(res.data['blocked_ip'])
        self.assertEqual(BlockedIP.objects.count(), 1)
