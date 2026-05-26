import json
import logging
import re
import urllib.error
import urllib.parse
import urllib.request

from django.conf import settings


logger = logging.getLogger('questions.ai_generation')

DIFFICULTY_LABELS = {
    'easy': 'Oson',
    'medium': "O'rta",
    'hard': 'Qiyin',
    'beginner': 'Beginner',
    'elementary': 'Elementary',
    'pre-int': 'Pre-Intermediate',
    'int': 'Intermediate',
    'upper-int': 'Upper-Intermediate',
    'advanced': 'Advanced',
}

TYPE_MULTIPLE_CHOICE = "Ko'p tanlovli"
TYPE_TRUE_FALSE = "To'g'ri/Noto'g'ri"
TYPE_SHORT_ANSWER = 'Qisqa javob'


def _json_from_ai_text(text):
    cleaned = str(text or '').strip()
    if cleaned.startswith('```'):
        cleaned = re.sub(r"^```(?:json)?\s*", '', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", '', cleaned)
    return json.loads(cleaned)


def _extract_output_text(raw):
    text = raw.get('output_text') or ''
    if text:
        return text
    chunks = []
    for item in raw.get('output') or []:
        for content in item.get('content') or []:
            if content.get('type') in ('output_text', 'text'):
                chunks.append(content.get('text') or '')
    return ''.join(chunks)


def _api_keys():
    keys = list(getattr(settings, 'AI_QUESTION_OPENAI_API_KEYS', []) or [])
    single_key = getattr(settings, 'AI_QUESTION_OPENAI_API_KEY', '')
    if single_key:
        keys.append(single_key)
    return list(dict.fromkeys(key for key in keys if key))


def _gemini_api_keys():
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


def _question_type_label(question_type):
    if question_type in (TYPE_TRUE_FALSE, 'true_false', 'true-false'):
        return TYPE_TRUE_FALSE
    if question_type in (TYPE_SHORT_ANSWER, 'short_answer', 'short-answer'):
        # The current test engine grades option indexes, so short-answer AI
        # prompts are converted into four-option tests for reliable scoring.
        return TYPE_SHORT_ANSWER
    return TYPE_MULTIPLE_CHOICE


def _prompt(subject, topic, count, difficulty, question_type):
    label = _question_type_label(question_type)
    difficulty_label = DIFFICULTY_LABELS.get(difficulty, difficulty or "O'rta")
    if label == TYPE_TRUE_FALSE:
        type_instruction = (
            'Har bir savolda options aynan ["To\'g\'ri", "Noto\'g\'ri"] bo\'lsin. '
            "correct_answer 0 yoki 1 bo'ladi."
        )
    else:
        type_instruction = (
            "Har bir savolda 4 ta aniq variant bo'lsin. "
            "Faqat bitta variant to'g'ri bo'lsin. "
            "correct_answer 0 dan 3 gacha bo'lgan indeks bo'lsin."
        )
        if label == TYPE_SHORT_ANSWER:
            type_instruction += (
                " Foydalanuvchi qisqa javob formatini tanlagan, lekin platforma "
                "testlarni variant orqali tekshiradi; shuning uchun qisqa javobga "
                "mos mazmunni 4 variantli testga aylantir."
            )
    return (
        "O'zbek tilida ta'lim tashkiloti olimpiadasi uchun original test savollarini tuz.\n"
        f"Fan: {subject}\n"
        f"Mavzu: {topic}\n"
        f"Savollar soni: {count}\n"
        f"Qiyinlik: {difficulty_label}\n"
        f"Format: {label}\n"
        f"{type_instruction}\n"
        "Savollar aniq, tekshiriladigan va yoshga mos bo'lsin. "
        "'Hammasi to'g'ri', 'yuqoridagilarning barchasi' kabi noaniq variantlardan foydalanma. "
        "Variantlarni takrorlama. Natijani faqat JSON schema bo'yicha qaytar."
    )


def _schema():
    return {
        'type': 'object',
        'additionalProperties': False,
        'properties': {
            'questions': {
                'type': 'array',
                'items': {
                    'type': 'object',
                    'additionalProperties': False,
                    'properties': {
                        'text': {'type': 'string'},
                        'options': {
                            'type': 'array',
                            'items': {'type': 'string'},
                        },
                        'correct_answer': {'type': 'integer'},
                    },
                    'required': ['text', 'options', 'correct_answer'],
                },
            },
        },
        'required': ['questions'],
    }


def _gemini_schema():
    return {
        'type': 'OBJECT',
        'properties': {
            'questions': {
                'type': 'ARRAY',
                'items': {
                    'type': 'OBJECT',
                    'properties': {
                        'text': {'type': 'STRING'},
                        'options': {
                            'type': 'ARRAY',
                            'items': {'type': 'STRING'},
                        },
                        'correct_answer': {'type': 'INTEGER'},
                    },
                    'required': ['text', 'options', 'correct_answer'],
                },
            },
        },
        'required': ['questions'],
    }


def _normalize_question(item, subject, difficulty, question_type):
    if not isinstance(item, dict):
        return None
    text = str(item.get('text') or '').strip()
    if len(text) < 8:
        return None
    options = [
        str(option).strip()
        for option in (item.get('options') or [])
        if str(option or '').strip()
    ]
    type_label = _question_type_label(question_type)
    if type_label == TYPE_TRUE_FALSE:
        options = ["To'g'ri", "Noto'g'ri"]
    elif len(options) != 4:
        return None
    seen = set()
    unique_options = []
    for option in options:
        key = option.casefold()
        if key in seen:
            continue
        seen.add(key)
        unique_options.append(option)
    if len(unique_options) != len(options):
        return None
    if len(unique_options) < 2:
        return None
    try:
        correct_answer = int(item.get('correct_answer'))
    except (TypeError, ValueError):
        return None
    if correct_answer < 0 or correct_answer >= len(unique_options):
        return None
    return {
        'subject': subject,
        'text': text,
        'options': unique_options,
        'correct_answer': correct_answer,
        'score': 3,
        'difficulty': difficulty,
        'source': 'ai',
    }


def _build_questions_from_parsed(parsed, count, subject, difficulty, question_type):
    questions = []
    seen_text = set()
    for item in (parsed or {}).get('questions') or []:
        question = _normalize_question(item, subject, difficulty, question_type)
        if not question:
            continue
        text_key = question['text'].casefold()
        if text_key in seen_text:
            continue
        seen_text.add(text_key)
        questions.append(question)
        if len(questions) >= count:
            break
    return questions


def _generate_via_openai(subject, topic, count, difficulty, question_type):
    api_keys = _api_keys()
    if not api_keys:
        return {
            'ok': False,
            'missing_key': True,
            'error': "Savol yaratish uchun OpenAI API kaliti sozlanmagan.",
            'questions': [],
        }

    payload = {
        'model': getattr(settings, 'AI_QUESTION_MODEL', 'gpt-4o-mini'),
        'input': [{
            'role': 'user',
            'content': [{'type': 'input_text', 'text': _prompt(subject, topic, count, difficulty, question_type)}],
        }],
        'text': {
            'format': {
                'type': 'json_schema',
                'name': 'olympy_generated_questions',
                'schema': _schema(),
                'strict': True,
            },
        },
        'max_output_tokens': getattr(settings, 'AI_QUESTION_MAX_OUTPUT_TOKENS', 6000),
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
            with urllib.request.urlopen(req, timeout=45) as response:
                raw = json.loads(response.read().decode('utf-8'))
            if index > 1:
                logger.info('AI question generation succeeded with OpenAI fallback key #%s', index)
            break
        except urllib.error.HTTPError as exc:
            status = getattr(exc, 'code', 0)
            last_error = f'HTTP {status}'
            logger.warning('AI question OpenAI key #%s failed: %s', index, last_error)
            if status not in (401, 403, 408, 409, 429, 500, 502, 503, 504):
                break
        except Exception as exc:
            last_error = exc.__class__.__name__
            logger.warning('AI question OpenAI key #%s failed: %s', index, last_error)

    if raw is None:
        return {
            'ok': False,
            'error': "OpenAI savollarni yarata olmadi.",
            'provider_error': last_error,
            'questions': [],
        }

    try:
        parsed = _json_from_ai_text(_extract_output_text(raw))
    except (TypeError, ValueError):
        logger.warning('AI question OpenAI response was not JSON')
        return {
            'ok': False,
            'error': "OpenAI javobi tushunarsiz bo'ldi.",
            'provider_error': 'invalid_json',
            'questions': [],
        }

    questions = _build_questions_from_parsed(parsed, count, subject, difficulty, question_type)
    if not questions:
        return {
            'ok': False,
            'error': "OpenAI yaroqli savol qaytarmadi.",
            'provider_error': 'empty_questions',
            'questions': [],
        }
    return {
        'ok': True,
        'provider': 'openai',
        'error': '',
        'questions': questions,
    }


def _generate_via_gemini(subject, topic, count, difficulty, question_type):
    keys = _gemini_api_keys()
    if not keys:
        return {
            'ok': False,
            'missing_key': True,
            'error': "Savol yaratish uchun Gemini API kaliti sozlanmagan.",
            'questions': [],
        }

    prompt = _prompt(subject, topic, count, difficulty, question_type)
    max_output_tokens = getattr(settings, 'AI_QUESTION_GEMINI_MAX_OUTPUT_TOKENS', 8192)
    try:
        max_output_tokens = int(max_output_tokens)
    except (TypeError, ValueError):
        max_output_tokens = 8192
    max_output_tokens = max(1024, min(max_output_tokens, 65536))

    payload = {
        'contents': [{
            'role': 'user',
            'parts': [{'text': prompt}],
        }],
        'generationConfig': {
            'responseMimeType': 'application/json',
            'responseSchema': _gemini_schema(),
            'maxOutputTokens': max_output_tokens,
        },
    }
    body = json.dumps(payload).encode('utf-8')

    last_error = ''
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
                with urllib.request.urlopen(req, timeout=60) as response:
                    raw = json.loads(response.read().decode('utf-8'))
                parts = (((raw.get('candidates') or [{}])[0].get('content') or {}).get('parts') or [])
                text = ''.join(part.get('text') or '' for part in parts)
                try:
                    parsed = _json_from_ai_text(text)
                except (TypeError, ValueError):
                    last_error = 'invalid_json'
                    logger.warning('AI question Gemini model=%s response was not JSON', model)
                    continue
                questions = _build_questions_from_parsed(parsed, count, subject, difficulty, question_type)
                if questions:
                    if index > 1:
                        logger.info('AI question generation succeeded with Gemini fallback key #%s', index)
                    logger.info('AI question generation succeeded with Gemini model=%s', model)
                    return {
                        'ok': True,
                        'provider': 'gemini',
                        'error': '',
                        'questions': questions,
                    }
                last_error = 'empty_questions'
                logger.warning('AI question Gemini model=%s returned no usable questions', model)
            except urllib.error.HTTPError as exc:
                status = getattr(exc, 'code', 0)
                last_error = f'HTTP {status}'
                logger.warning('AI question Gemini key #%s model=%s failed: %s', index, model, last_error)
                if status in (401, 403):
                    return {
                        'ok': False,
                        'error': "Gemini API kaliti ishlamayapti yoki ruxsat yetarli emas.",
                        'provider_error': last_error,
                        'questions': [],
                    }
                if status not in (400, 408, 409, 429, 500, 502, 503, 504):
                    break
            except Exception as exc:
                last_error = exc.__class__.__name__
                logger.warning('AI question Gemini key #%s model=%s failed: %s', index, model, last_error)

    return {
        'ok': False,
        'error': "Gemini savollarni yarata olmadi.",
        'provider_error': last_error,
        'questions': [],
    }


def generate_questions(subject, topic, count, difficulty='medium', question_type=TYPE_MULTIPLE_CHOICE):
    max_count = getattr(settings, 'AI_QUESTION_MAX_COUNT', 30)
    try:
        count = int(count)
    except (TypeError, ValueError):
        count = 10
    count = max(1, min(count, max_count))
    subject = str(subject or '').strip()[:80]
    topic = str(topic or '').strip()[:300]
    difficulty = difficulty if difficulty in DIFFICULTY_LABELS else 'medium'

    if not subject or not topic:
        return {
            'ok': False,
            'error': "Fan va mavzu majburiy.",
            'questions': [],
        }

    openai_keys = _api_keys()
    gemini_keys = _gemini_api_keys()

    if not openai_keys and not gemini_keys:
        return {
            'ok': False,
            'missing_key': True,
            'error': "Savol yaratish uchun OpenAI yoki Gemini API kaliti sozlanmagan.",
            'questions': [],
        }

    openai_result = None
    if openai_keys:
        openai_result = _generate_via_openai(subject, topic, count, difficulty, question_type)
        if openai_result.get('ok'):
            return openai_result
        logger.info(
            'AI question generation falling back to Gemini after OpenAI: %s',
            openai_result.get('provider_error') or openai_result.get('error') or 'unknown',
        )

    if gemini_keys:
        gemini_result = _generate_via_gemini(subject, topic, count, difficulty, question_type)
        if gemini_result.get('ok'):
            return gemini_result
        if openai_result is None:
            return gemini_result
        return {
            'ok': False,
            'error': openai_result.get('error') or gemini_result.get('error') or "AI savol yarata olmadi.",
            'provider_error': gemini_result.get('provider_error') or openai_result.get('provider_error') or '',
            'questions': [],
        }

    return openai_result or {
        'ok': False,
        'error': "AI savol yarata olmadi.",
        'questions': [],
    }


def explain_question_ai(question_text, options, correct_idx, subject=''):
    keys = _gemini_api_keys()
    if not keys:
        return "Tushuntirish olish uchun Gemini API kaliti sozlanmagan."

    options_str = "\n".join(f"{chr(65+i)}) {opt}" for i, opt in enumerate(options))
    correct_option = chr(65 + correct_idx) if correct_idx < len(options) else str(correct_idx)

    prompt = (
        f"Quyidagi test savoli va uning javoblari uchun o'zbek tilida qisqa, tushunarli va chiroyli yechim tushuntirishini yozib ber. "
        f"Matn oxirida to'g'ri javob nega to'g'ri ekanligini qisqacha izohla.\n\n"
        f"Fan: {subject}\n"
        f"Savol: {question_text}\n"
        f"Variantlar:\n{options_str}\n"
        f"To'g'ri javob: {correct_option}) {options[correct_idx] if correct_idx < len(options) else ''}\n\n"
        f"Javobni faqat o'zbek tilida va formatlashda Markdown (masalan, muhim joylarini qalin qilish, ro'yxat ko'rinishida yozish) ishlatib yoz."
    )

    payload = {
        'contents': [{
            'role': 'user',
            'parts': [{'text': prompt}],
        }],
        'generationConfig': {
            'maxOutputTokens': 2048,
        },
    }
    body = json.dumps(payload).encode('utf-8')

    for model in _gemini_models():
        model_path = urllib.parse.quote(model, safe='-_.~/')
        url = f'https://generativelanguage.googleapis.com/v1beta/models/{model_path}:generateContent'
        for api_key in keys:
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
                with urllib.request.urlopen(req, timeout=45) as response:
                    raw = json.loads(response.read().decode('utf-8'))
                parts = (((raw.get('candidates') or [{}])[0].get('content') or {}).get('parts') or [])
                text = ''.join(part.get('text') or '' for part in parts)
                if text.strip():
                    return text.strip()
            except Exception as exc:
                logger.warning('Gemini explanation failed with model=%s: %s', model, exc)
    return "AI yordamida tushuntirish generatsiya qilinmadi. Iltimos keyinroq urinib ko'ring."

