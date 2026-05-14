"""Manager Telegram bot helpers: document roster approval and Q&A."""
import hashlib
import io
import json
import logging
import re
import urllib.error
import urllib.parse
import urllib.request

from django.conf import settings
from django.core.cache import cache

from .ai_roster import (
    _manageable_centers,
    approve_roster_names,
    extract_names_from_payload,
    format_approval_summary,
)
from .models import CenterMembership


logger = logging.getLogger('centers.manager_bot')

MAX_DOCUMENT_TEXT_CHARS = 80_000
MAX_CONTEXT_PENDING_ROWS = 20
DEFAULT_CONVERSATION_TTL_SECONDS = 6 * 60 * 60
DEFAULT_HISTORY_MESSAGES = 8
OPENAI_ERROR_CACHE_SECONDS = 30 * 60
GEMINI_ERROR_CACHE_SECONDS = 30 * 60

APPROVAL_KEYWORDS = (
    'tasdiqla',
    'tasdiqlash',
    'qabul qil',
    'qabulqil',
    'approve',
    'auto-tasdiq',
    'avto tasdiq',
)
ROSTER_KEYWORDS = (
    "ro'yxat",
    'royxat',
    'roster',
    "o'quvchi",
    'oquvchi',
    'student',
    'students',
    'kod',
    'code',
)
MEMORY_CLEAR_KEYWORDS = (
    'xotirani tozala',
    'chatni tozala',
    'suhbatni tozala',
    'eslab qolma',
    'clear chat',
    'reset chat',
)


def _is_pdf(mime_type='', filename=''):
    mime_type = str(mime_type or '').lower()
    filename = str(filename or '').lower()
    return mime_type == 'application/pdf' or filename.endswith('.pdf')


def _is_text_document(mime_type='', filename=''):
    mime_type = str(mime_type or '').lower()
    filename = str(filename or '').lower()
    return (
        mime_type.startswith('text/')
        or mime_type in ('application/json', 'application/csv')
        or filename.endswith(('.txt', '.csv', '.json'))
    )


def _decode_text_bytes(data):
    for encoding in ('utf-8-sig', 'utf-16', 'cp1251', 'latin-1'):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode('utf-8', errors='replace')


def extract_document_text(document_bytes, mime_type='', filename=''):
    """Extract text from manager-uploaded PDF/text documents."""
    if not document_bytes:
        return {'ok': False, 'error': "Fayl bo'sh.", 'text': ''}
    if _is_pdf(mime_type, filename):
        try:
            from pypdf import PdfReader
        except ImportError:
            return {
                'ok': False,
                'error': "PDF o'qish uchun serverda pypdf paketi o'rnatilishi kerak.",
                'text': '',
            }
        try:
            reader = PdfReader(io.BytesIO(document_bytes))
            chunks = []
            for page in reader.pages[:50]:
                chunks.append(page.extract_text() or '')
            text = '\n'.join(chunks).strip()
        except Exception:
            logger.exception('manager bot PDF extraction failed')
            return {'ok': False, 'error': "PDF matnini o'qib bo'lmadi.", 'text': ''}
        if not text:
            from .ai_roster import _gemini_extract_names_from_pdf_bytes
            gemini_result = _gemini_extract_names_from_pdf_bytes(document_bytes)
            if gemini_result.get('ok') and gemini_result.get('entries'):
                return {
                    'ok': True,
                    'error': '',
                    'text': '',
                    'entries': gemini_result['entries'],
                    'via_vision': True,
                }
            return {
                'ok': False,
                'error': "PDFdan matn topilmadi. Gemini ham o'qiy olmadi — boshqa formatda yuboring.",
                'text': '',
            }
        return {'ok': True, 'error': '', 'text': text[:MAX_DOCUMENT_TEXT_CHARS]}
    if _is_text_document(mime_type, filename):
        return {
            'ok': True,
            'error': '',
            'text': _decode_text_bytes(document_bytes)[:MAX_DOCUMENT_TEXT_CHARS],
        }
    return {'ok': False, 'error': "Faqat PDF, TXT, CSV yoki rasm yuboring.", 'text': ''}


