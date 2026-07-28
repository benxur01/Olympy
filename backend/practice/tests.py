"""Mashq (practice) rejimi testlari.

Mashq rejimi markazning UMUMIY (olimpiada) savollar bankidan savol beradi.
Olib tashlangan Jonli Viktorina funksiyasidan qolgan `purpose=live_quiz`
qatorlar bu yerga tushmasligi kerak.
"""
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from centers.models import CenterMembership, EducationCenter
from questions.models import Question

User = get_user_model()


class PracticeLiveQuizIsolationTestCase(APITestCase):
    """Jonli Viktorina savoli mashq rejimida o'quvchiga ko'rinmaydi."""

    def setUp(self):
        self.center = EducationCenter.objects.create(
            name='Practice Academy', city='Toshkent',
            status=EducationCenter.STATUS_APPROVED,
        )
        self.teacher = User.objects.create_user(
            phone='+998901660001', password='StrongPass123', full_name='Ustoz',
        )
        self.student = User.objects.create_user(
            phone='+998901660002', password='StrongPass123', full_name="O'quvchi",
        )
        for user, role in (
            (self.teacher, CenterMembership.ROLE_TEACHER),
            (self.student, CenterMembership.ROLE_STUDENT),
        ):
            CenterMembership.objects.create(
                user=user, center=self.center, role=role,
                status=CenterMembership.STATUS_APPROVED,
            )
        self.olympiad_question = Question.objects.create(
            center=self.center, subject='Matematika',
            text='Olimpiada savoli', options=['1', '2'],
            correct_answer=0, score=5,
        )
        self.live_quiz_question = Question.objects.create(
            center=self.center, subject='Fizika',
            text='Viktorina savoli', options=['1', '2'],
            correct_answer=0, score=5, created_by=self.teacher,
            purpose=Question.QUESTION_PURPOSE_LIVE_QUIZ,
        )
        self.client.force_authenticate(user=self.student)

    def test_practice_subjects_excludes_live_quiz_subject(self):
        response = self.client.get(
            reverse('practice-subjects'), {'center': self.center.id},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        subjects = {row['subject'] for row in response.data}
        self.assertIn('Matematika', subjects)
        self.assertNotIn('Fizika', subjects)

    def test_practice_start_excludes_live_quiz_question(self):
        """Faqat viktorina savoli bor fanda mashq boshlanmaydi (404)."""
        response = self.client.post(
            reverse('practice-start'),
            {'center_id': self.center.id, 'subject': 'Fizika', 'question_count': 5},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_practice_start_returns_olympiad_questions(self):
        """Umumiy bank savollari avvalgidek qaytariladi (regressiya)."""
        response = self.client.post(
            reverse('practice-start'),
            {'center_id': self.center.id, 'subject': 'Matematika', 'question_count': 5},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [q['id'] for q in response.data['questions']],
            [self.olympiad_question.id],
        )
