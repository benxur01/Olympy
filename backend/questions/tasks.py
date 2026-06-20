import time

from celery import shared_task
from django.conf import settings
from django.core.cache import cache
import logging
from .models import Question

logger = logging.getLogger(__name__)


def _normalize_output(val):
    if val is None:
        return ''
    return str(val).strip().replace('\r\n', '\n').replace('\r', '\n')


def _build_batch(source_code, language, stdin, question_id):
    """Test caslarni yig'ib Judge0 batch so'rovini va meta ma'lumotni tuzadi."""
    test_cases = []
    if question_id:
        try:
            question = Question.objects.get(pk=question_id)
            if question.question_type == Question.QUESTION_TYPE_CODE:
                raw = question.test_cases if isinstance(question.test_cases, list) else []
                test_cases = raw[:5]  # Limit to max 5 visible test cases
        except Question.DoesNotExist:
            pass

    batch_subs = []
    test_cases_meta = []

    if not test_cases:
        batch_subs.append({
            'source_code': source_code,
            'language': language,
            'stdin': stdin,
        })
        test_cases_meta.append({'is_single': True})
    else:
        for tc in test_cases:
            tc_input = '' if tc.get('input') is None else str(tc.get('input'))
            batch_subs.append({
                'source_code': source_code,
                'language': language,
                'stdin': tc_input,
            })
            test_cases_meta.append({
                'is_single': False,
                'input': tc_input,
                'expected': '' if tc.get('expected_output') is None else str(tc.get('expected_output')),
                'is_hidden': bool(tc.get('is_hidden')),
            })

    return batch_subs, test_cases_meta


@shared_task(bind=True, max_retries=60)
def run_code_async_task(self, task_id, source_code, language, stdin, question_id, tokens=None, valid_indices=None, test_cases_meta=None, submission_id=None):
    """Kodni Judge0 ga yuborib, test caslar bo'yicha tekshiradi va natijani keshga yozadi.

    Production (Redis broker bor) — bloklamasdan: har bosqichda `self.retry(countdown=1)`
    bilan task navbatga qaytadi, worker thread band qilinmaydi.

    EAGER rejim (Redis yo'q dev/test) — `self.retry()` Celery'da `Retry` exception
    ko'taradi va qayta ishga tushmaydi. Shu sababli EAGER'da bitta chaqiruv ichida
    natija tayyor bo'lguncha polling qilamiz (bu rejim faqat broker yo'q joyda yoqiladi).

    `submission_id` berilgan bo'lsa (submit oqimida) — test caslar tugagach
    o'sha `CodeSubmission` yozuvining `all_tests_passed` maydoni yangilanadi va
    avtomatik ball hisoblash shunga tayanadi. "Run code" tugmasi oqimida
    `submission_id=None` keladi va hech qanday yozuv yangilanmaydi.
    """
    from .judge0_service import submit_code_batch, check_batch_status
    from django.db import close_old_connections
    close_old_connections()

    eager = getattr(settings, 'CELERY_TASK_ALWAYS_EAGER', False)

    try:
        # ─── EAGER rejim: retry o'rniga bitta chaqiruvda to'liq polling ───
        if eager:
            batch_subs, test_cases_meta = _build_batch(source_code, language, stdin, question_id)
            sub_res = submit_code_batch(batch_subs)
            if not sub_res.get('ok'):
                cache.set(f"run_code:task:{task_id}", {
                    'status': 'FAILED',
                    'error': sub_res.get('error') or "Kodni ishga tushirib bo'lmadi",
                }, timeout=300)
                return

            tokens = sub_res['tokens']
            valid_indices = sub_res['valid_indices']

            status_res = None
            for _ in range(30):
                status_res = check_batch_status(tokens, valid_indices, len(test_cases_meta))
                if not status_res.get('ok'):
                    cache.set(f"run_code:task:{task_id}", {
                        'status': 'FAILED',
                        'error': status_res.get('error') or "Kodni ishga tushirib bo'lmadi",
                    }, timeout=300)
                    return
                if status_res.get('status') != 'PENDING':
                    break
                time.sleep(1)
            else:
                cache.set(f"run_code:task:{task_id}", {
                    'status': 'FAILED',
                    'error': "Kod bajarilishini tekshirish vaqti tugadi (Timeout)",
                }, timeout=300)
                return

            _finalize_results(task_id, status_res['results'], test_cases_meta, submission_id)
            return

        # ─── Production rejim: bloklamaydigan retry oqimi ───
        # Step 1: Submit code to Judge0 if we don't have tokens yet
        if tokens is None:
            batch_subs, test_cases_meta = _build_batch(source_code, language, stdin, question_id)

            # Submit batch
            sub_res = submit_code_batch(batch_subs)
            if not sub_res.get('ok'):
                cache.set(f"run_code:task:{task_id}", {
                    'status': 'FAILED',
                    'error': sub_res.get('error') or "Kodni ishga tushirib bo'lmadi"
                }, timeout=300)
                return

            tokens = sub_res['tokens']
            valid_indices = sub_res['valid_indices']

            # Retry the task after 1 second to check status
            self.retry(args=[task_id, source_code, language, stdin, question_id, tokens, valid_indices, test_cases_meta, submission_id], countdown=1)
            return

        # Step 2: Retrieve batch results
        status_res = check_batch_status(tokens, valid_indices, len(test_cases_meta))
        if not status_res.get('ok'):
            cache.set(f"run_code:task:{task_id}", {
                'status': 'FAILED',
                'error': status_res.get('error') or "Kodni ishga tushirib bo'lmadi"
            }, timeout=300)
            return

        # If still pending, retry after 1 second
        if status_res.get('status') == 'PENDING':
            self.retry(args=[task_id, source_code, language, stdin, question_id, tokens, valid_indices, test_cases_meta, submission_id], countdown=1)
            return

        # Step 3: Parse and cache completed results
        _finalize_results(task_id, status_res['results'], test_cases_meta, submission_id)

    except self.MaxRetriesExceededError:
        cache.set(f"run_code:task:{task_id}", {
            'status': 'FAILED',
            'error': "Kod bajarilishini tekshirish vaqti tugadi (Timeout)"
        }, timeout=300)
    except Exception as e:
        logger.exception(f"Async run code task failed: {e}")
        cache.set(f"run_code:task:{task_id}", {
            'status': 'FAILED',
            'error': str(e)
        }, timeout=300)