def _approval_intent(text, has_file=False):
    lowered = str(text or '').lower()
    if has_file:
        return True
    if any(keyword in lowered for keyword in APPROVAL_KEYWORDS):
        return True
    has_roster_word = any(keyword in lowered for keyword in ROSTER_KEYWORDS)
    has_phone = bool(re.search(r'(?:\+?998)?\d[\d\s().-]{7,}\d', lowered))
    has_code = bool(re.search(r'\b(?:kod|code)\s*[:#-]?\s*[a-z0-9_-]{3,16}\b', lowered, flags=re.IGNORECASE))
    if has_roster_word and (has_phone or has_code):
        return True
    return False


def _strip_approval_words(text):
    cleaned = str(text or '')
    for keyword in APPROVAL_KEYWORDS:
        cleaned = re.sub(re.escape(keyword), ' ', cleaned, flags=re.IGNORECASE)
    return cleaned


def _context_for_actor(actor):
    centers = _manageable_centers(actor)
    center_ids = [center.id for center in centers]
    pending = list(
        CenterMembership.objects
        .select_related('user', 'center')
        .filter(center_id__in=center_ids, status=CenterMembership.STATUS_PENDING)
        .order_by('-created_at')
    )
    approved_students = CenterMembership.objects.filter(
        center_id__in=center_ids,
        role=CenterMembership.ROLE_STUDENT,
        status=CenterMembership.STATUS_APPROVED,
    ).count()
    pending_students = [m for m in pending if m.role == CenterMembership.ROLE_STUDENT]
    pending_staff = [m for m in pending if m.role != CenterMembership.ROLE_STUDENT]
    return {
        'centers': centers,
        'pending': pending,
        'pending_students': pending_students,
        'pending_staff': pending_staff,
        'approved_students_count': approved_students,
    }


def _membership_line(membership):
    user = membership.user
    role_label = {
        CenterMembership.ROLE_STUDENT: "o'quvchi",
        CenterMembership.ROLE_TEACHER: "o'qituvchi",
        CenterMembership.ROLE_MANAGER: 'manager',
    }.get(membership.role, membership.role)
    return (
        f"- {user.full_name} ({role_label}) | {user.normalized_phone} | "
        f"kod: {membership.approval_code or '-'} | {membership.center.name}"
    )


def _format_pending_summary(ctx):
    centers = ctx['centers']
    if not centers:
        return "Sizda tasdiqlangan manager/direktor markazi topilmadi."
    lines = [
        f"Markazlar: {', '.join(center.name for center in centers)}",
        f"Kutilayotgan o'quvchi arizalari: {len(ctx['pending_students'])}",
        f"Kutilayotgan staff arizalari: {len(ctx['pending_staff'])}",
        f"Tasdiqlangan o'quvchilar: {ctx['approved_students_count']}",
    ]
    rows = ctx['pending'][:MAX_CONTEXT_PENDING_ROWS]
    if rows:
        lines.append('')
        lines.append('Oxirgi kutilayotgan arizalar:')
        lines.extend(_membership_line(membership) for membership in rows)
    else:
        lines.append('')
        lines.append("Hozircha kutilayotgan ariza yo'q.")
    return '\n'.join(lines)


def _help_text():
    return (
        "Albatta, yordam beraman.\n\n"
        "Menga PDF, TXT, CSV, rasm yoki oddiy matn ko'rinishida ro'yxat yuborsangiz, "
        "o'quvchi arizalarini tekshiraman. Telefon yoki kod bo'lsa aniqroq topaman; "
        "faqat ism bo'lsa, bitta aniq mos pending ariza topilgandagina tasdiqlayman.\n\n"
        "Masalan: Ali Valiyev +998901234567 tasdiqla\n"
        "Yoki: Kutilayotgan arizalar nechta?"
    )


def _conversation_enabled():
    return bool(getattr(settings, 'AI_MANAGER_BOT_MEMORY_ENABLED', True))


def _history_limit():
    try:
        return max(0, min(int(getattr(settings, 'AI_MANAGER_BOT_HISTORY_MESSAGES', DEFAULT_HISTORY_MESSAGES)), 20))
    except (TypeError, ValueError):
        return DEFAULT_HISTORY_MESSAGES


def _history_ttl():
    try:
        return max(60, int(getattr(settings, 'AI_MANAGER_BOT_MEMORY_TTL_SECONDS', DEFAULT_CONVERSATION_TTL_SECONDS)))
    except (TypeError, ValueError):
        return DEFAULT_CONVERSATION_TTL_SECONDS


