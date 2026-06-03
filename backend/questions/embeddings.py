"""RAG embeddinglari — savol matnini vektorga aylantirish va o'xshash
savollarni topish.

Embedding Gemini `text-embedding-004` modeli orqali olinadi (768 o'lcham).
Loyihaning qolgan AI qismi kabi (`ai_generation.py`) bu yerda ham `urllib`
bilan REST chaqiruvi ishlatiladi — `google-generativeai` SDK qo'shilmaydi,
shunda yangi og'ir dependency va Render build muammosi yuzaga kelmaydi.

Maydon nomlari `questions.models.Question` bilan mos: `text`, `options`
(JSON ro'yxat), `correct_answer` (butun indeks), `difficulty`, `explanation`.
Modelda `is_deleted` yo'q, shuning uchun u ishlatilmaydi.
"""

import json
import logging
import urllib.error
import urllib.parse
import urllib.request

from django.conf import settings
from django.core.cache import cache


logger = logging.getLogger('questions.embeddings')

# Gemini embedding modeli. `gemini-embedding-001` standart 3072 o'lcham
# qaytaradi; `outputDimensionality=768` bilan bizning vector(768) ustuniga
# mos 768-o'lchamli vektor olamiz. Model env orqali ham o'zgartirilishi mumkin.
EMBEDDING_MODEL = 'models/gemini-embedding-001'
EMBEDDING_DIM = 768


def _embedding_model():
    return getattr(settings, 'AI_QUESTION_EMBEDDING_MODEL', '') or EMBEDDING_MODEL


def _gemini_api_keys():
    """ai_generation.py bilan bir xil kalitlar ro'yxati (env'dan)."""
    keys = list(getattr(settings, 'AI_QUESTION_GEMINI_API_KEYS', []) or [])
    single_key = getattr(settings, 'AI_QUESTION_GEMINI_API_KEY', '')
    if single_key:
        keys.append(single_key)
    return list(dict.fromkeys(key for key in keys if key))


def get_embedding(text):
    """Matnni 768-o'lchamli vektorga aylantiradi. Cache bilan.

    Xato yoki kalit yo'q bo'lsa None qaytaradi — chaqiruvchi oqim hech qachon
    buzilmaydi (RAG ixtiyoriy yaxshilanish).
    """
    if not text or len(text.strip()) < 5:
        return None

    keys = _gemini_api_keys()
    if not keys:
        return None

    snippet = text[:2000]
    cache_key = f'emb_{hash(snippet[:200])}'
    cached = cache.get(cache_key)
    if cached:
        return cached

    model = _embedding_model()
    payload = json.dumps({
        'model': model,
        'content': {'parts': [{'text': snippet}]},
        'outputDimensionality': EMBEDDING_DIM,
    }).encode('utf-8')
    model_path = urllib.parse.quote(model, safe='-_.~/')
    url = (
        'https://generativelanguage.googleapis.com/v1beta/'
        f'{model_path}:embedContent'
    )

    for api_key in keys:
        req = urllib.request.Request(
            url,
            data=payload,
            method='POST',
            headers={
                'Content-Type': 'application/json',
                'x-goog-api-key': api_key,
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                raw = json.loads(response.read().decode('utf-8'))
            values = ((raw.get('embedding') or {}).get('values')) or []
            if len(values) == EMBEDDING_DIM:
                embedding = [float(x) for x in values]
                cache.set(cache_key, embedding, 3600)
                return embedding
            logger.warning(
                'Embedding kutilmagan o\'lcham qaytardi: %s', len(values),
            )
        except urllib.error.HTTPError as exc:
            status = getattr(exc, 'code', 0)
            logger.warning('Embedding HTTP %s xatosi', status)
            # 401/403 — kalit ishlamayapti, keyingi kalitga o'tamiz; boshqa
            # turg'un xatolarda (400) qayta urinishning ma'nosi yo'q.
            if status not in (401, 403, 408, 429, 500, 502, 503, 504):
                break
        except Exception as exc:
            logger.warning('Embedding olishda xato: %s', exc.__class__.__name__)
    return None


def find_similar_questions(subject, topic, limit=20):
    """Subject va topic bo'yicha DB'dan o'xshash savollarni topadi.

    pgvector ulanmagan yoki embedding olib bo'lmasa — bo'sh ro'yxat.
    Faqat embeddingi bor savollarni qaytaradi (cosine masofa bo'yicha).
    """
    from django.db import connection

    # `<=>` operatori va `::vector` cast faqat pgvector (PostgreSQL) bor
    # muhitda ishlaydi. SQLite (lokal) yoki boshqa backend'da so'rovni
    # umuman yubormaymiz — bo'sh ro'yxat qaytaramiz.
    if connection.vendor != 'postgresql':
        return []

    query_text = f'{subject} {topic}'.strip()
    embedding = get_embedding(query_text)
    if embedding is None:
        return []

    vector_str = '[' + ','.join(str(x) for x in embedding) + ']'
    columns = [
        'text', 'options', 'correct_answer', 'difficulty', 'explanation',
    ]
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT q.text, q.options, q.correct_answer,
                       q.difficulty, q.explanation
                FROM questions_question q
                WHERE q.embedding IS NOT NULL
                ORDER BY q.embedding <=> %s::vector
                LIMIT %s
                """,
                [vector_str, limit],
            )
            rows = cursor.fetchall()
    except Exception as exc:
        # `embedding` ustuni yoki vector kengaytmasi yo'q muhitda jim o'tamiz.
        logger.warning(
            'O\'xshash savollarni topib bo\'lmadi: %s', exc.__class__.__name__,
        )
        return []

    return [dict(zip(columns, row)) for row in rows]
