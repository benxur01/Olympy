"""Essay savollarni qo'lda baholash endpointlari.

Essay javoblar avtomatik baholanmaydi (questions.grading RESULT_PENDING).
Bu modul teacher/manager uchun essay javoblarni ko'rish va 0..max_score
oralig'ida ball + izoh qo'yish imkonini beradi. Ball saqlangach attempt'ning
score (foiz) qiymati qayta hisoblanadi — baholangan essay'lar avtomatik
baholangan savollar bilan birga umumiy foizga kiradi.
"""
import logging

from django.shortcuts import get_object_or_404
from rest_framework import status as http_status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from olympiads.models import Olympiad

from .models import EssayGrade, TestAttempt, TestSession
from .views import _extract_review_chosen, _user_can_manage_olympiad

logger = logging.getLogger(__name__)


def _essay_questions_for(olympiad):
    """Olimpiadaning essay savollari (id bo'yicha tartiblangan)."""
    return list(
        olympiad.questions
        .filter(question_type='essay')
        .order_by('id')
    )


def _essay_answer_text(attempt, question):
    """Attempt javoblaridan essay matnini ajratadi (yo'q bo'lsa '')."""
    answers = attempt.answers or {}
    chosen = answers.get(str(question.id))
    if chosen is None:
        chosen = answers.get(question.id)
    text = _extract_review_chosen(chosen, 'essay')
    return str(text) if text is not None else ''


def _essay_entry(attempt, question, grade):
    """Bitta essay javob uchun javob+baho dict'i."""
    return {
        'attempt_id': attempt.id,
        'student_id': attempt.user_id,
        'student_name': attempt.user.full_name or attempt.user.phone or "O'quvchi",
        'question_id': question.id,
        'question_text': question.text,
        'max_score': question.score,
        'answer_text': _essay_answer_text(attempt, question),
        'graded': grade is not None,
        'score': grade.score if grade else None,
        'feedback': grade.feedback if grade else '',
        'graded_at': grade.updated_at.isoformat() if grade else None,
    }


def _recompute_attempt_score(attempt):
    """Essay baho saqlangach attempt score/foizini qayta hisoblaydi.

    score_session_answers `attempt` rejimida baholangan essay'larni (va kod
    savollar natijasini) ham hisobga oladi. Sessiya topilmasa (kutilmagan
    holat) jimgina o'tib ketadi — baho baribir saqlangan bo'ladi.
    """
    from .session_utils import score_session_answers

    session = TestSession.objects.filter(
        user_id=attempt.user_id, olympiad_id=attempt.olympiad_id,
    ).first()
    if not session:
        logger.warning(
            'essay baho: attempt=%s uchun sessiya topilmadi — score qayta hisoblanmadi',
            attempt.id,
        )
        return
    scored = score_session_answers(
        session, attempt.olympiad, attempt.answers or {}, attempt=attempt,
    )
    attempt.score = scored['score']
    attempt.correct_count = scored['correct']
    attempt.wrong_count = scored['wrong']
    attempt.total_questions = scored['total']
    attempt.save(update_fields=[
        'score', 'correct_count', 'wrong_count', 'total_questions',
    ])


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def attempt_essay_answers(request, attempt_id):
    """GET /api/attempts/<id>/essay-answers/ — attempt'ning essay javoblari.

    Faqat teacher/manager/owner/admin (olimpiada markazi bo'yicha).
    """
    attempt = get_object_or_404(
        TestAttempt.objects.select_related('user', 'olympiad', 'olympiad__center'),
        pk=attempt_id,
    )
    if not _user_can_manage_olympiad(request.user, attempt.olympiad):
        return Response({'detail': 'Forbidden'}, status=http_status.HTTP_403_FORBIDDEN)

    questions = _essay_questions_for(attempt.olympiad)
    grades = {
        g.question_id: g
        for g in EssayGrade.objects.filter(attempt=attempt)
    }
    return Response([
        _essay_entry(attempt, q, grades.get(q.id))
        for q in questions
    ])


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def grade_essay_answer(request, attempt_id, question_id):
    """POST /api/attempts/<id>/essay-answers/<qid>/grade/ — ball + izoh saqlash.

    Body: {"score": 8, "feedback": "..."} — score 0..question.score oralig'ida.
    Saqlangach attempt score (foiz) qayta hisoblanadi.
    """
    attempt = get_object_or_404(
        TestAttempt.objects.select_related('user', 'olympiad', 'olympiad__center'),
        pk=attempt_id,
    )
    if not _user_can_manage_olympiad(request.user, attempt.olympiad):
        return Response({'detail': 'Forbidden'}, status=http_status.HTTP_403_FORBIDDEN)

    question = attempt.olympiad.questions.filter(
        pk=question_id, question_type='essay',
    ).first()
    if not question:
        return Response(
            {'detail': 'Essay savol topilmadi'},
            status=http_status.HTTP_404_NOT_FOUND,
        )

    try:
        score = int(request.data.get('score'))
    except (TypeError, ValueError):
        return Response(
            {'detail': "score butun son bo'lishi kerak"},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    if score < 0 or score > question.score:
        return Response(
            {'detail': f"Ball 0 dan {question.score} gacha bo'lishi kerak"},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    feedback = str(request.data.get('feedback') or '')[:2000]

    grade, _ = EssayGrade.objects.update_or_create(
        attempt=attempt,
        question=question,
        defaults={
            'score': score,
            'feedback': feedback,
            'graded_by': request.user,
        },
    )

    # Ball saqlandi — attempt foizini qayta hisoblaymiz (baholangan essay
    # endi umumiy hisobga kiradi). Xato bo'lsa baho yo'qolmaydi.
    try:
        _recompute_attempt_score(attempt)
    except Exception:
        logger.exception(
            'essay baho: attempt=%s score qayta hisoblashda xato', attempt.id,
        )

    return Response({
        **_essay_entry(attempt, question, grade),
        'attempt_score': attempt.score,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def olympiad_essay_answers(request, olympiad_id):
    """GET /api/manager/olympiads/<id>/essay-answers/ — olimpiadaning barcha
    essay javoblari (manager paneli "Essay baholash" ro'yxati uchun).

    `?only_ungraded=1` — faqat hali baholanmaganlar.
    """
    olympiad = get_object_or_404(
        Olympiad.objects.select_related('center'),
        pk=olympiad_id,
    )
    if not _user_can_manage_olympiad(request.user, olympiad):
        return Response({'detail': 'Forbidden'}, status=http_status.HTTP_403_FORBIDDEN)

    questions = _essay_questions_for(olympiad)
    if not questions:
        return Response([])

    only_ungraded = str(request.query_params.get('only_ungraded') or '') in ('1', 'true')
    attempts = list(
        TestAttempt.objects
        .filter(olympiad=olympiad, disqualified=False)
        .select_related('user')
        .order_by('-submitted_at')
    )
    grades = {}
    for g in EssayGrade.objects.filter(attempt__in=attempts):
        grades[(g.attempt_id, g.question_id)] = g

    entries = []
    for attempt in attempts:
        for q in questions:
            answer = _essay_answer_text(attempt, q)
            # Javob yozilmagan essay'lar baholanmaydi — ro'yxatga kirmaydi.
            if not answer.strip():
                continue
            grade = grades.get((attempt.id, q.id))
            if only_ungraded and grade is not None:
                continue
            entries.append(_essay_entry(attempt, q, grade))
    return Response(entries)