def _conversation_cache_key(actor):
    return f'manager_bot:conversation:{getattr(actor, "id", "anon")}'


def _clean_for_history(text, limit=800):
    cleaned = re.sub(r'\s+', ' ', str(text or '')).strip()
    return cleaned[:limit]


def _conversation_history(actor):
    if not _conversation_enabled() or _history_limit() <= 0:
        return []
    history = cache.get(_conversation_cache_key(actor), [])
    return history if isinstance(history, list) else []


def _remember_exchange(actor, user_text, assistant_text):
    if not _conversation_enabled() or _history_limit() <= 0:
        return
    user_text = _clean_for_history(user_text, 800)
    assistant_text = _clean_for_history(assistant_text, 1000)
    if not user_text and not assistant_text:
        return
    history = _conversation_history(actor)
    history.extend([
        {'role': 'manager', 'text': user_text},
        {'role': 'bot', 'text': assistant_text},
    ])
    cache.set(
        _conversation_cache_key(actor),
        history[-_history_limit():],
        timeout=_history_ttl(),
    )


def _clear_conversation(actor):
    cache.delete(_conversation_cache_key(actor))


def _format_history_for_prompt(actor):
    lines = []
    for item in _conversation_history(actor)[-_history_limit():]:
        role = item.get('role')
        label = 'Manager' if role == 'manager' else 'Bot'
        text = _clean_for_history(item.get('text'), 500)
        if text:
            lines.append(f'{label}: {text}')
    return '\n'.join(lines)


def _is_memory_clear_request(text):
    lowered = str(text or '').strip().lower()
    return any(keyword in lowered for keyword in MEMORY_CLEAR_KEYWORDS)


def _compact_text(text):
    return re.sub(r'\s+', ' ', str(text or '').strip().lower())


def _has_any(text, words):
    return any(word in text for word in words)


def _is_help_request(text):
    lowered = _compact_text(text)
    exact = {
        '/help', 'help', 'yordam', 'komanda', 'komandalar', 'buyruq',
        'buyruqlar', 'nima qila olasan',
    }
    return lowered in exact or lowered.startswith('/help ')


def _is_approved_count_request(text):
    lowered = _compact_text(text)
    approved_words = ('tasdiqlangan', 'qabul qilingan', 'approved')
    count_words = ('nechta', 'qancha', 'soni', 'sanog', 'hisob', 'count')
    return _has_any(lowered, approved_words) and _has_any(lowered, count_words)


def _is_pending_summary_request(text):
    lowered = _compact_text(text)
    explicit_phrases = (
        'kutilayotgan arizalar',
        'pending arizalar',
        'pending',
        'arizalar ro',
        "arizalar ro'",
        'arizalarni chiqar',
        "ro'yxatni chiqar",
        'royxatni chiqar',
    )
    count_words = ('nechta', 'qancha', 'soni', 'sanog', 'hisob', 'count', 'bor')
    show_words = ("ko'rsat", 'korsat', 'chiqar', 'ber', "ro'yxat", 'royxat', 'status', 'holat')
    if lowered in ('pending', 'status', 'holat', 'arizalar', 'kutilayotganlar'):
        return True
    if _has_any(lowered, explicit_phrases) and (_has_any(lowered, count_words) or _has_any(lowered, show_words)):
        return True
    return _has_any(lowered, ('kutil', 'ariza')) and _has_any(lowered, count_words)


def _is_center_summary_request(text):
    lowered = _compact_text(text)
    center_words = ('markaz', 'center', 'tashkilot')
    show_words = ("ko'rsat", 'korsat', 'qaysi', 'qaysilar', 'roʻyxat', "ro'yxat", 'royxat', 'mening', 'boshqar')
    return _has_any(lowered, center_words) and _has_any(lowered, show_words)