def _update_submission_tests_passed(submission_id, passed_all):
    """Submit oqimidagi CodeSubmission yozuvining `all_tests_passed` maydonini
    yangilaydi va shu attempt ballini qayta hisoblaydi.

    `submission_id` berilmagan (Run code tugmasi) yoki yozuv topilmasa —
    `filter().update()` hech narsa qilmaydi (jim o'tkazib yuboradi).

    Submit paytida `score_session_answers` CodeSubmission yaratilishidan oldin
    ishlaydi va Judge0 asinxron tugaydi, shu sababli submit javobida kod ball
    hali 0 bo'ladi. Judge0 shu yerda tugagach attempt ballini qayta hisoblab
    yozamiz — leaderboard va natijalar sahifasi to'g'ri ballni ko'rsatadi.
    """
    if not submission_id:
        return
    try:
        from attempts.models import CodeSubmission
        updated = CodeSubmission.objects.filter(pk=submission_id).update(
            all_tests_passed=bool(passed_all),
        )
        if updated:
            _recompute_attempt_score_for_submission(submission_id)
    except Exception:
        logger.exception(
            'all_tests_passed yangilashda xato submission=%s', submission_id,
        )


def _recompute_attempt_score_for_submission(submission_id):
    """CodeSubmission tegishli attempt ballini qayta hisoblab yozadi.

    Kod savol balli Judge0 test natijasiga bog'liq va submit paytida hali
    tayyor bo'lmaydi. Shu sababli har bir kod savol Judge0'da tugagach shu
    funksiya attempt'ning score/correct_count/wrong_count'ini qayta hisoblaydi.
    """
    try:
        from attempts.models import CodeSubmission, TestSession
        from attempts.session_utils import score_session_answers

        sub = (
            CodeSubmission.objects
            .select_related('attempt', 'attempt__olympiad')
            .filter(pk=submission_id)
            .first()
        )
        if not sub or not sub.attempt_id:
            return
        attempt = sub.attempt
        olympiad = attempt.olympiad
        session = TestSession.objects.filter(
            user_id=attempt.user_id, olympiad=olympiad,
        ).first()
        if not session:
            return
        # `attempt` uzatamiz — shunda score_session_answers kod savol ballini
        # ham (shu attempt'ning CodeSubmission'lari bo'yicha) hisoblaydi.
        # Submit oqimida esa attempt berilmaydi va kod savollar hisobga
        # olinmaydi (Judge0 hali tugamagan).
        scored = score_session_answers(
            session, olympiad, attempt.answers or {}, attempt=attempt,
        )
        attempt.score = scored['score']
        attempt.correct_count = scored['correct']
        attempt.wrong_count = scored['wrong']
        attempt.total_questions = scored['total']
        attempt.save(update_fields=[
            'score', 'correct_count', 'wrong_count', 'total_questions',
        ])
    except Exception:
        logger.exception(
            'attempt ballini qayta hisoblashda xato submission=%s', submission_id,
        )


