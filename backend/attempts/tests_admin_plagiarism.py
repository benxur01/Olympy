"""Unit tests for Admin Plagiarism and Similarity detection.
"""
from decimal import Decimal
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from attempts.models import TestAttempt
from centers.models import EducationCenter
from olympiads.models import Olympiad
from questions.models import Question


@override_settings(SECURE_SSL_REDIRECT=False)
class AdminPlagiarismTestCase(APITestCase):

    def setUp(self):
        self.admin_user = User.objects.create_superuser(
            phone='+998901112233',
            password='AdminPassword123!',
            full_name='Platform Admin',
            is_platform_admin=True,
        )
        self.center = EducationCenter.objects.create(name='Test Center', city='Toshkent')
        self.u1 = User.objects.create_user(phone='+998901000001', password='pw1', full_name='Olim')
        self.u2 = User.objects.create_user(phone='+998901000002', password='pw2', full_name='Vali')

        self.olympiad = Olympiad.objects.create(
            center=self.center,
            title='Fizika Olimpiadasi',
            subject='Fizika',
            start_datetime=timezone.now(),
            duration_minutes=60,
        )

        self.q1 = Question.objects.create(center=self.center, subject='Fizika', text="Q1", options=["A", "B", "C", "D"], correct_answer=0)
        self.q2 = Question.objects.create(center=self.center, subject='Fizika', text="Q2", options=["A", "B", "C", "D"], correct_answer=1)
        self.olympiad.questions.add(self.q1, self.q2)

        # 1-o'quvchi urinishi
        self.att1 = TestAttempt.objects.create(
            user=self.u1,
            olympiad=self.olympiad,
            score=50,
            answers={
                str(self.q1.id): {'answer': 0, 'is_correct': True},
                str(self.q2.id): {'answer': 3, 'is_correct': False}, # Bir xil xato
            },
        )

        # 2-o'quvchi urinishi (u1 bilan bir xil)
        self.att2 = TestAttempt.objects.create(
            user=self.u2,
            olympiad=self.olympiad,
            score=50,
            answers={
                str(self.q1.id): {'answer': 0, 'is_correct': True},
                str(self.q2.id): {'answer': 3, 'is_correct': False}, # Bir xil xato
            },
        )

        self.client.force_authenticate(user=self.admin_user)

    def test_plagiarism_analysis(self):
        resp = self.client.get(f'/api/attempts/admin/olympiad/{self.olympiad.id}/plagiarism/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data['ok'])
        self.assertEqual(resp.data['suspicious_pairs_count'], 1)
        pair = resp.data['high_risk_pairs'][0]
        self.assertEqual(pair['similarity_percent'], 100.0)
        self.assertEqual(pair['identical_wrong_count'], 1)
        self.assertEqual(pair['risk_level'], 'CRITICAL')
