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
def run_code_async_task(self, task_id, source_code, language, stdin, question_id, tokens=None, valid_indices=None, test_cases_meta=None):
    """Kodni Judge0 ga yuborib, test caslar bo'yicha tekshiradi va natijani keshga yozadi.

    Production (Redis broker bor) — bloklamasdan: har bosqichda `self.retry(countdown=1)`
    bilan task navbatga qaytadi, worker thread band qilinmaydi.

    EAGER rejim (Redis yo'q dev/test) — `self.retry()` Celery'da `Retry` exception
    ko'taradi va qayta ishga tushmaydi. Shu sababli EAGER'da bitta chaqiruv ichida
    natija tayyor bo'lguncha polling qilamiz (bu rejim faqat broker yo'q joyda yoqiladi).
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

            _finalize_results(task_id, status_res['results'], test_cases_meta)
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
            self.retry(args=[task_id, source_code, language, stdin, question_id, tokens, valid_indices, test_cases_meta], countdown=1)
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
            self.retry(args=[task_id, source_code, language, stdin, question_id, tokens, valid_indices, test_cases_meta], countdown=1)
            return

        # Step 3: Parse and cache completed results
        _finalize_results(task_id, status_res['results'], test_cases_meta)

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


def _finalize_results(task_id, batch_results, test_cases_meta):
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
