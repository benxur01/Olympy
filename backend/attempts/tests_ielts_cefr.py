"""IELTS / CEFR imtihon tizimi testlari.

Qamrov:
  * `calculate_ielts_band` va `calculate_cefr_level` chegara qiymatlari
  * bo'lim bandlari o'rtachasini yaxlitlash (banker's rounding regressiyasi)
  * `score_session_answers` — `section_scores` faqat savol bor bo'limlar uchun
  * insho kech baholanganda band/CEFR/bo'lim ballari DB'da yangilanishi
  * IELTS/CEFR savolida `section` majburiyligi va audio fayl validatsiyasi
  * Speaking javob yuklash va Listening ijro hisobi endpointlari
"""
import os
import shutil
import tempfile
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from billing.models import SubscriptionPlan, UserSubscription
from centers.models import CenterMembership, EducationCenter
from olympiads.models import Olympiad
from questions.models import Question
from questions.serializers import QuestionSerializer

from .models import EssayAIFeedback, SpeakingAnswer, TestAttempt, TestSession
from .tasks import generate_essay_ai_feedback_task
from .session_utils import (
    calculate_cefr_level,
    calculate_ielts_band,
    score_session_answers,
)

User = get_user_model()


def make_center(name='IELTS Center'):
    return EducationCenter.objects.create(name=name, city='Toshkent')


def make_student(phone='+998901110001', full_name="O'quvchi"):
    return User.objects.create_user(
        phone=phone, password='StrongPass123', full_name=full_name,
    )


def make_olympiad(center, subject='IELTS Mock',
                  exam_format=Olympiad.EXAM_FORMAT_IELTS, duration_minutes=60):
    return Olympiad.objects.create(
        center=center,
        title=f'{subject} test',
        subject=subject,
        exam_format=exam_format,
        status=Olympiad.STATUS_ACTIVE,
        event_type=Olympiad.EVENT_TYPE_OLYMPIAD,
        start_datetime=timezone.now() - timedelta(minutes=5),
        duration_minutes=duration_minutes,
    )


def add_mcq_questions(olympiad, section, count, score=1):
    """Olimpiadaga `count` ta MCQ savol qo'shadi (to'g'ri javob — 0-indeks)."""
    questions = []
    for i in range(count):
        questions.append(Question.objects.create(
            center=olympiad.center,
            subject=olympiad.subject,
            text=f'{section} savol {i}',
            options=['A', 'B', 'C', 'D'],
            correct_answer=0,
            score=score,
            section=section,
        ))
    olympiad.questions.add(*questions)
    return questions


def answers_for(questions, correct_count):
    """Birinchi `correct_count` ta savolga to'g'ri (0), qolganiga xato (1) javob."""
    return {
        str(q.id): (0 if i < correct_count else 1)
        for i, q in enumerate(questions)
    }


class IeltsBandTableTests(TestCase):
    """Xom ball → band jadvalining chegara qiymatlari (40 talik shkala)."""

    def test_band_boundaries(self):
        cases = [
            (40, 9.0), (39, 9.0), (38, 8.5), (37, 8.5), (36, 8.0), (35, 8.0),
            (34, 7.5), (33, 7.5), (32, 7.0), (30, 7.0), (29, 6.5), (27, 6.5),
            (26, 6.0), (23, 6.0), (22, 5.5), (20, 5.5), (19, 5.0), (16, 5.0),
            (15, 4.5), (13, 4.5), (12, 4.0), (10, 4.0), (9, 3.5), (7, 3.5),
            (6, 3.0), (5, 3.0), (4, 2.5), (3, 2.5), (2, 2.0), (1, 2.0),
            (0, 1.0),
        ]
        for raw, expected in cases:
            with self.subTest(raw=raw):
                self.assertEqual(calculate_ielts_band(raw, 40), expected)

    def test_band_scales_to_forty(self):
        """Savollar soni 40 dan farq qilsa ham 40 talik shkalaga keltiriladi."""
        # 20 ta savoldan 14 tasi = 28 xom ball → 6.5
        self.assertEqual(calculate_ielts_band(14, 20), 6.5)
        # 10 ta savoldan 8 tasi = 32 xom ball → 7.0
        self.assertEqual(calculate_ielts_band(8, 10), 7.0)

    def test_zero_total_is_lowest_band(self):
        self.assertEqual(calculate_ielts_band(0, 0), 1.0)
        self.assertEqual(calculate_ielts_band(5, None), 1.0)


class CefrLevelTableTests(TestCase):
    """Foiz → CEFR daraja chegaralari."""

    def test_level_boundaries(self):
        cases = [
            (100, 'C1'), (86, 'C1'), (85, 'B2'), (71, 'B2'), (70, 'B1'),
            (56, 'B1'), (55, 'A2'), (46, 'A2'), (45, 'A1'), (30, 'A1'),
            (29, 'No Certificate'), (0, 'No Certificate'),
        ]
        for pct, expected in cases:
            with self.subTest(pct=pct):
                self.assertEqual(calculate_cefr_level(pct), expected)

    def test_fractional_percentage_is_rounded(self):
        self.assertEqual(calculate_cefr_level(85.6), 'C1')
        self.assertEqual(calculate_cefr_level(85.4), 'B2')


