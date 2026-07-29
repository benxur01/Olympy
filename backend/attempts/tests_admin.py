"""Platforma admini uchun markazlararo cheating ko'rinishi testlari.

`/api/admin/attempts/cheating-overview/` — bitta olimpiada doirasidagi
`olympiad_live_proctoring` dan farqli o'laroq BARCHA markazlarni bir ro'yxatga
yig'adi. Testlar aynan shu ikki xususiyatni qotiradi: nima ro'yxatga kiradi
(holat/filtr qoidalari) va kim ko'ra oladi (faqat platforma admini — markaz
menejeri EMAS).
"""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from attempts.models import TestSession
from attempts.views import _user_can_manage_olympiad
from centers.models import CenterMembership, EducationCenter
from olympiads.models import Olympiad

User = get_user_model()


class AdminCheatingOverviewTestCase(APITestCase):
    """GET /api/admin/attempts/cheating-overview/"""

    def setUp(self):
        self.url = reverse('admin-cheating-overview')
        self.admin = User.objects.create_user(
            phone='+998909990001', password='AdminPass123', full_name='Admin',
        )
        self.admin.is_platform_admin = True
        self.admin.save()

        self.center_a = EducationCenter.objects.create(name='A markaz', city='Toshkent')
        self.center_b = EducationCenter.objects.create(name='B markaz', city='Samarqand')
        self.olympiad_a = self._olympiad(self.center_a, 'Matematika olimpiadasi')
        self.olympiad_b = self._olympiad(self.center_b, 'Fizika olimpiadasi')

        now = timezone.now()
        # 9 kunlik farq — `?date_from=`/`?date_to=` testlari vaqt mintaqasi
        # chegarasida ham barqaror bo'lsin.
        self.dq_at = now - timedelta(days=10)
        self.pending_at = now - timedelta(days=1)

        # A markaz: diskvalifikatsiya (`disqualified_at` bor, `review_requested_at` yo'q).
        self.dq_student = self._student('0011', 'Ali Valiyev')
        self.dq_session = TestSession.objects.create(
            user=self.dq_student,
            olympiad=self.olympiad_a,
            status=TestSession.STATUS_DISQUALIFIED,
            cheating_reason='tab_or_app_left',
            disqualified_at=self.dq_at,
            reviewed_by=self.admin,
            reviewed_at=self.dq_at,
        )
        # B markaz: tekshiruv kutmoqda (`disqualified_at` HALI yo'q).
        self.pending_student = self._student('0012', 'Vali Aliyev')
        self.pending_session = TestSession.objects.create(
            user=self.pending_student,
            olympiad=self.olympiad_b,
            status=TestSession.STATUS_PENDING_REVIEW,
            cheating_reason='concurrent_session',
            review_requested_at=self.pending_at,
        )

    def _olympiad(self, center, title):
        return Olympiad.objects.create(
            center=center,
            title=title,
            subject='Matematika',
            status='active',
            event_type=Olympiad.EVENT_TYPE_OLYMPIAD,
            start_datetime=timezone.now() - timedelta(minutes=10),
            duration_minutes=60,
        )

    def _student(self, suffix, full_name):
        return User.objects.create_user(
            phone=f'+99890999{suffix}', password='UserPass123', full_name=full_name,
        )

    def _rows(self, params=None):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self.url, params or {})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        return res.data['results']

    def _session_ids(self, params=None):
        return {row['session_id'] for row in self._rows(params)}

    def test_sessions_from_all_centers_are_aggregated(self):
        rows = self._rows()
        self.assertEqual(len(rows), 2)
        # Tartib: voqea vaqti bo'yicha yangisi birinchi — kutayotgani 1 kun,
        # diskvalifikatsiya 10 kun oldin.
        self.assertEqual(rows[0]['session_id'], self.pending_session.id)
        self.assertEqual(rows[1]['session_id'], self.dq_session.id)
        self.assertEqual(
            {row['center_name'] for row in rows},
            {'A markaz', 'B markaz'},
        )

    def test_row_shape_matches_live_proctoring_fields(self):
        row = next(r for r in self._rows() if r['session_id'] == self.dq_session.id)
        self.assertEqual(row['student_id'], self.dq_student.id)
        self.assertEqual(row['student_name'], 'Ali Valiyev')
        self.assertEqual(row['student_phone'], '+998909990011')
        self.assertEqual(row['olympiad_id'], self.olympiad_a.id)
        self.assertEqual(row['olympiad_title'], 'Matematika olimpiadasi')
        self.assertEqual(row['center_id'], self.center_a.id)
        self.assertEqual(row['center_name'], 'A markaz')
        self.assertEqual(row['status'], TestSession.STATUS_DISQUALIFIED)
        self.assertEqual(row['cheating_reason'], 'tab_or_app_left')
        self.assertIsNotNone(row['disqualified_at'])
        self.assertIsNone(row['review_requested_at'])
        self.assertEqual(row['reviewed_by_name'], 'Admin')
        self.assertIsNotNone(row['reviewed_at'])

    def test_active_and_completed_sessions_are_excluded(self):
        TestSession.objects.create(
            user=self._student('0013', 'Faol'),
            olympiad=self.olympiad_a,
            status=TestSession.STATUS_ACTIVE,
        )
        TestSession.objects.create(
            user=self._student('0014', 'Tugatgan'),
            olympiad=self.olympiad_a,
            status=TestSession.STATUS_COMPLETED,
        )
        self.assertEqual(
            self._session_ids(),
            {self.dq_session.id, self.pending_session.id},
        )

    def test_center_filter_narrows_to_one_center(self):
        self.assertEqual(
            self._session_ids({'center_id': self.center_b.id}),
            {self.pending_session.id},
        )
        # Sessiyasi yo'q markaz — bo'sh ro'yxat (xato emas).
        empty = EducationCenter.objects.create(name='C markaz', city='Buxoro')
        self.assertEqual(self._session_ids({'center_id': empty.id}), set())

    def test_status_filter_selects_single_status(self):
        self.assertEqual(
            self._session_ids({'status': TestSession.STATUS_PENDING_REVIEW}),
            {self.pending_session.id},
        )
        self.assertEqual(
            self._session_ids({'status': TestSession.STATUS_DISQUALIFIED}),
            {self.dq_session.id},
        )
        # Ro'yxatga umuman kirmaydigan holat filtr sifatida e'tiborsiz
        # qoldiriladi — `active` sessiyalar baribir chiqmaydi.
        self.assertEqual(
            self._session_ids({'status': TestSession.STATUS_ACTIVE}),
            {self.dq_session.id, self.pending_session.id},
        )

    def test_search_matches_name_and_phone(self):
        self.assertEqual(self._session_ids({'search': 'ali val'}), {self.dq_session.id})
        self.assertEqual(self._session_ids({'search': '9990012'}), {self.pending_session.id})
        self.assertEqual(self._session_ids({'search': 'topilmaydi'}), set())

    def test_date_range_covers_both_timestamp_columns(self):
        # `date_from` — kutayotgan sessiya `review_requested_at` bo'yicha
        # tushadi (uning `disqualified_at` i umuman yo'q).
        self.assertEqual(
            self._session_ids({'date_from': timezone.localdate(self.pending_at).isoformat()}),
            {self.pending_session.id},
        )
        # `date_to` — diskvalifikatsiya `disqualified_at` bo'yicha tushadi.
        self.assertEqual(
            self._session_ids({'date_to': timezone.localdate(self.dq_at).isoformat()}),
            {self.dq_session.id},
        )
        # Ikkala chekka ham o'z kunini ICHIGA oladi.
        self.assertEqual(
            self._session_ids({
                'date_from': timezone.localdate(self.dq_at).isoformat(),
                'date_to': timezone.localdate(self.pending_at).isoformat(),
            }),
            {self.dq_session.id, self.pending_session.id},
        )
        # Noto'g'ri sana filtrsiz qoldiriladi (500 emas).
        self.assertEqual(
            self._session_ids({'date_from': '2026-02-30'}),
            {self.dq_session.id, self.pending_session.id},
        )

    def test_regular_user_is_forbidden(self):
        self.client.force_authenticate(user=self.dq_student)
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_center_manager_is_forbidden_even_for_own_center(self):
        """Markaz menejeri o'z olimpiadasini boshqara oladi, lekin bu ro'yxatni EMAS.

        Endpoint markazlararo agregatsiya — shuning uchun `IsPlatformAdmin`,
        `_user_can_manage_olympiad` emas. Test ikkalasini yonma-yon tekshiradi:
        menejer o'sha tekshiruvdan O'TADI, ro'yxatga esa kira olmaydi.
        """
        manager = self._student('0015', 'Menejer')
        CenterMembership.objects.create(
            user=manager,
            center=self.center_a,
            role=CenterMembership.ROLE_MANAGER,
            status=CenterMembership.STATUS_APPROVED,
        )
        self.assertTrue(_user_can_manage_olympiad(manager, self.olympiad_a))

        self.client.force_authenticate(user=manager)
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_center_owner_is_forbidden(self):
        owner = self._student('0016', 'Egasi')
        self.center_a.owner = owner
        self.center_a.save(update_fields=['owner'])
        self.assertTrue(_user_can_manage_olympiad(owner, self.olympiad_a))

        self.client.force_authenticate(user=owner)
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
