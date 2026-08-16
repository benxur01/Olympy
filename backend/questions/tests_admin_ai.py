"""Unit tests for Admin AI Orchestration Studio endpoints:
- AI Exam & Quiz Generator
- AI Appeal & Discrepancy Moderation
- AI Usage & Cost Tracker
"""
from unittest.mock import patch
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from centers.models import EducationCenter
from questions.models import Question


@override_settings(SECURE_SSL_REDIRECT=False)
class AdminAIStudioTestCase(APITestCase):

    def setUp(self):
        self.admin_user = User.objects.create_superuser(
            phone='+998901112233',
            password='AdminPassword123!',
            full_name='Platform Admin',
            is_platform_admin=True,
        )
        self.center = EducationCenter.objects.create(
            name='Test AI Markaz',
            city='Toshkent',
            status=EducationCenter.STATUS_APPROVED,
        )
        self.client.force_authenticate(user=self.admin_user)

    @patch('questions.views_admin_ai.generate_questions')
    def test_admin_ai_generate_exam_questions(self, mock_generate):
        mock_generate.return_value = [
            {
                'text': 'Kvadratning tomoni 4 sm bo‘lsa, yuzi nechaga teng?',
                'options': ['8 sm²', '12 sm²', '16 sm²', '20 sm²'],
                'correct_answer': 2,
            },
            {
                'text': 'Tenglamani yeching: 2x = 10',
                'options': ['2', '5', '8', '10'],
                'correct_answer': 1,
            }
        ]

        resp = self.client.post(
            '/api/questions/admin/generate-exam/',
            {
                'subject': 'Matematika',
                'topic': 'Geometriya va Algebra',
                'difficulty': 'medium',
                'count': 2,
                'save_to_bank': True,
                'center_id': self.center.id,
            },
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['generated_count'], 2)
        self.assertEqual(resp.data['saved_count'], 2)

        # DB da 2 ta AI savol paydo bo'lishini tekshiramiz
        self.assertEqual(Question.objects.filter(source=Question.SOURCE_AI).count(), 2)

    def test_admin_ai_usage_metrics(self):
        Question.objects.create(
            center=self.center,
            subject='Fizika',
            text='Nyutonning ikkinchi qonuni formulasi?',
            options=['F=ma', 'E=mc2', 'v=s/t', 'P=UI'],
            correct_answer=0,
            source=Question.SOURCE_AI,
        )

        resp = self.client.get('/api/questions/admin/ai-metrics/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(resp.data['total_ai_questions'], 1)
        self.assertIn('estimated_cost_usd', resp.data)