def _finalize_results(task_id, batch_results, test_cases_meta, submission_id=None):
    """Judge0 natijalarini test caslar bo'yicha hisoblab keshga yozadi."""
    try:
        # Single case
        if len(test_cases_meta) == 1 and test_cases_meta[0].get('is_single'):
            result = batch_results[0]
            if not result.get('ok'):
                cache.set(f"run_code:task:{task_id}", {
                    'status': 'FAILED',
                    'error': result.get('error') or "Kodni ishga tushirib bo'lmadi"
                }, timeout=300)
                return
            # Test caslar yo'q savol — kutilgan natija bilan solishtirilmaydi,
            # shu sababli avtomatik ball berilmaydi (all_tests_passed=False).
            _update_submission_tests_passed(submission_id, False)
            cache.set(f"run_code:task:{task_id}", {
                'status': 'COMPLETED',
                'result': {
                    'stdout': result.get('stdout', ''),
                    'stderr': result.get('stderr', ''),
                    'compile_output': result.get('compile_output', ''),
                    'status': result.get('status', 'Unknown'),
                    'time': result.get('time', 0),
                    'memory': result.get('memory', 0),
                    'test_results': [],
                }
            }, timeout=300)
            return

        # Multiple test cases
        test_results = []
        first_error = None
        passed_all = True
        last_status = 'Accepted'
        total_time = 0.0
        max_memory = 0

        for idx, tc in enumerate(test_cases_meta):
            tc_input = tc.get('input', '')
            expected = tc.get('expected', '')
            is_hidden = tc.get('is_hidden', False)
            
            result = batch_results[idx]
            if not result.get('ok'):
                cache.set(f"run_code:task:{task_id}", {
                    'status': 'FAILED',
                    'error': result.get('error') or "Kodni ishga tushirib bo'lmadi"
                }, timeout=300)
                return
            
            total_time += float(result.get('time') or 0)
            max_memory = max(max_memory, int(result.get('memory') or 0))
            got = result.get('stdout', '')
            status_desc = result.get('status', 'Unknown')
            
            if status_desc not in ('Accepted',) and (result.get('compile_output') or result.get('stderr')):
                if first_error is None:
                    first_error = {
                        'stderr': result.get('stderr', ''),
                        'compile_output': result.get('compile_output', ''),
                    }
            passed = (
                status_desc == 'Accepted'
                and _normalize_output(got) == _normalize_output(expected)
            )
            if not passed:
                passed_all = False
                last_status = status_desc if status_desc != 'Accepted' else 'Wrong Answer'
            
            entry = {
                'passed': passed,
                'is_hidden': is_hidden,
            }
            if not is_hidden:
                entry['input'] = tc_input
                entry['expected'] = expected
                entry['got'] = _normalize_output(got)
            test_results.append(entry)

        overall_status = 'Accepted' if passed_all else last_status
        # Submit oqimida bo'lsa — barcha test caslar muvaffaqiyatli o'tdimi
        # (passed_all) ni CodeSubmission yozuviga yozamiz. Avtomatik ball
        # hisoblash (score_session_answers) shu maydonga tayanadi.
        _update_submission_tests_passed(submission_id, passed_all)
        cache.set(f"run_code:task:{task_id}", {
            'status': 'COMPLETED',
            'result': {
                'stdout': '',
                'stderr': (first_error or {}).get('stderr', ''),
                'compile_output': (first_error or {}).get('compile_output', ''),
                'status': overall_status,
                'time': round(total_time, 3),
                'memory': max_memory,
                'test_results': test_results,
            }
        }, timeout=300)

    except Exception as e:
        logger.exception(f"Run code natijalarini hisoblashda xato: {e}")
        cache.set(f"run_code:task:{task_id}", {
            'status': 'FAILED',
            'error': str(e)
        }, timeout=300)