def _deterministic_answer(actor, text, ctx):
    if _is_memory_clear_request(text):
        _clear_conversation(actor)
        return "Bo'ldi, suhbat xotirasini tozaladim. Endi yangi savoldan davom etamiz."
    if _is_help_request(text):
        return _help_text()
    if _is_approved_count_request(text):
        return (
            f"Hozir tasdiqlangan o'quvchilar {ctx['approved_students_count']} ta. "
            f"Kutilayotgan o'quvchi arizalari esa {len(ctx['pending_students'])} ta. "
            "Ro'yxatini ko'rmoqchi bo'lsangiz, 'arizalarni ko'rsat' deb yozing."
        )
    if _is_pending_summary_request(text):
        return _format_pending_summary(ctx)
    if _is_center_summary_request(text):
        if not ctx['centers']:
            return "Sizda tasdiqlangan manager/direktor markazi topilmadi."
        return '\n'.join([
            'Siz boshqaradigan markazlar shu yerda:',
            *[f"- {center.name} ({center.district or center.city or center.region})" for center in ctx['centers']],
        ])
    return ''


def _ai_unavailable_reply(reason='temporary'):
    if reason == 'config':
        return (
            "Savolingizni oldim, lekin hozir erkin suhbat qismi server sozlamasi sabab ishlamayapti. "
            "Shunga qaramay, arizalar bo'yicha yordam bera olaman: 'kutilayotgan arizalar nechta?', "
            "'arizalarni ko'rsat' yoki 'Ali Valiyev +998901234567 tasdiqla' deb yozing."
        )
    return (
        "Savolingizni oldim. Hozir erkin suhbat qismi barqaror javob bera olmayapti, "
        "shuning uchun taxmin qilib gapirmayman. Arizalar bo'yicha esa yordam bera olaman: "
        "'kutilayotgan arizalar nechta?', 'arizalarni ko'rsat' yoki 'Ali Valiyev +998901234567 tasdiqla' deb yozing."
    )


def _openai_keys():
    keys = list(getattr(settings, 'AI_MANAGER_BOT_OPENAI_API_KEYS', []) or [])
    single = getattr(settings, 'AI_MANAGER_BOT_OPENAI_API_KEY', '')
    if single:
        keys.append(single)
    return list(dict.fromkeys(key for key in keys if key))


def _openai_error_cache_key():
    return 'manager_bot:openai_last_error'


def _remember_openai_error(error_code):
    if error_code in ('insufficient_quota', 'invalid_key'):
        cache.set(_openai_error_cache_key(), error_code, timeout=OPENAI_ERROR_CACHE_SECONDS)


def _cached_openai_error():
    cached = cache.get(_openai_error_cache_key())
    return cached if cached in ('insufficient_quota', 'invalid_key') else ''


def _gemini_keys():
    keys = list(getattr(settings, 'AI_MANAGER_BOT_GEMINI_API_KEYS', []) or [])
    single = getattr(settings, 'AI_MANAGER_BOT_GEMINI_API_KEY', '')
    if single:
        keys.append(single)
    return list(dict.fromkeys(key for key in keys if key))


def _gemini_error_cache_key():
    return 'manager_bot:gemini_last_error'


def _remember_gemini_error(error_code):
    if error_code in ('insufficient_quota', 'invalid_key'):
        cache.set(_gemini_error_cache_key(), error_code, timeout=GEMINI_ERROR_CACHE_SECONDS)


def _cached_gemini_error():
    cached = cache.get(_gemini_error_cache_key())
    return cached if cached in ('insufficient_quota', 'invalid_key') else ''


def _configured_gemini_models():
    primary = getattr(settings, 'AI_MANAGER_BOT_GEMINI_MODEL', 'gemini-2.5-flash')
    fallbacks = list(getattr(settings, 'AI_MANAGER_BOT_GEMINI_FALLBACK_MODELS', []) or [])
    return list(dict.fromkeys(model for model in [primary, *fallbacks] if model))


def _gemini_model_cache_key(api_key):
    digest = hashlib.sha256(str(api_key or '').encode('utf-8')).hexdigest()[:16]
    return f'manager_bot:gemini_models:{digest}'


