import base64
import io
import json
import logging
import re
import urllib.error
import urllib.parse
import urllib.request

from django.conf import settings

from .ai_generation import _extract_output_text, _json_from_ai_text


logger = logging.getLogger('questions.pdf_generation')

DIFFICULTY_ALIASES = {
    'easy': 'easy',
    'oson': 'easy',
    "o'rta": 'medium',
    "o‘rta": 'medium',
    'orta': 'medium',
    'medium': 'medium',
    'hard': 'hard',
    'qiyin': 'hard',
}


def _extract_pdf_text(pdf_bytes):
    if not pdf_bytes:
        return '', 0
    try:
        from pypdf import PdfReader
    except ImportError:
        logger.warning('pypdf is not installed; falling back to Gemini PDF vision only')
        return '', 0
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        chunks = []
        max_chars = getattr(settings, 'AI_QUESTION_PDF_MAX_TEXT_CHARS', 120000)
        for page_number, page in enumerate(reader.pages[:1000], start=1):
            text = (page.extract_text() or '').strip()
            if text:
                chunks.append(f'\n\n--- PAGE {page_number} ---\n{text}')
            if sum(len(chunk) for chunk in chunks) >= max_chars:
                break
        return '\n'.join(chunks).strip()[:max_chars], len(reader.pages)
    except Exception:
        logger.exception('question PDF text extraction failed')
        return '', 0


def _schema_openai():
    question = {
        'type': 'object',
        'additionalProperties': False,
        'properties': {
            'original_number': {'type': 'string'},
            'text': {'type': 'string'},
            'options': {
                'type': 'array',
                'items': {'type': 'string'},
            },
            'correct_answer': {'type': 'integer'},
            'answer_source': {
                'type': 'string',
                'enum': ['pdf', 'inferred', 'missing'],
            },
            'needs_review': {'type': 'boolean'},
            'difficulty': {
                'type': 'string',
                'enum': ['easy', 'medium', 'hard'],
            },
            'score': {'type': 'integer'},
        },
        'required': [
            'original_number', 'text', 'options', 'correct_answer',
            'answer_source', 'needs_review', 'difficulty', 'score',
        ],
    }
    return {
        'type': 'object',
        'additionalProperties': False,
        'properties': {
            'questions': {
                'type': 'array',
                'items': question,
            },
        },
        'required': ['questions'],
    }


def _schema_gemini():
    return {
        'type': 'OBJECT',
        'properties': {
            'questions': {
                'type': 'ARRAY',
                'items': {
                    'type': 'OBJECT',
                    'properties': {
                        'original_number': {'type': 'STRING'},
                        'text': {'type': 'STRING'},
                        'options': {
                            'type': 'ARRAY',
                            'items': {'type': 'STRING'},
                        },
                        'correct_answer': {'type': 'INTEGER'},
                        'answer_source': {
                            'type': 'STRING',
                            'enum': ['pdf', 'inferred', 'missing'],
                        },
                        'needs_review': {'type': 'BOOLEAN'},
                        'difficulty': {
                            'type': 'STRING',
                            'enum': ['easy', 'medium', 'hard'],
                        },
                        'score': {'type': 'INTEGER'},
                    },
                    'required': [
                        'original_number', 'text', 'options', 'correct_answer',
                        'answer_source', 'needs_review', 'difficulty', 'score',
                    ],
                },
            },
        },
        'required': ['questions'],
    }


