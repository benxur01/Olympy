"""Unit tests for advanced admin competition management operations:
- Live Leaderboard Freeze/Unfreeze
- Batch Regrading Engine
- IRT Question Analytics (facility & discrimination)
- Certificate and Diploma Generation
"""
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from attempts.models import TestAttempt, TestSession
from centers.models import EducationCenter
from olympiads.models import Olympiad
from questions.models import Question


@override_settings(SECURE_SSL_REDIRECT=False)
class AdminCompetitionOpsTestCase(APITestCase):

    def setUp(self):
        self.admin_user = User.objects.create_superuser(
            phone='+998901112233',
            password='AdminPassword123!',
            full_name='Platform Admin',
            is_platform_admin=True,
        )
        self.center = EducationCenter.objects.create(
            name='Test Markaz',
            city='Toshkent',
        )
        self.olympiad = Olympiad.objects.create(
            center=self.center,
            title='Respublika Matematika 2026',
            subject='Matematika',
            status=Olympiad.STATUS_ACTIVE,
        )
        # Savollar
        self.q1 = Question.objects.create(
            center=self.center,
            text='2 + 2 = ?',
            subject='Matematika',
            question_type=Question.QUESTION_TYPE_MCQ,
            options=['2', '3', '4', '5'],
            correct_answer=2,  # '4'
        )
        self.q2 = Question.objects.create(
            center=self.center,
            text='5 * 5 = ?',
            subject='Matematika',
            question_type=Question.QUESTION_TYPE_MCQ,
            options=['10', '20', '25', '30'],
            correct_answer=2,  # '25'
        )
        self.olympiad.questions.add(self.q1, self.q2)

        # O'quvchilar
        self.student1 = User.objects.create_user(
            phone='+998901000001',
            password='password123',
            full_name='Ahmad Aliyev',
        )
        self.student2 = User.objects.create_user(
            phone='+998901000002',
            password='password123',
            full_name='Bekzod Boboyev',
        )

        # Urinishlar
        self.att1 = TestAttempt.objects.create(
            user=self.student1,
            olympiad=self.olympiad,
            answers={str(self.q1.id): 2, str(self.q2.id): 2},  # 2 tasi ham to'g'ri (100%)
            score=100,
            correct_count=2,
            wrong_count=0,
            total_questions=2,
            time_spent=120,
            rank=1,
        )
        self.att2 = TestAttempt.objects.create(
            user=self.student2,
            olympiad=self.olympiad,
            answers={str(self.q1.id): 2, str(self.q2.id): 1},  # 1 tasi to'g'ri (50%)
            score=50,
            correct_count=1,
            wrong_count=1,
            total_questions=2,
            time_spent=150,
            rank=2,
        )

        self.client.force_authenticate(user=self.admin_user)

    def test_toggle_leaderboard_freeze(self):
        """Leaderboardni muzlatish va ochish."""
        # 1. Muzlatish
        resp_freeze = self.client.post(
            f'/api/olympiads/admin/{self.olympiad.id}/freeze/',
            format='json',
        )
        self.assertEqual(resp_freeze.status_code, status.HTTP_200_OK)
        self.olympiad.refresh_from_db()
        self.assertTrue(self.olympiad.is_leaderboard_frozen)
        self.assertIsNotNone(self.olympiad.frozen_at)

        # 2. Ochish
        resp_unfreeze = self.client.post(
            f'/api/olympiads/admin/{self.olympiad.id}/freeze/',
            format='json',
        )
        self.assertEqual(resp_unfreeze.status_code, status.HTTP_200_OK)
        self.olympiad.refresh_from_db()
        self.assertFalse(self.olympiad.is_leaderboard_frozen)
        self.assertIsNone(self.olympiad.frozen_at)

    def test_batch_regrading_engine(self):
        """Savol to'g'ri javobi o'zgarganda ballar qayta hisoblanishi."""
        # q2 ning to'g'ri javobini 1 ('20') ga o'zgartiramiz
        self.q2.correct_answer = 1
        self.q2.save()

        resp = self.client.post(
            f'/api/olympiads/admin/{self.olympiad.id}/regrade/',
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['total_attempts'], 2)
        self.assertEqual(resp.data['updated_count'], 2)

        self.att1.refresh_from_db()
        self.att2.refresh_from_db()

        # Endi att2 2 ta to'g'ri topgan (100%), att1 esa 1 ta to'g'ri (50%)
        self.assertEqual(self.att2.score, 100)
        self.assertEqual(self.att2.rank, 1)
        self.assertEqual(self.att1.score, 50)
        self.assertEqual(self.att1.rank, 2)

    def test_question_analytics_irt(self):
        """Savollar qiyinligi va diskriminatsiyasi tahlili."""
        resp = self.client.get(
            f'/api/olympiads/admin/{self.olympiad.id}/analytics/',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['total_participants'], 2)
        self.assertEqual(len(resp.data['questions']), 2)

        q1_data = next(q for q in resp.data['questions'] if q['question_id'] == self.q1.id)
        # q1 ni ikkalasi ham to'g'ri topgan (facility_index = 100%)
        self.assertEqual(q1_data['facility_index'], 100.0)
        self.assertEqual(q1_data['difficulty_label'], 'Juda oson')

    def test_certificates_and_template(self):
        """Diplomlar ro'yxati va shablonni o'zgartirish."""
        # 1. Ro'yxatni olish
        resp_get = self.client.get(
            f'/api/olympiads/admin/{self.olympiad.id}/certificates/',
        )
        self.assertEqual(resp_get.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_get.data['total_awards'], 2)
        self.assertEqual(resp_get.data['counts']['gold'], 1)

        # 2. Shablonni 'gold' ga o'zgartirish
        resp_post = self.client.post(
            f'/api/olympiads/admin/{self.olympiad.id}/certificates/',
            {'certificate_template': 'gold'},
            format='json',
        )
        self.assertEqual(resp_post.status_code, status.HTTP_200_OK)
        self.olympiad.refresh_from_db()
        self.assertEqual(self.olympiad.certificate_template, 'gold')
