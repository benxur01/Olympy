from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from centers.models import CenterMembership, EducationCenter
from olympiads.models import Olympiad
from questions.models import Question

User = get_user_model()


class OlympiadCreateTestCase(APITestCase):
    """POST /api/olympiads/ — manager/owner draft tadbir yaratadi."""

    def setUp(self):
        self.owner = User.objects.create_user(
            phone='+998901300001', password='StrongPass123', full_name='Owner',
        )
        self.center = EducationCenter.objects.create(
            name='Olimp Markaz', city='Toshkent', owner=self.owner,
            status=EducationCenter.STATUS_APPROVED,
        )
        self.question = Question.objects.create(
            center=self.center, subject='Matematika',
            text='2+2=?', options=['3', '4'], correct_answer=1, score=5,
        )
        self.client.force_authenticate(user=self.owner)

    def test_create_olympiad_as_draft(self):
        url = reverse('olympiads-list-create')
        response = self.client.post(url, {
            'center': self.center.id,
            'title': 'Matematika Olimpiadasi',
            'subject': 'Matematika',
            'event_type': Olympiad.EVENT_TYPE_COMPETITION,
            'duration_minutes': 60,
            'question_ids': [self.question.id],
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        olympiad = Olympiad.objects.get(title='Matematika Olimpiadasi')
        self.assertEqual(olympiad.status, Olympiad.STATUS_DRAFT)
        self.assertEqual(olympiad.center_id, self.center.id)
        self.assertIn(self.question, olympiad.questions.all())

    def test_outsider_cannot_create_olympiad(self):
        outsider = User.objects.create_user(
            phone='+998901300002', password='StrongPass123', full_name='Begona',
        )
        self.client.force_authenticate(user=outsider)
        url = reverse('olympiads-list-create')
        response = self.client.post(url, {
            'center': self.center.id,
            'title': 'Ruxsatsiz',
            'subject': 'Matematika',
            'duration_minutes': 60,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class OlympiadStatusFlowTestCase(APITestCase):
    """Olimpiada holati: draft -> active (publish) -> finished (finish)."""

    def setUp(self):
        self.owner = User.objects.create_user(
            phone='+998901300003', password='StrongPass123', full_name='Owner',
        )
        self.center = EducationCenter.objects.create(
            name='Status Markaz', city='Toshkent', owner=self.owner,
            status=EducationCenter.STATUS_APPROVED,
        )
        self.question = Question.objects.create(
            center=self.center, subject='Fizika',
            text='Yer tortishish tezlanishi?', options=['9.8', '10', '11'],
            correct_answer=0, score=5,
        )
        # event_readiness_errors o'tishi uchun: kelajakdagi start_datetime,
        # davomiylik va kamida bitta savol kerak.
        self.olympiad = Olympiad.objects.create(
            center=self.center,
            title='Fizika Tadbiri',
            subject='Fizika',
            event_type=Olympiad.EVENT_TYPE_COMPETITION,
            status=Olympiad.STATUS_DRAFT,
            start_datetime=timezone.now() + timezone.timedelta(hours=1),
            duration_minutes=60,
        )
        self.olympiad.questions.add(self.question)
        self.client.force_authenticate(user=self.owner)

    def test_publish_draft_to_active(self):
        url = reverse('olympiad-publish', args=[self.olympiad.id])
        with patch('notifications.services.send_olympiad_published_bulk'):
            response = self.client.post(url, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.olympiad.refresh_from_db()
        self.assertEqual(self.olympiad.status, Olympiad.STATUS_ACTIVE)

    def test_publish_not_ready_returns_errors(self):
        """Savolsiz / sanasiz draftni nashr qilib bo'lmaydi."""
        bare = Olympiad.objects.create(
            center=self.center, title='', subject='',
            event_type=Olympiad.EVENT_TYPE_COMPETITION,
            status=Olympiad.STATUS_DRAFT, duration_minutes=60,
        )
        url = reverse('olympiad-publish', args=[bare.id])
        response = self.client.post(url, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('errors', response.data)
        bare.refresh_from_db()
        self.assertEqual(bare.status, Olympiad.STATUS_DRAFT)

    def test_finish_active_olympiad(self):
        self.olympiad.status = Olympiad.STATUS_ACTIVE
        self.olympiad.save(update_fields=['status'])
        url = reverse('olympiad-finish', args=[self.olympiad.id])
        response = self.client.post(url, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.olympiad.refresh_from_db()
        self.assertEqual(self.olympiad.status, Olympiad.STATUS_FINISHED)

    def test_cannot_finish_draft(self):
        url = reverse('olympiad-finish', args=[self.olympiad.id])
        response = self.client.post(url, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.olympiad.refresh_from_db()
        self.assertEqual(self.olympiad.status, Olympiad.STATUS_DRAFT)

    def test_deactivate_active_to_inactive(self):
        self.olympiad.status = Olympiad.STATUS_ACTIVE
        self.olympiad.save(update_fields=['status'])
        url = reverse('olympiad-deactivate', args=[self.olympiad.id])
        response = self.client.post(url, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.olympiad.refresh_from_db()
        self.assertEqual(self.olympiad.status, Olympiad.STATUS_INACTIVE)


class OlympiadParticipationTestCase(APITestCase):
    """GET /api/olympiads/{id}/questions/ — o'quvchining olimpiadaga kirishi.

    Bu endpoint o'quvchini olimpiadaga "ro'yxatdan o'tkazadi": ruxsatni
    tekshiradi va test sessiyasini yaratadi.
    """

    def setUp(self):
        self.center = EducationCenter.objects.create(
            name='Part Markaz', city='Toshkent',
            status=EducationCenter.STATUS_APPROVED,
        )
        self.question = Question.objects.create(
            center=self.center, subject='Matematika',
            text='3*3=?', options=['6', '9', '12'], correct_answer=1, score=5,
        )
        # Allaqachon boshlangan (start o'tgan), hali tugamagan faol olimpiada.
        self.olympiad = Olympiad.objects.create(
            center=self.center,
            title='Faol Olimpiada',
            subject='Matematika',
            event_type=Olympiad.EVENT_TYPE_COMPETITION,
            status=Olympiad.STATUS_ACTIVE,
            start_datetime=timezone.now() - timezone.timedelta(minutes=5),
            duration_minutes=60,
        )
        self.olympiad.questions.add(self.question)

        self.student = User.objects.create_user(
            phone='+998901300010', password='StrongPass123', full_name="O'quvchi",
        )
        CenterMembership.objects.create(
            user=self.student, center=self.center,
            role=CenterMembership.ROLE_STUDENT,
            status=CenterMembership.STATUS_APPROVED,
        )

    def test_approved_student_can_enter(self):
        self.client.force_authenticate(user=self.student)
        url = reverse('olympiad-questions', args=[self.olympiad.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['questions']), 1)

    def test_non_member_cannot_enter_competition(self):
        outsider = User.objects.create_user(
            phone='+998901300011', password='StrongPass123', full_name='Begona',
        )
        self.client.force_authenticate(user=outsider)
        url = reverse('olympiad-questions', args=[self.olympiad.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