def _prompt(subject, difficulty, question_type, has_extracted_text):
    source_hint = (
        "Quyida PDFdan ajratilgan matn beriladi."
        if has_extracted_text else
        "PDF faylning o'zini ko'rib tahlil qil."
    )
    return (
        "Sen Olympy platformasi uchun PDFdan test savollarini ajratuvchi yordamchisan.\n"
        f"{source_hint}\n"
        "Vazifa: PDF ichidagi mavjud savollarni tartibini buzmasdan ajrat. "
        "PDFda savollar qanday ketma-ketlikda bo'lsa, JSON array ham shu tartibda bo'lsin. "
        "Yangi mavzu yoki ortiqcha savol o'ylab topma.\n"
        f"Fallback fan: {subject or '-'}\n"
        f"Fallback qiyinlik: {difficulty or 'medium'}\n"
        f"Kerakli format: {question_type or 'Ko‘p tanlovli'}\n"
        "Har bir savol uchun:\n"
        "- original_number: PDFdagi savol raqami yoki bo'sh string.\n"
        "- text: savol matni; raqamni saqlash mumkin, lekin javob variantlarini text ichiga qo'shma.\n"
        "- options: PDFdagi variantlarni aynan tartibida yoz. A/B/C/D belgilarini olib tashlab, matnini saqla. "
        "Agar variant yo'q bo'lsa, savol mazmunidan 4 ta variant tuz va needs_review=true qil.\n"
        "- correct_answer: options ichidagi to'g'ri variant indeksi, 0 dan boshlanadi.\n"
        "- answer_source: javob PDFda yoki answer keyda bo'lsa 'pdf'; AI aniqlasa 'inferred'; topilmasa 'missing'.\n"
        "- needs_review: answer_source 'pdf' bo'lmasa true.\n"
        "- difficulty: easy, medium yoki hard.\n"
        "- score: odatda 3, PDFda ball ko'rsatilgan bo'lsa 1..100 oralig'ida shu ball.\n"
        "Agar PDF oxirida javoblar jadvali/answer key bo'lsa, uni savollarga moslab biriktir. "
        "Agar variantlar To'g'ri/Noto'g'ri bo'lsa options aynan [\"To'g'ri\", \"Noto'g'ri\"] bo'lsin. "
        "Natijani faqat JSON schema bo'yicha qaytar."
    )


def _openai_keys():
    keys = list(getattr(settings, 'AI_QUESTION_OPENAI_API_KEYS', []) or [])
    single_key = getattr(settings, 'AI_QUESTION_OPENAI_API_KEY', '')
    if single_key:
        keys.append(single_key)
    return list(dict.fromkeys(key for key in keys if key))


def _gemini_keys():
    keys = list(getattr(settings, 'AI_QUESTION_GEMINI_API_KEYS', []) or [])
    single_key = getattr(settings, 'AI_QUESTION_GEMINI_API_KEY', '')
    if single_key:
        keys.append(single_key)
    return list(dict.fromkeys(key for key in keys if key))


def _gemini_models():
    primary = getattr(settings, 'AI_QUESTION_GEMINI_MODEL', 'gemini-2.5-flash')
    fallbacks = list(getattr(settings, 'AI_QUESTION_GEMINI_FALLBACK_MODELS', []) or [])
    defaults = [
        'gemini-3.1-flash-lite',
        'gemini-3-flash-preview',
        'gemini-2.5-flash',
        'gemini-2.5-pro',
    ]
    return list(dict.fromkeys(model for model in [primary, *fallbacks, *defaults] if model))


def _openai_pdf_error(last_error):
    if last_error == 'HTTP 429':
        return "OpenAI kvotasi tugagan yoki billing limiti yetmagan."
    if last_error in ('HTTP 401', 'HTTP 403'):
        return "OpenAI API kaliti ishlamayapti yoki ruxsat yetarli emas."
    if last_error == 'empty_questions':
        return "OpenAI PDF matnidan savol topa olmadi."
    return "OpenAI PDFni tahlil qila olmadi."


def _gemini_pdf_error(last_error):
    if last_error == 'empty_questions':
        return "Gemini PDFdan savollar topa olmadi. PDFda savol matni va variantlar aniq ko'rinishiga ishonch hosil qiling."
    if last_error in ('HTTP 401', 'HTTP 403'):
        return "Gemini API kaliti ishlamayapti yoki ruxsat yetarli emas."
    if last_error == 'HTTP 429':
        return "Gemini kvotasi tugagan yoki vaqtincha limitga tushgan."
    return "Gemini PDFni tahlil qila olmadi."


def _normalize_difficulty(value, fallback='medium'):
    normalized = str(value or '').strip().lower()
    return DIFFICULTY_ALIASES.get(normalized) or DIFFICULTY_ALIASES.get(str(fallback or '').lower()) or 'medium'


def _letter_to_index(value):
    text = str(value or '').strip().upper()
    if len(text) == 1 and 'A' <= text <= 'Z':
        return ord(text) - ord('A')
    match = re.match(r'^\s*([A-Z])[\).\s-]*', text)
    if match:
        return ord(match.group(1)) - ord('A')
    try:
        return int(text)
    except (TypeError, ValueError):
        return 0


