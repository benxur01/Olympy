"""Jonli nazoratdan imtihonni to'xtatish testlari.

`manager_live_proctoring_terminate` — menejer, o'qituvchi va direktor uchun.
Ikki amal: `remove` (natija bekor, ayblov yo'q) va `disqualify` (qoidabuzarlik).
"""
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import AuditLog, User
from attempts.models import TestAttempt, TestSession
from centers.models import CenterMembership, EducationCenter
from olympiads.models import Olympiad
from questions.models import Question


@override_settings(SECURE_SSL_REDIRECT=False)
class ManagerLiveTerminationTestCase(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            phone='+998901111111', password='OwnerPass123!', full_name='Direktor',
        )
        self.manager = User.objects.create_user(
            phone='+998902222222', password='ManagerPass123!', full_name='Menejer',
        )
        self.teacher = User.objects.create_user(
            phone='+998903333333', password='TeacherPass123!', full_name="O'qituvchi",
        )
        self.student = User.objects.create_user(
            phone='+998904444444', password='StudentPass123!', full_name='Ali Valiyev',
            roles=['student'],
        )
        self.center = EducationCenter.objects.create(
            name='Registon Markazi', owner=self.owner,
        )
        for user, role in (
            (self.manager, CenterMembership.ROLE_MANAGER),
            (self.teacher, CenterMembership.ROLE_TEACHER),
        ):
            CenterMembership.objects.create(
                user=user, center=self.center, role=role,
                status=CenterMembership.STATUS_APPROVED,
            )

        self.olympiad = Olympiad.objects.create(
            center=self.center,
            title='Matematika Bahor 2026',
            subject='Matematika',
            status=Olympiad.STATUS_ACTIVE,
            event_type=Olympiad.EVENT_TYPE_OLYMPIAD,
            start_datetime=timezone.now() - timezone.timedelta(minutes=5),
            duration_minutes=60,
        )
        question = Question.objects.create(
            center=self.center,
            subject='Matematika',
            text='2+2 = ?',
            options=['3', '4', '5', '6'],
            correct_answer=1,
            score=5,
        )
        self.olympiad.questions.add(question)

        # Boshqa markaz — ruxsat chegarasini tekshirish uchun.
        self.other_manager = User.objects.create_user(
            phone='+998905555555', password='OtherPass123!', full_name='Begona menejer',
        )
        self.other_center = EducationCenter.objects.create(
            name='Boshqa Markaz', owner=self.other_manager,
        )

    def _session(self, status_value=TestSession.STATUS_ACTIVE):
        return TestSession.objects.create(
            user=self.student, olympiad=self.olympiad, status=status_value,
        )

    def _url(self, session):
        return reverse('manager-live-proctoring-terminate', args=[session.id])

    def _terminate(self, session, decision, reason=None, actor=None):
        self.client.force_authenticate(user=actor or self.manager)
        body = {'decision': decision}
        if reason is not None:
            body['reason'] = reason
        return self.client.post(self._url(session), body, format='json')

    def test_manager_remove_active_session_marks_removed_not_disqualified(self):
        """`remove` — sessiya REMOVED, attempt removed=True (lekin DQ ham True)."""
        session = self._session()

        response = self._terminate(session, 'remove', reason='Xato hisob bilan kirgan')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['decision'], 'remove')
        self.assertEqual(response.data['status'], TestSession.STATUS_REMOVED)

        session.refresh_from_db()
        self.assertEqual(session.status, TestSession.STATUS_REMOVED)
        self.assertEqual(session.reviewed_by_id, self.manager.id)
        self.assertIsNotNone(session.reviewed_at)
        self.assertEqual(session.removal_reason, 'Xato hisob bilan kirgan')
        # Qoidabuzarlik maydoni TEGILMAYDI — bu ayblov emas.
        self.assertEqual(session.cheating_reason, '')

        attempt = TestAttempt.objects.get(user=self.student, olympiad=self.olympiad)
        self.assertTrue(attempt.removed)
        # `disqualified` ham True: statistika/reyting shu bayroq bo'yicha filtrlaydi.
        self.assertTrue(attempt.disqualified)
        self.assertEqual(attempt.score, 0)

        self.assertTrue(
            AuditLog.objects.filter(
                action='manager_live_remove', target_id=self.student.id,
            ).exists()
        )

    def test_remove_without_reason_uses_default_text(self):
        """Sabab `remove` uchun ixtiyoriy — backend standart matn qo'yadi."""
        session = self._session()

        response = self._terminate(session, 'remove')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        session.refresh_from_db()
        self.assertEqual(
            session.removal_reason, "Tashkilotchi tomonidan imtihondan chiqarildi",
        )

    def test_manager_disqualify_active_session_without_pending_review(self):
        """`disqualify` ACTIVE sessiyada ham ishlaydi (pending_review shart emas).

        Aynan shu narsa buzilgan edi: modal `reviewCheatingCase` ni chaqirar,
        u esa faqat PENDING_REVIEW ni qabul qilib 409 qaytarardi.
        """
        session = self._session()

        response = self._terminate(session, 'disqualify', reason='Ekranda begona odam')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], TestSession.STATUS_DISQUALIFIED)

        session.refresh_from_db()
        self.assertEqual(session.status, TestSession.STATUS_DISQUALIFIED)
        self.assertEqual(session.cheating_reason, 'Ekranda begona odam')
        self.assertIsNotNone(session.disqualified_at)

        attempt = TestAttempt.objects.get(user=self.student, olympiad=self.olympiad)
        self.assertTrue(attempt.disqualified)
        self.assertFalse(attempt.removed)

        self.assertTrue(
            AuditLog.objects.filter(
                action='manager_live_disqualify', target_id=self.student.id,
            ).exists()
        )

    def test_disqualify_requires_reason(self):
        """Ayblov hujjatsiz qolmasin — sababsiz `disqualify` 400."""
        session = self._session()

        response = self._terminate(session, 'disqualify', reason='   ')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        session.refresh_from_db()
        self.assertEqual(session.status, TestSession.STATUS_ACTIVE)
        self.assertFalse(
            TestAttempt.objects.filter(user=self.student, olympiad=self.olympiad).exists()
        )

    def test_invalid_decision_rejected(self):
        session = self._session()
        response = self._terminate(session, 'ban')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_terminate_forbidden_for_other_center_manager(self):
        """Ruxsat faqat O'Z markazi doirasida."""
        session = self._session()

        response = self._terminate(session, 'remove', actor=self.other_manager)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        session.refresh_from_db()
        self.assertEqual(session.status, TestSession.STATUS_ACTIVE)

    def test_student_forbidden_from_terminate_endpoint(self):
        """O'quvchi o'z sessiyasini ham to'xtata olmaydi."""
        session = self._session()

        response = self._terminate(session, 'remove', actor=self.student)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_terminate_conflict_when_already_terminal(self):
        """Yakunlangan sessiyada ikkala qaror ham 409 (race guard)."""
        for terminal in (
            TestSession.STATUS_DISQUALIFIED,
            TestSession.STATUS_REMOVED,
            TestSession.STATUS_COMPLETED,
        ):
            with self.subTest(status=terminal):
                session = self._session(terminal)
                for decision, reason in (('remove', ''), ('disqualify', 'sabab')):
                    response = self._terminate(session, decision, reason=reason)
                    self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
                    self.assertEqual(response.data['status'], terminal)
                session.delete()

    def test_teacher_and_owner_can_also_terminate(self):
        """O'qituvchi va direktor ham to'xtata oladi (`_user_can_manage_olympiad`)."""
        for actor in (self.teacher, self.owner):
            with self.subTest(actor=actor.full_name):
                session = self._session()
                response = self._terminate(session, 'remove', actor=actor)
                self.assertEqual(response.status_code, status.HTTP_200_OK)
                session.refresh_from_db()
                self.assertEqual(session.status, TestSession.STATUS_REMOVED)
                # Keyingi iteratsiya uchun tozalaymiz (unique user+olympiad).
                session.delete()
                TestAttempt.objects.filter(
                    user=self.student, olympiad=self.olympiad,
                ).delete()

    def test_removed_student_cannot_restart_olympiad(self):
        """Chiqarilgan o'quvchi shu olimpiadaga qayta start bera olmaydi.

        Haqiqiy oqim: chiqarishda attempt darhol yaratilgani uchun qayta kirish
        `TestAttempt` tekshiruvida to'xtaydi. Javob `removed` bayrog'ini olib
        keladi — frontend "Savollar yuklanmadi" o'rniga chetlatilish ekranini
        ko'rsatishi uchun.
        """
        session = self._session()
        self._terminate(session, 'remove')

        self.client.force_authenticate(user=self.student)
        response = self.client.get(
            reverse('olympiad-questions', args=[self.olympiad.id])
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(response.data.get('removed'))
        detail = response.data.get('detail', '')
        # Matnda ayblov bo'lmasligi kerak.
        self.assertNotIn('cheating', detail.lower())

    def test_removed_student_submit_reports_removed_not_generic_error(self):
        """Yakunlash tugmasi ham chetlatilish holatini qaytaradi.

        Regressiya: bayroqsiz javob frontend'da matn regexiga tushmay umumiy
        "Javoblar yuborilmadi. Qayta urinib ko'ring." xatosiga aylanardi va
        o'quvchi nima bo'lganini bilmay qayta-qayta bosardi.
        """
        session = self._session()
        self._terminate(session, 'remove')

        self.client.force_authenticate(user=self.student)
        response = self.client.post(
            reverse('submit-attempt'),
            {'olympiad': self.olympiad.id, 'answers': {}, 'time_spent': 10},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(response.data.get('removed'))
        self.assertNotIn('cheating', response.data.get('detail', '').lower())

    def test_disqualified_student_restart_keeps_generic_message(self):
        """DQ bo'lgan o'quvchida `removed` bayrog'i CHIQMAYDI (aralashmasin)."""
        session = self._session()
        self._terminate(session, 'disqualify', reason='Ekranda begona odam')

        self.client.force_authenticate(user=self.student)
        response = self.client.get(
            reverse('olympiad-questions', args=[self.olympiad.id])
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertNotIn('removed', response.data)
        self.assertIn('allaqachon', response.data.get('detail', ''))

    def test_removed_session_blocks_questions_without_attempt(self):
        """Ikkinchi qatlam: attempt yo'q bo'lsa ham REMOVED sessiya savol bermaydi."""
        self._session(TestSession.STATUS_REMOVED)

        self.client.force_authenticate(user=self.student)
        response = self.client.get(
            reverse('olympiad-questions', args=[self.olympiad.id])
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertNotIn('cheating', response.data['detail'].lower())
        # `removed` bayrog'i SHART: frontend bu yo'lda xatoni matn regexi bilan
        # tanidi va bayroqsiz "Savollar yuklanmadi" chiqarardi.
        self.assertTrue(response.data.get('removed'))

    def test_removed_session_blocks_submit_without_attempt(self):
        """Ikkinchi qatlam: REMOVED sessiyadan kelgan submit qabul qilinmaydi."""
        self._session(TestSession.STATUS_REMOVED)

        self.client.force_authenticate(user=self.student)
        response = self.client.post(
            reverse('submit-attempt'),
            {'olympiad': self.olympiad.id, 'answers': {}, 'time_spent': 10},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertNotIn('cheating', response.data['detail'].lower())
        # Bayroqsiz javob frontend'da umumiy "Javoblar yuborilmadi. Qayta urinib
        # ko'ring." ga tushib, o'quvchini cheksiz qayta bosish tsikliga solardi.
        self.assertTrue(response.data.get('removed'))
        self.assertFalse(
            TestAttempt.objects.filter(user=self.student, olympiad=self.olympiad).exists()
        )

    def test_removed_student_ping_returns_neutral_conflict(self):
        """Imtihon ichidagi o'quvchining ping'i `removed` bayrog'i bilan 409."""
        session = self._session()
        self._terminate(session, 'remove')

        self.client.force_authenticate(user=self.student)
        response = self.client.post(
            reverse('test-session-ping'), {'olympiad': self.olympiad.id}, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertTrue(response.data.get('removed'))
        self.assertNotIn('disqualified', response.data)
        detail = response.data.get('detail', '')
        self.assertNotIn('qoidabuzarlik', detail.lower())

    def test_live_proctoring_row_shows_removed_status(self):
        """Menejer jadvalida 'disqualified' emas, 'removed' ko'rinadi."""
        session = self._session()
        self._terminate(session, 'remove', reason='Xato ro\'yxatdan o\'tgan')

        self.client.force_authenticate(user=self.manager)
        response = self.client.get(
            reverse('olympiad-live-proctoring', args=[self.olympiad.id])
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        row = next(r for r in response.data if r['session_id'] == session.id)
        self.assertEqual(row['status'], 'removed')
        self.assertEqual(row['removal_reason'], "Xato ro'yxatdan o'tgan")
        self.assertEqual(row['cheating_reason'], '')

    def test_removed_attempt_excluded_from_default_leaderboard(self):
        """Oddiy ishtirokchi reytingida chiqarilgan qator ko'rinmaydi."""
        session = self._session()
        self._terminate(session, 'remove')

        self.client.force_authenticate(user=self.student)
        response = self.client.get(
            reverse('leaderboard'), {'olympiad': self.olympiad.id},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        user_ids = [e['user_id'] for e in response.data['results']]
        self.assertNotIn(self.student.id, user_ids)

    def test_removed_attempt_visible_to_manager_with_removed_flag(self):
        """Menejer ko'radigan reytingda qator `removed: true` bilan qaytadi."""
        session = self._session()
        self._terminate(session, 'remove')

        self.client.force_authenticate(user=self.manager)
        response = self.client.get(
            reverse('leaderboard'), {'olympiad': self.olympiad.id},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        entry = next(e for e in response.data['results'] if e['user_id'] == self.student.id)
        self.assertTrue(entry['removed'])
        self.assertTrue(entry['disqualified'])


@override_settings(SECURE_SSL_REDIRECT=False)
class RemovedAttemptNotCountedAsCheatingTestCase(APITestCase):
    """`removed` urinish admin xavf/qoidabuzarlik hisoblagichlariga kirmasin.

    `removed=True` da `disqualified=True` ham turadi (natija bekor bo'lishi va
    statistikadan chiqishi uchun) — lekin "necha marta DQ bo'lgan" deb SANAYDIGAN
    joylar uni qo'shsa, aybsiz o'quvchi admin uchun "takroriy qoidabuzar" bo'lib
    ko'rinadi. Frontend'dagi `dq = disqualified && !removed` bilan bir xil mantiq.
    """

    def setUp(self):
        self.admin = User.objects.create_superuser(
            phone='+998900000001', password='AdminPass123!', full_name='Platform Admin',
        )
        self.student = User.objects.create_user(
            phone='+998900000002', password='StudentPass123!', full_name='Ali Valiyev',
            roles=['student'],
        )
        self.center = EducationCenter.objects.create(
            name='Registon Markazi', owner=self.admin,
        )
        self.olympiad_removed = Olympiad.objects.create(
            center=self.center, title='Matematika', subject='Matematika',
            status=Olympiad.STATUS_ACTIVE, duration_minutes=30,
        )
        self.olympiad_other = Olympiad.objects.create(
            center=self.center, title='Fizika', subject='Fizika',
            status=Olympiad.STATUS_ACTIVE, duration_minutes=30,
        )
        # Chiqarib yuborilgan urinish — DQ bayrog'i bor, lekin ayb yo'q.
        TestAttempt.objects.create(
            user=self.student, olympiad=self.olympiad_removed,
            score=0, disqualified=True, removed=True,
        )
        self.client.force_authenticate(user=self.admin)

    def test_risk_profile_ignores_removed_attempt(self):
        """`compute_user_risk_profile` — xavf balli va matn oshmasin."""
        from accounts.views import compute_user_risk_profile

        profile = compute_user_risk_profile(self.student)
        names = [f['name'] for f in profile['factors']]
        self.assertNotIn('Diskvalifikatsiya qilingan olimpiadalar', names)

    def test_risk_profile_still_counts_real_disqualification(self):
        """Haqiqiy DQ hamon sanaladi — filtr faqat `removed` ni chiqaradi."""
        from accounts.views import compute_user_risk_profile

        TestAttempt.objects.create(
            user=self.student, olympiad=self.olympiad_other,
            score=0, disqualified=True, removed=False,
        )
        profile = compute_user_risk_profile(self.student)
        names = [f['name'] for f in profile['factors']]
        self.assertIn('Diskvalifikatsiya qilingan olimpiadalar', names)

    def test_admin_list_risk_annotation_ignores_removed_attempt(self):
        """`annotate_admin_risk` (ro'yxat SQL'i) detal bilan mos bo'lishi shart."""
        from accounts.security_queries import annotate_admin_risk

        row = annotate_admin_risk(User.objects.filter(pk=self.student.pk)).first()
        self.assertEqual(row.risk_dq_count, 0)

        TestAttempt.objects.create(
            user=self.student, olympiad=self.olympiad_other,
            score=0, disqualified=True, removed=False,
        )
        row = annotate_admin_risk(User.objects.filter(pk=self.student.pk)).first()
        self.assertEqual(row.risk_dq_count, 1)

    def test_ai_summary_does_not_list_removed_as_weakness(self):
        """`admin_user_ai_summary` — "zaif tomon" ro'yxatiga tushmasin."""
        response = self.client.get(
            reverse('admin-user-ai-summary', args=[self.student.id])
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        weaknesses = ' '.join(response.data['weaknesses'])
        self.assertNotIn('diskvalifikatsiya', weaknesses.lower())

    def test_cheating_overview_prior_count_ignores_removed_attempt(self):
        """`_prior_disqualification_count` — severity darajasini ko'tarmasin."""
        # Boshqa olimpiadada haqiqiy tekshiruv holati: shu qatorning "oldingi
        # qoidabuzarliklari" sanaladi. Yagona boshqa attempt — chiqarilgan.
        TestSession.objects.create(
            user=self.student, olympiad=self.olympiad_other,
            status=TestSession.STATUS_PENDING_REVIEW,
            review_requested_at=timezone.now(),
            cheating_reason='tab_or_app_left',
        )
        response = self.client.get(reverse('admin-cheating-overview'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        row = next(
            r for r in response.data['results']
            if r['student_id'] == self.student.id
        )
        self.assertEqual(row['prior_disqualifications'], 0)
