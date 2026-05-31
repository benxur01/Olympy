"""Kod ishga tushirish servisi — Judge0 CE.

Default: https://ce.judge0.com (bepul, API key shart emas).
JUDGE0_API_KEY o'rnatilsa: RapidAPI Judge0 CE ishlatiladi (ko'proq limit).
"""
import base64
import time

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


def run_code(source_code: str, language: str, stdin: str = '', timeout: int = 10) -> dict:
    """
    Kodni ishga tushiradi.

    Returns: {ok, stdout, stderr, compile_output, status, time, memory, error}
    """
    from django.conf import settings
    api_key = getattr(settings, 'JUDGE0_API_KEY', '')

    lang = str(language or '').lower()
    lang_id = LANGUAGE_IDS.get(lang)
    if not lang_id:
        return {'ok': False, 'error': f"'{language}' tili qo'llab-quvvatlanmaydi"}

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

    payload = {
        'source_code': base64.b64encode((source_code or '').encode()).decode(),
        'language_id': lang_id,
        'stdin': base64.b64encode((stdin or '').encode()).decode(),
        'cpu_time_limit': min(timeout, 15),
        'memory_limit': 128000,
    }

    try:
        resp = requests.post(
            f"{base_url}/submissions?base64_encoded=true&wait=false",
            json=payload, headers=headers, timeout=20,
        )
        if resp.status_code == 429:
            return {'ok': False, 'error': 'Kod runner limiti tugadi. Biroz kuting va qayta urining.'}
        if resp.status_code in (401, 403):
            return {'ok': False, 'error': 'Kod runner xizmatiga kirish rad etildi.'}
        resp.raise_for_status()

        token = resp.json().get('token')
        if not token:
            return {'ok': False, 'error': 'Kod runner tokenini olishda xato'}

        # Natijani polling (max 15 sekund)
        result = {}
        for _ in range(15):
            time.sleep(1)
            r = requests.get(
                f"{base_url}/submissions/{token}?base64_encoded=true",
                headers=headers, timeout=10,
            )
            result = r.json()
            if result.get('status', {}).get('id', 0) not in (1, 2):
                break

        def decode(val):
            if not val:
                return ''
            try:
                return base64.b64decode(val).decode('utf-8', errors='replace')
            except Exception:
                return str(val)

        status_id = result.get('status', {}).get('id', 0)
        status_desc = STATUS_MAP.get(status_id) or result.get('status', {}).get('description', 'Unknown')

        return {
            'ok': True,
            'stdout': decode(result.get('stdout', '')),
            'stderr': decode(result.get('stderr', '')),
            'compile_output': decode(result.get('compile_output', '')),
            'status': status_desc,
            'time': float(result.get('time') or 0),
            'memory': int(result.get('memory') or 0),
        }
    except requests.exceptions.Timeout:
        return {'ok': False, 'error': 'Kod bajarilishi vaqt limitini oshdi'}
    except requests.exceptions.ConnectionError:
        return {'ok': False, 'error': 'Kod runner serveriga ulanib bo\'lmadi'}
    except Exception as e:
        return {'ok': False, 'error': f'Kod ishga tushirishda xato: {str(e)[:100]}'}
