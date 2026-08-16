"""Platforma admini uchun markazlararo cheating ko'rinishi testlari.

`/api/admin/attempts/cheating-overview/` — bitta olimpiada doirasidagi
`olympiad_live_proctoring` dan farqli o'laroq BARCHA markazlarni bir ro'yxatga
yig'adi. Testlar aynan shu ikki xususiyatni qotiradi: nima ro'yxatga kiradi
(holat/filtr qoidalari) va kim ko'ra oladi (faqat platforma admini — markaz
menejeri EMAS).
"""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from attempts.models import TestAttempt, TestSession
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

    def _pending_session(self, suffix, reason):
        """`reason` sababli tekshiruv kutayotgan sessiya (har biri yangi o'quvchi).

        (user, olympiad) unikal — shu sababli har chaqiruvda alohida o'quvchi.
        """
        return TestSession.objects.create(
            user=self._student(suffix, f"O'quvchi {suffix}"),
            olympiad=self.olympiad_a,
            status=TestSession.STATUS_PENDING_REVIEW,
            cheating_reason=reason,
            review_requested_at=self.pending_at,
        )

    def _disqualified_attempt(self, student, olympiad):
        """Diskvalifikatsiya tarixi — `finalize_cheating_disqualification` yozadigan qator."""
        return TestAttempt.objects.create(
            user=student, olympiad=olympiad, disqualified=True,
        )

    def _rows(self, params=None):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self.url, params or {})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        return res.data['results']

    def _row(self, session_id, params=None):
        return next(r for r in self._rows(params) if r['session_id'] == session_id)

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
        self.assertEqual(row['severity'], 'past')
        self.assertEqual(row['prior_disqualifications'], 0)

    def test_severity_is_derived_from_cheating_reason(self):
        """Sabab kodi darajani belgilaydi — navbat endi bir xil ko'rinmaydi."""
        low = self._pending_session('0021', 'tab_or_app_left')
        # Sabab erkin matn: katta-kichik harf va bo'shliq ahamiyatsiz.
        high = self._pending_session('0022', '  No_Face_Detected ')
        medium = self._pending_session('0023', 'copy_paste_attempt')
        # Menejer qo'lda yozgan noma'lum sabab pastga tushirilmaydi — "o'rta".
        unknown = self._pending_session('0024', "Admin tomonidan to'xtatildi")
        # Sabab umuman yo'q — hech qanday signal yo'q, ya'ni 'past'.
        empty = self._pending_session('0025', '')

        severity = {row['session_id']: row['severity'] for row in self._rows()}
        self.assertEqual(severity[low.id], 'past')
        self.assertEqual(severity[high.id], 'yuqori')
        self.assertEqual(severity[medium.id], "o'rta")
        self.assertEqual(severity[unknown.id], "o'rta")
        self.assertEqual(severity[empty.id], 'past')
        # setUp dagi qatorlar: bir marta tab almashtirish — 'past', boshqa
        # qurilmadan parallel kirish — 'yuqori'.
        self.assertEqual(severity[self.dq_session.id], 'past')
        self.assertEqual(severity[self.pending_session.id], 'yuqori')

    def test_prior_disqualifications_escalate_severity(self):
        """Takroriy qoidabuzarda bir xil sabab og'irroq baholanadi."""
        session = self._pending_session('0026', 'tab_or_app_left')
        self.assertEqual(self._row(session.id)['severity'], 'past')

        # 1 ta oldingi diskvalifikatsiya — bir pog'ona yuqori.
        self._disqualified_attempt(session.user, self.olympiad_b)
        row = self._row(session.id)
        self.assertEqual(row['prior_disqualifications'], 1)
        self.assertEqual(row['severity'], "o'rta")

        # 2 ta — sababdan qat'i nazar darhol 'yuqori'.
        self._disqualified_attempt(
            session.user, self._olympiad(self.center_a, 'Ikkinchi olimpiada'),
        )
        row = self._row(session.id)
        self.assertEqual(row['prior_disqualifications'], 2)
        self.assertEqual(row['severity'], 'yuqori')

    def test_own_disqualification_is_not_counted_as_prior(self):
        """Sessiyaning O'ZI DQ qilinganda yozilgan attempt 'oldingi' emas.

        `finalize_cheating_disqualification` aynan shu olimpiada uchun
        `disqualified=True` attempt yaratadi — u hisobga olinsa har bir DQ
        qatori o'zini o'zi ko'targan bo'lardi.
        """
        self._disqualified_attempt(self.dq_student, self.olympiad_a)
        row = self._row(self.dq_session.id)
        self.assertEqual(row['prior_disqualifications'], 0)
        self.assertEqual(row['severity'], 'past')

    def test_sort_by_severity_puts_worst_first(self):
        newest_low = TestSession.objects.create(
            user=self._student('0027', 'Eng yangi'),
            olympiad=self.olympiad_a,
            status=TestSession.STATUS_PENDING_REVIEW,
            cheating_reason='tab_or_app_left',
            review_requested_at=timezone.now(),
        )
        # Standart tartib — voqea vaqti: eng yangi (lekin past darajali) tepada.
        self.assertEqual(self._rows()[0]['session_id'], newest_low.id)

        rows = self._rows({'sort': 'severity'})
        self.assertEqual([row['severity'] for row in rows], ['yuqori', 'past', 'past'])
        self.assertEqual(rows[0]['session_id'], self.pending_session.id)
        # Teng darajalar ichida standart tartib (yangisi birinchi) saqlanadi.
        self.assertEqual(
            [row['session_id'] for row in rows[1:]],
            [newest_low.id, self.dq_session.id],
        )
        # Noma'lum `sort` qiymati e'tiborsiz qoldiriladi.
        self.assertEqual(
            self._rows({'sort': 'nomalum'})[0]['session_id'], newest_low.id,
        )

    def test_severity_filters_combine_with_existing_filters(self):
        """`?sort=severity` mavjud filtrlarni buzmaydi."""
        self._pending_session('0028', 'no_face_detected')
        self.assertEqual(
            self._session_ids({'sort': 'severity', 'center_id': self.center_b.id}),
            {self.pending_session.id},
        )
        self.assertEqual(
            self._session_ids({'sort': 'severity', 'search': 'ali val'}),
            {self.dq_session.id},
        )

    def test_severity_adds_no_query_per_session(self):
        """N+1 yo'q: qatorlar soni uch barobar bo'lsa ham so'rovlar soni o'zgarmaydi.

        Oldingi diskvalifikatsiya soni har sessiya uchun alohida so'rov bilan
        emas, asosiy queryset ichidagi korrelyatsiyalangan subquery bilan
        olinadi.
        """
        self.client.force_authenticate(user=self.admin)
        with CaptureQueriesContext(connection) as baseline:
            self.assertEqual(self.client.get(self.url).status_code, status.HTTP_200_OK)

        # Yana 4 ta sessiya, har birida diskvalifikatsiya tarixi ham bor —
        # aynan shu tarix severity hisobiga kiradi.
        for index in range(4):
            session = self._pending_session(f'003{index}', 'no_face_detected')
            self._disqualified_attempt(session.user, self.olympiad_b)

        with self.assertNumQueries(len(baseline.captured_queries)):
            res = self.client.get(self.url)
        self.assertEqual(len(res.data['results']), 6)

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
