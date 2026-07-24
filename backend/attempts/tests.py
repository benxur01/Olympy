from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework import status
from centers.models import EducationCenter
from olympiads.models import Olympiad
from questions.models import Question
from attempts.models import TestAttempt, TestSession

User = get_user_model()


class AttemptsTestCase(APITestCase):

    def setUp(self):
        # Create a test student user
        self.student = User.objects.create_user(
            username='student123',
            phone='+998901234567',
            password='testpassword',
            first_name='Ali',
            last_name='Valiyev'
        )
        self.client.force_authenticate(user=self.student)

        # Create education center
        self.center = EducationCenter.objects.create(
            name='ProSkill Academy',
            city='Toshkent'
        )

        # Create a test center or olympiad
        self.olympiad = Olympiad.objects.create(
            center=self.center,
            title='Matematika Olimpiadasi',
            subject='Matematika',
            status='active',
            event_type=Olympiad.EVENT_TYPE_OLYMPIAD,
            start_datetime=timezone.now() - timezone.timedelta(minutes=10),
            duration_minutes=60
        )

        # Create some test questions
        self.q1 = Question.objects.create(
            center=self.center,
            subject='Matematika',
            text='2+2 = ?',
            options=['3', '4', '5', '6'],
            correct_answer=1,
            score=5
        )
        self.q2 = Question.objects.create(
            center=self.center,
            subject='Matematika',
            text='3*3 = ?',
            options=['6', '9', '12', '15'],
            correct_answer=1,
            score=10
        )
        self.olympiad.questions.add(self.q1, self.q2)

    def test_submit_attempt_success(self):
        """Test submitting a test attempt with correct answers and getting graded."""
        # Start a test session
        session = TestSession.objects.create(
            user=self.student,
            olympiad=self.olympiad,
            status=TestSession.STATUS_ACTIVE
        )

        url = reverse('submit-attempt')
        data = {
            'olympiad': self.olympiad.id,
            'answers': {
                str(self.q1.id): 1,  # Correct (points: 5)
                str(self.q2.id): 1   # Correct (points: 10)
            },
            'time_spent': 300
        }

        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(TestAttempt.objects.filter(user=self.student, olympiad=self.olympiad).exists())

        attempt = TestAttempt.objects.get(user=self.student, olympiad=self.olympiad)
        self.assertEqual(attempt.correct_count, 2)
        self.assertEqual(attempt.wrong_count, 0)
        self.assertEqual(attempt.score, 100)  # Correct points = 15/15 * 100 = 100

        # Check session status updated to completed
        session.refresh_from_db()
        self.assertEqual(session.status, TestSession.STATUS_COMPLETED)

    def test_submit_attempt_partial_correct(self):
        """Test grading with partially correct answers."""
        TestSession.objects.create(
            user=self.student,
            olympiad=self.olympiad,
            status=TestSession.STATUS_ACTIVE
        )

        url = reverse('submit-attempt')
        data = {
            'olympiad': self.olympiad.id,
            'answers': {
                str(self.q1.id): 1,  # Correct (5 points)
                str(self.q2.id): 0   # Incorrect (0 points)
            },
            'time_spent': 200
        }

        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        attempt = TestAttempt.objects.get(user=self.student, olympiad=self.olympiad)
        self.assertEqual(attempt.correct_count, 1)
        self.assertEqual(attempt.wrong_count, 1)
        # Score calculation: 5 / 15 * 100 = 33.33... % -> rounded to 33
        self.assertEqual(attempt.score, 33)

    def test_cheating_report_moves_session_to_pending_review(self):
        """Cheating report endi darhol DQ QILMAYDI — sessiyani menejer/owner
        tekshiruviga (PENDING_REVIEW) yuboradi va hali attempt yaratmaydi."""
        session = TestSession.objects.create(
            user=self.student,
            olympiad=self.olympiad,
            status=TestSession.STATUS_ACTIVE
        )

        url = reverse('report-cheating')
        data = {
            'olympiad': self.olympiad.id,
            'reason': 'Test oynasidan 3 martadan ko\'p chiqildi'
        }

        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get('status'), 'pending_review')

        session.refresh_from_db()
        self.assertEqual(session.status, TestSession.STATUS_PENDING_REVIEW)
        self.assertIsNotNone(session.review_requested_at)
        self.assertEqual(session.cheating_reason, 'Test oynasidan 3 martadan ko\'p chiqildi')

        # Tekshiruvdan oldin diskvalifikatsiya attempt'i yaratilmaydi.
        self.assertFalse(TestAttempt.objects.filter(user=self.student, olympiad=self.olympiad).exists())

    def test_cheating_report_new_proctoring_reason_ownerless_center(self):
        """Regressiya: markaz owner=None bo'lganda cheating report 500 QILMASLIGI kerak.

        `EducationCenter.owner` nullable. `ReportCheatingView` olimpiadani
        `select_for_update().select_related('center', 'center__owner')` bilan
        oladi — `center__owner` LEFT OUTER JOIN hosil qiladi. `of` bo'lmasa
        PostgreSQL "FOR UPDATE cannot be applied to the nullable side of an
        outer join" bilan 500 qaytaradi. Yangi kamera/ovoz proktoring
        signallari (masalan 'ambient_speech_detected') aynan shu endpoint
        orqali o'tadi, shu sababli har bir proktoring hodisasi 500 bo'lardi.

        Eslatma: SQLite `select_for_update`ni butunlay e'tiborsiz qoldiradi, shu
        sababli bu test lokal SQLite'da fix'siz ham o'tadi — haqiqiy regressiyani
        PostgreSQL backendли CI ushlaydi. `select_for_update_of` tekshiruvi esa
        har qanday backendda lock scope'ini himoya qiladi.
        """
        self.assertIsNone(self.center.owner_id)  # markazda owner yo'q -> nullable join
        self.olympiad.camera_proctoring_enabled = True
        self.olympiad.voice_proctoring_enabled = True
        self.olympiad.save(update_fields=['camera_proctoring_enabled', 'voice_proctoring_enabled'])
        TestSession.objects.create(
            user=self.student, olympiad=self.olympiad, status=TestSession.STATUS_ACTIVE,
        )

        response = self.client.post(
            reverse('report-cheating'),
            {'olympiad': self.olympiad.id, 'reason': 'ambient_speech_detected'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get('status'), 'pending_review')

        session = TestSession.objects.get(user=self.student, olympiad=self.olympiad)
        self.assertEqual(session.status, TestSession.STATUS_PENDING_REVIEW)
        self.assertEqual(session.cheating_reason, 'ambient_speech_detected')

    def test_review_cheating_disqualify(self):
        """Menejer 'disqualify' qarori — sessiya DQ + disqualified attempt."""
        self.center.owner = self.student  # student ham owner (test soddaligi uchun)
        self.center.save(update_fields=['owner'])
        session = TestSession.objects.create(
            user=self.student,
            olympiad=self.olympiad,
            status=TestSession.STATUS_PENDING_REVIEW,
            review_requested_at=timezone.now(),
            cheating_reason='tab_or_app_left',
        )

        url = reverse('review-cheating-case')
        response = self.client.post(
            url, {'session_id': session.id, 'decision': 'disqualify'}, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        session.refresh_from_db()
        self.assertEqual(session.status, TestSession.STATUS_DISQUALIFIED)
        self.assertEqual(session.reviewed_by_id, self.student.id)
        self.assertIsNotNone(session.reviewed_at)
        self.assertTrue(
            TestAttempt.objects.filter(user=self.student, olympiad=self.olympiad, disqualified=True).exists()
        )

    def test_review_cheating_continue_adds_paused_seconds(self):
        """Menejer 'continue' qarori — sessiya ACTIVE va kutish vaqti
        paused_seconds ga qo'shiladi (imtihon muddati uzayadi)."""
        self.center.owner = self.student
        self.center.save(update_fields=['owner'])
        session = TestSession.objects.create(
            user=self.student,
            olympiad=self.olympiad,
            status=TestSession.STATUS_PENDING_REVIEW,
            review_requested_at=timezone.now() - timezone.timedelta(seconds=30),
        )

        url = reverse('review-cheating-case')
        response = self.client.post(
            url, {'session_id': session.id, 'decision': 'continue'}, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        session.refresh_from_db()
        self.assertEqual(session.status, TestSession.STATUS_ACTIVE)
        self.assertGreaterEqual(session.paused_seconds, 29)
        self.assertFalse(TestAttempt.objects.filter(user=self.student, olympiad=self.olympiad).exists())

    def test_review_cheating_already_handled_conflict(self):
        """Sessiya PENDING_REVIEW bo'lmasa review 409 qaytaradi (race guard)."""
        self.center.owner = self.student
        self.center.save(update_fields=['owner'])
        session = TestSession.objects.create(
            user=self.student,
            olympiad=self.olympiad,
            status=TestSession.STATUS_DISQUALIFIED,
        )
        url = reverse('review-cheating-case')
        response = self.client.post(
            url, {'session_id': session.id, 'decision': 'continue'}, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)

    def test_session_ping_device_collision(self):
        """Test that pinging from another device within 30 seconds disqualifies the session."""
        session = TestSession.objects.create(
            user=self.student,
            olympiad=self.olympiad,
            status=TestSession.STATUS_ACTIVE,
            last_device_id='device_A',
            last_ping_at=timezone.now()
        )

        url = reverse('test-session-ping')
        # Ping from device_B
        data = {
            'olympiad': self.olympiad.id,
            'device_id': 'device_B'
        }

        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        # Collision should disqualify
        session.refresh_from_db()
        self.assertEqual(session.status, TestSession.STATUS_DISQUALIFIED)
        self.assertEqual(session.cheating_reason, "concurrent_session")


class EssayAIFeedbackTestCase(APITestCase):
    """Feature 4: Insho uchun on-demand chuqur AI tahlili (Plus tarifi)."""

    def setUp(self):
        from django.core.cache import cache
        # is_user_premium 60s cache'ni ishlatadi — testlar orasida premium
        # holati eskirmasin.
        cache.clear()

        self.center = EducationCenter.objects.create(name='AI Center', city='Toshkent')
        self.olympiad = Olympiad.objects.create(
            center=self.center,
            title='Insho Olimpiadasi',
            subject='Ona tili',
            status='active',
            event_type=Olympiad.EVENT_TYPE_OLYMPIAD,
            start_datetime=timezone.now() - timezone.timedelta(minutes=10),
            duration_minutes=60,
        )
        self.essay_q = Question.objects.create(
            center=self.center,
            subject='Ona tili',
            text='Vatan haqida insho yozing.',
            question_type=Question.QUESTION_TYPE_ESSAY,
            score=20,
        )
        self.code_q = Question.objects.create(
            center=self.center,
            subject='Informatika',
            text='Ikki sonni qo\'shing.',
            question_type=Question.QUESTION_TYPE_CODE,
            score=10,
        )
        self.olympiad.questions.add(self.essay_q, self.code_q)

        # Plus o'quvchi + uning attempt'i (insho javobi bilan).
        self.plus_student = User.objects.create_user(
            username='plus_stu', phone='+998900000001', password='pw',
        )
        self._make_plus(self.plus_student)
        self.attempt = TestAttempt.objects.create(
            user=self.plus_student,
            olympiad=self.olympiad,
            score=0,
            correct_count=0,
            wrong_count=0,
            total_questions=2,
            answers={str(self.essay_q.id): {'text': 'Vatan — muqaddas tushuncha.'}},
        )

        # Boshqa (begona) o'quvchi.
        self.other_student = User.objects.create_user(
            username='other_stu', phone='+998900000002', password='pw',
        )

    def _make_plus(self, user):
        from billing.models import SubscriptionPlan, UserSubscription
        plan = SubscriptionPlan.objects.create(
            name='Plus (1 oy)', plan_type='student', price=0, duration_days=30,
        )
        UserSubscription.objects.create(
            user=user, plan=plan,
            end_date=timezone.now() + timezone.timedelta(days=30),
            is_active=True,
        )
        user.refresh_from_db()

    def _url(self):
        return reverse(
            'attempt-essay-ai-feedback',
            kwargs={'attempt_id': self.attempt.id, 'question_id': self.essay_q.id},
        )

    def test_non_plus_owner_forbidden(self):
        """Plus bo'lmagan (free) egaga 403 upgrade_required (required_tier=plus)."""
        from django.core.cache import cache
        free_student = User.objects.create_user(
            username='free_stu', phone='+998900000003', password='pw',
        )
        attempt = TestAttempt.objects.create(
            user=free_student, olympiad=self.olympiad,
            score=0, correct_count=0, wrong_count=0, total_questions=2,
            answers={str(self.essay_q.id): {'text': 'javob'}},
        )
        cache.clear()
        self.client.force_authenticate(user=free_student)
        url = reverse(
            'attempt-essay-ai-feedback',
            kwargs={'attempt_id': attempt.id, 'question_id': self.essay_q.id},
        )
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(res.data.get('upgrade_required'))
        self.assertEqual(res.data.get('required_tier'), 'plus')

    def test_non_owner_forbidden(self):
        """Begona o'quvchi boshqa attempt'ga kira olmaydi (403)."""
        self.client.force_authenticate(user=self.other_student)
        res = self.client.get(self._url())
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_plus_owner_pending_then_ready(self):
        """Plus egasi: birinchi GET pending (task navbatga), keyin ready."""
        from unittest.mock import patch
        from attempts.models import EssayAIFeedback
        from attempts.tasks import generate_essay_ai_feedback_task

        self.client.force_authenticate(user=self.plus_student)

        with patch(
            'attempts.tasks.review_essay_answer',
            return_value={'ok': True, 'review': 'AI insho tahlili.', 'error': ''},
        ):
            with patch.object(generate_essay_ai_feedback_task, 'delay') as mock_delay:
                res = self.client.get(self._url())
                self.assertEqual(res.status_code, status.HTTP_200_OK)
                self.assertEqual(res.data.get('status'), 'pending')
                mock_delay.assert_called_once()
                feedback = EssayAIFeedback.objects.get(
                    attempt=self.attempt, question=self.essay_q,
                )
                self.assertEqual(feedback.status, EssayAIFeedback.STATUS_PENDING)

            # Task'ni to'g'ridan-to'g'ri bajaramiz (Gemini mock'langan holda).
            generate_essay_ai_feedback_task(feedback.id)

            # Keyingi GET — ready + feedback matni.
            res2 = self.client.get(self._url())
            self.assertEqual(res2.status_code, status.HTTP_200_OK)
            self.assertEqual(res2.data.get('status'), 'ready')
            self.assertEqual(res2.data.get('feedback'), 'AI insho tahlili.')

    def test_no_duplicate_row_per_attempt_question(self):
        """Ikkinchi GET (attempt, savol) uchun ikkinchi yozuv yaratmaydi."""
        from unittest.mock import patch
        from attempts.models import EssayAIFeedback
        from attempts.tasks import generate_essay_ai_feedback_task

        self.client.force_authenticate(user=self.plus_student)
        with patch.object(generate_essay_ai_feedback_task, 'delay'):
            self.client.get(self._url())
            self.client.get(self._url())
        self.assertEqual(
            EssayAIFeedback.objects.filter(
                attempt=self.attempt, question=self.essay_q,
            ).count(),
            1,
        )

    def test_code_review_ungated_on_result_payload(self):
        """Regression: ai_code_review free o'quvchiga ham natija sahifasida
        ko'rinadi (Plus bilan gate qilinmagan)."""
        from django.core.cache import cache
        from attempts.models import CodeSubmission

        free_student = User.objects.create_user(
            username='free_code', phone='+998900000004', password='pw',
        )
        attempt = TestAttempt.objects.create(
            user=free_student, olympiad=self.olympiad,
            score=0, correct_count=0, wrong_count=0, total_questions=2,
            answers={},
        )
        CodeSubmission.objects.create(
            attempt=attempt, question=self.code_q,
            submitted_code='print(a+b)', code_language='python',
            ai_code_review='Kod yaxshi yozilgan.', ai_code_score=85,
        )
        cache.clear()
        self.client.force_authenticate(user=free_student)
        res = self.client.get(
            reverse('attempt-detail', kwargs={'attempt_id': attempt.id}),
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        review = res.data.get('questions_review') or []
        code_item = next(
            (q for q in review if q.get('question_type') == 'code'), None,
        )
        self.assertIsNotNone(code_item)
        self.assertEqual(code_item.get('ai_code_review'), 'Kod yaxshi yozilgan.')
        self.assertEqual(code_item.get('ai_code_score'), 85)
