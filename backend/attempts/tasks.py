from celery import shared_task
import logging
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from .models import (
    AttemptAIAnalysis, CodeSubmission, EvidenceSnapshot, TestAttempt, TestSession,
)
from questions.ai_generation import (
    analyze_attempt_ai, review_code_submission, review_essay_answer,
)

logger = logging.getLogger(__name__)

# Menejer/owner javob bermasa, cheating tekshiruvi shu muddatdan keyin
# avtomatik "disqualify" (xavfsiz default) sifatida yakunlanadi.
PENDING_REVIEW_TIMEOUT_MINUTES = 10

# Proktoring dalili (o'quvchining kamera/ekran kadri) shuncha kundan keyin
# butunlay o'chiriladi. Muddat mahsulot qarori bilan belgilangan: appellyatsiya
# va qarorni qayta ko'rish uchun yetarli, lekin biometrik ma'lumotni undan
# uzoq saqlash asossiz. Env orqali sozlanmaydi — retention va'dasi bitta
# joyda, ko'rinadigan holda tursin.
EVIDENCE_RETENTION_DAYS = 90

# AI xatolar tahlili task'ining kesh prefiksi (`questions.ai_task_status`).
EXPLAIN_MISTAKES_TASK_PREFIX = 'explain_mistakes'


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
                    # `of=('self',)` — faqat sessiya qatorini lock qilamiz.
                    # `olympiad__center__owner` nullable FK LEFT OUTER JOIN
                    # hosil qiladi; `of` bo'lmasa PostgreSQL nullable outer join
                    # ustida FOR UPDATE'ni rad etadi (avto-diskvalifikatsiya
                    # task'i jimgina uzilardi).
                    .select_for_update(of=('self',))
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
def cleanup_expired_evidence():
    """`EVIDENCE_RETENTION_DAYS` dan eski proktoring dalillarini o'chiradi.

    Fayl VA DB qatori — ikkalasi ham. Faylni `attempts.signals.
    delete_evidence_files` (post_delete) o'chiradi: Django modelni o'chirganda
    `FileField` faylini diskda QOLDIRADI, ya'ni signalsiz `EVIDENCE_MEDIA_ROOT`
    cheksiz o'sib VPS diskini to'ldirardi. Signal shu yerda ataylab
    takrorlanmaydi — u qator o'chishining boshqa yo'llarini ham (sessiya yoki
    hisob o'chirilishi, CASCADE) qoplaydi va cheklov bitta joyda turadi.

    Xatolik (fayl allaqachon yo'q, ruxsat muammosi) butun sweep'ni to'xtatmaydi
    — `auto_disqualify_pending_reviews` dagi bilan bir xil naqsh: har element
    o'z `try` bloki ichida.
    """
    cutoff = timezone.now() - timedelta(days=EVIDENCE_RETENTION_DAYS)
    # Avval id'lar ro'yxati: queryset bo'ylab yurib turib o'sha qatorlarni
    # o'chirish kursorni buzadi.
    stale_ids = list(
        EvidenceSnapshot.objects
        .filter(captured_at__lt=cutoff)
        .values_list('id', flat=True)
    )
    removed = 0
    for snapshot_id in stale_ids:
        try:
            snapshot = EvidenceSnapshot.objects.filter(pk=snapshot_id).first()
            if snapshot is None:
                continue
            snapshot.delete()
            removed += 1
        except Exception:
            logger.exception('cleanup_expired_evidence failed evidence=%s', snapshot_id)
    if removed:
        logger.info('cleanup_expired_evidence: %s ta dalil o\'chirildi', removed)
    return removed


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
def explain_all_mistakes_task(task_id, user_id, mistakes):
    """O'quvchining xatolari bo'yicha umumiy AI tavsiyani generatsiya qiladi.

    Avval `explain_all_mistakes` view'i `explain_mistakes_ai` ni SINXRON
    chaqirardi: Gemini model/kalit sikli 45s timeout bilan, eng yomon holatda
    bir necha daqiqa gunicorn thread'ini bloklardi. Endi PDF import oqimidagi
    kabi Celery task; frontend `mistakes/explain/<task_id>/status/` ni polling
    qiladi. `mistakes` view'da yig'iladi (DB ishi tez) va JSON sifatida uzatiladi.
    """
    from questions.ai_generation import explain_mistakes_ai
    from questions.ai_task_status import set_ai_task_failed, set_ai_task_result

    try:
        explanation_text = explain_mistakes_ai(mistakes or [])
        # T5: AI xatolar tahlilini menejer faoliyat logiga yozamiz (markaz bo'lsa).
        try:
            from accounts.models import User
            from centers.models import ManagerActivityLog
            from centers.services import log_manager_activity, primary_center_for_user
            user = User.objects.filter(pk=user_id).first()
            center = primary_center_for_user(user) if user else None
            if center is not None:
                log_manager_activity(
                    center, user, ManagerActivityLog.ACTION_SEND_ANALYSIS,
                    description='Xatolar tahlili (AI) generatsiya qilindi',
                    target_user=user,
                )
        except Exception:
            logger.exception('manager activity log failed for user=%s', user_id)
        set_ai_task_result(
            EXPLAIN_MISTAKES_TASK_PREFIX, task_id,
            {'explanation': explanation_text},
        )
    except Exception as exc:
        logger.exception('AI xatolar tahlili task xatosi task=%s', task_id)
        set_ai_task_failed(
            EXPLAIN_MISTAKES_TASK_PREFIX, task_id,
            str(exc) or "AI yordamida xatolar tahlili generatsiya qilinmadi",
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
