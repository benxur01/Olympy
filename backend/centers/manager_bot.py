"""Manager Telegram bot helpers: document roster approval and Q&A."""
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
            return {
                'ok': False,
                'error': "PDFdan matn topilmadi. Skan rasm bo'lsa, PDF o'rniga rasm yuboring.",
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
    if any(keyword in lowered for keyword in APPROVAL_KEYWORDS):
        return True
    if any(keyword in lowered for keyword in ROSTER_KEYWORDS):
        return True
    if '\n' in str(text or ''):
        return True
    if has_file:
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
        "Ha, yordam beraman.\n\n"
        "Nimalar qila olaman:\n"
        "- PDF, TXT, CSV, rasm yoki ro'yxat matnidan o'quvchilarni tasdiqlayman.\n"
        "- Telefon yoki kod bo'lsa aniq tekshiraman; faqat ism bo'lsa faqat bitta mos pending topilganda tasdiqlayman.\n"
        "- 'Kutilayotgan arizalar nechta?' desangiz, holatni chiqaraman.\n"
        "- Oddiy savollarga ham javob beraman.\n\n"
        "Masalan: Ali Valiyev +998901234567 tasdiqla"
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


def _deterministic_answer(actor, text, ctx):
    lowered = str(text or '').lower()
    if _is_memory_clear_request(text):
        _clear_conversation(actor)
        return "Bo'ldi, shu suhbat xotirasini tozaladim. Yangi savoldan davom etamiz."
    if any(word in lowered for word in ('help', 'yordam', 'nima qila olasan', 'komanda', 'buyruq')):
        return _help_text()
    if any(word in lowered for word in ('tasdiqlangan', 'approved')):
        return (
            f"Hozir tasdiqlangan o'quvchilar: {ctx['approved_students_count']} ta.\n"
            f"Kutilayotgan o'quvchi arizalari: {len(ctx['pending_students'])} ta."
        )
    if any(word in lowered for word in ('pending', 'kutil', 'ariza', 'nechta', "ro'yxat", 'royxat')):
        return _format_pending_summary(ctx)
    if any(word in lowered for word in ('markaz', 'center', 'tashkilot')):
        if not ctx['centers']:
            return "Sizda tasdiqlangan manager/direktor markazi topilmadi."
        return '\n'.join([
            'Siz boshqaradigan markazlar:',
            *[f"- {center.name} ({center.district or center.city or center.region})" for center in ctx['centers']],
        ])
    return ''


def _openai_keys():
    keys = list(getattr(settings, 'AI_MANAGER_BOT_OPENAI_API_KEYS', []) or [])
    single = getattr(settings, 'AI_MANAGER_BOT_OPENAI_API_KEY', '')
    if single:
        keys.append(single)
    return list(dict.fromkeys(key for key in keys if key))


def _gemini_keys():
    keys = list(getattr(settings, 'AI_MANAGER_BOT_GEMINI_API_KEYS', []) or [])
    single = getattr(settings, 'AI_MANAGER_BOT_GEMINI_API_KEY', '')
    if single:
        keys.append(single)
    return list(dict.fromkeys(key for key in keys if key))


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
        "Sen Olympy platformasidagi managerlar uchun Telegram yordamchisan. "
        "Javobing odam bilan xotirjam gaplashayotgandek bo'lsin: tabiiy, samimiy, lo'nda va ishchan. "
        "Managerga 'siz' deb murojaat qil. Juda rasmiy, quruq yoki robotga o'xshash iboralarni ishlatma. "
        "Kerak bo'lsa bitta aniq savol bilan aniqlashtir. O'zbek tilida javob ber; manager boshqa tilda yozsa ham "
        "o'zbekcha qisqa javob qaytar.\n\n"
        "Chegaralar: faqat berilgan kontekst va suhbat tarixiga tayan. Ma'lumot yetmasa, ochiq ayt va nima yuborish "
        "kerakligini so'ra. Hech qachon o'zing mustaqil tasdiqlash qildim deb yozma; tasdiqlashni backend alohida bajaradi. "
        "Agar manager kimnidir tasdiqlashni so'rasa, ism, telefon yoki kod kerakligini ayt; noaniq bo'lsa aniqlashtir. "
        "Javob odatda 2-5 gapdan oshmasin. Emoji ishlatma.\n\n"
        "Kontekst:\n"
        f"{chr(10).join(context_lines)}"
        f"{history_block}\n\n"
        f"Manager savoli: {str(text or '')[:2000]}"
    )