def _discover_gemini_models(api_key):
    if not api_key or not getattr(settings, 'AI_MANAGER_BOT_GEMINI_AUTO_DISCOVER_MODELS', True):
        return []
    cached = cache.get(_gemini_model_cache_key(api_key))
    if isinstance(cached, list):
        return cached
    req = urllib.request.Request(
        'https://generativelanguage.googleapis.com/v1beta/models',
        method='GET',
        headers={'x-goog-api-key': api_key},
    )
    models = []
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            raw = json.loads(response.read().decode('utf-8'))
        for item in raw.get('models') or []:
            name = str(item.get('name') or '').replace('models/', '').strip()
            methods = item.get('supportedGenerationMethods') or []
            if not name.startswith('gemini') or 'generateContent' not in methods:
                continue
            # Manager chat is text-only. Skip modality-specific Gemini endpoints
            # that are not useful for short Telegram Q&A.
            if any(part in name for part in ('image', 'tts', 'robotics', 'computer-use')):
                continue
            models.append(name)
    except urllib.error.HTTPError as exc:
        logger.warning('Manager bot Gemini model discovery failed: HTTP %s', getattr(exc, 'code', 0))
    except Exception as exc:
        logger.warning('Manager bot Gemini model discovery failed: %s', exc.__class__.__name__)
    max_models = max(1, int(getattr(settings, 'AI_MANAGER_BOT_GEMINI_MAX_MODELS', 6)))
    models = list(dict.fromkeys(models))[:max_models]
    if models:
        cache.set(
            _gemini_model_cache_key(api_key),
            models,
            timeout=getattr(settings, 'AI_MANAGER_BOT_GEMINI_MODEL_CACHE_SECONDS', 6 * 60 * 60),
        )
    return models


def _gemini_models(api_key=None):
    configured = _configured_gemini_models()
    discovered = _discover_gemini_models(api_key) if api_key else []
    max_models = max(1, int(getattr(settings, 'AI_MANAGER_BOT_GEMINI_MAX_MODELS', 6)))
    return list(dict.fromkeys([*configured, *discovered]))[:max_models]


def _manager_ai_prompt(actor, text, ctx):
    context_lines = [
        f"Manager: {actor.full_name}",
        f"Markazlar: {', '.join(center.name for center in ctx['centers']) or '-'}",
        f"Kutilayotgan o'quvchi arizalari: {len(ctx['pending_students'])}",
        f"Kutilayotgan staff arizalari: {len(ctx['pending_staff'])}",
        f"Tasdiqlangan o'quvchilar: {ctx['approved_students_count']}",
    ]
    if ctx['pending']:
        context_lines.append('Kutilayotgan arizalar:')
        context_lines.extend(_membership_line(m) for m in ctx['pending'][:MAX_CONTEXT_PENDING_ROWS])
    history = _format_history_for_prompt(actor)
    history_block = f"\n\nOxirgi suhbat:\n{history}" if history else ''
    return (
        "Sen PROLYMP platformasidagi managerlar uchun Telegram yordamchisan. "
        "Suhbatdagi tirik odamdek javob ber: avval manager gapini qisqa tan ol, keyin aniq yordam ber. "
        "Ohang samimiy, xotirjam va ishchan bo'lsin; shablon, haddan tashqari rasmiy yoki robotcha iboralarni takrorlama. "
        "Managerga 'siz' deb murojaat qil, lekin gapni sun'iy bezama. O'zbek tilida, tabiiy Telegram uslubida yoz; "
        "manager boshqa tilda yozsa ham qisqa o'zbekcha javob qaytar. Kerak bo'lsa faqat bitta aniq savol bilan aniqlashtir.\n\n"
        "Javob uslubi: 2-4 gap yetarli. Avval foydali xulosa, keyin keyingi qadam. "
        "Ro'yxat faqat haqiqatan kerak bo'lsa ishlatilsin. Emoji kamdan-kam, faqat tabiiy ko'rinsa ishlat.\n\n"
        "Chegaralar: faqat berilgan kontekst va suhbat tarixiga tayan. Ma'lumot yetmasa, ochiq ayt va nima yuborish "
        "kerakligini so'ra. Hech qachon o'zing mustaqil tasdiqlash qildim deb yozma; tasdiqlashni backend alohida bajaradi. "
        "Agar manager kimnidir tasdiqlashni so'rasa, ism, telefon yoki kod kerakligini ayt; noaniq bo'lsa aniqlashtir. "
        "OpenAI, Gemini, model, quota, API kalit kabi texnik tafsilotlarni managerga aytma.\n\n"
        "Kontekst:\n"
        f"{chr(10).join(context_lines)}"
        f"{history_block}\n\n"
        f"Manager savoli: {str(text or '')[:2000]}"
    )


