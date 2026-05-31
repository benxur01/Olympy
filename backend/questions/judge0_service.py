"""Kod ishga tushirish servisi — Judge0 CE.

Default: https://ce.judge0.com (bepul, API key shart emas).
JUDGE0_API_KEY o'rnatilsa: RapidAPI Judge0 CE ishlatiladi (ko'proq limit).
"""
import base64
import requests

# Rasmiy bepul Judge0 CE instance (API key shart emas)
JUDGE0_PUBLIC_URL = "https://ce.judge0.com"
# RapidAPI orqali (API key bo'lsa)
JUDGE0_RAPIDAPI_URL = "https://judge0-ce.p.rapidapi.com"

# Til ID lari (Judge0 CE)
LANGUAGE_IDS = {
    'python':     71,   # Python 3.8.1
    'python3':    71,
    'javascript': 63,   # JavaScript (Node.js 12.14.0)
    'js':         63,
    'typescript': 74,   # TypeScript 3.7.4
    'ts':         74,
    'java':       62,   # Java (OpenJDK 13.0.1)
    'cpp':        54,   # C++ (GCC 9.2.0)
    'c++':        54,
    'c':          50,   # C (GCC 9.2.0)
    'csharp':     51,   # C# (Mono 6.6.0.161)
    'c#':         51,
    'go':         60,   # Go (1.13.5)
    'rust':       73,   # Rust (1.40.0)
    'php':        68,   # PHP (7.4.1)
    'ruby':       72,   # Ruby (2.7.0)
    'kotlin':     78,   # Kotlin (1.3.70)
    'swift':      83,   # Swift (5.2.3)
    'bash':       46,   # Bash (5.0.0)
    'r':          80,   # R (4.0.0)
}

STATUS_MAP = {
    1: 'In Queue',
    2: 'Processing',
    3: 'Accepted',
    4: 'Wrong Answer',
    5: 'Time Limit Exceeded',
    6: 'Compilation Error',
    7: 'Runtime Error (SIGSEGV)',
    8: 'Runtime Error (SIGXFSZ)',
    9: 'Runtime Error (SIGFPE)',
    10: 'Runtime Error (SIGABRT)',
    11: 'Runtime Error (NZEC)',
    12: 'Runtime Error (Other)',
    13: 'Internal Error',
    14: 'Exec Format Error',
}


def is_supported(language: str) -> bool:
    return str(language or '').lower() in LANGUAGE_IDS


def get_judge0_credentials():
    from django.conf import settings
    api_key = getattr(settings, 'JUDGE0_API_KEY', '')
    if api_key:
        base_url = JUDGE0_RAPIDAPI_URL
        headers = {
            'Content-Type': 'application/json',
            'X-RapidAPI-Key': api_key,
            'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com',
        }
    else:
        base_url = getattr(settings, 'JUDGE0_URL', JUDGE0_PUBLIC_URL)
        headers = {'Content-Type': 'application/json'}
    return base_url, headers


def submit_code_batch(submissions: list, timeout: int = 10) -> dict:
    """
    Submits a batch of code runs to Judge0 and returns their tokens.
    Returns a dict: {'ok': True, 'tokens': list, 'valid_indices': list} or {'ok': False, 'error': str}
    """
    base_url, headers = get_judge0_credentials()

    batch_submissions = []
    for sub in submissions:
        lang = str(sub.get('language') or '').lower()
        lang_id = LANGUAGE_IDS.get(lang)
        if not lang_id:
            batch_submissions.append(None)
            continue
        
        batch_submissions.append({
            'source_code': base64.b64encode((sub.get('source_code') or '').encode()).decode(),
            'language_id': lang_id,
            'stdin': base64.b64encode((sub.get('stdin') or '').encode()).decode(),
            'cpu_time_limit': min(timeout, 15),
            'memory_limit': 128000,
        })

    valid_indices = [i for i, x in enumerate(batch_submissions) if x is not None]
    if not valid_indices:
        return {'ok': False, 'error': "Qo'llab-quvvatlanmaydigan dasturlash tili yoki bo'sh so'rov"}

    payload = {
        'submissions': [batch_submissions[i] for i in valid_indices]
    }

    try:
        resp = requests.post(
            f"{base_url}/submissions/batch?base64_encoded=true&wait=false",
            json=payload, headers=headers, timeout=20,
        )
        if resp.status_code == 429:
            return {'ok': False, 'error': 'Kod runner limiti tugadi. Biroz kuting va qayta urining.'}
        if resp.status_code in (401, 403):
            return {'ok': False, 'error': 'Kod runner xizmatiga kirish rad etildi.'}
        resp.raise_for_status()

        tokens_data = resp.json()
        if not isinstance(tokens_data, list) or len(tokens_data) != len(valid_indices):
            return {'ok': False, 'error': 'Kod runner tokenlarini olishda xato'}

        tokens = [item.get('token') for item in tokens_data]
        if any(not t for t in tokens):
            return {'ok': False, 'error': "Ayrim kod runner tokenlarini yuklab bo'lmadi"}

        return {'ok': True, 'tokens': tokens, 'valid_indices': valid_indices}

    except requests.exceptions.Timeout:
        return {'ok': False, 'error': 'Kod bajarilishi vaqt limitini oshdi'}
    except requests.exceptions.ConnectionError:
        return {'ok': False, 'error': "Kod runner serveriga ulanib bo'lmadi"}
    except Exception as e:
        return {'ok': False, 'error': f'Kod ishga tushirishda xato: {str(e)[:100]}'}


def check_batch_status(tokens: list, valid_indices: list, total_count: int) -> dict:
    """
    Checks the status of submitted tokens and returns results if all completed.
    Returns:
      {'ok': True, 'status': 'PENDING'} if still processing.
      {'ok': True, 'status': 'COMPLETED', 'results': list} if finished.
      {'ok': False, 'error': str} on error.
    """
    base_url, headers = get_judge0_credentials()
    tokens_str = ",".join(tokens)
    
    try:
        r = requests.get(
            f"{base_url}/submissions/batch?tokens={tokens_str}&base64_encoded=true",
            headers=headers, timeout=10,
        )
        r.raise_for_status()
        batch_result = r.json()
        subs = batch_result.get('submissions') or []
        
        if not subs or len(subs) != len(valid_indices):
            return {'ok': False, 'error': 'Natijalarni olishda xato yuz berdi'}
            
        # Check if any is still processing/in queue (status 1 or 2)
        if any(item.get('status', {}).get('id', 0) in (1, 2) for item in subs):
            return {'ok': True, 'status': 'PENDING'}
            
        # Decode and structure results
        def decode(val):
            if not val:
                return ''
            try:
                return base64.b64decode(val).decode('utf-8', errors='replace')
            except Exception:
                return str(val)

        results = [{'ok': False, 'error': "Dasturlash tili qo'llab-quvvatlanmaydi"} for _ in range(total_count)]
        for idx, item in enumerate(subs):
            orig_idx = valid_indices[idx]
            status_id = item.get('status', {}).get('id', 0)
            status_desc = STATUS_MAP.get(status_id) or item.get('status', {}).get('description', 'Unknown')
            results[orig_idx] = {
                'ok': True,
                'stdout': decode(item.get('stdout', '')),
                'stderr': decode(item.get('stderr', '')),
                'compile_output': decode(item.get('compile_output', '')),
                'status': status_desc,
                'time': float(item.get('time') or 0),
                'memory': int(item.get('memory') or 0),
            }
        return {'ok': True, 'status': 'COMPLETED', 'results': results}

    except Exception as e:
        return {'ok': False, 'error': f"Status tekshirishda xatolik: {str(e)[:100]}"}