@shared_task(bind=True)
def process_pdf_questions_task(self, task_id, pdf_b64, subject, difficulty, question_type):
    """PDFdan savollarni AI yordamida ajratadi va natijani keshga yozadi.

    Avval bu ish `preview_pdf_questions` view'da SINXRON bajarilardi va Gemini
    API chaqiruvlari 15-30 daqiqagacha cho'zilib, Gunicorn worker'ni to'liq
    bloklardi. Endi alohida Celery task — worker thread band qilinmaydi.

    Frontend `GET /api/questions/pdf-preview/<task_id>/status/` orqali polling
    qilib natijani oladi. EAGER rejimda (Redis yo'q dev) task sinxron bajariladi
    va `delay()` shu yerdayoq natijani keshga yozib qaytadi — bu lokal dev uchun
    to'g'ri (settings.CELERY_TASK_ALWAYS_EAGER boshqaradi).

    PDF baytlari Celery argumenti sifatida base64 string ko'rinishida keladi
    (broker JSON serializer'i bilan mos bo'lishi uchun).
    """
    import base64

    from django.core.cache import cache
    from django.db import close_old_connections

    from .pdf_generation import extract_questions_from_pdf

    close_old_connections()
    cache_key = f"pdf_questions:task:{task_id}"
    try:
        pdf_bytes = base64.b64decode(pdf_b64) if pdf_b64 else b''
        result = extract_questions_from_pdf(
            pdf_bytes=pdf_bytes,
            subject=subject or '',
            difficulty=difficulty or 'medium',
            question_type=question_type or 'multiple_choice',
        )
        if not result.get('ok'):
            cache.set(cache_key, {
                'status': 'FAILED',
                'error': result.get('error') or "PDFdan savollarni ajratib bo'lmadi",
                'pdf_text_chars': result.get('pdf_text_chars', 0),
                'page_count': result.get('page_count', 0),
                'used_pdf_vision': bool(result.get('used_pdf_vision')),
            }, timeout=900)
            return
        cache.set(cache_key, {
            'status': 'COMPLETED',
            'result': {
                'questions': result.get('questions') or [],
                'provider': result.get('provider') or '',
                'pdf_text_chars': result.get('pdf_text_chars', 0),
                'page_count': result.get('page_count', 0),
                'used_pdf_vision': bool(result.get('used_pdf_vision')),
                'complete': result.get('complete', True),
                'warning': result.get('warning') or '',
                'chunks': result.get('chunks', 1),
            },
        }, timeout=900)
    except Exception as exc:
        logger.exception('PDF savol ajratish task xatosi task=%s', task_id)
        cache.set(cache_key, {
            'status': 'FAILED',
            'error': str(exc) or "PDFni tahlil qilishda kutilmagan xato",
        }, timeout=900)


@shared_task(bind=True, max_retries=3)
def update_question_embedding(self, question_id):
    """RAG: savol matnini vektorga aylantirib `embedding` ustuniga yozadi.

    Raw SQL bilan yoziladi (`.save()` emas) — shu sababli `post_save` signal
    qayta ishga tushmaydi va cheksiz tsikl bo'lmaydi. Embedding olib bo'lmasa
    (kalit yo'q yoki API xato) jim o'tadi. pgvector ulanmagan muhitda UPDATE
    xato bersa retry qilinadi, lekin uch urinishdan keyin to'xtaydi.
    """
    from django.db import connection
    from .embeddings import get_embedding

    try:
        question = Question.objects.filter(pk=question_id).only('id', 'text').first()
        if not question:
            return
        embedding = get_embedding(question.text)
        if not embedding:
            return
        vector_str = '[' + ','.join(str(x) for x in embedding) + ']'
        with connection.cursor() as cursor:
            cursor.execute(
                'UPDATE questions_question SET embedding = %s::vector WHERE id = %s',
                [vector_str, question_id],
            )
    except Exception as exc:
        logger.warning('Embedding yangilashda xato question=%s: %s', question_id, exc)
        raise self.retry(exc=exc, countdown=60)
