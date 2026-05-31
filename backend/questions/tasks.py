from celery import shared_task
from django.core.cache import cache
import logging
from django.shortcuts import get_object_or_404
from .models import Question

logger = logging.getLogger(__name__)


def _normalize_output(val):
    if val is None:
        return ''
    return str(val).strip().replace('\r\n', '\n').replace('\r', '\n')


@shared_task
def run_code_async_task(task_id, source_code, language, stdin, question_id):
    """Asynchronously runs a code submission against Judge0, batches test cases, and caches results."""
    from .judge0_service import is_supported, run_code, run_code_batch
    from django.db import close_old_connections
    close_old_connections()
    
    try:
        # 1. Fetch test cases if question_id is provided
        test_cases = []
        if question_id:
            try:
                question = Question.objects.get(pk=question_id)
                if question.question_type == Question.QUESTION_TYPE_CODE:
                    raw = question.test_cases if isinstance(question.test_cases, list) else []
                    # Limit to max 5 visible test cases
                    test_cases = raw[:5]
            except Question.DoesNotExist:
                pass

        # 2. Run code
        if not test_cases:
            result = run_code(source_code, language, stdin=stdin)
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

        # 3. Batch run for test cases
        batch_subs = []
        for tc in test_cases:
            tc_input = '' if tc.get('input') is None else str(tc.get('input'))
            batch_subs.append({
                'source_code': source_code,
                'language': language,
                'stdin': tc_input
            })

        batch_results = run_code_batch(batch_subs)
        if not isinstance(batch_results, list) or len(batch_results) != len(test_cases):
            err_msg = "Kodni ishga tushirib bo'lmadi"
            if isinstance(batch_results, dict) and not batch_results.get('ok'):
                err_msg = batch_results.get('error') or err_msg
            cache.set(f"run_code:task:{task_id}", {
                'status': 'FAILED',
                'error': err_msg
            }, timeout=300)
            return

        test_results = []
        first_error = None
        passed_all = True
        last_status = 'Accepted'
        total_time = 0.0
        max_memory = 0

        for idx, tc in enumerate(test_cases):
            tc_input = '' if tc.get('input') is None else str(tc.get('input'))
            expected = '' if tc.get('expected_output') is None else str(tc.get('expected_output'))
            is_hidden = bool(tc.get('is_hidden'))
            
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
        logger.exception(f"Async run code task failed: {e}")
        cache.set(f"run_code:task:{task_id}", {
            'status': 'FAILED',
            'error': str(e)
        }, timeout=300)
