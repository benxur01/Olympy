import json
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from attempts.models import CodeSubmission, EssayGrade, TestAttempt
from centers.models import CenterMembership, EducationCenter
from olympiads.models import Olympiad
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

    def test_teacher_creates_slider_question(self):
        """Slayder savoli: sozlama correct_text ichida JSON bo'lib saqlanadi."""
        self.client.force_authenticate(user=self.teacher)
        url = reverse('questions-list-create')
        response = self.client.post(url, {
            'center': self.center.id,
            'subject': 'Tarix',
            'text': "O'zbekiston mustaqilligi qaysi yilda e'lon qilindi?",
            'question_type': Question.QUESTION_TYPE_SLIDER,
            'correct_text': '{"min": 1900, "max": 2000, "step": 1, "correct": 1991, "tolerance": 2}',
            'score': 5,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        q = Question.objects.get(center=self.center, question_type=Question.QUESTION_TYPE_SLIDER)
        self.assertEqual(q.options, [])
        self.assertEqual(
            json.loads(q.correct_text),
            {'min': 1900, 'max': 2000, 'step': 1, 'correct': 1991, 'tolerance': 2},
        )

    def test_slider_correct_value_outside_range_rejected(self):
        self.client.force_authenticate(user=self.teacher)
        url = reverse('questions-list-create')
        response = self.client.post(url, {
            'center': self.center.id,
            'subject': 'Tarix',
            'text': 'Noto\'g\'ri slayder',
            'question_type': Question.QUESTION_TYPE_SLIDER,
            'correct_text': '{"min": 0, "max": 10, "step": 1, "correct": 42, "tolerance": 0}',
            'score': 5,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('correct_text', response.data)

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


class QuestionPurposeApiTestCase(APITestCase):
    """Savol banki — markaz bo'ylab yagona `olympiad` banki.

    Jonli Viktorina (`purpose='live_quiz'`) banki olib tashlandi, lekin eski
    qatorlar bazada qolgan: ular ro'yxatga CHIQMASLIGI kerak.
    """

    def setUp(self):
        self.center = EducationCenter.objects.create(
            name='Purpose Academy', city='Toshkent',
            status=EducationCenter.STATUS_APPROVED,
        )
        self.teacher = User.objects.create_user(
            phone='+998901440001', password='StrongPass123', full_name="Ustoz 1",
        )
        self.other_teacher = User.objects.create_user(
            phone='+998901440002', password='StrongPass123', full_name="Ustoz 2",
        )
        for user in (self.teacher, self.other_teacher):
            CenterMembership.objects.create(
                user=user, center=self.center, role=CenterMembership.ROLE_TEACHER,
                status=CenterMembership.STATUS_APPROVED,
            )
        self.url = reverse('questions-list-create')

    def _rows(self, response):
        """Paginatsiyalangan javobdan savollar ro'yxatini oladi."""
        data = response.data
        return data['results'] if isinstance(data, dict) else data

    def _create(self, user, text):
        self.client.force_authenticate(user=user)
        return self.client.post(self.url, {
            'center': self.center.id,
            'subject': 'Matematika',
            'text': text,
            'options': ['1', '2'],
            'correct_answer': 0,
            'score': 3,
        }, format='json')

    def test_create_olympiad_question_by_default(self):
        """Yangi savol har doim umumiy olimpiada bankiga tushadi."""
        response = self._create(self.teacher, 'Olimpiada savoli')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['purpose'], Question.QUESTION_PURPOSE_OLYMPIAD)
        q = Question.objects.get(text='Olimpiada savoli')
        self.assertEqual(q.purpose, Question.QUESTION_PURPOSE_OLYMPIAD)

    def test_list_returns_center_wide_bank_without_legacy_live_quiz(self):
        """Ro'yxat markaz bo'ylab umumiy, eski viktorina savollarisiz."""
        self._create(self.teacher, 'Umumiy 1')
        self._create(self.other_teacher, 'Umumiy 2')
        # Feature olib tashlanishidan oldin yaratilgan qator (endi API orqali
        # bunday savol yaratib bo'lmaydi).
        Question.objects.create(
            center=self.center, subject='Matematika', text='Eski viktorina',
            options=['1', '2'], correct_answer=0, score=3,
            created_by=self.teacher,
            purpose=Question.QUESTION_PURPOSE_LIVE_QUIZ,
        )

        self.client.force_authenticate(user=self.other_teacher)
        response = self.client.get(self.url, {'center': self.center.id})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        texts = sorted(row['text'] for row in self._rows(response))
        # Hamkasbning savoli ham ko'rinadi (markaz bo'ylab umumiy).
        self.assertEqual(texts, ['Umumiy 1', 'Umumiy 2'])


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

    @patch('questions.ai_generation.generate_questions')
    def test_generate_ai_questions_allowed_for_premium_center(self, mock_generate):
        """Premium markaz uchun generatsiya task'i boshlanadi va natija polling bilan olinadi.

        Gemini chaqiruvi endi Celery task'da (test muhitida EAGER — `delay()`
        sinxron bajariladi), shu sababli view 202 + task_id qaytaradi.
        """
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
        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        task_id = response.data.get('task_id')
        self.assertTrue(task_id)

        status_resp = self.client.get(
            reverse('questions-generate-ai-status', args=[task_id]),
        )
        self.assertEqual(status_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(status_resp.data.get('status'), 'COMPLETED')
        self.assertEqual(status_resp.data.get('questions'), [])


class QuestionDeleteProtectionTestCase(APITestCase):
    """Foydalanishdagi savol o'chirilmaydi, balki arxivlanadi (is_active=False).

    O'chirish tarixiy baholash ma'lumotini yo'qotardi; endi himoyalangan savol
    is_active=False qilinadi — savol bankidan yo'qoladi, ammo qatori (va unga
    bog'liq CodeSubmission/EssayGrade) saqlanadi va scoring yo'liga ta'sir
    qilmaydi. Himoyalanmagan savol avvalgidek qattiq o'chiriladi.
    """

    def setUp(self):
        self.center = EducationCenter.objects.create(
            name='Delete Academy', city='Toshkent',
            status=EducationCenter.STATUS_APPROVED,
        )
        self.teacher = User.objects.create_user(
            phone='+998901330001', password='StrongPass123', full_name="O'qituvchi",
        )
        CenterMembership.objects.create(
            user=self.teacher, center=self.center,
            role=CenterMembership.ROLE_TEACHER,
            status=CenterMembership.STATUS_APPROVED,
        )
        self.manager = User.objects.create_user(
            phone='+998901330002', password='StrongPass123', full_name='Menejer',
        )
        CenterMembership.objects.create(
            user=self.manager, center=self.center,
            role=CenterMembership.ROLE_MANAGER,
            status=CenterMembership.STATUS_APPROVED,
        )
        self.student = User.objects.create_user(
            phone='+998901330003', password='StrongPass123', full_name='Talaba',
        )

    def _make_question(self, text='2+2 = ?'):
        return Question.objects.create(
            center=self.center, subject='Matematika', text=text,
            options=['3', '4', '5'], correct_answer=1, score=5,
        )

    def _make_attempt(self, olympiad):
        return TestAttempt.objects.create(user=self.student, olympiad=olympiad)

    def _make_olympiad(self, status_value, title='Olimpiada'):
        return Olympiad.objects.create(
            center=self.center, title=title, subject='Matematika',
            status=status_value,
        )

    def test_teacher_can_delete_unused_question(self):
        q = self._make_question()
        self.client.force_authenticate(user=self.teacher)
        url = reverse('questions-detail', args=[q.id])
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Question.objects.filter(pk=q.id).exists())

    def test_teacher_archives_question_with_code_submission(self):
        q = self._make_question()
        olympiad = self._make_olympiad(Olympiad.STATUS_DRAFT)
        attempt = self._make_attempt(olympiad)
        submission = CodeSubmission.objects.create(attempt=attempt, question=q)
        self.client.force_authenticate(user=self.teacher)
        url = reverse('questions-detail', args=[q.id])
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data.get('archived'))
        q.refresh_from_db()
        self.assertFalse(q.is_active)
        # Qator (va bog'liq CodeSubmission) o'chirilmagan.
        self.assertTrue(Question.objects.filter(pk=q.id).exists())
        self.assertTrue(CodeSubmission.objects.filter(pk=submission.id).exists())

    def test_teacher_archives_question_with_essay_grade(self):
        q = self._make_question()
        olympiad = self._make_olympiad(Olympiad.STATUS_DRAFT)
        attempt = self._make_attempt(olympiad)
        grade = EssayGrade.objects.create(attempt=attempt, question=q, score=3)
        self.client.force_authenticate(user=self.teacher)
        url = reverse('questions-detail', args=[q.id])
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data.get('archived'))
        q.refresh_from_db()
        self.assertFalse(q.is_active)
        self.assertTrue(Question.objects.filter(pk=q.id).exists())
        self.assertTrue(EssayGrade.objects.filter(pk=grade.id).exists())

    def test_teacher_archives_question_in_active_olympiad(self):
        q = self._make_question()
        olympiad = self._make_olympiad(Olympiad.STATUS_ACTIVE)
        olympiad.questions.add(q)
        self.client.force_authenticate(user=self.teacher)
        url = reverse('questions-detail', args=[q.id])
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data.get('archived'))
        q.refresh_from_db()
        self.assertFalse(q.is_active)
        self.assertTrue(Question.objects.filter(pk=q.id).exists())
        # Arxivlangan savol hamon olimpiada M2M tarkibida (scoring uchun).
        self.assertTrue(olympiad.questions.filter(pk=q.id).exists())

    def test_teacher_archives_question_in_finished_olympiad(self):
        q = self._make_question()
        olympiad = self._make_olympiad(Olympiad.STATUS_FINISHED)
        olympiad.questions.add(q)
        self.client.force_authenticate(user=self.teacher)
        url = reverse('questions-detail', args=[q.id])
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data.get('archived'))
        q.refresh_from_db()
        self.assertFalse(q.is_active)
        self.assertTrue(Question.objects.filter(pk=q.id).exists())

    def test_archived_question_hidden_from_bank_list(self):
        """Arxivlangan savol savol banki GET ro'yxatida ko'rinmaydi."""
        active_q = self._make_question('faol')
        archived_q = self._make_question('arxiv')
        olympiad = self._make_olympiad(Olympiad.STATUS_ACTIVE)
        olympiad.questions.add(archived_q)
        self.client.force_authenticate(user=self.teacher)
        # Arxivlaymiz.
        self.client.delete(reverse('questions-detail', args=[archived_q.id]))
        # Ro'yxatni olamiz.
        resp = self.client.get(reverse('questions-list-create') + f'?center={self.center.id}')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get('results', resp.data)
        ids = {item['id'] for item in results}
        self.assertIn(active_q.id, ids)
        self.assertNotIn(archived_q.id, ids)

    def test_question_in_draft_olympiad_still_deletable(self):
        """Draft/nofaol olimpiadaga biriktirilgan savol hali o'chirilishi mumkin."""
        q = self._make_question()
        olympiad = self._make_olympiad(Olympiad.STATUS_DRAFT)
        olympiad.questions.add(q)
        self.client.force_authenticate(user=self.teacher)
        url = reverse('questions-detail', args=[q.id])
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Question.objects.filter(pk=q.id).exists())

    def test_teacher_cannot_bulk_delete_all(self):
        """Ommaviy o'chirish teacher uchun taqiqlangan (faqat manager/owner)."""
        self._make_question('q1')
        self.client.force_authenticate(user=self.teacher)
        url = reverse('questions-delete-all') + f'?center={self.center.id}'
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(Question.objects.filter(center=self.center).count(), 1)

    def test_manager_bulk_delete_archives_protected(self):
        """Manager delete-all himoyalanmaganni o'chiradi, himoyalanganni arxivlaydi."""
        free_q = self._make_question('free')
        used_q = self._make_question('used')
        active = self._make_olympiad(Olympiad.STATUS_ACTIVE)
        active.questions.add(used_q)

        self.client.force_authenticate(user=self.manager)
        url = reverse('questions-delete-all') + f'?center={self.center.id}'
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get('deleted_count'), 1)
        self.assertEqual(response.data.get('archived_count'), 1)
        self.assertFalse(Question.objects.filter(pk=free_q.id).exists())
        used_q.refresh_from_db()
        self.assertFalse(used_q.is_active)
        self.assertTrue(Question.objects.filter(pk=used_q.id).exists())

    def test_archiving_does_not_change_graded_essay_score(self):
        """ASOSIY KAFOLAT: essay savolni arxivlash baholangan attempt ballini
        o'zgartirmaydi — scoring yo'li (ordered_questions/score_session_answers)
        is_active bayrog'ini filtrlamaydi.
        """
        from attempts.models import TestSession
        from attempts.session_utils import ordered_questions, score_session_answers

        # Essay savol + faol olimpiada + attempt + baholangan essay.
        essay_q = Question.objects.create(
            center=self.center, subject='Matematika', text='Insho yozing',
            options=[], correct_answer=0, score=10,
            question_type=Question.QUESTION_TYPE_ESSAY,
        )
        olympiad = self._make_olympiad(Olympiad.STATUS_ACTIVE)
        olympiad.questions.add(essay_q)
        attempt = self._make_attempt(olympiad)
        attempt.answers = {str(essay_q.id): {'text': 'javob matni'}}
        attempt.save(update_fields=['answers'])
        session = TestSession.objects.create(
            user=self.student, olympiad=olympiad,
            question_order=[essay_q.id],
        )
        EssayGrade.objects.create(
            attempt=attempt, question=essay_q, score=7, graded_by=self.manager,
        )

        # Arxivlashdan OLDINGI ball.
        before = score_session_answers(
            session, olympiad, attempt.answers or {}, attempt=attempt,
        )['score']

        # Savolni arxivlaymiz (himoyalangan — faol olimpiadada + essay bahosi bor).
        self.client.force_authenticate(user=self.teacher)
        resp = self.client.delete(reverse('questions-detail', args=[essay_q.id]))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        essay_q.refresh_from_db()
        self.assertFalse(essay_q.is_active)

        # Scoring yo'li arxivlangan savolni hamon ko'radi.
        self.assertIn(
            essay_q.id,
            [q.id for q in ordered_questions(session, olympiad)],
        )
        # Va qayta hisoblangan ball o'zgarmagan.
        after = score_session_answers(
            session, olympiad, attempt.answers or {}, attempt=attempt,
        )['score']
        self.assertEqual(before, after)
        self.assertEqual(after, 70)  # 7/10 ball (yagona baholangan savol) → 70%


