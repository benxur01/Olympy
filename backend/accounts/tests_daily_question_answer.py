"""Kunlik savolga javob (`POST /api/daily-questions/<id>/answer/`).

`DailyQuestionAnswer` da (user, daily_question) uchun DB `UniqueConstraint`
bor, shuning uchun parallel ikki javob coin/statistikani dublikat qila
OLMAYDI — bu xavfsizlik muammosi emas. Lekin "javob berganmi" tekshiruvi
qulfsiz: poygada ikkinchi INSERT unique cheklovni buzadi va ilgari
ushlanmagan `IntegrityError` foydalanuvchiga 500 bo'lib qaytardi. Bu testlar
o'sha holatda 400 qaytishini qotiradi.
"""
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import DailyQuestion, DailyQuestionAnswer
from centers.models import EducationCenter
from questions.models import Question

User = get_user_model()


class DailyQuestionAnswerTestCase(APITestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            phone='+998906660001', password='UserPass123', full_name='O\'quvchi',
        )
        center = EducationCenter.objects.create(name='Daily Academy', city='Toshkent')
        question = Question.objects.create(
            center=center, subject='Matematika', text='2+2=?',
            options=['3', '4'], correct_answer=1,
        )
        self.daily = DailyQuestion.objects.create(
            question=question, date=timezone.now().date(), subject='Matematika',
        )
        self.url = reverse('daily-question-answer', args=[self.daily.pk])
        self.client.force_authenticate(user=self.user)

    def test_first_answer_is_accepted(self):
        response = self.client.post(self.url, {'selected_option': 1}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['is_correct'])
        self.assertEqual(DailyQuestionAnswer.objects.count(), 1)

    def test_second_answer_is_rejected_with_400(self):
        """Ketma-ket takroriy javob — tez yo'l tekshiruvi (mavjud xulq)."""
        self.client.post(self.url, {'selected_option': 1}, format='json')
        response = self.client.post(self.url, {'selected_option': 0}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(DailyQuestionAnswer.objects.count(), 1)

    def test_unique_constraint_violation_returns_400_not_500(self):
        """POYGA: `.exists()` False qaytarib, INSERT unique cheklovga urilsa.

        Parallel ikkinchi so'rov aynan shu yo'ldan o'tadi. Qulfsiz tekshiruvni
        seam orqali "o'tkazib yuboramiz" (filter → bo'sh queryset), keyin
        haqiqiy INSERT unique cheklovni buzadi. Foydalanuvchi 500 emas, aniq
        400 olishi kerak.
        """
        DailyQuestionAnswer.objects.create(
            user=self.user, daily_question=self.daily,
            selected_option=1, is_correct=True,
        )
        with patch.object(
            DailyQuestionAnswer.objects, 'filter',
            return_value=DailyQuestionAnswer.objects.none(),
        ):
            response = self.client.post(self.url, {'selected_option': 0}, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], 'Bu savolga allaqachon javob bergansiz')
        self.assertEqual(DailyQuestionAnswer.objects.count(), 1)