class IeltsBandRoundingTests(TestCase):
    """Bo'lim bandlari o'rtachasi .25/.75 ga tushganda yuqoriga yaxlitlanishi.

    Bu — `round(avg_band * 2) / 2` regressiyasi: Python `round()` banker's
    rounding qiladi va yarim qiymatni JUFT songa yaxlitlaydi, ya'ni 6.25 → 6.0
    (kerak 6.5), 7.25 → 7.0 (kerak 7.5). Test aynan shu kombinatsiyalarni
    tekshiradi — `math.floor(x + 0.5)` o'rniga `round()` qaytarilsa YIQILADI.
    """

    def setUp(self):
        self.center = make_center()
        self.student = make_student()
        self.olympiad = make_olympiad(self.center)
        self.listening = add_mcq_questions(
            self.olympiad, Question.SECTION_LISTENING, 20,
        )
        self.reading = add_mcq_questions(
            self.olympiad, Question.SECTION_READING, 20,
        )
        self.session = TestSession.objects.create(
            user=self.student, olympiad=self.olympiad,
        )

    def _score(self, listening_correct, reading_correct):
        answers = {}
        answers.update(answers_for(self.listening, listening_correct))
        answers.update(answers_for(self.reading, reading_correct))
        return score_session_answers(self.session, self.olympiad, answers)

    def test_avg_6_25_rounds_up_to_6_5(self):
        # listening 14/20 → 6.5, reading 12/20 → 6.0 → o'rtacha 6.25
        scored = self._score(14, 12)
        self.assertEqual(
            scored['section_scores'], {'listening': 6.5, 'reading': 6.0},
        )
        self.assertEqual(scored['ielts_band'], 6.5)
        self.assertEqual(scored['cefr_level'], 'B2')

    def test_avg_7_25_rounds_up_to_7_5(self):
        # listening 17/20 → 7.5, reading 15/20 → 7.0 → o'rtacha 7.25
        scored = self._score(17, 15)
        self.assertEqual(
            scored['section_scores'], {'listening': 7.5, 'reading': 7.0},
        )
        self.assertEqual(scored['ielts_band'], 7.5)
        self.assertEqual(scored['cefr_level'], 'C1')

    def test_avg_6_75_rounds_up_to_7_0(self):
        # listening 15/20 → 7.0, reading 14/20 → 6.5 → o'rtacha 6.75
        scored = self._score(15, 14)
        self.assertEqual(scored['ielts_band'], 7.0)

    def test_exact_half_band_is_not_changed(self):
        # Ikkala bo'lim ham 6.5 → o'rtacha aniq 6.5, yaxlitlash o'zgartirmaydi
        scored = self._score(14, 14)
        self.assertEqual(scored['ielts_band'], 6.5)


class IeltsSectionScoresTests(TestCase):
    """`section_scores` faqat savol MAVJUD bo'lgan bo'limlarni o'z ichiga oladi."""

    def setUp(self):
        self.center = make_center()
        self.student = make_student()
        self.olympiad = make_olympiad(self.center)
        self.listening = add_mcq_questions(
            self.olympiad, Question.SECTION_LISTENING, 10,
        )
        self.reading = add_mcq_questions(
            self.olympiad, Question.SECTION_READING, 10,
        )
        self.session = TestSession.objects.create(
            user=self.student, olympiad=self.olympiad,
        )

    def test_only_present_sections_are_reported(self):
        answers = {}
        answers.update(answers_for(self.listening, 8))
        answers.update(answers_for(self.reading, 6))
        scored = score_session_answers(self.session, self.olympiad, answers)

        self.assertEqual(set(scored['section_scores']), {'listening', 'reading'})
        # 8/10 → 32 xom ball → 7.0; 6/10 → 24 xom ball → 6.0
        self.assertEqual(scored['section_scores']['listening'], 7.0)
        self.assertEqual(scored['section_scores']['reading'], 6.0)
        self.assertEqual(scored['ielts_band'], 6.5)

    def test_section_scores_ignores_unset_section_questions(self):
        """Bo'limsiz savol (section='') hech qaysi bo'lim ballini o'zgartirmaydi."""
        extra = add_mcq_questions(self.olympiad, Question.SECTION_UNSET, 4)
        answers = {}
        answers.update(answers_for(self.listening, 8))
        answers.update(answers_for(self.reading, 6))
        answers.update(answers_for(extra, 0))
        scored = score_session_answers(self.session, self.olympiad, answers)

        self.assertEqual(set(scored['section_scores']), {'listening', 'reading'})
        # Bo'limsiz savollar umumiy `total` ga baribir kiradi
        self.assertEqual(scored['total'], 24)

    def test_cefr_format_reports_section_percentages(self):
        cefr = make_olympiad(
            self.center, subject='CEFR Mock',
            exam_format=Olympiad.EXAM_FORMAT_CEFR,
        )
        listening = add_mcq_questions(cefr, Question.SECTION_LISTENING, 10)
        session = TestSession.objects.create(user=self.student, olympiad=cefr)
        scored = score_session_answers(session, cefr, answers_for(listening, 9))

        # CEFR formatida bo'lim ballari — band emas, FOIZ
        self.assertEqual(scored['section_scores'], {'listening': 90})
        self.assertEqual(scored['cefr_level'], 'C1')

    def test_standard_format_has_no_band(self):
        standard = make_olympiad(
            self.center, subject='Matematika',
            exam_format=Olympiad.EXAM_FORMAT_STANDARD,
        )
        questions = add_mcq_questions(standard, Question.SECTION_UNSET, 10)
        session = TestSession.objects.create(user=self.student, olympiad=standard)
        scored = score_session_answers(session, standard, answers_for(questions, 7))

        self.assertIsNone(scored['ielts_band'])
        self.assertEqual(scored['section_scores'], {})
        # Standart rejimda CEFR daraja informatsion tarzda baribir beriladi
        self.assertEqual(scored['cefr_level'], calculate_cefr_level(scored['score']))


