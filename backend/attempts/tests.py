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
