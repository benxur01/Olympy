import json
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import transaction
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework import status
from centers.models import EducationCenter
from olympiads.models import Olympiad
from questions.models import Question
from attempts.models import CodeSubmission, TestAttempt, TestSession

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


class SliderAttemptTestCase(APITestCase):
    """Slayder savoli imtihonda uchidan-uchiga ishlaydimi.

    Faqat `grade_answer` emas — savol payload'i (o'quvchiga javob sizmasligi)
    va submit oqimidagi javob ajratish (`{"value": N}`) ham tekshiriladi.
    """

    def setUp(self):
        self.student = User.objects.create_user(
            phone='+998901239001', password='StrongPass123', full_name="O'quvchi",
        )
        self.client.force_authenticate(user=self.student)
        self.center = EducationCenter.objects.create(
            name='Slider Center', city='Toshkent',
            status=EducationCenter.STATUS_APPROVED,
        )
        self.olympiad = Olympiad.objects.create(
            center=self.center,
            title='Slayder Olimpiadasi',
            subject='Tarix',
            status='active',
            event_type=Olympiad.EVENT_TYPE_OLYMPIAD,
            start_datetime=timezone.now() - timezone.timedelta(minutes=5),
            duration_minutes=60,
        )
        self.slider_q = Question.objects.create(
            center=self.center,
            subject='Tarix',
            text="O'zbekiston mustaqilligi qaysi yilda e'lon qilindi?",
            options=[],
            correct_answer=0,
            question_type=Question.QUESTION_TYPE_SLIDER,
            correct_text=(
                '{"min": 1900, "max": 2000, "step": 1, '
                '"correct": 1991, "tolerance": 2}'
            ),
            score=10,
        )
        self.olympiad.questions.add(self.slider_q)

    def test_student_payload_exposes_range_without_answer(self):
        """Savol payload'ida min/max/step bor, correct/tolerance YO'Q."""
        url = reverse('olympiad-questions', args=[self.olympiad.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        item = response.data['questions'][0]
        self.assertEqual(item['question_type'], 'slider')
        self.assertEqual(
            item['slider_range'], {'min': 1900, 'max': 2000, 'step': 1},
        )
        # Javob kaliti hech qanday ko'rinishda chiqmasligi kerak.
        self.assertNotIn('correct_text', item)
        self.assertNotIn('correct_answer', item)
        self.assertNotIn('correct', item['slider_range'])
        self.assertNotIn('tolerance', item['slider_range'])
        self.assertNotIn('1991', json.dumps(item))

    def _submit(self, value):
        TestSession.objects.create(
            user=self.student, olympiad=self.olympiad,
            status=TestSession.STATUS_ACTIVE,
        )
        response = self.client.post(reverse('submit-attempt'), {
            'olympiad': self.olympiad.id,
            'answers': {str(self.slider_q.id): {'value': value}},
            'time_spent': 60,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        return TestAttempt.objects.get(user=self.student, olympiad=self.olympiad)

    def test_submit_value_within_tolerance_scores_correct(self):
        attempt = self._submit(1990)
        self.assertEqual(attempt.correct_count, 1)
        self.assertEqual(attempt.wrong_count, 0)
        self.assertEqual(attempt.score, 100)

    def test_submit_value_outside_tolerance_scores_wrong(self):
        attempt = self._submit(1950)
        self.assertEqual(attempt.correct_count, 0)
        self.assertEqual(attempt.wrong_count, 1)
        self.assertEqual(attempt.score, 0)

    def test_review_payload_unwraps_slider_answer(self):
        """Natijalar sahifasi `{"value": N}` ni ochib ko'rsatadi (dict emas)."""
        attempt = self._submit(1990)
        url = reverse('attempt-detail', args=[attempt.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        item = next(
            r for r in response.data['questions_review']
            if r['id'] == self.slider_q.id
        )
        self.assertEqual(item['chosen_answer'], 1990)
        self.assertTrue(item['is_correct'])


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


class ExplainAllMistakesAsyncTestCase(APITestCase):
    """POST /api/attempts/mistakes/explain/ — AI xatolar tahlili asinxron oqimi.

    Sekin Gemini chaqiruvi so'rov ichida emas, Celery task'da bajariladi:
    view 202 + task_id qaytaradi, natija `mistakes/explain/<task_id>/status/`
    orqali olinadi (test muhitida EAGER — `delay()` sinxron bajariladi).
    """

    def setUp(self):
        self.center = EducationCenter.objects.create(
            name='Mistakes Center', city='Toshkent',
        )
        self.olympiad = Olympiad.objects.create(
            center=self.center, title='Matematika', subject='Matematika',
            status='finished',
        )
        self.question = Question.objects.create(
            center=self.center, subject='Matematika', text='2 + 2 = ?',
            options=['3', '4', '5', '6'], correct_answer=1, score=5,
        )
        self.olympiad.questions.add(self.question)
        self.student = User.objects.create_user(
            username='mistake_stu', phone='+998900000101', password='pw',
        )
        self.other_student = User.objects.create_user(
            username='mistake_other', phone='+998900000102', password='pw',
        )
        # Noto'g'ri javob (to'g'risi indeks 1).
        TestAttempt.objects.create(
            user=self.student, olympiad=self.olympiad,
            score=0, correct_count=0, wrong_count=1, total_questions=1,
            answers={str(self.question.id): 0},
        )
        self.client.force_authenticate(user=self.student)

    @patch(
        'questions.ai_generation.explain_mistakes_ai',
        return_value='Tavsiyalar matni',
    )
    def test_returns_task_then_result(self, mock_ai):
        resp = self.client.post(reverse('mistakes-explain-all'))
        self.assertEqual(resp.status_code, status.HTTP_202_ACCEPTED)
        task_id = resp.data.get('task_id')
        self.assertTrue(task_id)
        mock_ai.assert_called_once()

        status_resp = self.client.get(
            reverse('mistakes-explain-all-status', args=[task_id]),
        )
        self.assertEqual(status_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(status_resp.data.get('status'), 'COMPLETED')
        self.assertEqual(status_resp.data.get('explanation'), 'Tavsiyalar matni')

    @patch('attempts.tasks.explain_all_mistakes_task.delay')
    def test_no_mistakes_returns_message_without_task(self, mock_delay):
        TestAttempt.objects.filter(user=self.student).delete()
        resp = self.client.post(reverse('mistakes-explain-all'))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIsNone(resp.data.get('task_id'))
        self.assertTrue(resp.data.get('explanation'))
        mock_delay.assert_not_called()

    @patch(
        'questions.ai_generation.explain_mistakes_ai',
        return_value='Tavsiyalar matni',
    )
    def test_other_user_cannot_read_task_result(self, _mock_ai):
        start = self.client.post(reverse('mistakes-explain-all'))
        self.assertEqual(start.status_code, status.HTTP_202_ACCEPTED)
        self.client.force_authenticate(user=self.other_student)
        resp = self.client.get(
            reverse('mistakes-explain-all-status', args=[start.data['task_id']]),
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


class AttemptTaskOnCommitTestCase(TestCase):
    """Celery task'lari tranzaksiya COMMIT bo'lgandan KEYIN navbatga qo'yiladi.

    `submit_attempt` butun ishni `transaction.atomic()` ichida bajaradi. Task
    commit'dan oldin yuborilsa worker attempt/CodeSubmission qatorini
    ko'rmaydi va `attempts.tasks` dagi `DoesNotExist` tutqichlari retry'siz
    jimgina `return` qiladi — AI tahlil abadiy `pending` qolib, kod sharhi
    (`ai_code_review`/`ai_code_score`) hech qachon to'ldirilmaydi.
    """

    def setUp(self):
        self.student = User.objects.create_user(
            username='oncommit_student',
            phone='+998901112233',
            password='testpassword',
        )
        self.center = EducationCenter.objects.create(
            name='OnCommit Center', city='Toshkent',
        )
        self.olympiad = Olympiad.objects.create(
            center=self.center,
            title='Informatika',
            subject='Informatika',
            status='active',
            event_type=Olympiad.EVENT_TYPE_OLYMPIAD,
            start_datetime=timezone.now() - timezone.timedelta(minutes=10),
            duration_minutes=60,
        )
        self.code_q = Question.objects.create(
            center=self.center,
            subject='Informatika',
            text="Ikki sonni qo'shing",
            question_type=Question.QUESTION_TYPE_CODE,
            programming_language='python',
            score=10,
            test_cases=[{'input': '3 4', 'expected_output': '7'}],
        )
        self.olympiad.questions.add(self.code_q)
        self.attempt = TestAttempt.objects.create(
            user=self.student, olympiad=self.olympiad,
            score=0, correct_count=0, wrong_count=0, total_questions=1,
            answers={},
        )

    def test_ai_analysis_task_waits_for_commit(self):
        from attempts.tasks import generate_attempt_ai_analysis_task
        from attempts.views import _trigger_attempt_ai_analysis

        with patch.object(generate_attempt_ai_analysis_task, 'delay') as mock_delay:
            with self.captureOnCommitCallbacks(execute=True):
                with transaction.atomic():
                    _trigger_attempt_ai_analysis(self.attempt, self.olympiad, {})
                # Blok tugadi, ammo tashqi tranzaksiya hali commit bo'lmagan.
                mock_delay.assert_not_called()
            mock_delay.assert_called_once_with(self.attempt.id)

    def test_code_review_tasks_wait_for_commit(self):
        from attempts.views import _save_code_submissions
        from attempts.tasks import review_code_submissions_task
        from questions.tasks import run_code_async_task

        code_answers = {
            str(self.code_q.id): {'code': 'print(7)', 'language': 'python'},
        }
        with patch.object(review_code_submissions_task, 'delay') as mock_review, \
                patch.object(run_code_async_task, 'delay') as mock_run:
            with self.captureOnCommitCallbacks(execute=True):
                with transaction.atomic():
                    _save_code_submissions(
                        self.attempt, self.olympiad, code_answers,
                    )
                mock_review.assert_not_called()
                mock_run.assert_not_called()

            submission = CodeSubmission.objects.get(
                attempt=self.attempt, question=self.code_q,
            )
            mock_review.assert_called_once_with([submission.id])
            # Sikl ichidagi argumentlar to'g'ri bog'langan (late-binding yo'q).
            self.assertEqual(
                mock_run.call_args.args[1:],
                ('print(7)', 'python', '', self.code_q.id),
            )
            self.assertEqual(
                mock_run.call_args.kwargs, {'submission_id': submission.id},
            )


class LiveFrameConsentTestCase(APITestCase):
    """`session_live_frame` POST — proktoring roziligi SERVERDA tekshiriladi.

    Ilgari rozilik faqat frontend oqimida talab qilinardi: o'zgartirilgan
    klient yoki UI bug'i uni chetlab o'tib kadr/audio yuborsa, ular keshga
    yozilib kuzatuvchi paneliga chiqardi. Endi proktoring YOQILGAN-u rozilik
    BERILMAGAN kanalning ma'lumoti umuman qabul qilinmaydi — lekin so'rovning
    o'zi rad etilmaydi, chunki `app_switched`/`tab_escapes` kamera/mikrofonga
    umuman bog'liq emas va baribir qayd etilishi kerak.
    """

    FRAME = 'data:image/jpeg;base64,AAAA'
    SCREEN_FRAME = 'data:image/jpeg;base64,BBBB'

    def setUp(self):
        # LocMemCache jarayon davomida testlar orasida saqlanib qoladi —
        # oldingi testning kadri yangisiga sizib o'tmasin.
        cache.clear()
        self.student = User.objects.create_user(
            phone='+998901238001', password='StrongPass123', full_name="O'quvchi",
        )
        self.admin = User.objects.create_user(
            phone='+998901238002', password='StrongPass123', full_name='Admin',
        )
        self.admin.is_platform_admin = True
        self.admin.save(update_fields=['is_platform_admin'])
        self.center = EducationCenter.objects.create(name='ProSkill', city='Toshkent')
        self.olympiad = Olympiad.objects.create(
            center=self.center,
            title='Matematika Olimpiadasi',
            subject='Matematika',
            status='active',
            event_type=Olympiad.EVENT_TYPE_OLYMPIAD,
            start_datetime=timezone.now() - timezone.timedelta(minutes=10),
            duration_minutes=60,
            camera_proctoring_enabled=True,
            voice_proctoring_enabled=True,
        )
        self.session = TestSession.objects.create(
            user=self.student,
            olympiad=self.olympiad,
            status=TestSession.STATUS_ACTIVE,
        )
        self.url = reverse('session-live-frame', args=[self.session.id])

    def _send_frame(self):
        """Student to'liq to'plamni yuboradi (rozilikni tekshirmagan klient)."""
        self.client.force_authenticate(user=self.student)
        response = self.client.post(self.url, {
            'frame': self.FRAME,
            'screen_frame': self.SCREEN_FRAME,
            'audio_level': 42,
            'face_detected': False,
            'speech_detected': True,
            'app_switched': True,
            'tab_escapes': 3,
        }, format='json')
        # So'rov RAD ETILMAYDI — faqat rozilik yo'q kanal tashlab yuboriladi.
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def _watch(self):
        """Kuzatuvchi (platforma admini) o'sha sessiyani o'qiydi."""
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return response.data

    def test_media_dropped_without_consent_but_other_signals_kept(self):
        self._send_frame()
        data = self._watch()

        self.assertIsNone(data['frame'])
        self.assertIsNone(data['screen_frame'])
        self.assertEqual(data['audio_level'], 0)
        self.assertFalse(data['is_live'])
        # Kamera/mikrofondan hosil bo'lgan bayroqlar ham neytral qiymatda —
        # oqim umuman bo'lmagan joyda "yuz aniqlanmadi" signali bo'lmaydi.
        self.assertTrue(data['face_detected'])
        self.assertFalse(data['speech_detected'])
        # Rozilikka bog'liq bo'lmagan signallar esa SAQLANADI.
        self.assertTrue(data['app_switched'])
        self.assertEqual(data['tab_escapes'], 3)

    def test_media_stored_after_consent(self):
        self.session.camera_consent_given = True
        self.session.microphone_consent_given = True
        self.session.save(update_fields=[
            'camera_consent_given', 'microphone_consent_given',
        ])

        self._send_frame()
        data = self._watch()

        self.assertEqual(data['frame'], self.FRAME)
        self.assertEqual(data['screen_frame'], self.SCREEN_FRAME)
        self.assertEqual(data['audio_level'], 42)
        self.assertFalse(data['face_detected'])
        self.assertTrue(data['speech_detected'])
        self.assertTrue(data['is_live'])

    def test_camera_and_microphone_are_gated_independently(self):
        """Kamera roziligi bor, mikrofonniki yo'q — faqat audio bloklanadi."""
        self.session.camera_consent_given = True
        self.session.save(update_fields=['camera_consent_given'])

        self._send_frame()
        data = self._watch()

        self.assertEqual(data['frame'], self.FRAME)
        self.assertFalse(data['face_detected'])
        self.assertEqual(data['audio_level'], 0)
        self.assertFalse(data['speech_detected'])

    def test_consent_not_required_when_proctoring_disabled(self):
        """Olimpiadada proktoring o'chiq — rozilik ekrani umuman ko'rsatilmaydi."""
        self.olympiad.camera_proctoring_enabled = False
        self.olympiad.voice_proctoring_enabled = False
        self.olympiad.save(update_fields=[
            'camera_proctoring_enabled', 'voice_proctoring_enabled',
        ])

        self._send_frame()
        data = self._watch()

        self.assertEqual(data['frame'], self.FRAME)
        self.assertEqual(data['audio_level'], 42)