def _normalize_questions(parsed, subject, difficulty):
    questions = []
    seen = set()
    fallback_difficulty = _normalize_difficulty(difficulty)
    for index, item in enumerate((parsed or {}).get('questions') or [], start=1):
        if not isinstance(item, dict):
            continue
        text = str(item.get('text') or '').strip()
        if len(text) < 5:
            continue
        options = [
            re.sub(r'^\s*[A-H][\).\s-]+', '', str(option or '').strip(), flags=re.IGNORECASE)
            for option in (item.get('options') or [])
            if str(option or '').strip()
        ]
        options = [option for option in options if option]
        if len(options) < 2:
            continue
        seen_options = set()
        deduped_options = []
        for option in options:
            key = option.casefold()
            if key in seen_options:
                continue
            seen_options.add(key)
            deduped_options.append(option[:500])
        if len(deduped_options) < 2:
            continue
        deduped_options = deduped_options[:8]
        correct_answer = _letter_to_index(item.get('correct_answer'))
        if correct_answer < 0 or correct_answer >= len(deduped_options):
            correct_answer = 0
            item['answer_source'] = 'missing'
            item['needs_review'] = True
        try:
            score = int(item.get('score') or 3)
        except (TypeError, ValueError):
            score = 3
        score = min(max(score, 1), 100)
        answer_source = str(item.get('answer_source') or 'missing').strip().lower()
        if answer_source not in ('pdf', 'inferred', 'missing'):
            answer_source = 'missing'
        needs_review = bool(item.get('needs_review')) or answer_source != 'pdf'
        text_key = text.casefold()
        if text_key in seen:
            continue
        seen.add(text_key)
        questions.append({
            'order': len(questions) + 1,
            'original_number': str(item.get('original_number') or index).strip(),
            'subject': subject,
            'text': text[:3000],
            'options': deduped_options,
            'correct_answer': correct_answer,
            'score': score,
            'difficulty': _normalize_difficulty(item.get('difficulty'), fallback_difficulty),
            'source': 'pdf',
            'answer_source': answer_source,
            'needs_review': needs_review,
        })
    return questions


def _openai_from_text(pdf_text, subject, difficulty, question_type):
    keys = _openai_keys()
    if not keys:
        return {'ok': False, 'missing_key': True, 'error': "OpenAI API kaliti sozlanmagan.", 'questions': []}
    if not pdf_text:
        return {'ok': False, 'error': "PDF matni topilmadi.", 'questions': []}
    prompt = f"{_prompt(subject, difficulty, question_type, True)}\n\nPDF matni:\n{pdf_text}"
    payload = {
        'model': getattr(settings, 'AI_QUESTION_MODEL', 'gpt-4o-mini'),
        'input': [{
            'role': 'user',
            'content': [{'type': 'input_text', 'text': prompt}],
        }],
        'text': {
            'format': {
                'type': 'json_schema',
                'name': 'olympy_pdf_questions',
                'schema': _schema_openai(),
                'strict': True,
            },
        },
        'max_output_tokens': getattr(settings, 'AI_QUESTION_MAX_OUTPUT_TOKENS', 6000),
    }
    body = json.dumps(payload).encode('utf-8')
    last_error = ''
    for index, api_key in enumerate(keys, start=1):
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
            with urllib.request.urlopen(req, timeout=60) as response:
                raw = json.loads(response.read().decode('utf-8'))
            parsed = _json_from_ai_text(_extract_output_text(raw))
            questions = _normalize_questions(parsed, subject, difficulty)
            if questions:
                if index > 1:
                    logger.info('PDF question extraction succeeded with OpenAI fallback key #%s', index)
                return {'ok': True, 'provider': 'openai', 'questions': questions}
            last_error = 'empty_questions'
        except urllib.error.HTTPError as exc:
            status = getattr(exc, 'code', 0)
            last_error = f'HTTP {status}'
            logger.warning('OpenAI PDF question key #%s failed: %s', index, last_error)
            if status not in (401, 403, 408, 409, 429, 500, 502, 503, 504):
                break
        except Exception as exc:
            last_error = exc.__class__.__name__
            logger.warning('OpenAI PDF question key #%s failed: %s', index, last_error)
    return {'ok': False, 'error': _openai_pdf_error(last_error), 'provider_error': last_error, 'questions': []}


def _gemini_payload(pdf_bytes, pdf_text, subject, difficulty, question_type, include_pdf):
    use_inline_pdf = include_pdf and bool(pdf_bytes)
    prompt = _prompt(subject, difficulty, question_type, not use_inline_pdf)
    parts = [{'text': prompt}]
    if use_inline_pdf:
        if pdf_text:
            parts.append({'text': f'PDFdan ajratilgan matn:\n{pdf_text}'})
        parts.append({
            'inlineData': {
                'mimeType': 'application/pdf',
                'data': base64.b64encode(pdf_bytes).decode('ascii'),
            },
        })
    else:
        parts.append({'text': f'PDF matni:\n{pdf_text}'})
    return {
        'contents': [{'role': 'user', 'parts': parts}],
        'generationConfig': {
            'responseMimeType': 'application/json',
            'responseSchema': _schema_gemini(),
        },
    }


