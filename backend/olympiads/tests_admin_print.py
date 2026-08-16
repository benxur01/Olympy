"""Unit tests for Printable Exam and OMR Sheet views.
"""
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from centers.models import EducationCenter
from olympiads.models import Olympiad
from questions.models import Question


@override_settings(SECURE_SSL_REDIRECT=False)
class AdminPrintExamTestCase(APITestCase):

    def setUp(self):
        self.admin_user = User.objects.create_superuser(
            phone='+998901112233',
            password='AdminPassword123!',
            full_name='Platform Admin',
            is_platform_admin=True,
        )
        self.center = EducationCenter.objects.create(name='Maktab 1', city='Samarqand')
        self.olympiad = Olympiad.objects.create(
            center=self.center,
            title='Ona Tili Imtihoni',
            subject='Ona tili',
            start_datetime=timezone.now(),
            duration_minutes=90,
            max_score=100,
        )
        self.q1 = Question.objects.create(
            center=self.center,
            subject='Ona tili',
            text='Qaysi so‘z to‘g‘ri yozilgan?',
            options=['Muallim', 'Mualim', 'Muallim', 'Moallim'],
            correct_answer=0,
        )
        self.olympiad.questions.add(self.q1)
        self.client.force_authenticate(user=self.admin_user)

    def test_printable_exam_data(self):
        resp = self.client.get(f'/api/olympiads/admin/{self.olympiad.id}/printable/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data['ok'])
        self.assertEqual(resp.data['total_questions'], 1)
        self.assertEqual(resp.data['questions'][0]['options'][0]['letter'], 'A')
        self.assertEqual(resp.data['answer_keys'][0]['correct_letter'], 'A')
