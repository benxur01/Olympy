"""Manager Telegram bot helpers: document roster approval and Q&A."""
import io
import json
import logging
import re
import urllib.error
import urllib.request

from django.conf import settings

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
        "Manager bot tayyor.\n"
        "- PDF, TXT, CSV, rasm yoki ro'yxat matnini yuboring: bot mos pending o'quvchilarni tasdiqlaydi.\n"
        "- Telefon yoki kod bo'lsa eng aniq tekshiradi; faqat ism bo'lsa bitta aniq pending moslik topilgandagina tasdiqlaydi.\n"
        "- 'Kutilayotgan arizalar nechta?' deb so'rasangiz, holatni chiqaradi.\n"
        "- 'Ali Valiyev +998901234567 tasdiqla' kabi buyruq ham ishlaydi."
    )


def _deterministic_answer(actor, text, ctx):
    lowered = str(text or '').lower()
    if any(word in lowered for word in ('help', 'yordam', 'nima qila olasan', 'komanda', 'buyruq')):
        return _help_text()
    if any(word in lowered for word in ('tasdiqlangan', 'approved')):
        return (
            f"Tasdiqlangan o'quvchilar: {ctx['approved_students_count']}\n"
            f"Kutilayotgan o'quvchi arizalari: {len(ctx['pending_students'])}"
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


def _openai_answer(actor, text, ctx):
    api_keys = _openai_keys()
    if not api_keys:
        return '', 'missing_key'
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
    prompt = (
        "Sen Olympy manager Telegram botisan. O'zbek tilida qisqa va aniq javob ber. "
        "Faqat berilgan kontekstdagi ma'lumotlarga tayan; yetarli ma'lumot bo'lmasa shuni ayt. "
        "Hech qachon o'zing mustaqil tasdiqlash qildim deb yozma; tasdiqlashni backend alohida bajaradi.\n\n"
        "Kontekst:\n"
        f"{chr(10).join(context_lines)}\n\n"
        f"Manager savoli: {str(text or '')[:2000]}"
    )
    payload = {
        'model': getattr(settings, 'AI_MANAGER_BOT_MODEL', 'gpt-4o-mini'),
        'input': [{
            'role': 'user',
            'content': [{'type': 'input_text', 'text': prompt}],
        }],
        'max_output_tokens': 500,
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


def answer_manager_question(actor, text):
    ctx = _context_for_actor(actor)
    deterministic = _deterministic_answer(actor, text, ctx)
    if deterministic:
        return deterministic
    ai_answer, ai_error = _openai_answer(actor, text, ctx)
    if ai_answer:
        return ai_answer
    if ai_error == 'insufficient_quota':
        return (
            "OpenAI ulangan, lekin hisobda quota yoki billing yetmayapti. "
            "OpenAI billing/quota sozlamasini tekshiring yoki ishlaydigan yangi API kalit qo'ying. "
            "'Kutilayotgan arizalar nechta?' yoki 'yordam' deb yozsangiz, asosiy holatni chiqaraman."
        )
    if ai_error == 'invalid_key':
        return (
            "OpenAI kaliti serverda bor, lekin OpenAI uni rad etdi. "
            "Yangi API kalit qo'yish kerak. 'Kutilayotgan arizalar nechta?' yoki 'yordam' deb yozsangiz, "
            "asosiy holatni chiqaraman."
        )
    return (
        "Savolingizni tushundim, lekin AI javob uchun OpenAI kaliti sozlanmagan. "
        "'Kutilayotgan arizalar nechta?' yoki 'yordam' deb yozsangiz, asosiy holatni chiqaraman."
    )


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
            return format_approval_summary(summary)
        if has_file:
            return extraction.get('error') or "Ro'yxatdan ism, telefon yoki kod topilmadi."

    return answer_manager_question(actor, text or combined_text)