class ExplainQuestionPermissionTestCase(APITestCase):
    """AI tushuntirish (questions-explain) ruxsat tizimi.

    - Markazning tasdiqlangan o'qituvchisi ola oladi.
    - Savolni o'z ichiga olgan olimpiadani topshirgan o'quvchi ham ola oladi
      (mistakes review). Regressiya: ilgari o'quvchi 403 olardi.
    - Boshqa (topshirmagan) o'quvchi ola olmaydi — 403.
    """

    def setUp(self):
        self.center = EducationCenter.objects.create(
            name='Explain Academy', city='Toshkent',
            status=EducationCenter.STATUS_APPROVED,
        )
        self.teacher = User.objects.create_user(
            phone='+998901440001', password='StrongPass123', full_name="O'qituvchi",
        )
        CenterMembership.objects.create(
            user=self.teacher, center=self.center,
            role=CenterMembership.ROLE_TEACHER,
            status=CenterMembership.STATUS_APPROVED,
        )
        self.student = User.objects.create_user(
            phone='+998901440002', password='StrongPass123', full_name='Talaba',
        )
        self.other_student = User.objects.create_user(
            phone='+998901440003', password='StrongPass123', full_name='Boshqa',
        )
        self.question = Question.objects.create(
            center=self.center, subject='Matematika', text='2 + 2 = ?',
            options=['3', '4', '5', '6'], correct_answer=1, score=5,
        )
        self.olympiad = Olympiad.objects.create(
            center=self.center, title='Olimpiada', subject='Matematika',
            status=Olympiad.STATUS_FINISHED,
        )
        self.olympiad.questions.add(self.question)
        # Faqat `student` shu olimpiadani topshirgan.
        TestAttempt.objects.create(user=self.student, olympiad=self.olympiad)

    def _explain(self, user):
        """Tushuntirish task'ini boshlaydi va (agar boshlangan bo'lsa) natijani oladi.

        Gemini chaqiruvi endi Celery task'da: view 202 + task_id qaytaradi,
        natija esa status endpointidan olinadi (test muhitida EAGER — task
        `delay()` ichida sinxron bajariladi).
        """
        self.client.force_authenticate(user=user)
        resp = self.client.post(reverse('questions-explain', args=[self.question.id]))
        if resp.status_code != status.HTTP_202_ACCEPTED:
            return resp
        return self.client.get(
            reverse('questions-explain-status', args=[resp.data['task_id']]),
        )

    @patch('questions.ai_generation.explain_question_ai', return_value='Tushuntirish matni')
    def test_student_who_attempted_can_explain(self, _mock):
        resp = self._explain(self.student)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data.get('status'), 'COMPLETED')
        self.assertEqual(resp.data.get('explanation'), 'Tushuntirish matni')
        # Generatsiya qilingan tushuntirish savolga saqlanadi (keyingi so'rov
        # AI'ga umuman bormaydi va darhol 200 qaytadi).
        self.question.refresh_from_db()
        self.assertEqual(self.question.explanation, 'Tushuntirish matni')

    @patch('questions.ai_generation.explain_question_ai', return_value='Tushuntirish matni')
    def test_saved_explanation_returned_without_task(self, mock_ai):
        self.question.explanation = 'Oldindan saqlangan'
        self.question.save(update_fields=['explanation'])
        self.client.force_authenticate(user=self.student)
        resp = self.client.post(reverse('questions-explain', args=[self.question.id]))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data.get('explanation'), 'Oldindan saqlangan')
        mock_ai.assert_not_called()

    @patch('questions.ai_generation.explain_question_ai', return_value='Tushuntirish matni')
    def test_teacher_can_explain(self, _mock):
        resp = self._explain(self.teacher)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data.get('status'), 'COMPLETED')

    @patch('questions.ai_generation.explain_question_ai', return_value='Tushuntirish matni')
    def test_unrelated_student_forbidden(self, _mock):
        resp = self._explain(self.other_student)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    @patch('questions.ai_generation.explain_question_ai', return_value='Tushuntirish matni')
    def test_other_user_cannot_read_task_result(self, _mock):
        """task_id topilsa ham begona foydalanuvchi natijani o'qiy olmaydi."""
        self.client.force_authenticate(user=self.student)
        start = self.client.post(reverse('questions-explain', args=[self.question.id]))
        self.assertEqual(start.status_code, status.HTTP_202_ACCEPTED)
        self.client.force_authenticate(user=self.other_student)
        resp = self.client.get(
            reverse('questions-explain-status', args=[start.data['task_id']]),
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


class CodeReviewAsyncTestCase(APITestCase):
    """POST /api/questions/code-review/ — AI kod baholash asinxron oqimi.

    Gemini chaqiruvi (eng yomon holatda daqiqalab davom etadi) so'rov ichida
    emas, Celery task'da bajariladi: view 202 + task_id qaytaradi, natija
    `code-review/<task_id>/status/` orqali olinadi. Bu endpoint olimpiada
    vaqtida chaqirilgani uchun gunicorn thread'ini bloklamasligi shart.
    """

    def setUp(self):
        self.center = EducationCenter.objects.create(
            name='Code Review Academy', city='Toshkent',
            status=EducationCenter.STATUS_APPROVED,
        )
        self.student = User.objects.create_user(
            phone='+998901450001', password='StrongPass123', full_name='Talaba',
        )
        self.other_student = User.objects.create_user(
            phone='+998901450002', password='StrongPass123', full_name='Boshqa',
        )
        self.code_question = Question.objects.create(
            center=self.center, subject='Informatika',
            text='Ikki sonni qo\'shing', question_type=Question.QUESTION_TYPE_CODE,
            programming_language='python', expected_output='7', score=10,
        )
        self.client.force_authenticate(user=self.student)

    @patch(
        'questions.ai_generation.review_code_submission',
        return_value={'score': 82, 'review': 'Yaxshi kod'},
    )
    def test_code_review_returns_task_then_result(self, mock_review):
        resp = self.client.post(reverse('questions-code-review'), {
            'question_id': self.code_question.id,
            'submitted_code': 'print(3+4)',
            'language': 'python',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_202_ACCEPTED)
        task_id = resp.data.get('task_id')
        self.assertTrue(task_id)

        status_resp = self.client.get(
            reverse('questions-code-review-status', args=[task_id]),
        )
        self.assertEqual(status_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(status_resp.data.get('status'), 'COMPLETED')
        self.assertEqual(status_resp.data.get('score'), 82)
        self.assertEqual(status_resp.data.get('review'), 'Yaxshi kod')
        mock_review.assert_called_once()

    @patch('questions.tasks.code_review_task.delay')
    def test_empty_code_rejected_without_task(self, mock_delay):
        resp = self.client.post(reverse('questions-code-review'), {
            'question_id': self.code_question.id,
            'submitted_code': '   ',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        mock_delay.assert_not_called()

    @patch('questions.tasks.code_review_task.delay')
    def test_non_code_question_rejected_without_task(self, mock_delay):
        mcq = Question.objects.create(
            center=self.center, subject='Matematika', text='2 + 2 = ?',
            options=['3', '4'], correct_answer=1, score=5,
        )
        resp = self.client.post(reverse('questions-code-review'), {
            'question_id': mcq.id,
            'submitted_code': 'print(1)',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        mock_delay.assert_not_called()

    def test_status_unknown_task(self):
        resp = self.client.get(
            reverse('questions-code-review-status', args=['no-such-task']),
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(resp.data.get('status'), 'FAILED')

    @patch(
        'questions.ai_generation.review_code_submission',
        return_value={'score': 82, 'review': 'Yaxshi kod'},
    )
    def test_other_user_cannot_read_task_result(self, _mock):
        start = self.client.post(reverse('questions-code-review'), {
            'question_id': self.code_question.id,
            'submitted_code': 'print(3+4)',
        }, format='json')
        self.assertEqual(start.status_code, status.HTTP_202_ACCEPTED)
        self.client.force_authenticate(user=self.other_student)
        resp = self.client.get(
            reverse('questions-code-review-status', args=[start.data['task_id']]),
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

