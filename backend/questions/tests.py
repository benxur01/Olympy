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

    @patch('questions.views.explain_question_ai', return_value='Tushuntirish matni')
    def test_student_who_attempted_can_explain(self, _mock):
        self.client.force_authenticate(user=self.student)
        resp = self.client.post(reverse('questions-explain', args=[self.question.id]))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data.get('explanation'), 'Tushuntirish matni')

    @patch('questions.views.explain_question_ai', return_value='Tushuntirish matni')
    def test_teacher_can_explain(self, _mock):
        self.client.force_authenticate(user=self.teacher)
        resp = self.client.post(reverse('questions-explain', args=[self.question.id]))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    @patch('questions.views.explain_question_ai', return_value='Tushuntirish matni')
    def test_unrelated_student_forbidden(self, _mock):
        self.client.force_authenticate(user=self.other_student)
        resp = self.client.post(reverse('questions-explain', args=[self.question.id]))
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