def _gemini_extract(pdf_bytes, pdf_text, subject, difficulty, question_type):
    keys = _gemini_keys()
    if not keys:
        return {'ok': False, 'missing_key': True, 'error': "Gemini API kaliti sozlanmagan.", 'questions': []}
    # Text PDFs are cheaper/faster as text, but some PDFs extract noisy text.
    # Try text first, then the original PDF file as a second pass.
    modes = [False, True] if pdf_text else [True]
    last_error = ''
    saw_empty_questions = False
    saw_quota_error = False
    for include_pdf in modes:
        body = json.dumps(_gemini_payload(
            pdf_bytes,
            pdf_text,
            subject,
            difficulty,
            question_type,
            include_pdf,
        )).encode('utf-8')
        mode_label = 'inline_pdf' if include_pdf else 'text'
        for model in _gemini_models():
            model_path = urllib.parse.quote(model, safe='-_.~/')
            url = f'https://generativelanguage.googleapis.com/v1beta/models/{model_path}:generateContent'
            for index, api_key in enumerate(keys, start=1):
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
                    with urllib.request.urlopen(req, timeout=90) as response:
                        raw = json.loads(response.read().decode('utf-8'))
                    parts = (((raw.get('candidates') or [{}])[0].get('content') or {}).get('parts') or [])
                    text = ''.join(part.get('text') or '' for part in parts)
                    parsed = _json_from_ai_text(text)
                    questions = _normalize_questions(parsed, subject, difficulty)
                    if questions:
                        if index > 1:
                            logger.info('PDF question extraction succeeded with Gemini fallback key #%s', index)
                        logger.info('PDF question extraction succeeded with Gemini model=%s mode=%s', model, mode_label)
                        return {'ok': True, 'provider': 'gemini', 'questions': questions}
                    last_error = 'empty_questions'
                    saw_empty_questions = True
                    logger.warning('Gemini PDF question model=%s mode=%s returned no questions', model, mode_label)
                except urllib.error.HTTPError as exc:
                    status = getattr(exc, 'code', 0)
                    last_error = f'HTTP {status}'
                    if status == 429:
                        saw_quota_error = True
                    logger.warning('Gemini PDF question key #%s model=%s mode=%s failed: %s', index, model, mode_label, last_error)
                    if status in (401, 403):
                        return {
                            'ok': False,
                            'error': _gemini_pdf_error(last_error),
                            'provider_error': last_error,
                            'questions': [],
                        }
                    if status not in (400, 408, 409, 429, 500, 502, 503, 504):
                        break
                except Exception as exc:
                    last_error = exc.__class__.__name__
                    logger.warning('Gemini PDF question key #%s model=%s mode=%s failed: %s', index, model, mode_label, last_error)
    if saw_empty_questions and saw_quota_error:
        last_error = 'empty_questions'
    return {'ok': False, 'error': _gemini_pdf_error(last_error), 'provider_error': last_error, 'questions': []}


def extract_questions_from_pdf(pdf_bytes, subject, difficulty='medium', question_type='multiple_choice'):
    pdf_text, page_count = _extract_pdf_text(pdf_bytes)
    openai_result = _openai_from_text(pdf_text, subject, difficulty, question_type)
    if openai_result.get('ok'):
        openai_result['pdf_text_chars'] = len(pdf_text)
        openai_result['page_count'] = page_count
        openai_result['used_pdf_vision'] = False
        return openai_result
    gemini_result = _gemini_extract(pdf_bytes, pdf_text, subject, difficulty, question_type)
    if gemini_result.get('ok'):
        if openai_result.get('provider_error') or openai_result.get('error'):
            logger.info('PDF question extraction used Gemini after OpenAI failed: %s', openai_result.get('provider_error') or openai_result.get('error'))
        gemini_result['pdf_text_chars'] = len(pdf_text)
        gemini_result['page_count'] = page_count
        gemini_result['used_pdf_vision'] = not bool(pdf_text)
        return gemini_result
    errors = [
        value for value in [
            openai_result.get('error') or openai_result.get('provider_error'),
            gemini_result.get('error') or gemini_result.get('provider_error'),
        ]
        if value
    ]
    return {
        'ok': False,
        'error': ' / '.join(errors) or "PDFdan savollarni ajratib bo'lmadi.",
        'questions': [],
        'pdf_text_chars': len(pdf_text),
        'page_count': page_count,
        'used_pdf_vision': not bool(pdf_text),
    }
