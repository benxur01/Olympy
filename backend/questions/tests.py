from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from centers.models import CenterMembership, EducationCenter
from questions.models import Question

User = get_user_model()


class QuestionModelTestCase(APITestCase):
    """Question modeli va test case biriktirish."""

    def setUp(self):
        self.center = EducationCenter.objects.create(
            name='Code Academy', city='Toshkent',
            status=EducationCenter.STATUS_APPROVED,
        )

    def test_create_mcq_question(self):
        q = Question.objects.create(
            center=self.center,
            subject='Matematika',
            text='2 + 2 = ?',
            options=['3', '4', '5'],
            correct_answer=1,
            score=5,
        )
        self.assertEqual(q.question_type, Question.QUESTION_TYPE_MCQ)
        self.assertEqual(q.options[q.correct_answer], '4')
        self.assertEqual(self.center.questions.count(), 1)

    def test_create_code_question_with_test_cases(self):
        """IT (code) savol test_cases JSON maydoni bilan saqlanadi."""
        test_cases = [
            {'input': '5', 'expected_output': '25', 'is_hidden': False},
            {'input': '3', 'expected_output': '9', 'is_hidden': True},
        ]
        q = Question.objects.create(
            center=self.center,
            subject='Dasturlash',
            text="Sonning kvadratini chiqaring",
            question_type=Question.QUESTION_TYPE_CODE,
            programming_language='python',
            code_template='n = int(input())',
            expected_output='25',
            test_cases=test_cases,
        )
        q.refresh_from_db()
        self.assertEqual(q.question_type, Question.QUESTION_TYPE_CODE)
        self.assertEqual(len(q.test_cases), 2)
        self.assertEqual(q.test_cases[0]['expected_output'], '25')
        self.assertTrue(q.test_cases[1]['is_hidden'])


class QuestionCreateApiTestCase(APITestCase):
    """POST /api/questions/ — faqat tasdiqlangan teacher/manager/owner."""

    def setUp(self):
        self.center = EducationCenter.objects.create(
            name='ProSkill', city='Toshkent',
            status=EducationCenter.STATUS_APPROVED,
        )
        self.teacher = User.objects.create_user(
            phone='+998901110001', password='StrongPass123', full_name="O'qituvchi",
        )
        CenterMembership.objects.create(
            user=self.teacher, center=self.center,
            role=CenterMembership.ROLE_TEACHER,
            status=CenterMembership.STATUS_APPROVED,
        )
        self.outsider = User.objects.create_user(
            phone='+998901110002', password='StrongPass123', full_name='Begona',
        )

    def test_teacher_creates_question(self):
        self.client.force_authenticate(user=self.teacher)
        url = reverse('questions-list-create')
        response = self.client.post(url, {
            'center': self.center.id,
            'subject': 'Fizika',
            'text': 'Yorug\'lik tezligi qancha?',
            'options': ['3*10^8 m/s', '3*10^6 m/s', '300 m/s'],
            'correct_answer': 0,
            'score': 4,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(
            Question.objects.filter(center=self.center, text__startswith='Yorug').exists()
        )

    def test_outsider_cannot_create_question(self):
        self.client.force_authenticate(user=self.outsider)
        url = reverse('questions-list-create')
        # To'liq valid payload — 403 ruxsat sababli qaytishini tekshiramiz
        # (serializer validatsiyasi emas).
        response = self.client.post(url, {
            'center': self.center.id,
            'subject': 'Fizika',
            'text': 'Test',
            'options': ['a', 'b'],
            'correct_answer': 0,
            'score': 3,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class RunCodeViewTestCase(APITestCase):
    """POST /api/questions/run-code/start/ — Judge0 async runner.

    Judge0'ga real chiqmaslik uchun Celery taskni mock qilamiz
    (test muhitida CELERY_TASK_ALWAYS_EAGER, aks holda task sinxron
    bajarilib Judge0 API'ga murojaat qilardi).
    """

    def setUp(self):
        self.user = User.objects.create_user(
            phone='+998901110003', password='StrongPass123', full_name='Coder',
        )
        self.client.force_authenticate(user=self.user)

    @patch('questions.tasks.run_code_async_task.delay')
    def test_run_code_start_returns_pending(self, mock_delay):
        url = reverse('questions-run-code-start')
        response = self.client.post(url, {
            'source_code': 'print(int(input())**2)',
            'language': 'python',
            'stdin': '5',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        task_id = response.data.get('task_id')
        self.assertTrue(task_id)
        mock_delay.assert_called_once()

        # Yangi yaratilgan task statusi PENDING bo'lishi kerak (keshda).
        status_url = reverse('questions-run-code-status', args=[task_id])
        status_resp = self.client.get(status_url)
        self.assertEqual(status_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(status_resp.data.get('status'), 'PENDING')

    @patch('questions.tasks.run_code_async_task.delay')
    def test_run_code_empty_source_rejected(self, mock_delay):
        url = reverse('questions-run-code-start')
        response = self.client.post(url, {
            'source_code': '   ',
            'language': 'python',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        mock_delay.assert_not_called()

    @patch('questions.tasks.run_code_async_task.delay')
    def test_run_code_unsupported_language_rejected(self, mock_delay):
        url = reverse('questions-run-code-start')
        response = self.client.post(url, {
            'source_code': 'print(1)',
            'language': 'cobol',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        mock_delay.assert_not_called()

    def test_run_code_status_unknown_task(self):
        status_url = reverse('questions-run-code-status', args=['no-such-task'])
        response = self.client.get(status_url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.data.get('status'), 'FAILED')


class PremiumQuestionFeaturesTestCase(APITestCase):
    """AI va PDF orqali savol yaratish premium obunaga bog'liqligini tekshirish."""

    def setUp(self):
        self.owner = User.objects.create_user(
            phone='+998901200097', password='StrongPass123', full_name='Owner'
        )
        self.center = EducationCenter.objects.create(
            name='Test Markaz', city='Toshkent', owner=self.owner,
            status=EducationCenter.STATUS_APPROVED,
            is_premium=False
        )
        # approved membership
        CenterMembership.objects.create(
            user=self.owner, center=self.center,
            role=CenterMembership.ROLE_OWNER,
            status=CenterMembership.STATUS_APPROVED
        )
        self.client.force_authenticate(user=self.owner)

    def test_generate_ai_questions_locked_for_free_center(self):
        url = reverse('questions-generate-ai')
        response = self.client.post(url, {
            'center': self.center.id,
            'subject': 'Matematika',
            'topic': 'Integral',
            'count': 5
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(response.data.get('upgrade_required'))

    def test_preview_pdf_questions_locked_for_free_center(self):
        url = reverse('questions-pdf-preview')
        from django.core.files.uploadedfile import SimpleUploadedFile
        fake_pdf = SimpleUploadedFile("test.pdf", b"%PDF-1.4 dummy content", content_type="application/pdf")
        response = self.client.post(url, {
            'center': self.center.id,
            'pdf': fake_pdf
        }, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(response.data.get('upgrade_required'))

    @patch('questions.views.generate_questions')
    def test_generate_ai_questions_allowed_for_premium_center(self, mock_generate):
        mock_generate.return_value = {'ok': True, 'questions': []}
        self.center.is_premium = True
        self.center.save()
        
        url = reverse('questions-generate-ai')
        response = self.client.post(url, {
            'center': self.center.id,
            'subject': 'Matematika',
            'topic': 'Integral',
            'count': 5
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