def _openai_answer(actor, text, ctx):
    api_keys = _openai_keys()
    if not api_keys:
        return '', 'missing_key'
    cached_error = _cached_openai_error()
    if cached_error:
        return '', cached_error
    prompt = _manager_ai_prompt(actor, text, ctx)
    payload = {
        'model': getattr(settings, 'AI_MANAGER_BOT_MODEL', 'gpt-4o-mini'),
        'input': [{
            'role': 'user',
            'content': [{'type': 'input_text', 'text': prompt}],
        }],
        'max_output_tokens': 500,
        'temperature': getattr(settings, 'AI_MANAGER_BOT_TEMPERATURE', 0.45),
    }
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
            text_out = raw.get('output_text') or ''
            if not text_out:
                chunks = []
                for item in raw.get('output') or []:
                    for content in item.get('content') or []:
                        if content.get('type') in ('output_text', 'text'):
                            chunks.append(content.get('text') or '')
                text_out = ''.join(chunks)
            return text_out.strip()[:3500], ''
        except urllib.error.HTTPError as exc:
            status = getattr(exc, 'code', 0)
            error_code = ''
            error_type = ''
            try:
                raw_error = json.loads(exc.read().decode('utf-8'))
                error = raw_error.get('error') or {}
                error_code = error.get('code') or ''
                error_type = error.get('type') or ''
            except Exception:
                pass
            logger.warning(
                'Manager bot OpenAI key #%s failed: HTTP %s type=%s code=%s',
                index,
                status,
                error_type or '-',
                error_code or '-',
            )
            if status == 429 and (error_code == 'insufficient_quota' or error_type == 'insufficient_quota'):
                _remember_openai_error('insufficient_quota')
                return '', 'insufficient_quota'
            if status in (401, 403):
                _remember_openai_error('invalid_key')
                return '', 'invalid_key'
            if status not in (401, 403, 408, 409, 429, 500, 502, 503, 504):
                break
        except Exception as exc:
            logger.warning('Manager bot OpenAI key #%s failed: %s', index, exc.__class__.__name__)
    return '', 'request_failed'


def _gemini_answer(actor, text, ctx):
    api_keys = _gemini_keys()
    if not api_keys:
        return '', 'missing_key'
    cached_error = _cached_gemini_error()
    if cached_error:
        return '', cached_error
    prompt = _manager_ai_prompt(actor, text, ctx)
    payload = {
        'contents': [{
            'parts': [{'text': prompt}],
        }],
        'generationConfig': {
            'maxOutputTokens': 500,
            'temperature': getattr(settings, 'AI_MANAGER_BOT_TEMPERATURE', 0.45),
        },
    }
    body = json.dumps(payload).encode('utf-8')
    quota_seen = False
    invalid_key_seen = False
    temporary_seen = False
    for index, api_key in enumerate(api_keys, start=1):
        models = _gemini_models(api_key)
        for model_position, model in enumerate(models, start=1):
            model_path = urllib.parse.quote(model, safe='-_.~/')
            url = f'https://generativelanguage.googleapis.com/v1beta/models/{model_path}:generateContent'
            req = urllib.request.Request(
                url,
                data=body,
                method='POST',
                headers={
                    'Content-Type': 'application/json',
                    'x-goog-api-key': api_key,
                },
            )
            try:
                with urllib.request.urlopen(req, timeout=30) as response:
                    raw = json.loads(response.read().decode('utf-8'))
                parts = (((raw.get('candidates') or [{}])[0].get('content') or {}).get('parts') or [])
                text_out = ''.join(part.get('text') or '' for part in parts)
                if text_out.strip():
                    if index > 1 or model_position > 1:
                        logger.info(
                            'Manager bot Gemini succeeded with key #%s model=%s',
                            index,
                            model,
                        )
                    return text_out.strip()[:3500], ''
            except urllib.error.HTTPError as exc:
                status = getattr(exc, 'code', 0)
                error_status = ''
                error_message = ''
                try:
                    raw_error = json.loads(exc.read().decode('utf-8'))
                    error = raw_error.get('error') or {}
                    error_status = error.get('status') or ''
                    error_message = error.get('message') or ''
                except Exception:
                    pass
                logger.warning(
                    'Manager bot Gemini key #%s model=%s failed: HTTP %s status=%s',
                    index,
                    model,
                    status,
                    error_status or '-',
                )
                if status == 429 or error_status == 'RESOURCE_EXHAUSTED':
                    quota_seen = True
                    break
                if status == 401 or 'API key not valid' in error_message:
                    invalid_key_seen = True
                    break
                if status == 403:
                    continue
                if status in (408, 409, 500, 502, 503, 504) or error_status == 'UNAVAILABLE':
                    temporary_seen = True
                    continue
                if status in (400, 404):
                    continue
                break
            except Exception as exc:
                logger.warning(
                    'Manager bot Gemini key #%s model=%s failed: %s',
                    index,
                    model,
                    exc.__class__.__name__,
                )
                temporary_seen = True
                continue
        if quota_seen or invalid_key_seen:
            break
    if quota_seen:
        _remember_gemini_error('insufficient_quota')
        return '', 'insufficient_quota'
    if invalid_key_seen:
        _remember_gemini_error('invalid_key')
        return '', 'invalid_key'
    if temporary_seen:
        return '', 'temporary_unavailable'
    return '', 'request_failed'


