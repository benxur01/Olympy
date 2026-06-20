from celery import shared_task
import logging

from .models import TestAttempt, AttemptAIAnalysis, CodeSubmission
from notifications.services import send_attempt_result_to_parents
from questions.ai_generation import analyze_attempt_ai, review_code_submission

logger = logging.getLogger(__name__)


@shared_task
def send_attempt_result_to_parents_task(attempt_id):
    """Asynchronously sends the attempt result notification to parents via Telegram."""
    try:
        attempt = TestAttempt.objects.select_related('user', 'olympiad').get(pk=attempt_id)
        send_attempt_result_to_parents(attempt)
    except TestAttempt.DoesNotExist:
        logger.warning(f"Attempt {attempt_id} not found for parent notification task")
    except Exception as exc:
        logger.exception(f"Parent notification task failed for attempt={attempt_id}: {exc}")


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