def _openai_answer(actor, text, ctx):
    api_keys = _openai_keys()
    if not api_keys:
        return '', 'missing_key'
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
            return text_out.strip()[:3500]
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
                return '', 'insufficient_quota'
            if status in (401, 403):
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
    model = getattr(settings, 'AI_MANAGER_BOT_GEMINI_MODEL', 'gemini-2.5-flash')
    model_path = urllib.parse.quote(model, safe='-_.~/')
    url = f'https://generativelanguage.googleapis.com/v1beta/models/{model_path}:generateContent'
    for index, api_key in enumerate(api_keys, start=1):
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
                if index > 1:
                    logger.info('Manager bot Gemini succeeded with fallback key #%s', index)
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
                'Manager bot Gemini key #%s failed: HTTP %s status=%s',
                index,
                status,
                error_status or '-',
            )
            if status == 429 or error_status == 'RESOURCE_EXHAUSTED':
                return '', 'insufficient_quota'
            if status in (401, 403) or 'API key not valid' in error_message:
                return '', 'invalid_key'
            if status not in (400, 408, 409, 429, 500, 502, 503, 504):
                break
        except Exception as exc:
            logger.warning('Manager bot Gemini key #%s failed: %s', index, exc.__class__.__name__)
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
        reply = (
            "Gemini ulangan, lekin Google AI quota yoki rate limit yetmayapti. "
            "Gemini quota/billing sozlamasini tekshiring yoki ishlaydigan yangi API kalit qo'ying. "
            "'Kutilayotgan arizalar nechta?' yoki 'yordam' deb yozsangiz, asosiy holatni chiqaraman."
        )
        _remember_exchange(actor, text, reply)
        return reply
    if gemini_error == 'invalid_key':
        reply = (
            "Gemini kaliti serverda bor, lekin Google uni rad etdi. "
            "Yangi Gemini API kalit qo'yish kerak. 'Kutilayotgan arizalar nechta?' yoki 'yordam' deb yozsangiz, "
            "asosiy holatni chiqaraman."
        )
        _remember_exchange(actor, text, reply)
        return reply
    if ai_error == 'insufficient_quota':
        reply = (
            "OpenAI ulangan, lekin hisobda quota yoki billing yetmayapti. "
            "OpenAI billing/quota sozlamasini tekshiring yoki ishlaydigan yangi API kalit qo'ying. "
            "'Kutilayotgan arizalar nechta?' yoki 'yordam' deb yozsangiz, asosiy holatni chiqaraman."
        )
        _remember_exchange(actor, text, reply)
        return reply
    if ai_error == 'invalid_key':
        reply = (
            "OpenAI kaliti serverda bor, lekin OpenAI uni rad etdi. "
            "Yangi API kalit qo'yish kerak. 'Kutilayotgan arizalar nechta?' yoki 'yordam' deb yozsangiz, "
            "asosiy holatni chiqaraman."
        )
        _remember_exchange(actor, text, reply)
        return reply
    if ai_error == 'missing_key' and gemini_error == 'missing_key':
        reply = (
            "Savolingizni tushundim, lekin AI javob uchun OpenAI yoki Gemini kaliti sozlanmagan. "
            "'Kutilayotgan arizalar nechta?' yoki 'yordam' deb yozsangiz, asosiy holatni chiqaraman."
        )
        _remember_exchange(actor, text, reply)
        return reply
    reply = (
        "AI xizmatiga ulanishda vaqtinchalik xato bo'ldi. "
        "'Kutilayotgan arizalar nechta?' yoki 'yordam' deb yozsangiz, asosiy holatni chiqaraman."
    )
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
            summary = approve_roster_names(actor, entries, source=source)
            reply = format_approval_summary(summary)
            _remember_exchange(actor, combined_text or '[roster fayl]', reply)
            return reply
        if has_file:
            reply = extraction.get('error') or "Ro'yxatdan ism, telefon yoki kod topilmadi."
            _remember_exchange(actor, combined_text or '[roster fayl]', reply)
            return reply

    return answer_manager_question(actor, text or combined_text)