def answer_manager_question(actor, text):
    ctx = _context_for_actor(actor)
    deterministic = _deterministic_answer(actor, text, ctx)
    if deterministic:
        if not _is_memory_clear_request(text):
            _remember_exchange(actor, text, deterministic)
        return deterministic
    ai_answer, ai_error = _openai_answer(actor, text, ctx)
    if ai_answer:
        _remember_exchange(actor, text, ai_answer)
        return ai_answer
    gemini_answer, gemini_error = _gemini_answer(actor, text, ctx)
    if gemini_answer:
        _remember_exchange(actor, text, gemini_answer)
        return gemini_answer
    if gemini_error == 'insufficient_quota':
        reply = _ai_unavailable_reply()
        _remember_exchange(actor, text, reply)
        return reply
    if gemini_error == 'invalid_key':
        reply = _ai_unavailable_reply('config')
        _remember_exchange(actor, text, reply)
        return reply
    if gemini_error == 'temporary_unavailable':
        reply = _ai_unavailable_reply()
        _remember_exchange(actor, text, reply)
        return reply
    if gemini_error == 'request_failed' and ai_error == 'insufficient_quota':
        reply = _ai_unavailable_reply()
        _remember_exchange(actor, text, reply)
        return reply
    if ai_error == 'insufficient_quota':
        reply = _ai_unavailable_reply()
        _remember_exchange(actor, text, reply)
        return reply
    if ai_error == 'invalid_key':
        reply = _ai_unavailable_reply('config')
        _remember_exchange(actor, text, reply)
        return reply
    if ai_error == 'missing_key' and gemini_error == 'missing_key':
        reply = _ai_unavailable_reply('config')
        _remember_exchange(actor, text, reply)
        return reply
    reply = _ai_unavailable_reply()
    _remember_exchange(actor, text, reply)
    return reply


def handle_manager_message(actor, text='', image_bytes=None, mime_type='image/jpeg', document_text='', source='telegram_manager_bot'):
    if not _manageable_centers(actor):
        return "Sizda tasdiqlangan manager/direktor markazi topilmadi."

    combined_text = '\n'.join(part for part in [str(text or '').strip(), str(document_text or '').strip()] if part)
    has_file = bool(image_bytes or document_text)
    if _approval_intent(combined_text, has_file=has_file):
        extraction_text = _strip_approval_words(combined_text)
        extraction = extract_names_from_payload(
            text=extraction_text,
            image_bytes=image_bytes,
            mime_type=mime_type,
            use_ai_text=bool(document_text or not image_bytes),
        )
        entries = extraction.get('entries') or []
        if extraction.get('ok') and entries:
            # Roster cache'ga saqla — keyingi ariza kelsa avto-tasdiq uchun
            centers = _manageable_centers(actor)
            if len(centers) == 1:
                from .ai_roster import save_center_roster
                save_center_roster(centers[0].id, entries)
            summary = approve_roster_names(actor, entries, source=source)
            reply = format_approval_summary(summary)
            _remember_exchange(actor, combined_text or '[roster fayl]', reply)
            return reply
        if has_file:
            reply = extraction.get('error') or "Ro'yxatdan ism, telefon yoki kod topilmadi."
            _remember_exchange(actor, combined_text or '[roster fayl]', reply)
            return reply

    return answer_manager_question(actor, text or combined_text)
