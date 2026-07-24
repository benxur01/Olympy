from celery import shared_task
import logging
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from .models import TestAttempt, AttemptAIAnalysis, CodeSubmission, TestSession
from questions.ai_generation import (
    analyze_attempt_ai, review_code_submission, review_essay_answer,
)

logger = logging.getLogger(__name__)

# Menejer/owner javob bermasa, cheating tekshiruvi shu muddatdan keyin
# avtomatik "disqualify" (xavfsiz default) sifatida yakunlanadi.
PENDING_REVIEW_TIMEOUT_MINUTES = 10


@shared_task
def auto_disqualify_pending_reviews():
    """10 daqiqadan oshgan PENDING_REVIEW sessiyalarni avto-diskvalifikatsiya.

    Menejer/owner belgilangan muddatda qaror qilmasa, sessiya `disqualify`
    branch bilan bir xil yakunlanadi (reviewed_by=None — audit izida bu qaror
    AVTOMATIK bo'lganini bildiradi). Har sessiya alohida tranzaksiya +
    select_for_update ichida qayta ishlanadi — review endpoint bilan poyga
    (race) bo'lsa, PENDING_REVIEW bo'lmasa o'tkazib yuboriladi.
    """
    # Circular import'dan qochish uchun ichkarida import (views tasks'ga tayanadi).
    from .views import finalize_cheating_disqualification, notify_cheating_confirmed

    cutoff = timezone.now() - timedelta(minutes=PENDING_REVIEW_TIMEOUT_MINUTES)
    stale_ids = list(
        TestSession.objects
        .filter(status=TestSession.STATUS_PENDING_REVIEW, review_requested_at__lt=cutoff)
        .values_list('id', flat=True)
    )
    for session_id in stale_ids:
        student = None
        olympiad = None
        reason = ''
        try:
            with transaction.atomic():
                session = (
                    TestSession.objects
                    .select_for_update()
                    .select_related('user', 'olympiad', 'olympiad__center', 'olympiad__center__owner')
                    .filter(pk=session_id)
                    .first()
                )
                if not session or session.status != TestSession.STATUS_PENDING_REVIEW:
                    continue
                olympiad = session.olympiad
                finalize_cheating_disqualification(session, olympiad, None)
                student = session.user
                reason = session.cheating_reason or ''
            if student is not None:
                notify_cheating_confirmed(student, olympiad, reason)
        except Exception:
            logger.exception('auto_disqualify_pending_reviews failed session=%s', session_id)


@shared_task
def generate_attempt_ai_analysis_task(attempt_id):
    """Asynchronously generates AI analysis for premium student attempts."""
    try:
        attempt = TestAttempt.objects.select_related('olympiad').get(pk=attempt_id)
    except TestAttempt.DoesNotExist:
        logger.warning(f"Attempt {attempt_id} not found for AI analysis task")
        return

    # Check/create analysis row
    analysis, created = AttemptAIAnalysis.objects.get_or_create(
        attempt=attempt,
        defaults={'status': AttemptAIAnalysis.STATUS_PENDING},
    )
    if not created and analysis.status == AttemptAIAnalysis.STATUS_READY:
        return

    from .views import _build_attempt_mistakes
    summary = {
        'olympiad_title': attempt.olympiad.title,
        'subject': attempt.olympiad.subject,
        'score': attempt.score,
        'correct': attempt.correct_count,
        'wrong': attempt.wrong_count,
        'total': attempt.total_questions,
    }
    mistakes = _build_attempt_mistakes(attempt, attempt.olympiad, attempt.answers or {})
    
    try:
        text = analyze_attempt_ai(summary, mistakes)
        AttemptAIAnalysis.objects.filter(attempt_id=attempt_id).update(
            analysis_text=text or '',
            status=AttemptAIAnalysis.STATUS_READY,
        )
    except Exception as exc:
        logger.exception(f"AI analysis generation failed for attempt={attempt_id}: {exc}")
        try:
            AttemptAIAnalysis.objects.filter(attempt_id=attempt_id).update(
                status=AttemptAIAnalysis.STATUS_FAILED,
            )
        except Exception:
            logger.exception(
                "Failed to mark AI analysis FAILED for attempt=%s", attempt_id,
            )


@shared_task
def generate_essay_ai_feedback_task(feedback_id):
    """On-demand: bitta insho javobi uchun chuqur AI tahlilini generatsiya qiladi."""
    from .models import EssayAIFeedback
    from .views_essay import _essay_answer_text

    try:
        feedback = EssayAIFeedback.objects.select_related(
            'attempt', 'attempt__olympiad', 'question',
        ).get(pk=feedback_id)
    except EssayAIFeedback.DoesNotExist:
        logger.warning(f"EssayAIFeedback {feedback_id} not found for AI feedback task")
        return

    if feedback.status == EssayAIFeedback.STATUS_READY:
        return

    try:
        answer_text = _essay_answer_text(feedback.attempt, feedback.question)
        result = review_essay_answer(
            question_text=feedback.question.text,
            essay_text=answer_text,
            subject=feedback.attempt.olympiad.subject or '',
        )
        if result.get('ok'):
            EssayAIFeedback.objects.filter(pk=feedback_id).update(
                feedback_text=result.get('review') or '',
                status=EssayAIFeedback.STATUS_READY,
            )
        else:
            EssayAIFeedback.objects.filter(pk=feedback_id).update(
                feedback_text=result.get('error') or '',
                status=EssayAIFeedback.STATUS_FAILED,
            )
    except Exception as exc:
        logger.exception(f"Essay AI feedback generation failed for id={feedback_id}: {exc}")
        try:
            EssayAIFeedback.objects.filter(pk=feedback_id).update(
                status=EssayAIFeedback.STATUS_FAILED,
            )
        except Exception:
            logger.exception(
                "Failed to mark EssayAIFeedback FAILED for id=%s", feedback_id,
            )


@shared_task
def review_code_submissions_task(submission_ids):
    """Asynchronously processes code submissions using Gemini AI review."""
    for sub_id in submission_ids:
        try:
            sub = CodeSubmission.objects.select_related('question').get(pk=sub_id)
            result = review_code_submission(
                question_text=sub.question.text,
                submitted_code=sub.submitted_code,
                language=sub.code_language,
                expected_output=sub.question.expected_output or '',
            )
            sub.ai_code_review = result.get('review') or ''
            sub.ai_code_score = result.get('score')
            sub.save(update_fields=['ai_code_review', 'ai_code_score'])
        except CodeSubmission.DoesNotExist:
            logger.warning(f"CodeSubmission {sub_id} not found")
        except Exception as exc:
            logger.exception(f"Code review failed for submission={sub_id}: {exc}")