class EssayGradeRescoreTests(APITestCase):
    """Insho kech baholanganda band/CEFR/bo'lim ballari DB'da yangilanishi.

    Writing/Speaking insholari submit paytida baholanmagan bo'ladi — ular
    menejer ball qo'ygandan keyingina hisobga kiradi. Avval faqat `score`
    yangilanib, `ielts_band` submit paytidagi (inshosiz) qiymatda qolib
    ketardi.
    """

    def setUp(self):
        self.center = make_center()
        self.student = make_student()
        self.manager = make_student(phone='+998901110002', full_name='Menejer')
        CenterMembership.objects.create(
            user=self.manager,
            center=self.center,
            role=CenterMembership.ROLE_MANAGER,
            status=CenterMembership.STATUS_APPROVED,
        )
        self.olympiad = make_olympiad(self.center)
        self.listening = add_mcq_questions(
            self.olympiad, Question.SECTION_LISTENING, 20,
        )
        self.essay = Question.objects.create(
            center=self.center,
            subject=self.olympiad.subject,
            text='Writing Task 2',
            options=[],
            correct_answer=0,
            score=10,
            question_type=Question.QUESTION_TYPE_ESSAY,
            section=Question.SECTION_WRITING,
        )
        self.olympiad.questions.add(self.essay)
        TestSession.objects.create(user=self.student, olympiad=self.olympiad)

    def _submit(self):
        self.client.force_authenticate(user=self.student)
        answers = answers_for(self.listening, 12)
        answers[str(self.essay.id)] = 'Mening inshoyim.'
        response = self.client.post(
            reverse('submit-attempt'),
            {'olympiad': self.olympiad.id, 'answers': answers, 'time_spent': 300},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        return TestAttempt.objects.get(user=self.student, olympiad=self.olympiad)

    def test_grading_essay_updates_band_and_section_scores(self):
        attempt = self._submit()
        # Submit paytida faqat listening hisobga kiradi: 12/20 → 24 xom ball → 6.0
        self.assertEqual(float(attempt.ielts_band), 6.0)
        self.assertEqual(attempt.cefr_level, 'B2')
        self.assertEqual(attempt.section_scores, {'listening': 6.0})

        self.client.force_authenticate(user=self.manager)
        response = self.client.post(
            reverse('grade-essay-answer', args=[attempt.id, self.essay.id]),
            {'score': 10, 'feedback': 'Zo\'r'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        attempt.refresh_from_db()
        # Writing to'liq ball → 9.0; o'rtacha (6.0 + 9.0) / 2 = 7.5
        self.assertEqual(attempt.section_scores, {'listening': 6.0, 'writing': 9.0})
        self.assertEqual(float(attempt.ielts_band), 7.5)
        self.assertEqual(attempt.cefr_level, 'C1')

    def test_standard_olympiad_grading_keeps_band_empty(self):
        """Oddiy olimpiadada qayta hisoblash band'ni to'ldirib yubormaydi."""
        standard = make_olympiad(
            self.center, subject='Matematika',
            exam_format=Olympiad.EXAM_FORMAT_STANDARD,
        )
        questions = add_mcq_questions(standard, Question.SECTION_UNSET, 4)
        essay = Question.objects.create(
            center=self.center,
            subject='Matematika',
            text='Fikringizni yozing',
            options=[],
            correct_answer=0,
            score=10,
            question_type=Question.QUESTION_TYPE_ESSAY,
        )
        standard.questions.add(essay)
        TestSession.objects.create(user=self.student, olympiad=standard)

        self.client.force_authenticate(user=self.student)
        answers = answers_for(questions, 3)
        answers[str(essay.id)] = 'Javob matni'
        response = self.client.post(
            reverse('submit-attempt'),
            {'olympiad': standard.id, 'answers': answers, 'time_spent': 120},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        attempt = TestAttempt.objects.get(user=self.student, olympiad=standard)

        self.client.force_authenticate(user=self.manager)
        response = self.client.post(
            reverse('grade-essay-answer', args=[attempt.id, essay.id]),
            {'score': 10},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        attempt.refresh_from_db()
        self.assertIsNone(attempt.ielts_band)
        self.assertEqual(attempt.section_scores, {})
        # CEFR daraja standart olimpiadada informatsion qiymat sifatida qoladi
        self.assertEqual(attempt.cefr_level, calculate_cefr_level(attempt.score))

    def test_speaking_answers_are_flagged_as_audio(self):
        attempt = self._submit()
        speaking = Question.objects.create(
            center=self.center,
            subject=self.olympiad.subject,
            text='Speaking Part 1',
            options=[],
            correct_answer=0,
            score=10,
            question_type=Question.QUESTION_TYPE_ESSAY,
            section=Question.SECTION_SPEAKING,
        )
        self.olympiad.questions.add(speaking)

        self.client.force_authenticate(user=self.manager)
        response = self.client.get(
            reverse('attempt-essay-answers', args=[attempt.id]),
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        flags = {row['question_id']: row['is_audio_answer'] for row in response.data}
        self.assertTrue(flags[speaking.id])
        self.assertFalse(flags[self.essay.id])


class QuestionSectionValidationTests(TestCase):
    """IELTS/CEFR savolida `section` majburiy, boshqa fanlarda ixtiyoriy."""

    def setUp(self):
        self.center = make_center()

    def _payload(self, **overrides):
        data = {
            'center': self.center.id,
            'subject': 'IELTS Mock',
            'text': 'Savol matni',
            'options': ['A', 'B', 'C', 'D'],
            'correct_answer': 0,
            'score': 5,
        }
        data.update(overrides)
        return data

    def test_section_required_for_ielts_and_cefr_subjects(self):
        # 'Ielts mock' / 'Cefr mock' — `Question.save()` normalizatsiyasidan
        # keyingi (bazada yotadigan) shakl, shuning uchun ular ham qamraladi.
        for subject in ('IELTS Mock', 'IELTS', 'CEFR Mock', 'CEFR',
                        'Ielts mock', 'Cefr mock', 'ielts'):
            with self.subTest(subject=subject):
                serializer = QuestionSerializer(data=self._payload(subject=subject))
                self.assertFalse(serializer.is_valid())
                self.assertIn('section', serializer.errors)

    def test_blank_section_rejected_for_ielts(self):
        serializer = QuestionSerializer(data=self._payload(section=''))
        self.assertFalse(serializer.is_valid())
        self.assertIn('section', serializer.errors)

    def test_section_accepted_for_ielts(self):
        serializer = QuestionSerializer(
            data=self._payload(section=Question.SECTION_LISTENING),
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_section_optional_for_other_subjects(self):
        serializer = QuestionSerializer(data=self._payload(subject='Matematika'))
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_section_required_for_essay_type_too(self):
        """Tekshiruv savol turidan qat'i nazar ishlaydi (essay ham)."""
        serializer = QuestionSerializer(data=self._payload(
            question_type=Question.QUESTION_TYPE_ESSAY, options=[],
        ))
        self.assertFalse(serializer.is_valid())
        self.assertIn('section', serializer.errors)

    def test_patch_uses_instance_subject_and_section(self):
        question = Question.objects.create(
            center=self.center,
            subject='IELTS Mock',
            text='Savol',
            options=['A', 'B'],
            correct_answer=0,
            score=5,
            section=Question.SECTION_READING,
        )
        # Bo'limga tegmaydigan PATCH — instance qiymati bilan o'tadi
        serializer = QuestionSerializer(
            question, data={'text': 'Yangilangan savol'}, partial=True,
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)

        # Bo'limni bo'shatishga urinish — rad etiladi
        serializer = QuestionSerializer(question, data={'section': ''}, partial=True)
        self.assertFalse(serializer.is_valid())
        self.assertIn('section', serializer.errors)


class QuestionAudioValidationTests(TestCase):
    """`Question.audio` uchun MIME turi va hajm cheklovi."""

    def setUp(self):
        self.center = make_center()

    def _payload(self, audio):
        return {
            'center': self.center.id,
            'subject': 'IELTS Mock',
            'section': Question.SECTION_LISTENING,
            'text': 'Listening savol',
            'options': ['A', 'B', 'C', 'D'],
            'correct_answer': 0,
            'score': 5,
            'audio': audio,
        }

    def test_audio_accepted(self):
        audio = SimpleUploadedFile('a.mp3', b'fake-audio', content_type='audio/mpeg')
        serializer = QuestionSerializer(data=self._payload(audio))
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_non_audio_content_type_rejected(self):
        upload = SimpleUploadedFile(
            'a.html', b'<script>alert(1)</script>', content_type='text/html',
        )
        serializer = QuestionSerializer(data=self._payload(upload))
        self.assertFalse(serializer.is_valid())
        self.assertIn('audio', serializer.errors)

    @override_settings(QUESTION_AUDIO_MAX_BYTES=10)
    def test_oversized_audio_rejected(self):
        upload = SimpleUploadedFile(
            'a.mp3', b'x' * 64, content_type='audio/mpeg',
        )
        serializer = QuestionSerializer(data=self._payload(upload))
        self.assertFalse(serializer.is_valid())
        self.assertIn('audio', serializer.errors)


class SpeakingAnswerUploadTests(APITestCase):
    """POST /api/attempts/speaking-answer/ — Speaking javob audiosini yuklash."""

    def setUp(self):
        # Ovoz yozuvlari YOPIQ storage'ga (`EVIDENCE_MEDIA_ROOT`) tushadi;
        # `MEDIA_ROOT` ham vaqtinchalik katalogga o'tkaziladi — testlar u yerga
        # HECH NARSA tushmasligini ham tekshiradi.
        self.media_root = tempfile.mkdtemp(prefix='olympy-media-')
        self.private_root = tempfile.mkdtemp(prefix='olympy-speaking-')
        overridden = override_settings(
            MEDIA_ROOT=self.media_root, EVIDENCE_MEDIA_ROOT=self.private_root,
        )
        overridden.enable()
        self.addCleanup(overridden.disable)
        self.addCleanup(shutil.rmtree, self.media_root, True)
        self.addCleanup(shutil.rmtree, self.private_root, True)

        self.center = make_center()
        self.student = make_student()
        self.olympiad = make_olympiad(self.center)
        self.speaking = Question.objects.create(
            center=self.center,
            subject=self.olympiad.subject,
            text='Speaking Part 2',
            options=[],
            correct_answer=0,
            score=10,
            question_type=Question.QUESTION_TYPE_ESSAY,
            section=Question.SECTION_SPEAKING,
        )
        self.reading = add_mcq_questions(
            self.olympiad, Question.SECTION_READING, 1,
        )[0]
        self.olympiad.questions.add(self.speaking)
        self.session = TestSession.objects.create(
            user=self.student, olympiad=self.olympiad,
        )
        self.url = reverse('speaking-answer')
        self.client.force_authenticate(user=self.student)

    def _post(self, **overrides):
        payload = {
            'olympiad': self.olympiad.id,
            'question': self.speaking.id,
            'audio': SimpleUploadedFile(
                'answer.webm', b'fake-webm-audio', content_type='audio/webm',
            ),
        }
        payload.update(overrides)
        payload = {k: v for k, v in payload.items() if v is not None}
        return self.client.post(self.url, payload, format='multipart')

    def test_upload_success(self):
        response = self._post()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data, {
            'saved': True,
            'question': self.speaking.id,
            'answer_ref': f'speaking-answer:{self.speaking.id}',
        })
        # Javobda HECH QANDAY ochiq havola bo'lmasligi kerak
        self.assertNotIn('url', response.data)

        answer = SpeakingAnswer.objects.get(
            user=self.student, olympiad=self.olympiad, question=self.speaking,
        )
        self.assertEqual(answer.content_type, 'audio/webm')
        # Fayl YOPIQ katalogda, ochiq media makonida emas
        self.assertTrue(os.path.exists(
            os.path.join(self.private_root, answer.audio.name),
        ))
        self.assertFalse(os.path.exists(
            os.path.join(self.media_root, answer.audio.name),
        ))
        self.assertEqual(os.listdir(self.media_root), [])
        # Yopiq storage URL bermaydi — `.url` xato ko'taradi (nginx `/media/`
        # bloki bu faylga hech qachon yeta olmaydi).
        with self.assertRaises(ValueError):
            answer.audio.url

    def test_reupload_replaces_previous_recording(self):
        self._post()
        first = SpeakingAnswer.objects.get(question=self.speaking)
        first_name = first.audio.name

        self._post(audio=SimpleUploadedFile(
            'answer2.webm', b'second-take-audio', content_type='audio/webm',
        ))
        self.assertEqual(SpeakingAnswer.objects.filter(question=self.speaking).count(), 1)
        second = SpeakingAnswer.objects.get(question=self.speaking)
        self.assertNotEqual(second.audio.name, first_name)
        # Eski fayl storage'da yetim qolmasligi kerak
        self.assertFalse(os.path.exists(os.path.join(self.private_root, first_name)))
        self.assertEqual(second.audio.read(), b'second-take-audio')

    def test_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self._post()
        self.assertIn(
            response.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

    def test_missing_audio_rejected(self):
        response = self._post(audio=None)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_non_audio_content_type_rejected(self):
        response = self._post(audio=SimpleUploadedFile(
            'answer.html', b'<html></html>', content_type='text/html',
        ))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @override_settings(SPEAKING_AUDIO_MAX_BYTES=8)
    def test_oversized_audio_rejected(self):
        response = self._post(audio=SimpleUploadedFile(
            'answer.webm', b'x' * 64, content_type='audio/webm',
        ))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_non_speaking_question_rejected(self):
        response = self._post(question=self.reading.id)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_question_from_other_olympiad_rejected(self):
        other = make_olympiad(self.center, subject='IELTS')
        foreign = Question.objects.create(
            center=self.center,
            subject='IELTS',
            text='Boshqa olimpiada savoli',
            options=[],
            correct_answer=0,
            score=10,
            question_type=Question.QUESTION_TYPE_ESSAY,
            section=Question.SECTION_SPEAKING,
        )
        other.questions.add(foreign)
        response = self._post(question=foreign.id)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_without_session_rejected(self):
        self.session.delete()
        response = self._post()
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_expired_session_rejected(self):
        TestSession.objects.filter(pk=self.session.pk).update(
            started_at=timezone.now() - timedelta(minutes=120),
        )
        response = self._post()
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_invalid_body_rejected(self):
        response = self.client.post(self.url, {'olympiad': 'x'}, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class SpeakingAnswerPlaybackTests(APITestCase):
    """GET /api/attempts/<attempt_id>/speaking-answer/<question_id>/

    Ovoz — shaxsiy ma'lumot: faqat javob egasi va o'sha olimpiadani baholay
    oladigan xodim tinglaydi. Begona o'quvchi uchun yopiq.
    """

    AUDIO_BYTES = b'fake-webm-audio-bytes'

    def setUp(self):
        self.media_root = tempfile.mkdtemp(prefix='olympy-media-')
        self.private_root = tempfile.mkdtemp(prefix='olympy-speaking-')
        overridden = override_settings(
            MEDIA_ROOT=self.media_root, EVIDENCE_MEDIA_ROOT=self.private_root,
        )
        overridden.enable()
        self.addCleanup(overridden.disable)
        self.addCleanup(shutil.rmtree, self.media_root, True)
        self.addCleanup(shutil.rmtree, self.private_root, True)

        self.center = make_center()
        self.student = make_student()
        self.stranger = make_student(phone='+998901110009', full_name='Begona')
        self.manager = make_student(phone='+998901110008', full_name='Menejer')
        CenterMembership.objects.create(
            user=self.manager,
            center=self.center,
            role=CenterMembership.ROLE_MANAGER,
            status=CenterMembership.STATUS_APPROVED,
        )
        self.olympiad = make_olympiad(self.center)
        self.speaking = Question.objects.create(
            center=self.center,
            subject=self.olympiad.subject,
            text='Speaking Part 2',
            options=[],
            correct_answer=0,
            score=10,
            question_type=Question.QUESTION_TYPE_ESSAY,
            section=Question.SECTION_SPEAKING,
        )
        self.writing = Question.objects.create(
            center=self.center,
            subject=self.olympiad.subject,
            text='Writing Task 2',
            options=[],
            correct_answer=0,
            score=10,
            question_type=Question.QUESTION_TYPE_ESSAY,
            section=Question.SECTION_WRITING,
        )
        self.olympiad.questions.add(self.speaking, self.writing)
        TestSession.objects.create(user=self.student, olympiad=self.olympiad)

        # Yozuvni yuklash oqimi orqali yaratamiz — saqlash yo'li ham test
        # ostida qolsin.
        self.client.force_authenticate(user=self.student)
        upload = self.client.post(reverse('speaking-answer'), {
            'olympiad': self.olympiad.id,
            'question': self.speaking.id,
            'audio': SimpleUploadedFile(
                'answer.webm', self.AUDIO_BYTES, content_type='audio/webm',
            ),
        }, format='multipart')
        self.assertEqual(upload.status_code, status.HTTP_201_CREATED)

        self.attempt = TestAttempt.objects.create(
            user=self.student,
            olympiad=self.olympiad,
            answers={str(self.speaking.id): f'speaking-answer:{self.speaking.id}'},
        )
        self.url = reverse(
            'attempt-speaking-answer', args=[self.attempt.id, self.speaking.id],
        )

    def _audio_bytes(self, response):
        return b''.join(response.streaming_content)

    def test_owner_can_listen(self):
        self.client.force_authenticate(user=self.student)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response['Content-Type'], 'audio/webm')
        self.assertEqual(self._audio_bytes(response), self.AUDIO_BYTES)
        # Shaxsiy ma'lumot keshlanmasin
        self.assertEqual(response['Cache-Control'], 'private, no-store, max-age=0')

    def test_grader_can_listen(self):
        self.client.force_authenticate(user=self.manager)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self._audio_bytes(response), self.AUDIO_BYTES)

    def test_stranger_student_cannot_listen(self):
        self.client.force_authenticate(user=self.stranger)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(self.url)
        self.assertIn(
            response.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

    def test_missing_attempt_returns_404(self):
        self.client.force_authenticate(user=self.student)
        response = self.client.get(
            reverse('attempt-speaking-answer', args=[self.attempt.id + 999, self.speaking.id]),
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_question_without_recording_returns_404(self):
        self.client.force_authenticate(user=self.student)
        response = self.client.get(
            reverse('attempt-speaking-answer', args=[self.attempt.id, self.writing.id]),
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_recording_of_another_student_is_not_reachable(self):
        """Begona attempt id bilan o'z yozuvini emas, EGASINIKINI so'rash."""
        other_olympiad_attempt = TestAttempt.objects.create(
            user=self.stranger, olympiad=self.olympiad, answers={},
        )
        self.client.force_authenticate(user=self.stranger)
        response = self.client.get(reverse(
            'attempt-speaking-answer',
            args=[other_olympiad_attempt.id, self.speaking.id],
        ))
        # O'z attempt'i — ruxsat bor, lekin o'zining yozuvi yo'q → 404
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_student_review_never_shows_internal_marker(self):
        """O'quvchining rasmiy natijalar sahifasida marker KO'RINMASLIGI shart.

        `answers` da speaking javobi "speaking-answer:<id>" ichki belgisi bo'lib
        yotadi; u `chosen_answer` ga tushsa o'quvchi "Sizning javobingiz:
        speaking-answer:57" degan bema'ni matnni ko'rardi.
        """
        self.client.force_authenticate(user=self.student)
        response = self.client.get(reverse('attempt-detail', args=[self.attempt.id]))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = {r['id']: r for r in response.data['questions_review']}

        speaking_row = rows[self.speaking.id]
        self.assertTrue(speaking_row['is_audio_answer'])
        self.assertIsNone(speaking_row['chosen_answer'])
        # Marker javobning HECH QAYSI maydonida qolmasligi kerak
        self.assertNotIn('speaking-answer:', str(speaking_row))
        # O'rniga — himoyalangan endpoint yo'li (ochiq media havolasi emas)
        self.assertEqual(speaking_row['audio_url'], self.url)
        self.assertNotIn('/media/', speaking_row['audio_url'])

    def test_review_keeps_text_answer_for_writing_essay(self):
        """Oddiy (matnli) insho javobi avvalgidek `chosen_answer` da qoladi."""
        self.attempt.answers = {
            str(self.speaking.id): f'speaking-answer:{self.speaking.id}',
            str(self.writing.id): {'text': 'Mening inshoyim.'},
        }
        self.attempt.save(update_fields=['answers'])

        self.client.force_authenticate(user=self.student)
        response = self.client.get(reverse('attempt-detail', args=[self.attempt.id]))
        rows = {r['id']: r for r in response.data['questions_review']}

        writing_row = rows[self.writing.id]
        self.assertFalse(writing_row['is_audio_answer'])
        self.assertEqual(writing_row['chosen_answer'], 'Mening inshoyim.')
        self.assertEqual(writing_row['audio_url'], '')

    def test_review_audio_url_empty_when_recording_missing(self):
        """Yozuv yo'q bo'lsa `audio_url` bo'sh — frontend pleyer ko'rsatmaydi."""
        SpeakingAnswer.objects.all().delete()

        self.client.force_authenticate(user=self.student)
        response = self.client.get(reverse('attempt-detail', args=[self.attempt.id]))
        rows = {r['id']: r for r in response.data['questions_review']}

        speaking_row = rows[self.speaking.id]
        self.assertTrue(speaking_row['is_audio_answer'])
        self.assertEqual(speaking_row['audio_url'], '')
        self.assertIsNone(speaking_row['chosen_answer'])

    def test_essay_entry_exposes_protected_audio_url(self):
        self.client.force_authenticate(user=self.manager)
        response = self.client.get(
            reverse('attempt-essay-answers', args=[self.attempt.id]),
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = {row['question_id']: row for row in response.data}

        speaking_row = rows[self.speaking.id]
        self.assertTrue(speaking_row['is_audio_answer'])
        self.assertEqual(speaking_row['audio_url'], self.url)
        # Ochiq media havolasi qaytmasligi kerak
        self.assertNotIn('/media/', speaking_row['audio_url'])

        writing_row = rows[self.writing.id]
        self.assertFalse(writing_row['is_audio_answer'])
        self.assertEqual(writing_row['audio_url'], '')

    def test_manager_list_keeps_audio_answer_without_text(self):
        """Matnsiz (faqat ovozli) javob menejer ro'yxatidan tushib qolmasin."""
        self.attempt.answers = {}
        self.attempt.save(update_fields=['answers'])

        self.client.force_authenticate(user=self.manager)
        response = self.client.get(
            reverse('olympiad-essay-answers', args=[self.olympiad.id]),
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        question_ids = [row['question_id'] for row in response.data]
        self.assertIn(self.speaking.id, question_ids)
        # Matnsiz writing javobi esa avvalgidek ro'yxatga kirmaydi
        self.assertNotIn(self.writing.id, question_ids)


class SpeakingAIFeedbackRejectionTests(APITestCase):
    """Speaking javobi matnli AI tahlilga YUBORILMAYDI.

    Speaking savoli `essay` turida bo'lgani uchun AI tahlil endpointi filtridan
    o'tib ketardi va `answers` dagi ichki marker ("speaking-answer:<id>") LLM'ga
    "insho" sifatida ketardi: tahlil bema'ni chiqadi va pullik chaqiruv behuda
    sarflanadi.
    """

    def setUp(self):
        cache.clear()
        self.center = make_center()
        self.student = make_student()
        self.olympiad = make_olympiad(self.center)
        self.speaking = Question.objects.create(
            center=self.center,
            subject=self.olympiad.subject,
            text='Speaking Part 2',
            options=[],
            correct_answer=0,
            score=10,
            question_type=Question.QUESTION_TYPE_ESSAY,
            section=Question.SECTION_SPEAKING,
        )
        self.writing = Question.objects.create(
            center=self.center,
            subject=self.olympiad.subject,
            text='Writing Task 2',
            options=[],
            correct_answer=0,
            score=10,
            question_type=Question.QUESTION_TYPE_ESSAY,
            section=Question.SECTION_WRITING,
        )
        self.olympiad.questions.add(self.speaking, self.writing)
        self.attempt = TestAttempt.objects.create(
            user=self.student,
            olympiad=self.olympiad,
            answers={
                str(self.speaking.id): f'speaking-answer:{self.speaking.id}',
                str(self.writing.id): {'text': 'Mening inshoyim.'},
            },
        )
        # Plus tarif — aks holda so'rov tier darvozasida (403) to'xtab,
        # tekshirmoqchi bo'lgan shoxgacha yetib bormasdi.
        plan = SubscriptionPlan.objects.create(
            name='Plus (1 oy)', plan_type='student', price=0, duration_days=30,
        )
        UserSubscription.objects.create(
            user=self.student, plan=plan,
            end_date=timezone.now() + timedelta(days=30),
            is_active=True,
        )
        self.student.refresh_from_db()
        cache.clear()
        self.client.force_authenticate(user=self.student)

    def _url(self, question):
        return reverse(
            'attempt-essay-ai-feedback',
            kwargs={'attempt_id': self.attempt.id, 'question_id': question.id},
        )

    def test_speaking_question_rejected(self):
        with patch('attempts.tasks.review_essay_answer') as mocked:
            response = self.client.get(self._url(self.speaking))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        # AI chaqiruvi UMUMAN bo'lmasligi kerak
        mocked.assert_not_called()
        # Va navbatga qo'yiladigan yozuv ham yaratilmasin
        self.assertFalse(
            EssayAIFeedback.objects.filter(
                attempt=self.attempt, question=self.speaking,
            ).exists()
        )

    def test_writing_question_still_accepted(self):
        response = self.client.get(self._url(self.writing))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(response.data['status'], ('pending', 'ready', 'failed'))
        self.assertTrue(
            EssayAIFeedback.objects.filter(
                attempt=self.attempt, question=self.writing,
            ).exists()
        )

    def test_task_skips_speaking_without_calling_llm(self):
        """Ikkinchi qatlam: tuzatishdan OLDIN navbatga tushgan yozuv uchun."""
        feedback = EssayAIFeedback.objects.create(
            attempt=self.attempt,
            question=self.speaking,
            status=EssayAIFeedback.STATUS_PENDING,
        )
        with patch('attempts.tasks.review_essay_answer') as mocked:
            generate_essay_ai_feedback_task(feedback.id)
        mocked.assert_not_called()

        feedback.refresh_from_db()
        self.assertEqual(feedback.status, EssayAIFeedback.STATUS_FAILED)
        self.assertNotIn('speaking-answer:', feedback.feedback_text)


class ListeningPlayCountTests(APITestCase):
    """POST /api/attempts/listening-play/ — audio ijro hisobi server tomonda."""

    def setUp(self):
        self.center = make_center()
        self.student = make_student()
        self.olympiad = make_olympiad(self.center)
        self.question = add_mcq_questions(
            self.olympiad, Question.SECTION_LISTENING, 1,
        )[0]
        self.session = TestSession.objects.create(
            user=self.student, olympiad=self.olympiad,
        )
        self.url = reverse('listening-play')
        self.client.force_authenticate(user=self.student)

    def _play(self, olympiad=None, question=None):
        return self.client.post(self.url, {
            'olympiad': (olympiad or self.olympiad).id,
            'question': (question or self.question).id,
        }, format='json')

    def _state(self, olympiad=None, question=None):
        return self.client.get(self.url, {
            'olympiad': (olympiad or self.olympiad).id,
            'question': (question or self.question).id,
        })

    def test_first_play_allowed_second_blocked_for_ielts(self):
        first = self._play()
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(first.data, {'play_count': 1, 'allowed': True})

        second = self._play()
        # Limit oshsa ham 200 — frontend xato ko'rsatmasdan tugmani o'chiradi
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(second.data, {'play_count': 2, 'allowed': False})

        self.session.refresh_from_db()
        self.assertEqual(
            self.session.listening_play_counts, {str(self.question.id): 2},
        )

    def test_counts_are_per_question(self):
        second_question = add_mcq_questions(
            self.olympiad, Question.SECTION_LISTENING, 1,
        )[0]
        self._play()
        response = self._play(question=second_question)
        self.assertEqual(response.data, {'play_count': 1, 'allowed': True})

        self.session.refresh_from_db()
        self.assertEqual(self.session.listening_play_counts, {
            str(self.question.id): 1,
            str(second_question.id): 1,
        })

    def test_cefr_allows_two_plays_then_blocks(self):
        cefr = make_olympiad(
            self.center, subject='CEFR Mock',
            exam_format=Olympiad.EXAM_FORMAT_CEFR,
        )
        question = add_mcq_questions(cefr, Question.SECTION_LISTENING, 1)[0]
        TestSession.objects.create(user=self.student, olympiad=cefr)

        first = self._play(olympiad=cefr, question=question)
        self.assertEqual(first.data, {'play_count': 1, 'allowed': True})
        second = self._play(olympiad=cefr, question=question)
        self.assertEqual(second.data, {'play_count': 2, 'allowed': True})
        third = self._play(olympiad=cefr, question=question)
        self.assertEqual(third.data, {'play_count': 3, 'allowed': False})

    def test_standard_format_has_no_limit(self):
        standard = make_olympiad(
            self.center, subject='Ingliz tili',
            exam_format=Olympiad.EXAM_FORMAT_STANDARD,
        )
        question = add_mcq_questions(standard, Question.SECTION_LISTENING, 1)[0]
        TestSession.objects.create(user=self.student, olympiad=standard)

        self._play(olympiad=standard, question=question)
        self._play(olympiad=standard, question=question)
        response = self._play(olympiad=standard, question=question)
        self.assertEqual(response.data, {'play_count': 3, 'allowed': True})

    def test_ielts_detected_from_subject_without_exam_format(self):
        """Eski yozuvda `exam_format` 'standard' bo'lsa ham fan bo'yicha IELTS."""
        legacy = make_olympiad(
            self.center, subject='IELTS Mock',
            exam_format=Olympiad.EXAM_FORMAT_STANDARD,
        )
        question = add_mcq_questions(legacy, Question.SECTION_LISTENING, 1)[0]
        TestSession.objects.create(user=self.student, olympiad=legacy)

        self._play(olympiad=legacy, question=question)
        response = self._play(olympiad=legacy, question=question)
        self.assertFalse(response.data['allowed'])

    def test_get_returns_state_without_incrementing(self):
        before = self._state()
        self.assertEqual(before.status_code, status.HTTP_200_OK)
        self.assertEqual(before.data, {'play_count': 0, 'allowed': True})

        # GET hisobni oshirmasligi kerak — takroran chaqirsak ham 0 qoladi
        self.assertEqual(self._state().data, {'play_count': 0, 'allowed': True})
        self.session.refresh_from_db()
        self.assertEqual(self.session.listening_play_counts, {})

    def test_get_reports_exhausted_state_after_play(self):
        self._play()
        # IELTS limiti 1 — bitta ijrodan keyin yangisiga ruxsat yo'q
        self.assertEqual(self._state().data, {'play_count': 1, 'allowed': False})

    def test_get_reports_remaining_play_for_cefr(self):
        cefr = make_olympiad(
            self.center, subject='CEFR Mock',
            exam_format=Olympiad.EXAM_FORMAT_CEFR,
        )
        question = add_mcq_questions(cefr, Question.SECTION_LISTENING, 1)[0]
        TestSession.objects.create(user=self.student, olympiad=cefr)

        self._play(olympiad=cefr, question=question)
        # CEFR limiti 2 — bitta ijrodan keyin yana bitta qoladi
        state = self._state(olympiad=cefr, question=question)
        self.assertEqual(state.data, {'play_count': 1, 'allowed': True})

        self._play(olympiad=cefr, question=question)
        state = self._state(olympiad=cefr, question=question)
        self.assertEqual(state.data, {'play_count': 2, 'allowed': False})

    def test_get_without_session_rejected(self):
        self.session.delete()
        response = self._state()
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_question_from_other_olympiad_rejected(self):
        other = make_olympiad(self.center, subject='IELTS')
        foreign = add_mcq_questions(other, Question.SECTION_LISTENING, 1)[0]
        response = self._play(question=foreign)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_without_session_rejected(self):
        self.session.delete()
        response = self._play()
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_expired_session_rejected(self):
        TestSession.objects.filter(pk=self.session.pk).update(
            started_at=timezone.now() - timedelta(minutes=120),
        )
        response = self._play()
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self._play()
        self.assertIn(
            response.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )
