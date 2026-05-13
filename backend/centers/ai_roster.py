import base64
import json
import logging
import re
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from difflib import SequenceMatcher

from django.conf import settings
from django.core.exceptions import PermissionDenied, ValidationError

from notifications.models import Notification
from accounts.utils import normalize_phone

from .models import CenterMembership, EducationCenter
from .services import decide_membership


logger = logging.getLogger('centers.ai_roster')

WORD_RE = re.compile(r"[A-Za-zÀ-ÿĀ-žА-Яа-яЁёЎўҚқҒғҲҳʻʼ'`-]+")
LINE_PREFIX_RE = re.compile(r"^\s*(?:\d+|[IVXLC]+|[A-Za-z])[\).\-\s]+", re.IGNORECASE)
PHONE_CANDIDATE_RE = re.compile(r"\+?\d[\d\s().-]{8,}\d")
APPROVAL_CODE_RE = re.compile(r"\b(?:kod|code|id)\s*[:#-]?\s*([A-Za-z0-9]{4,16})\b", re.IGNORECASE)
STOP_WORDS = {
    'ism', 'ismi', 'familiya', 'familya', 'sharif', 'otasining', 'otasi',
    'fish', 'fio', 'f.i.sh', 'telefon', 'raqam', 'sinf', 'guruh', 'royxat',
    "ro'yxat", 'jadval', 'student', 'oquvchi', "o'quvchi",
}


def canonical_name(value):
    text = unicodedata.normalize('NFKC', str(value or '')).lower()
    text = text.replace('ʻ', "'").replace('ʼ', "'").replace('`', "'")
    words = []
    for word in WORD_RE.findall(text):
        cleaned = re.sub(r"['`\-]", '', word)
        if cleaned:
            words.append(cleaned)
    return ' '.join(words)


def _token_set(value):
    return tuple(sorted(canonical_name(value).split()))


def _looks_like_name(value):
    canonical = canonical_name(value)
    tokens = canonical.split()
    if len(tokens) < 2 or len(tokens) > 5:
        return False
    if any(len(token) < 2 for token in tokens):
        return False
    if any(token in STOP_WORDS for token in tokens):
        return False
    return True


MAX_TEXT_INPUT_BYTES = 32 * 1024  # 32 KB
MAX_IMAGE_INPUT_BYTES = 5 * 1024 * 1024  # 5 MB


def parse_roster_entries_from_text(text):
    """Conservative line-based parser for typed/pasted roster rows."""
    raw_text = str(text or '').replace('\r', '\n')
    # DoS himoyasi: regex har bir satrda ishlatiladi va katta input bilan
    # backtracking xavfli bo'lishi mumkin. 32 KB dan oshig'ini kesib
    # tashlaymiz — bu real ro'yxatlar uchun yetarlidan ko'p (bir ism ~50
    # bayt, demak ~600 ism).
    if len(raw_text) > MAX_TEXT_INPUT_BYTES:
        raw_text = raw_text[:MAX_TEXT_INPUT_BYTES]
    # Semicolon separated names are common in copied lists; commas are too
    # ambiguous for names, so we only split them when line breaks are absent.
    if '\n' not in raw_text and ';' in raw_text:
        raw_lines = raw_text.split(';')
    else:
        raw_lines = raw_text.split('\n')

    entries = []
    seen = set()
    for raw_line in raw_lines:
        phone = ''
        phone_match = PHONE_CANDIDATE_RE.search(raw_line)
        if phone_match:
            phone = normalize_phone(phone_match.group(0))
        code = ''
        code_match = APPROVAL_CODE_RE.search(raw_line)
        if code_match:
            code = code_match.group(1).upper()
        line = LINE_PREFIX_RE.sub('', raw_line).strip()
        line = PHONE_CANDIDATE_RE.sub(' ', line)
        line = APPROVAL_CODE_RE.sub(' ', line)
        line = re.sub(r"\+?\d[\d\s().-]{5,}", ' ', line)
        words = WORD_RE.findall(line)
        if not words:
            continue
        candidate = ' '.join(words[:5])
        if not _looks_like_name(candidate):
            continue
        key = canonical_name(candidate)
        if key in seen:
            continue
        seen.add(key)
        entries.append({
            'full_name': candidate,
            'phone': phone,
            'approval_code': code,
        })
    return _dedupe_entries(entries)


def parse_roster_names_from_text(text):
    """Backward-compatible helper used by older tests."""
    return [entry['full_name'] for entry in parse_roster_entries_from_text(text)]


def _json_from_ai_text(text):
    cleaned = str(text or '').strip()
    if cleaned.startswith('```'):
        cleaned = re.sub(r"^```(?:json)?\s*", '', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", '', cleaned)
    return json.loads(cleaned)


def _openai_extract_names_from_image(image_bytes, mime_type, caption=''):
    api_keys = list(getattr(settings, 'AI_ROSTER_OPENAI_API_KEYS', []) or [])
    single_key = getattr(settings, 'AI_ROSTER_OPENAI_API_KEY', '')
    if single_key:
        api_keys.append(single_key)
    api_keys = list(dict.fromkeys(key for key in api_keys if key))
    if not api_keys:
        return {
            'ok': False,
            'error': "OpenAI API kaliti sozlanmagan.",
            'names': [],
            'provider': 'openai',
            'missing_key': True,
        }
    data_url = f"data:{mime_type or 'image/jpeg'};base64,{base64.b64encode(image_bytes).decode('ascii')}"
    schema = {
        'type': 'object',
        'additionalProperties': False,
        'properties': {
            'students': {
                'type': 'array',
                'items': {
                    'type': 'object',
                    'additionalProperties': False,
                    'properties': {
                        'full_name': {
                            'type': 'string',
                            'description': "Student full name only, without numbering or extra columns.",
                        },
                        'phone': {
                            'type': 'string',
                            'description': "Visible phone number for this student, or empty string.",
                        },
                        'approval_code': {
                            'type': 'string',
                            'description': "Visible approval/code/id for this student, or empty string.",
                        },
                    },
                    'required': ['full_name', 'phone', 'approval_code'],
                },
            },
        },
        'required': ['students'],
    }
    prompt = (
        "Rasmdagi yoki skrinshotdagi o'quvchilar ro'yxatidan faqat F.I.Sh. "
        "to'liq ismlarini ajratib ber. Agar telefon raqam yoki kod/id ko'rinsa, "
        "ularni ham shu o'quvchi qatoriga yoz; ko'rinmasa bo'sh string qaytar. "
        "Sinf, tartib raqami, ball, sarlavha va izohlarni chiqarma. "
        "Natijani faqat JSON schema bo'yicha qaytar."
    )
    if caption:
        prompt += f"\nQo'shimcha caption: {caption[:1000]}"
    payload = {
        'model': getattr(settings, 'AI_ROSTER_MODEL', 'gpt-4o-mini'),
        'input': [{
            'role': 'user',
            'content': [
                {'type': 'input_text', 'text': prompt},
                {'type': 'input_image', 'image_url': data_url},
            ],
        }],
        'text': {
            'format': {
                'type': 'json_schema',
                'name': 'student_roster_names',
                'schema': schema,
                'strict': True,
            },
        },
    }
    raw = None
    last_error = ''
    body = json.dumps(payload).encode('utf-8')
    for index, api_key in enumerate(api_keys, start=1):
        req = urllib.request.Request(
            'https://api.openai.com/v1/responses',
            data=body,
            method='POST',
            headers={
                'Authorization': f'Bearer {api_key}',
                'Content-Type': 'application/json',
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                raw = json.loads(response.read().decode('utf-8'))
            if index > 1:
                logger.info('OpenAI roster extraction succeeded with fallback key #%s', index)
            break
        except urllib.error.HTTPError as exc:
            status = getattr(exc, 'code', 0)
            last_error = f'HTTP {status}'
            logger.warning('OpenAI roster key #%s failed: %s', index, last_error)
            if status not in (401, 403, 408, 409, 429, 500, 502, 503, 504):
                break
        except Exception as exc:
            last_error = exc.__class__.__name__
            logger.warning('OpenAI roster key #%s failed: %s', index, last_error)
    if raw is None:
        logger.error('OpenAI roster extraction failed for all configured keys: %s', last_error)
        return {'ok': False, 'error': "OpenAI rasmni o'qiy olmadi.", 'names': [], 'provider': 'openai'}

    text = raw.get('output_text') or ''
    if not text:
        chunks = []
        for item in raw.get('output') or []:
            for content in item.get('content') or []:
                if content.get('type') in ('output_text', 'text'):
                    chunks.append(content.get('text') or '')
        text = ''.join(chunks)
    try:
        parsed = _json_from_ai_text(text)
    except (TypeError, ValueError):
        logger.warning('OpenAI roster response was not JSON: %s', text[:500])
        return {'ok': False, 'error': "OpenAI javobi tushunarsiz bo'ldi.", 'names': [], 'provider': 'openai'}

    entries = _dedupe_entries([
        {
            'full_name': item.get('full_name', '').strip(),
            'phone': normalize_phone(item.get('phone', '')),
            'approval_code': str(item.get('approval_code') or '').strip().upper(),
        }
        for item in (parsed.get('students') or [])
        if isinstance(item, dict) and _looks_like_name(item.get('full_name', ''))
    ])
    return {
        'ok': True,
        'error': '',
        'entries': entries,
        'names': [entry['full_name'] for entry in entries],
        'provider': 'openai',
    }


def _openai_extract_names_from_text(text):
    api_keys = list(getattr(settings, 'AI_ROSTER_OPENAI_API_KEYS', []) or [])
    single_key = getattr(settings, 'AI_ROSTER_OPENAI_API_KEY', '')
    if single_key:
        api_keys.append(single_key)
    api_keys = list(dict.fromkeys(key for key in api_keys if key))
    if not api_keys:
        return {
            'ok': False,
            'error': "OpenAI API kaliti sozlanmagan.",
            'entries': [],
            'names': [],
            'provider': 'openai',
            'missing_key': True,
        }
    schema = {
        'type': 'object',
        'additionalProperties': False,
        'properties': {
            'students': {
                'type': 'array',
                'items': {
                    'type': 'object',
                    'additionalProperties': False,
                    'properties': {
                        'full_name': {'type': 'string'},
                        'phone': {'type': 'string'},
                        'approval_code': {'type': 'string'},
                    },
                    'required': ['full_name', 'phone', 'approval_code'],
                },
            },
        },
        'required': ['students'],
    }
    prompt = (
        "Quyidagi matndan faqat o'quvchilar ro'yxatini ajrat. "
        "Har bir o'quvchi uchun F.I.Sh., ko'rinsa telefon raqam va kod/id ni qaytar. "
        "Sarlavha, izoh, fan, sinf, ball va boshqa ustunlarni chiqarmagin. "
        "Agar o'quvchi topilmasa bo'sh students array qaytar.\n\n"
        f"Matn:\n{str(text or '')[:24000]}"
    )
    payload = {
        'model': getattr(settings, 'AI_ROSTER_MODEL', 'gpt-4o-mini'),
        'input': [{
            'role': 'user',
            'content': [{'type': 'input_text', 'text': prompt}],
        }],
        'text': {
            'format': {
                'type': 'json_schema',
                'name': 'student_roster_text_names',
                'schema': schema,
                'strict': True,
            },
        },
        'max_output_tokens': 5000,
    }
    body = json.dumps(payload).encode('utf-8')
    raw = None
    last_error = ''
    for index, api_key in enumerate(api_keys, start=1):
        req = urllib.request.Request(
            'https://api.openai.com/v1/responses',
            data=body,
            method='POST',
            headers={
                'Authorization': f'Bearer {api_key}',
                'Content-Type': 'application/json',
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=35) as response:
                raw = json.loads(response.read().decode('utf-8'))
            if index > 1:
                logger.info('OpenAI text roster extraction succeeded with fallback key #%s', index)
            break
        except urllib.error.HTTPError as exc:
            status = getattr(exc, 'code', 0)
            last_error = f'HTTP {status}'
            logger.warning('OpenAI text roster key #%s failed: %s', index, last_error)
            if status not in (401, 403, 408, 409, 429, 500, 502, 503, 504):
                break
        except Exception as exc:
            last_error = exc.__class__.__name__
            logger.warning('OpenAI text roster key #%s failed: %s', index, last_error)
    if raw is None:
        logger.error('OpenAI text roster extraction failed for all configured keys: %s', last_error)
        return {'ok': False, 'error': "OpenAI matnni o'qiy olmadi.", 'entries': [], 'names': [], 'provider': 'openai'}

    text_out = raw.get('output_text') or ''
    if not text_out:
        chunks = []
        for item in raw.get('output') or []:
            for content in item.get('content') or []:
                if content.get('type') in ('output_text', 'text'):
                    chunks.append(content.get('text') or '')
        text_out = ''.join(chunks)
    try:
        parsed = _json_from_ai_text(text_out)
    except (TypeError, ValueError):
        logger.warning('OpenAI text roster response was not JSON: %s', text_out[:500])
        return {'ok': False, 'error': "OpenAI javobi tushunarsiz bo'ldi.", 'entries': [], 'names': [], 'provider': 'openai'}

    entries = _dedupe_entries([
        {
            'full_name': item.get('full_name', '').strip(),
            'phone': normalize_phone(item.get('phone', '')),
            'approval_code': str(item.get('approval_code') or '').strip().upper(),
        }
        for item in (parsed.get('students') or [])
        if isinstance(item, dict) and _looks_like_name(item.get('full_name', ''))
    ])
    return {
        'ok': True,
        'error': '',
        'entries': entries,
        'names': [entry['full_name'] for entry in entries],
        'provider': 'openai',
    }


def _gemini_extract_names_from_text(text):
    api_keys = list(getattr(settings, 'AI_ROSTER_GEMINI_API_KEYS', []) or [])
    single_key = getattr(settings, 'AI_ROSTER_GEMINI_API_KEY', '')
    if single_key:
        api_keys.append(single_key)
    api_keys = list(dict.fromkeys(key for key in api_keys if key))
    if not api_keys:
        return {'ok': False, 'error': "Gemini API kaliti sozlanmagan.", 'entries': [], 'names': [], 'provider': 'gemini', 'missing_key': True}
    prompt = (
        "Quyidagi matndan faqat o'quvchilar ro'yxatini ajrat. "
        "Har bir o'quvchi uchun F.I.Sh., ko'rinsa telefon raqam va kod/id ni qaytar. "
        "Sarlavha, izoh, fan, sinf, ball va boshqa ustunlarni chiqarmagin. "
        "Agar o'quvchi topilmasa bo'sh students array qaytar.\n\n"
        f"Matn:\n{str(text or '')[:24000]}"
    )
    schema = {
        'type': 'OBJECT',
        'properties': {
            'students': {
                'type': 'ARRAY',
                'items': {
                    'type': 'OBJECT',
                    'properties': {
                        'full_name': {'type': 'STRING'},
                        'phone': {'type': 'STRING'},
                        'approval_code': {'type': 'STRING'},
                    },
                    'required': ['full_name', 'phone', 'approval_code'],
                },
            },
        },
        'required': ['students'],
    }
    payload = {
        'contents': [{'role': 'user', 'parts': [{'text': prompt}]}],
        'generationConfig': {'responseMimeType': 'application/json', 'responseSchema': schema},
    }
    body = json.dumps(payload).encode('utf-8')
    model = getattr(settings, 'AI_ROSTER_GEMINI_MODEL', 'gemini-2.5-flash')
    raw = None
    last_error = ''
    for index, api_key in enumerate(api_keys, start=1):
        model_path = urllib.parse.quote(model, safe='-_.~/')
        url = f'https://generativelanguage.googleapis.com/v1beta/models/{model_path}:generateContent?key={urllib.parse.quote(api_key)}'
        req = urllib.request.Request(url, data=body, method='POST', headers={'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=35) as response:
                raw = json.loads(response.read().decode('utf-8'))
            if index > 1:
                logger.info('Gemini text roster succeeded with fallback key #%s', index)
            break
        except urllib.error.HTTPError as exc:
            status = getattr(exc, 'code', 0)
            last_error = f'HTTP {status}'
            logger.warning('Gemini text roster key #%s failed: %s', index, last_error)
            if status not in (400, 401, 403, 408, 409, 429, 500, 502, 503, 504):
                break
        except Exception as exc:
            last_error = exc.__class__.__name__
            logger.warning('Gemini text roster key #%s failed: %s', index, last_error)
    if raw is None:
        return {'ok': False, 'error': "Gemini matnni o'qiy olmadi.", 'entries': [], 'names': [], 'provider': 'gemini'}
    parts = (((raw.get('candidates') or [{}])[0].get('content') or {}).get('parts') or [])
    text_out = ''.join(part.get('text') or '' for part in parts)
    try:
        parsed = _json_from_ai_text(text_out)
    except (TypeError, ValueError):
        return {'ok': False, 'error': "Gemini javobi tushunarsiz bo'ldi.", 'entries': [], 'names': [], 'provider': 'gemini'}
    entries = _dedupe_entries([
        {'full_name': item.get('full_name', '').strip(), 'phone': normalize_phone(item.get('phone', '')), 'approval_code': str(item.get('approval_code') or '').strip().upper()}
        for item in (parsed.get('students') or [])
        if isinstance(item, dict) and _looks_like_name(item.get('full_name', ''))
    ])
    return {'ok': True, 'error': '', 'entries': entries, 'names': [e['full_name'] for e in entries], 'provider': 'gemini'}


def _gemini_extract_names_from_pdf_bytes(pdf_bytes):
    """Skan PDF uchun — Gemini vision bilan PDF baytlardan ism olish."""
    api_keys = list(getattr(settings, 'AI_ROSTER_GEMINI_API_KEYS', []) or [])
    single_key = getattr(settings, 'AI_ROSTER_GEMINI_API_KEY', '')
    if single_key:
        api_keys.append(single_key)
    api_keys = list(dict.fromkeys(key for key in api_keys if key))
    if not api_keys:
        return {'ok': False, 'error': "Gemini API kaliti sozlanmagan.", 'entries': [], 'names': [], 'provider': 'gemini', 'missing_key': True}
    prompt = (
        "Bu PDF fayldan faqat o'quvchilar ro'yxatini ajrat. "
        "Har bir o'quvchi uchun F.I.Sh., ko'rinsa telefon raqam va kod/id ni qaytar. "
        "Sarlavha, izoh, fan, sinf, ball va boshqa ustunlarni chiqarmagin. "
        "Agar o'quvchi topilmasa bo'sh students array qaytar."
    )
    schema = {
        'type': 'OBJECT',
        'properties': {
            'students': {
                'type': 'ARRAY',
                'items': {
                    'type': 'OBJECT',
                    'properties': {
                        'full_name': {'type': 'STRING'},
                        'phone': {'type': 'STRING'},
                        'approval_code': {'type': 'STRING'},
                    },
                    'required': ['full_name', 'phone', 'approval_code'],
                },
            },
        },
        'required': ['students'],
    }
    payload = {
        'contents': [{'role': 'user', 'parts': [
            {'text': prompt},
            {'inlineData': {'mimeType': 'application/pdf', 'data': base64.b64encode(pdf_bytes).decode('ascii')}},
        ]}],
        'generationConfig': {'responseMimeType': 'application/json', 'responseSchema': schema},
    }
    body = json.dumps(payload).encode('utf-8')
    model = getattr(settings, 'AI_ROSTER_GEMINI_MODEL', 'gemini-2.5-flash')
    raw = None
    last_error = ''
    for index, api_key in enumerate(api_keys, start=1):
        model_path = urllib.parse.quote(model, safe='-_.~/')
        url = f'https://generativelanguage.googleapis.com/v1beta/models/{model_path}:generateContent?key={urllib.parse.quote(api_key)}'
        req = urllib.request.Request(url, data=body, method='POST', headers={'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=60) as response:
                raw = json.loads(response.read().decode('utf-8'))
            break
        except urllib.error.HTTPError as exc:
            status = getattr(exc, 'code', 0)
            last_error = f'HTTP {status}'
            logger.warning('Gemini PDF vision roster key #%s failed: %s', index, last_error)
            if status not in (400, 401, 403, 408, 409, 429, 500, 502, 503, 504):
                break
        except Exception as exc:
            last_error = exc.__class__.__name__
            logger.warning('Gemini PDF vision roster key #%s failed: %s', index, last_error)
    if raw is None:
        return {'ok': False, 'error': "Gemini PDFni o'qiy olmadi.", 'entries': [], 'names': [], 'provider': 'gemini'}
    parts = (((raw.get('candidates') or [{}])[0].get('content') or {}).get('parts') or [])
    text_out = ''.join(part.get('text') or '' for part in parts)
    try:
        parsed = _json_from_ai_text(text_out)
    except (TypeError, ValueError):
        return {'ok': False, 'error': "Gemini PDF javobi tushunarsiz bo'ldi.", 'entries': [], 'names': [], 'provider': 'gemini'}
    entries = _dedupe_entries([
        {'full_name': item.get('full_name', '').strip(), 'phone': normalize_phone(item.get('phone', '')), 'approval_code': str(item.get('approval_code') or '').strip().upper()}
        for item in (parsed.get('students') or [])
        if isinstance(item, dict) and _looks_like_name(item.get('full_name', ''))
    ])
    return {'ok': True, 'error': '', 'entries': entries, 'names': [e['full_name'] for e in entries], 'provider': 'gemini'}


def _gemini_extract_names_from_image(image_bytes, mime_type, caption=''):
    api_keys = list(getattr(settings, 'AI_ROSTER_GEMINI_API_KEYS', []) or [])
    single_key = getattr(settings, 'AI_ROSTER_GEMINI_API_KEY', '')
    if single_key:
        api_keys.append(single_key)
    api_keys = list(dict.fromkeys(key for key in api_keys if key))
    if not api_keys:
        return {
            'ok': False,
            'error': "Gemini API kaliti sozlanmagan.",
            'names': [],
            'provider': 'gemini',
            'missing_key': True,
        }
    prompt = (
        "Rasmdagi yoki skrinshotdagi o'quvchilar ro'yxatidan faqat F.I.Sh. "
        "to'liq ismlarini ajratib ber. Agar telefon raqam yoki kod/id ko'rinsa, "
        "ularni ham shu o'quvchi qatoriga yoz; ko'rinmasa bo'sh string qaytar. "
        "Sinf, tartib raqami, ball, sarlavha va izohlarni chiqarma. Faqat JSON qaytar: "
        '{"students":[{"full_name":"Familiya Ism Otasining ismi","phone":"+998901234567","approval_code":"ABC123"}]}.'
    )
    if caption:
        prompt += f"\nQo'shimcha caption: {caption[:1000]}"
    schema = {
        'type': 'OBJECT',
        'properties': {
            'students': {
                'type': 'ARRAY',
                'items': {
                    'type': 'OBJECT',
                    'properties': {
                        'full_name': {'type': 'STRING'},
                        'phone': {'type': 'STRING'},
                        'approval_code': {'type': 'STRING'},
                    },
                    'required': ['full_name', 'phone', 'approval_code'],
                },
            },
        },
        'required': ['students'],
    }
    payload = {
        'contents': [{
            'role': 'user',
            'parts': [
                {'text': prompt},
                {
                    'inlineData': {
                        'mimeType': mime_type or 'image/jpeg',
                        'data': base64.b64encode(image_bytes).decode('ascii'),
                    },
                },
            ],
        }],
        'generationConfig': {
            'responseMimeType': 'application/json',
            'responseSchema': schema,
        },
    }
    body = json.dumps(payload).encode('utf-8')
    model = getattr(settings, 'AI_ROSTER_GEMINI_MODEL', 'gemini-1.5-flash')
    raw = None
    last_error = ''
    for index, api_key in enumerate(api_keys, start=1):
        model_path = urllib.parse.quote(model, safe='-_.~/')
        url = f'https://generativelanguage.googleapis.com/v1beta/models/{model_path}:generateContent?key={urllib.parse.quote(api_key)}'
        req = urllib.request.Request(
            url,
            data=body,
            method='POST',
            headers={'Content-Type': 'application/json'},
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                raw = json.loads(response.read().decode('utf-8'))
            if index > 1:
                logger.info('Gemini roster extraction succeeded with fallback key #%s', index)
            break
        except urllib.error.HTTPError as exc:
            status = getattr(exc, 'code', 0)
            last_error = f'HTTP {status}'
            logger.warning('Gemini roster key #%s failed: %s', index, last_error)
            if status not in (400, 401, 403, 408, 409, 429, 500, 502, 503, 504):
                break
        except Exception as exc:
            last_error = exc.__class__.__name__
            logger.warning('Gemini roster key #%s failed: %s', index, last_error)
    if raw is None:
        logger.error('Gemini roster extraction failed for all configured keys: %s', last_error)
        return {'ok': False, 'error': "Gemini rasmni o'qiy olmadi.", 'names': [], 'provider': 'gemini'}

    parts = (((raw.get('candidates') or [{}])[0].get('content') or {}).get('parts') or [])
    text = ''.join(part.get('text') or '' for part in parts)
    try:
        parsed = _json_from_ai_text(text)
    except (TypeError, ValueError):
        logger.warning('Gemini roster response was not JSON: %s', text[:500])
        return {'ok': False, 'error': "Gemini javobi tushunarsiz bo'ldi.", 'names': [], 'provider': 'gemini'}
    entries = _dedupe_entries([
        {
            'full_name': item.get('full_name', '').strip(),
            'phone': normalize_phone(item.get('phone', '')),
            'approval_code': str(item.get('approval_code') or '').strip().upper(),
        }
        for item in (parsed.get('students') or [])
        if isinstance(item, dict) and _looks_like_name(item.get('full_name', ''))
    ])
    return {
        'ok': True,
        'error': '',
        'entries': entries,
        'names': [entry['full_name'] for entry in entries],
        'provider': 'gemini',
    }


def _ai_extract_names_from_image(image_bytes, mime_type, caption=''):
    openai_result = _openai_extract_names_from_image(image_bytes, mime_type, caption=caption)
    if openai_result.get('ok'):
        return openai_result
    gemini_result = _gemini_extract_names_from_image(image_bytes, mime_type, caption=caption)
    if gemini_result.get('ok'):
        logger.info('AI roster extraction used Gemini after OpenAI failed: %s', openai_result.get('error'))
        return gemini_result
    errors = [r.get('error') for r in (openai_result, gemini_result) if r.get('error')]
    return {
        'ok': False,
        'error': ' / '.join(errors) or "AI rasmni o'qiy olmadi.",
        'names': [],
    }


def extract_names_from_payload(text='', image_bytes=None, mime_type='image/jpeg', use_ai_text=False):
    entries = parse_roster_entries_from_text(text)
    if image_bytes:
        # Defensive size check — caller (telegram handler) allaqachon o'lchaydi,
        # lekin bu funksiya to'g'ridan-to'g'ri chaqirilishi mumkin. AI API
        # tomonga juda katta payload yuborib, kvota va xarajatga zarar
        # bermaymiz.
        if len(image_bytes) > MAX_IMAGE_INPUT_BYTES:
            return {
                'ok': False,
                'error': f"Rasm juda katta. Limit: {MAX_IMAGE_INPUT_BYTES // (1024 * 1024)} MB.",
                'entries': entries,
                'names': [entry['full_name'] for entry in entries],
            }
        ai_result = _ai_extract_names_from_image(image_bytes, mime_type, caption=text)
        if ai_result['ok']:
            entries = _dedupe_entries([*entries, *(ai_result.get('entries') or [])])
        elif not entries:
            return ai_result
    elif use_ai_text and text and not entries:
        ai_result = _openai_extract_names_from_text(text)
        if ai_result.get('ok'):
            entries = _dedupe_entries([*entries, *(ai_result.get('entries') or [])])
        else:
            gemini_result = _gemini_extract_names_from_text(text)
            if gemini_result.get('ok'):
                logger.info('Text roster used Gemini after OpenAI failed: %s', ai_result.get('error'))
                entries = _dedupe_entries([*entries, *(gemini_result.get('entries') or [])])
            elif not ai_result.get('missing_key') and not gemini_result.get('missing_key'):
                return gemini_result
    return {
        'ok': True,
        'error': '',
        'entries': entries,
        'names': [entry['full_name'] for entry in entries],
    }


def _dedupe_names(names):
    result = []
    seen = set()
    for name in names:
        if not _looks_like_name(name):
            continue
        key = canonical_name(name)
        if key in seen:
            continue
        seen.add(key)
        result.append(name.strip())
    return result


def _dedupe_entries(entries):
    result = []
    seen = set()
    for entry in entries or []:
        if isinstance(entry, str):
            entry = {'full_name': entry, 'phone': '', 'approval_code': ''}
        name = str(entry.get('full_name') or '').strip()
        if not _looks_like_name(name):
            continue
        phone = normalize_phone(entry.get('phone', ''))
        approval_code = str(entry.get('approval_code') or '').strip().upper()
        key = (canonical_name(name), phone, approval_code)
        if key in seen:
            continue
        seen.add(key)
        result.append({
            'full_name': name,
            'phone': phone,
            'approval_code': approval_code,
        })
    return result


def _manageable_centers(actor):
    # Markazning platforma admin tomonidan tasdiqlanishi shart emas — manager
    # sifatida tayinlangan bo'lishi yetarli. STATUS_APPROVED tekshiruvi faqat
    # membership darajasida qoladi.
    manager_ids = CenterMembership.objects.filter(
        user=actor,
        role=CenterMembership.ROLE_MANAGER,
        status=CenterMembership.STATUS_APPROVED,
    ).values_list('center_id', flat=True)
    owner_ids = EducationCenter.objects.filter(
        owner=actor,
    ).values_list('id', flat=True)
    ids = sorted(set([*manager_ids, *owner_ids]))
    return list(EducationCenter.objects.filter(id__in=ids).order_by('name'))


def _single_center_for_actor(actor):
    centers = _manageable_centers(actor)
    if len(centers) == 1:
        return centers[0], ''
    if len(centers) > 1:
        return None, "Bir nechta markazga ulangan accountsiz auto-tasdiq xavfsiz emas. Avval sayt orqali markazni tanlang."
    return None, "Sizda tasdiqlangan manager/direktor markazi topilmadi."


def _match_score(roster_name, pending_name):
    roster_key = _token_set(roster_name)
    pending_key = _token_set(pending_name)
    if len(roster_key) < 2 or len(pending_key) < 2:
        return 0.0
    if roster_key == pending_key:
        return 1.0
    # Near match is intentionally strict: it catches minor apostrophe/hyphen
    # differences but avoids approving different students with similar names.
    roster_set = set(roster_key)
    pending_set = set(pending_key)
    overlap = len(roster_set & pending_set)
    if overlap < min(len(roster_set), len(pending_set)):
        return 0.0
    return SequenceMatcher(None, ' '.join(roster_key), ' '.join(pending_key)).ratio()


def _entries_from_payload(names_or_entries):
    entries = []
    for item in names_or_entries or []:
        if isinstance(item, dict):
            entries.append(item)
        else:
            entries.append({'full_name': str(item or ''), 'phone': '', 'approval_code': ''})
    return _dedupe_entries(entries)


def _membership_identifier_matches(membership, phone='', approval_code=''):
    phone = normalize_phone(phone)
    approval_code = str(approval_code or '').strip().upper()
    if not phone and not approval_code:
        return False
    if phone and membership.user.normalized_phone != phone:
        return False
    if approval_code and (membership.approval_code or '').upper() != approval_code:
        return False
    return True


def approve_roster_names(actor, names, source='telegram_ai_roster'):
    entries = _entries_from_payload(names)
    if not getattr(settings, 'AI_ROSTER_AUTO_APPROVE', True):
        return {
            'ok': False,
            'error': 'AI auto-tasdiq serverda o‘chirilgan.',
            'center': None,
            'extracted': len(entries),
            'approved': [],
            'ambiguous': [],
            'not_found': [],
        }
    max_names = getattr(settings, 'AI_ROSTER_MAX_NAMES', 200)
    if not entries:
        return {
            'ok': False,
            'error': "Ro'yxatdan ismlar topilmadi.",
            'center': None,
            'extracted': 0,
            'approved': [],
            'ambiguous': [],
            'not_found': [],
        }
    if len(entries) > max_names:
        return {
            'ok': False,
            'error': f"Ro'yxatda {len(entries)} ta ism bor. Limit: {max_names}.",
            'center': None,
            'extracted': len(entries),
            'approved': [],
            'ambiguous': [],
            'not_found': [],
        }

    center, center_error = _single_center_for_actor(actor)
    if center_error:
        return {
            'ok': False,
            'error': center_error,
            'center': None,
            'extracted': len(entries),
            'approved': [],
            'ambiguous': [],
            'not_found': [],
        }

    pending = list(
        CenterMembership.objects
        .select_related('user', 'center')
        .filter(
            center=center,
            role=CenterMembership.ROLE_STUDENT,
            status=CenterMembership.STATUS_PENDING,
        )
    )
    threshold = getattr(settings, 'AI_ROSTER_MIN_CONFIDENCE', 0.98)
    approved = []
    ambiguous = []
    not_found = []
    claimed_membership_ids = set()

    for entry in entries:
        name = entry['full_name']
        phone = entry.get('phone') or ''
        approval_code = entry.get('approval_code') or ''
        if not phone and not approval_code:
            if not getattr(settings, 'AI_ROSTER_ALLOW_NAME_ONLY_APPROVAL', True):
                ambiguous.append(name)
                continue
            candidates = [
                (_match_score(name, membership.user.full_name), membership)
                for membership in pending
            ]
            # Name-only approval is useful for manager bot rosters, but it must
            # stay strict: one clear pending match only, no guessing.
            candidates = [
                pair for pair in candidates
                if pair[0] >= threshold and pair[1].id not in claimed_membership_ids
            ]
            candidates.sort(key=lambda pair: pair[0], reverse=True)
            unique_ids = {membership.id for _, membership in candidates}
            if len(unique_ids) != 1:
                if candidates:
                    ambiguous.append(name)
                else:
                    not_found.append(name)
                continue
            membership = candidates[0][1]
            try:
                membership = decide_membership(membership, actor, 'approved')
            except (PermissionDenied, ValidationError):
                logger.exception('AI roster approval skipped membership=%s actor=%s', membership.id, actor.id)
                ambiguous.append(name)
                continue
            claimed_membership_ids.add(membership.id)
            approved.append({
                'name': membership.user.full_name,
                'phone': membership.user.normalized_phone,
                'membership_id': membership.id,
            })
            continue
        candidates = []
        for membership in pending:
            if not _membership_identifier_matches(membership, phone, approval_code):
                continue
            score = _match_score(name, membership.user.full_name)
            if score >= threshold:
                candidates.append((score, membership))
        candidates.sort(key=lambda pair: pair[0], reverse=True)
        unique_ids = {membership.id for _, membership in candidates}
        if len(unique_ids) != 1:
            if candidates:
                ambiguous.append(name)
            else:
                not_found.append(name)
            continue
        membership = candidates[0][1]
        if membership.id in claimed_membership_ids:
            ambiguous.append(name)
            continue
        try:
            membership = decide_membership(membership, actor, 'approved')
        except (PermissionDenied, ValidationError):
            logger.exception('AI roster approval skipped membership=%s actor=%s', membership.id, actor.id)
            ambiguous.append(name)
            continue
        claimed_membership_ids.add(membership.id)
        approved.append({
            'name': membership.user.full_name,
            'phone': membership.user.normalized_phone,
            'membership_id': membership.id,
        })

    Notification.objects.create(
        user=actor,
        center=center,
        type=getattr(Notification, 'TYPE_AI_ROSTER_APPROVAL', 'ai_roster_approval'),
        title='AI ro‘yxat tekshiruvi',
        message=(
            f"{source}: {len(entries)} ta ism tekshirildi. "
            f"{len(approved)} ta auto-tasdiqlandi, "
            f"{len(ambiguous)} ta aniqlik talab qiladi, "
            f"{len(not_found)} ta pending arizadan topilmadi."
        ),
    )
    return {
        'ok': True,
        'error': '',
        'center': center,
        'extracted': len(entries),
        'approved': approved,
        'ambiguous': ambiguous,
        'not_found': not_found,
    }


def format_approval_summary(summary):
    if not summary.get('ok'):
        return f"⚠ {summary.get('error') or 'AI ro‘yxatni tekshira olmadi.'}"
    center = summary.get('center')
    lines = [
        f"AI ro'yxat tekshirildi: {center.name if center else 'Markaz'}",
        f"Topilgan ismlar: {summary.get('extracted', 0)}",
        f"✅ Auto-tasdiqlandi: {len(summary.get('approved') or [])}",
        f"⚠ Aniqlik kerak: {len(summary.get('ambiguous') or [])}",
        f"🔎 Pending arizadan topilmadi: {len(summary.get('not_found') or [])}",
    ]
    approved_names = [item['name'] for item in (summary.get('approved') or [])[:10]]
    if approved_names:
        lines.append('')
        lines.append('Tasdiqlanganlar:')
        lines.extend(f"- {name}" for name in approved_names)
    if len(summary.get('approved') or []) > 10:
        lines.append(f"... yana {len(summary['approved']) - 10} ta")
    if summary.get('ambiguous'):
        lines.append('')
        lines.append("Qo'lda tekshirish kerak:")
        lines.extend(f"- {name}" for name in summary['ambiguous'][:8])
    return '\n'.join(lines)


ROSTER_CACHE_TTL = 7 * 24 * 60 * 60  # 7 kun


def _roster_cache_key(center_id):
    return f'center_roster:{center_id}'


def save_center_roster(center_id, entries):
    from django.core.cache import cache
    if not entries or not center_id:
        return
    cache.set(_roster_cache_key(center_id), entries, timeout=ROSTER_CACHE_TTL)
    logger.info('Saved %d roster entries for center %s', len(entries), center_id)


def get_center_roster(center_id):
    from django.core.cache import cache
    return cache.get(_roster_cache_key(center_id)) or []


def try_auto_approve_from_roster(center, membership):
    """Roster cache'da o'quvchi topilsa tasdiqlab True qaytaradi."""
    entries = get_center_roster(center.id)
    if not entries:
        return False
    user = membership.user
    user_name = str(user.full_name or '')
    user_phone = str(user.normalized_phone or '')
    threshold = getattr(settings, 'AI_ROSTER_MIN_CONFIDENCE', 0.98)
    membership_code = str(membership.approval_code or '').strip().upper()
    for entry in entries:
        entry_phone = str(entry.get('phone') or '')
        entry_code = str(entry.get('approval_code') or '').strip().upper()
        # Telefon raqam bo'yicha — eng ishonchli
        if entry_phone and user_phone and entry_phone == user_phone:
            _do_auto_approve(center, membership)
            return True
        # Kod bo'yicha
        if entry_code and membership_code and entry_code == membership_code:
            _do_auto_approve(center, membership)
            return True
        # Ism bo'yicha — faqat yuqori ishonchlilik
        score = _match_score(entry.get('full_name', ''), user_name)
        if score >= threshold:
            _do_auto_approve(center, membership)
            return True
    return False


def _do_auto_approve(center, membership):
    try:
        actor = center.owner or membership.user
        decide_membership(membership, actor, 'approved')
        logger.info('Auto-approved membership %s from roster cache', membership.id)
    except Exception:
        logger.exception('Auto-approve from roster failed for membership %s', membership.id)
