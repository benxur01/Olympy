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
from moderation.models import ModerationFlag
from moderation.tasks import detect_suspicious_activity
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
