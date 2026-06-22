import base64
import io
import json
import logging
import re
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from django.conf import settings

from .ai_generation import _extract_output_text, _json_from_ai_text


logger = logging.getLogger('questions.pdf_generation')

DIFFICULTY_ALIASES = {
    'easy': 'easy',
    'oson': 'easy',
    'beginner': 'beginner',
    'elementary': 'elementary',
    'pre-intermediate': 'pre-int',
    'pre-int': 'pre-int',
    'intermediate': 'int',
    'int': 'int',
    'upper-intermediate': 'upper-int',
    'upper-int': 'upper-int',
    'advanced': 'advanced',
    # ASCII apostrof bilan bir marta. Unicode apostrofli ("o‘rta") input
    # _normalize_difficulty ichida ASCII'ga keltirilib qidiriladi, shu sababli
    # kalitni ikki marta yozish (Unicode dublikat) shart emas.
    "o'rta": 'medium',
    'orta': 'medium',
    'medium': 'medium',
    'hard': 'hard',
    'qiyin': 'hard',
}


# --- Prompt qo'shimchalari: sifat, matematika, rasm va javobsiz savollar uchun ---

QUALITY_PROMPT = (
    "\nSifat qoidalari:\n"
    "- Savol matnini PDFdagidek aniq saqla, qisqartirma yoki o'zgartirma.\n"
    "- Imlo xatosi bo'lsa tuzat, lekin savol ma'nosini o'zgartirma.\n"
    "- Variant matnini saqla (A, B, C, D harflarini olib tashlab, matnini qoldir).\n"
    "- Bir xil savolni ikki marta chiqarma (dublikatlarni tashlab ket).\n"
    "- Savol to'liq bo'lmasa yoki matn kesilgan bo'lsa — needs_review=true qo'y.\n"
    "- Bo'sh yoki ma'nosiz savollarni umuman chiqarma.\n"
)

MATH_PROMPT_ADDITION = (
    "\nMatematik belgilar uchun qoidalar:\n"
    "- ∑ → \"yig'indisi\", ∫ → \"integrali\", √ → \"ildiz\", ^ → \"darajasi\".\n"
    "- Belgi noto'g'ri o'qilgan bo'lsa, kontekstdan tushunib to'g'rilab yoz.\n"
    "- Formulani o'qib bo'lmasa, savol matnida [formula] deb yoz va needs_review=true qo'y.\n"
    "- Kasrlarni a/b shaklida yoz (masalan 3/4).\n"
    "- LaTeX formatini oddiy matnga aylantir: \\frac{a}{b} → a/b.\n"
)

VISION_PROMPT_ADDITION = (
    "\nRasm va diagrammaga oid savollar uchun qoidalar:\n"
    "- Savol rasmga/diagrammaga/grafikka havola qilsa (masalan \"Quyidagi rasmga qarab...\" "
    "yoki \"Grafikdan...\"), savol matnini saqla va needs_review=true qo'y.\n"
    "- explanation o'rniga (agar mavjud bo'lsa) yoki belgisi sifatida answer_source='missing' bilan, "
    "savolni yo'qotma — rasm ko'rinmasa ham saqla.\n"
    "- Rasmga bog'liq savolda javobni ishonch bilan aniqlay olmasang, needs_review=true qoldir.\n"
)

NO_ANSWER_PROMPT_ADDITION = (
    "\nJavobsiz savollar uchun qoidalar:\n"
    "- Variantlar bor lekin to'g'ri javob ko'rsatilmagan bo'lsa: savolni saqla.\n"
    "- Agar savol mantiqiy va sen javobni ishonch bilan bilsang — o'zing belgilab, "
    "answer_source='inferred', needs_review=false qil.\n"
    "- Agar bilmasang yoki noaniq bo'lsa — correct_answer=0, answer_source='missing', needs_review=true.\n"
    "- Javob kaliti (answer key) alohida sahifada bo'lsa, uni topib variantlarga biriktir.\n"
)

# Matnda matematik belgilar ko'pligini aniqlash uchun.
_MATH_SYMBOLS = ('∑', '∫', '√', '∏', '≈', '≤', '≥', '≠', '∞', '∂', 'π', '±', '×', '÷', '°', '^', '\\frac', '\\sqrt', '\\sum', '\\int')
_MATH_SUBJECTS = ('matematika', 'matematik', 'fizika', 'kimyo', 'algebra', 'geometriya', 'math', 'physics', 'chemistry')


def _looks_mathematical(subject, pdf_text):
    """Fan matematik bo'lsa yoki matnda formula belgilari ko'p bo'lsa True."""
    subject_lower = str(subject or '').strip().lower()
    if any(key in subject_lower for key in _MATH_SUBJECTS):
        return True
    text = str(pdf_text or '')
    if not text:
        return False
    hits = sum(text.count(symbol) for symbol in _MATH_SYMBOLS)
    return hits >= 5


def _int_setting(name, default, minimum=None, maximum=None):
    try:
        value = int(getattr(settings, name, default) or default)
    except (TypeError, ValueError):
        value = default
    if minimum is not None:
        value = max(value, minimum)
    if maximum is not None:
        value = min(value, maximum)
    return value


def _pdf_max_parallel():
    """Bir vaqtda yuboriladigan maksimal parallel Gemini so'rovi (chunk'lar uchun).

    Avval chunk'lar `for` loop bilan ketma-ket yuborilardi va 30 sahifali PDF
    Gemini'da 15-30 daqiqagacha cho'zilardi. Endi ThreadPoolExecutor bilan
    parallel yuboramiz — Gemini kvotasini bosib qo'ymaslik uchun default 5.
    """
    return _int_setting('AI_QUESTION_PDF_MAX_PARALLEL', 5, 1, 10)


def _map_chunks_parallel(chunk_count, worker):
    """`worker(chunk_index)` ni 1..chunk_count uchun parallel chaqiradi.

    Natijalarni KIRISH TARTIBIDA (chunk_index bo'yicha) ro'yxat qilib qaytaradi —
    savollar ketma-ketligi PDFdagidek saqlanishi shart, shu sababli parallel
    bajarsak ham tartibni buzmaymiz. Bitta chunk'da chaqiruv istisno otsa,
    o'sha o'rin uchun None qaytadi (chaqiruvchi failed deb belgilaydi).
    """
    if chunk_count <= 0:
        return []
    if chunk_count == 1:
        # Bitta chunk — pool ortiqcha, to'g'ridan-to'g'ri chaqiramiz.
        try:
            return [worker(1)]
        except Exception:
            logger.exception('PDF chunk #1 worker failed')
            return [None]
    max_workers = min(_pdf_max_parallel(), chunk_count)
    results = [None] * chunk_count
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_index = {
            executor.submit(worker, index): index
            for index in range(1, chunk_count + 1)
        }
        for future in future_to_index:
            index = future_to_index[future]
            try:
                results[index - 1] = future.result()
            except Exception:
                logger.exception('PDF chunk #%s worker failed', index)
                results[index - 1] = None
    return results


def _extract_tables_per_page(pdf_bytes, max_pages=1000):
    """pdfplumber orqali har sahifadagi jadvallarni matnga aylantirib qaytaradi.

    pypdf jadval strukturasini yo'qotadi (ustunlar bir-biriga yopishadi), shuning
    uchun jadvalli savollar uchun pdfplumber'dan foydalanamiz. Qaytadigan dict:
    {sahifa_raqami: "ustun | ustun ... matn"}. pdfplumber yo'q bo'lsa yoki xato
    bo'lsa bo'sh dict qaytadi va chaqiruvchi pypdf matni bilan davom etadi.
    """
    if not pdf_bytes:
        return {}
    try:
        import pdfplumber
    except ImportError:
        logger.info('pdfplumber is not installed; PDF table structure will rely on pypdf only')
        return {}
    tables_by_page = {}
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page_number, page in enumerate(pdf.pages[:max_pages], start=1):
                try:
                    page_tables = page.extract_tables() or []
                except Exception:
                    continue
                rendered = []
                for table in page_tables:
                    rows = []
                    for row in table:
                        if not row:
                            continue
                        cells = [str(cell).strip() if cell else '' for cell in row]
                        if any(cells):
                            rows.append(' | '.join(cells))
                    if rows:
                        rendered.append('\n'.join(rows))
                if rendered:
                    tables_by_page[page_number] = '\n\n'.join(rendered)
    except Exception:
        logger.exception('pdfplumber table extraction failed; continuing with pypdf text')
        return {}
    return tables_by_page


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
        # Jadvallarni alohida (struktura saqlangan holda) pdfplumber bilan ajratamiz.
        tables_by_page = _extract_tables_per_page(pdf_bytes, max_pages=min(len(reader.pages), 1000))
        chunks = []
        max_chars = _int_setting('AI_QUESTION_PDF_MAX_TEXT_CHARS', 300000, 10000, 800000)
        for page_number, page in enumerate(reader.pages[:1000], start=1):
            text = (page.extract_text() or '').strip()
            table_text = tables_by_page.get(page_number, '')
            if not text and not table_text:
                continue
            block = f'\n\n--- PAGE {page_number} ---\n'
            if text:
                block += text
            if table_text:
                # Jadval matnini shu sahifa marker ichida saqlaymiz — _page_units
                # va boshqa bo'lish logikasi PAGE markerlariga tayanadi.
                block += f"\n[JADVAL]\n{table_text}"
            chunks.append(block)
            if sum(len(chunk) for chunk in chunks) >= max_chars:
                break
        return '\n'.join(chunks).strip()[:max_chars], len(reader.pages)
    except Exception:
        logger.exception('question PDF text extraction failed')
        return '', 0


def _pdf_has_images(pdf_bytes, max_pages=50):
    """PDF sahifalarida raster rasm (XObject Image) bor-yo'qligini aniqlaydi.

    Rasm/diagrammaga bog'liq savollar matndan to'liq ajralmaydi, shuning uchun
    rasm topilsa Gemini'ning vision (inline PDF) rejimini ustun qo'yamiz.
    """
    if not pdf_bytes:
        return False
    try:
        from pypdf import PdfReader
    except ImportError:
        return False
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        for page in reader.pages[:max_pages]:
            resources = page.get('/Resources')
            if not resources:
                continue
            xobjects = resources.get('/XObject') if hasattr(resources, 'get') else None
            if not xobjects:
                continue
            try:
                xobjects = xobjects.get_object()
            except Exception:
                pass
            for ref in (xobjects or {}).values():
                try:
                    obj = ref.get_object()
                except Exception:
                    continue
                if obj.get('/Subtype') == '/Image':
                    return True
        return False
    except Exception:
        logger.debug('PDF image detection failed', exc_info=True)
        return False


def _split_pdf_into_page_chunks(pdf_bytes, pages_per_chunk=10):
    if not pdf_bytes:
        return []
    try:
        from pypdf import PdfReader, PdfWriter
    except ImportError:
        logger.warning('pypdf is not installed; cannot split scanned PDF into page chunks')
        return []
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        total = len(reader.pages)
        if total <= 0:
            return []
        pages_per_chunk = max(1, int(pages_per_chunk or 10))
        chunks = []
        for start in range(0, total, pages_per_chunk):
            writer = PdfWriter()
            for page in reader.pages[start:start + pages_per_chunk]:
                writer.add_page(page)
            buf = io.BytesIO()
            writer.write(buf)
            chunks.append({
                'bytes': buf.getvalue(),
                'start_page': start + 1,
                'end_page': min(start + pages_per_chunk, total),
                'total_pages': total,
            })
        return chunks
    except Exception:
        logger.exception('failed to split PDF into page chunks')
        return []


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


def _prompt(subject, difficulty, question_type, has_extracted_text, pdf_text=''):
    source_hint = (
        "Quyida PDFdan ajratilgan matn beriladi."
        if has_extracted_text else
        "PDF faylning o'zini ko'rib tahlil qil."
    )
    base = (
        "Sen PROLYMP platformasi uchun PDFdan test savollarini ajratuvchi yordamchisan.\n"
        f"{source_hint}\n"
        "Vazifa: PDF ichidagi mavjud savollarni tartibini buzmasdan ajrat. "
        "PDFda savollar qanday ketma-ketlikda bo'lsa, JSON array ham shu tartibda bo'lsin. "
        "Bitta ham aniq ko'ringan savolni tashlab ketma. "
        "Yangi mavzu yoki ortiqcha savol o'ylab topma.\n"
        "PDF matnida [JADVAL] belgisi bo'lsa, u jadval mazmuni — ustunlar | bilan ajratilgan. "
        "Jadvalga oid savollarda jadval ma'lumotini to'g'ri o'qib, savol va variantlarni aniqla.\n"
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
        "Savollar ko'p bo'lsa ham qisqartirma; har bir savol alohida obyekt bo'lsin. "
        "Natijani faqat JSON schema bo'yicha qaytar."
    )
    extras = QUALITY_PROMPT + NO_ANSWER_PROMPT_ADDITION
    # Vision rejimida (matn ajratilmagan) Gemini rasmni ko'radi — rasm ko'rsatmasini
    # qo'shamiz. Matnli rejimda rasmga havola qiluvchi savollar ham bo'lishi mumkin.
    extras += VISION_PROMPT_ADDITION
    if _looks_mathematical(subject, pdf_text):
        extras += MATH_PROMPT_ADDITION
    return base + extras


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
    primary = getattr(settings, 'AI_QUESTION_GEMINI_MODEL', 'gemini-2.0-flash')
    fallbacks = list(getattr(settings, 'AI_QUESTION_GEMINI_FALLBACK_MODELS', []) or [])
    # Faqat haqiqatda mavjud bo'lgan modellar. Avval bu yerda
    # 'gemini-3.1-flash-lite' va 'gemini-3-flash-preview' bor edi — ular Google
    # API'da yo'q va birinchi urinishda 404 qaytarib har so'rovni sekinlashtirardi.
    defaults = [
        'gemini-2.0-flash',
        'gemini-1.5-flash',
        'gemini-1.5-pro',
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
    # Unicode apostroflarni ('‘ ’ ‛ `') ASCII (') ga keltiramiz — "o‘rta"
    # va "o'rta" bitta kalitga ('o'rta') tushadi.
    normalized = str(value or '').strip().lower()
    for ch in ('‘', '’', '‛', '`'):
        normalized = normalized.replace(ch, "'")
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


def _question_identity(question):
    number = re.sub(r'\s+', '', str(question.get('original_number') or '').casefold())
    text = re.sub(r'\s+', ' ', str(question.get('text') or '').strip().casefold())
    if number and number not in ('-', '0'):
        return f'{number}:{text[:140]}'
    return text[:220]


def _merge_questions(question_lists):
    merged = []
    seen = set()
    for questions in question_lists:
        for question in questions or []:
            key = _question_identity(question)
            if not key or key in seen:
                continue
            seen.add(key)
            item = dict(question)
            item['order'] = len(merged) + 1
            merged.append(item)
    return merged


def _clean_extracted_text(text):
    text = re.sub(r'--- PAGE \d+ ---', '\n', str(text or ''), flags=re.IGNORECASE)
    text = text.replace('\r\n', '\n').replace('\r', '\n')
    text = re.sub(r'[ \t]+', ' ', text)
    return re.sub(r'\n{3,}', '\n\n', text).strip()


def _clean_question_text(text):
    text = _clean_extracted_text(text)
    text = re.sub(
        r'^\s*(?:(?:savol\s*)?\d{1,4}\s*(?:[-–]\s*savol)?[\).\:\-]|\d{1,4}\s*[-–]\s*savol[\).\:\-]?)\s*',
        '',
        text,
        flags=re.IGNORECASE,
    )
    return re.sub(r'\s+', ' ', text).strip()


def _parse_answer_key(pdf_text):
    text = _clean_extracted_text(pdf_text)
    lower = text.casefold()
    starts = [
        lower.rfind(keyword)
        for keyword in ('javoblar', "to'g'ri javob", "to‘g‘ri javob", 'answer key', 'answers')
    ]
    start = max(starts)
    if start < 0:
        return {}
    region = text[start:]
    answers = {}
    for match in re.finditer(r'(?<!\d)(\d{1,4})\s*[\).\:\-]?\s*([A-H])\b', region, flags=re.IGNORECASE):
        answers[int(match.group(1))] = ord(match.group(2).upper()) - ord('A')
    return answers


def _block_answer_index(block):
    match = re.search(
        r'(?:javob|to\s*[\'‘’`]?g\s*[\'‘’`]?ri\s+javob|answer)\s*[:\-]?\s*([A-H])\b',
        block,
        flags=re.IGNORECASE,
    )
    if not match:
        return None
    return ord(match.group(1).upper()) - ord('A')


def _question_blocks_from_text(pdf_text):
    text = _clean_extracted_text(pdf_text)
    if not text:
        return []
    line_pattern = re.compile(
        r'(?im)^\s*(?:(?:savol\s*)?(\d{1,4})\s*(?:[-–]\s*savol)?[\).\:\-]|(\d{1,4})\s*[-–]\s*savol[\).\:\-]?)\s+'
    )
    matches = list(line_pattern.finditer(text))
    if len(matches) <= 1:
        inline_pattern = re.compile(
            r'(?i)(?<![\w])(?:(?:savol\s*)?(\d{1,4})\s*(?:[-–]\s*savol)?[\).\:\-]|(\d{1,4})\s*[-–]\s*savol[\).\:\-]?)\s+'
        )
        inline_matches = list(inline_pattern.finditer(text))
        if len(inline_matches) > len(matches):
            matches = inline_matches
    if not matches:
        return [('1', text)] if re.search(r'(?im)^\s*[A-H]\s*[\)\.\:\-]\s+', text) else []
    blocks = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        number = match.group(1) or match.group(2) or str(index + 1)
        block = text[match.start():end].strip()
        if block:
            blocks.append((number, block))
    return blocks


def _options_from_block(block):
    option_pattern = re.compile(r'(?im)(?:^|(?<=\s))([A-H])\s*[\)\.\:\-]\s*')
    matches = list(option_pattern.finditer(block))
    if len(matches) < 2:
        return '', []
    question_text = block[:matches[0].start()]
    options = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(block)
        option = block[match.end():end]
        option = re.split(
            r'(?i)\b(?:javoblar|to\s*[\'‘’`]?g\s*[\'‘’`]?ri\s+javob|answer key|answers)\b',
            option,
        )[0]
        option = re.sub(r'\s+', ' ', option).strip(' .;,-')
        if option:
            options.append(option)
    return question_text, options


def _parse_questions_from_text(pdf_text, subject, difficulty, question_type):
    answer_key = _parse_answer_key(pdf_text)
    parsed = []
    true_false = str(question_type or '').strip().lower() in {
        "to'g'ri/noto'g'ri",
        "to‘g‘ri/noto‘g‘ri",
        'true_false',
        'true-false',
    }
    for fallback_index, (number, block) in enumerate(_question_blocks_from_text(pdf_text), start=1):
        question_text, options = _options_from_block(block)
        if len(options) < 2 and true_false:
            question_text = block
            options = ["To'g'ri", "Noto'g'ri"]
        text = _clean_question_text(question_text)
        if len(text) < 5 or len(options) < 2:
            continue
        number_int = None
        try:
            number_int = int(number)
        except (TypeError, ValueError):
            pass
        block_answer = _block_answer_index(block)
        answer_index = answer_key.get(number_int, block_answer) if number_int is not None else block_answer
        if answer_index is None or answer_index < 0 or answer_index >= len(options):
            answer_index = 0
            answer_source = 'missing'
        else:
            answer_source = 'pdf'
        parsed.append({
            'original_number': str(number or fallback_index),
            'text': text,
            'options': options,
            'correct_answer': answer_index,
            'answer_source': answer_source,
            'needs_review': answer_source != 'pdf',
            'difficulty': difficulty,
            'score': 3,
        })
    return _normalize_questions({'questions': parsed}, subject, difficulty)


def _page_units(pdf_text):
    text = str(pdf_text or '').strip()
    if not text:
        return []
    matches = list(re.finditer(r'(?:^|\n\n)--- PAGE \d+ ---\n', text))
    if not matches:
        return []
    units = []
    for index, match in enumerate(matches):
        start = match.start()
        if text[start:start + 2] == '\n\n':
            start += 2
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        unit = text[start:end].strip()
        if unit:
            units.append(unit)
    return units


def _question_units(pdf_text):
    text = str(pdf_text or '').strip()
    if not text:
        return []
    units = _page_units(text)
    if units:
        return units
    units = [
        unit.strip()
        for unit in re.split(r'(?=\n\s*(?:savol\s*)?\d{1,4}[\).\:-]\s+)', text, flags=re.IGNORECASE)
        if unit.strip()
    ]
    return units if len(units) > 1 else [text]


def _split_pdf_text_chunks(pdf_text):
    text = str(pdf_text or '').strip()
    if not text:
        return []
    chunk_chars = _int_setting('AI_QUESTION_PDF_CHUNK_CHARS', 25000, 8000, 60000)
    max_chunks = _int_setting('AI_QUESTION_PDF_MAX_CHUNKS', 20, 1, 50)
    if len(text) <= chunk_chars:
        return [text]

    chunks = []
    current = []
    current_len = 0

    def flush():
        nonlocal current, current_len
        if current and len(chunks) < max_chunks:
            chunks.append('\n\n'.join(current).strip())
        current = []
        current_len = 0

    for unit in _question_units(text):
        unit = unit.strip()
        if not unit:
            continue
        if len(unit) > chunk_chars:
            flush()
            for start in range(0, len(unit), chunk_chars):
                if len(chunks) >= max_chunks:
                    break
                chunks.append(unit[start:start + chunk_chars].strip())
            continue
        unit_len = len(unit) + 2
        if current and current_len + unit_len > chunk_chars:
            flush()
        current.append(unit)
        current_len += unit_len
        if len(chunks) >= max_chunks:
            break
    flush()

    if len(chunks) >= max_chunks and sum(len(chunk) for chunk in chunks) < len(text):
        logger.warning('PDF text chunking stopped at AI_QUESTION_PDF_MAX_CHUNKS=%s', max_chunks)
    return chunks or [text[:chunk_chars]]


def _openai_from_text(pdf_text, subject, difficulty, question_type):
    keys = _openai_keys()
    if not keys:
        return {'ok': False, 'missing_key': True, 'error': "OpenAI API kaliti sozlanmagan.", 'questions': []}
    if not pdf_text:
        return {'ok': False, 'error': "PDF matni topilmadi.", 'questions': []}
    prompt = f"{_prompt(subject, difficulty, question_type, True, pdf_text)}\n\nPDF matni:\n{pdf_text}"
    payload = {
        'model': getattr(settings, 'AI_QUESTION_MODEL', 'gpt-4o-mini'),
        'messages': [{
            'role': 'user',
            'content': prompt,
        }],
        'response_format': {
            'type': 'json_schema',
            'json_schema': {
                'name': 'olympy_pdf_questions',
                'schema': _schema_openai(),
                'strict': True,
            },
        },
        'max_tokens': getattr(settings, 'AI_QUESTION_MAX_OUTPUT_TOKENS', 6000),
    }
    body = json.dumps(payload).encode('utf-8')
    last_error = ''
    for index, api_key in enumerate(keys, start=1):
        req = urllib.request.Request(
            'https://api.openai.com/v1/chat/completions',
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


def _gemini_payload(pdf_bytes, pdf_text, subject, difficulty, question_type, include_pdf, chunk_note=''):
    use_inline_pdf = include_pdf and bool(pdf_bytes)
    prompt = _prompt(subject, difficulty, question_type, not use_inline_pdf, pdf_text)
    if chunk_note:
        prompt = f'{prompt}\n\n{chunk_note}'
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
    generation_config = {
        'responseMimeType': 'application/json',
        'responseSchema': _schema_gemini(),
    }
    max_output_tokens = _int_setting('AI_QUESTION_GEMINI_MAX_OUTPUT_TOKENS', 8192, 1024, 65536)
    if max_output_tokens:
        generation_config['maxOutputTokens'] = max_output_tokens
    return {
        'contents': [{'role': 'user', 'parts': parts}],
        'generationConfig': generation_config,
    }


def _gemini_request(payload, subject, difficulty, mode_label, used_pdf_vision=False):
    keys = _gemini_keys()
    body = json.dumps(payload).encode('utf-8')
    last_error = ''
    saw_empty_questions = False
    saw_quota_error = False
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
                    return {
                        'ok': True,
                        'provider': 'gemini',
                        'questions': questions,
                        'used_pdf_vision': used_pdf_vision,
                    }
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


def _gemini_extract_text_chunks(pdf_text, subject, difficulty, question_type):
    chunks = _split_pdf_text_chunks(pdf_text)
    if len(chunks) <= 1:
        return None

    chunk_count = len(chunks)

    def _run_chunk(chunk_index):
        chunk = chunks[chunk_index - 1]
        chunk_note = (
            f"Bu PDF matnining {chunk_index}/{chunk_count}-bo'lagi. "
            "Faqat shu bo'lakda ko'ringan savollarni ajrat. "
            "Oldingi yoki keyingi bo'lakdagi savollarni o'ylab topma. "
            "Agar bo'lak ichida savol raqamlari davom etsa, raqamlarni original_number sifatida saqla."
        )
        payload = _gemini_payload(
            None,
            chunk,
            subject,
            difficulty,
            question_type,
            False,
            chunk_note=chunk_note,
        )
        return _gemini_request(
            payload,
            subject,
            difficulty,
            f'text_chunk_{chunk_index}_of_{chunk_count}',
            used_pdf_vision=False,
        )

    # Chunk'larni parallel yuboramiz (ThreadPoolExecutor, max 5) — tartib saqlanadi.
    chunk_results = _map_chunks_parallel(chunk_count, _run_chunk)
    collected = []
    failed_chunks = []
    for chunk_index, result in enumerate(chunk_results, start=1):
        if result and result.get('ok'):
            collected.append(result.get('questions') or [])
        else:
            failed_chunks.append(chunk_index)

    merged = _merge_questions(collected)
    if merged:
        warning = ''
        if failed_chunks:
            warning = (
                f"PDFning {len(failed_chunks)} ta bo'lagi to'liq ajratilmadi. "
                "Natijani saqlashdan oldin PDF bilan solishtirib tekshiring."
            )
        return {
            'ok': True,
            'provider': 'gemini',
            'questions': merged,
            'used_pdf_vision': False,
            'complete': not failed_chunks,
            'warning': warning,
            'chunks': chunk_count,
        }
    return {
        'ok': False,
        'error': "Gemini PDF bo'laklaridan savollar topa olmadi.",
        'provider_error': 'empty_questions',
        'questions': [],
    }


def _gemini_vision_chunks(pdf_bytes, pdf_text, subject, difficulty, question_type):
    pages_per_chunk = _int_setting('AI_QUESTION_PDF_VISION_PAGES_PER_CHUNK', 10, 1, 50)
    min_pages_for_split = _int_setting('AI_QUESTION_PDF_VISION_MIN_PAGES', 15, 1, 1000)
    chunks = _split_pdf_into_page_chunks(pdf_bytes, pages_per_chunk=pages_per_chunk)
    if not chunks:
        return None
    total_pages = chunks[0].get('total_pages') or 0
    if total_pages and total_pages < min_pages_for_split:
        return None
    if len(chunks) <= 1:
        return None

    chunk_count = len(chunks)

    def _run_chunk(chunk_index):
        chunk = chunks[chunk_index - 1]
        chunk_note = (
            f"Bu PDFning {chunk_index}/{chunk_count}-bo'lagi "
            f"(sahifa {chunk.get('start_page')}–{chunk.get('end_page')}/{chunk.get('total_pages')}). "
            "Faqat shu bo'lakdagi sahifalarda ko'ringan savollarni ajrat. "
            "Oldingi yoki keyingi bo'lakdagi savollarni o'ylab topma. "
            "PDFdagi savol raqamlari davom etsa, ularni original_number sifatida saqla."
        )
        payload = _gemini_payload(
            chunk.get('bytes'),
            '',
            subject,
            difficulty,
            question_type,
            True,
            chunk_note=chunk_note,
        )
        return _gemini_request(
            payload,
            subject,
            difficulty,
            f'vision_chunk_{chunk_index}_of_{chunk_count}',
            used_pdf_vision=True,
        )

    # Sahifa bo'laklarini parallel yuboramiz (ThreadPoolExecutor, max 5) — tartib saqlanadi.
    chunk_results = _map_chunks_parallel(chunk_count, _run_chunk)
    collected = []
    failed_chunks = []
    for chunk_index, result in enumerate(chunk_results, start=1):
        if result and result.get('ok'):
            collected.append(result.get('questions') or [])
        else:
            failed_chunks.append(chunk_index)

    merged = _merge_questions(collected)
    if merged:
        warning = ''
        if failed_chunks:
            warning = (
                f"PDFning {len(failed_chunks)} ta sahifa bo'lagi to'liq ajratilmadi. "
                "Natijani saqlashdan oldin PDF bilan solishtirib tekshiring."
            )
        return {
            'ok': True,
            'provider': 'gemini',
            'questions': merged,
            'used_pdf_vision': True,
            'complete': not failed_chunks,
            'warning': warning,
            'chunks': chunk_count,
        }
    return {
        'ok': False,
        'error': "Gemini PDF sahifa bo'laklaridan savollar topa olmadi.",
        'provider_error': 'empty_questions',
        'questions': [],
    }


def _gemini_extract(pdf_bytes, pdf_text, subject, difficulty, question_type):
    keys = _gemini_keys()
    if not keys:
        return {'ok': False, 'missing_key': True, 'error': "Gemini API kaliti sozlanmagan.", 'questions': []}

    best_result = None
    chunked_result = _gemini_extract_text_chunks(pdf_text, subject, difficulty, question_type) if pdf_text else None
    if chunked_result and chunked_result.get('ok'):
        if chunked_result.get('complete', True):
            return chunked_result
        best_result = chunked_result

    # Skan/rasm PDF (yoki matn umuman ajratilmagan) — sahifalar bo'yicha vision rejimi
    if not pdf_text and pdf_bytes:
        vision_chunked = _gemini_vision_chunks(pdf_bytes, pdf_text, subject, difficulty, question_type)
        if vision_chunked and vision_chunked.get('ok'):
            if vision_chunked.get('complete', True):
                return vision_chunked
            if best_result is None or len(vision_chunked.get('questions') or []) > len(best_result.get('questions') or []):
                best_result = vision_chunked

    # Matn bo'lsa odatda avval text rejimi (tezroq), keyin vision (inline PDF).
    # Lekin PDFda rasm/diagramma bor bo'lsa, savollar rasmga bog'liq bo'lishi
    # mumkin — bunda vision rejimini oldinga qo'yamiz.
    if not pdf_text:
        modes = [True]
    elif pdf_bytes and _pdf_has_images(pdf_bytes):
        modes = [True, False]
    else:
        modes = [False, True]
    failures = []
    for include_pdf in modes:
        mode_label = 'inline_pdf' if include_pdf else 'text'
        result = _gemini_request(
            _gemini_payload(
                pdf_bytes,
                pdf_text,
                subject,
                difficulty,
                question_type,
                include_pdf,
            ),
            subject,
            difficulty,
            mode_label,
            used_pdf_vision=include_pdf,
        )
        if result.get('ok'):
            if best_result and len(best_result.get('questions') or []) >= len(result.get('questions') or []):
                return best_result
            return result
        failures.append(result)

    if best_result:
        return best_result
    last_error = ''
    saw_empty_questions = False
    saw_quota_error = False
    for failure in failures:
        provider_error = failure.get('provider_error') or ''
        last_error = provider_error or last_error
        saw_empty_questions = saw_empty_questions or provider_error == 'empty_questions'
        saw_quota_error = saw_quota_error or provider_error == 'HTTP 429'
    if saw_empty_questions and saw_quota_error:
        last_error = 'empty_questions'
    return {'ok': False, 'error': _gemini_pdf_error(last_error), 'provider_error': last_error, 'questions': []}


def extract_questions_from_text(text, subject, difficulty='medium', question_type='multiple_choice'):
    """Tayyor matndan (PDF baytlari emas) AI yordamida savollarni ajratadi.

    Word (.docx) matni shu yo'l orqali o'tadi: docx'dan ajratilgan matn to'g'ridan-
    to'g'ri uzatiladi va PDF oqimidagi xuddi shu AI logikasi (OpenAI/Gemini matn
    rejimi + regex parser fallback) qayta ishlatiladi. PDF baytlari yo'qligi
    sababli vision/inline-PDF rejimi ishlatilmaydi, `page_count=0` va
    `used_pdf_vision=False`. Qaytadigan dict shakli extract_questions_from_pdf
    bilan bir xil — mavjud status endpoint va frontend o'zgartirilmasdan ishlaydi.
    """
    source_text = str(text or '').strip()
    text_chunk_count = len(_split_pdf_text_chunks(source_text)) if source_text else 0

    if not source_text:
        return {
            'ok': False,
            'error': "Word faylda matn topilmadi. Hujjatda savollar matn ko'rinishida ekanini tekshiring.",
            'questions': [],
            'pdf_text_chars': 0,
            'page_count': 0,
            'used_pdf_vision': False,
        }

    has_openai = bool(_openai_keys())
    has_gemini = bool(_gemini_keys())

    openai_result = {'ok': False}
    gemini_result = {'ok': False}

    if has_openai or has_gemini:
        if has_openai:
            openai_result = _openai_from_text(source_text, subject, difficulty, question_type)
            if openai_result.get('ok') and text_chunk_count <= 1:
                openai_result['pdf_text_chars'] = len(source_text)
                openai_result['page_count'] = 0
                openai_result['used_pdf_vision'] = False
                openai_result['complete'] = True
                return openai_result

        if has_gemini:
            # pdf_bytes=None — Gemini faqat matn rejimida ishlaydi (vision yo'q).
            gemini_result = _gemini_extract(None, source_text, subject, difficulty, question_type)
            if gemini_result.get('ok'):
                if openai_result.get('ok') and len(openai_result.get('questions') or []) > len(gemini_result.get('questions') or []):
                    openai_result['pdf_text_chars'] = len(source_text)
                    openai_result['page_count'] = 0
                    openai_result['used_pdf_vision'] = False
                    openai_result['complete'] = False
                    openai_result['warning'] = "Katta hujjat bir martada ajratildi. Natijani asl fayl bilan solishtirib tekshiring."
                    openai_result['chunks'] = text_chunk_count
                    return openai_result
                gemini_result['pdf_text_chars'] = len(source_text)
                gemini_result['page_count'] = 0
                gemini_result['used_pdf_vision'] = False
                gemini_result['complete'] = gemini_result.get('complete', True)
                gemini_result['chunks'] = gemini_result.get('chunks') or max(text_chunk_count, 1)
                return gemini_result

        if openai_result.get('ok'):
            openai_result['pdf_text_chars'] = len(source_text)
            openai_result['page_count'] = 0
            openai_result['used_pdf_vision'] = False
            openai_result['complete'] = False
            openai_result['warning'] = "Katta hujjat bo'lgani uchun barcha savollar chiqqanini asl fayl bilan solishtirib tekshiring."
            openai_result['chunks'] = text_chunk_count
            return openai_result

    # Fallback: AI yo'q/ishlamadi — mahalliy regex parser.
    parser_questions = _parse_questions_from_text(source_text, subject, difficulty, question_type)
    if parser_questions:
        return {
            'ok': True,
            'provider': 'parser',
            'questions': parser_questions,
            'pdf_text_chars': len(source_text),
            'page_count': 0,
            'used_pdf_vision': False,
            'complete': True,
            'chunks': max(text_chunk_count, 1),
            'warning': (
                "Savollar matndan tez ajratildi. "
                "Javoblar topilmagan savollar saqlashdan oldin tekshirilishi kerak."
            ),
        }

    detail = (
        "Word matni o'qildi, lekin savol va variantlar aniq ajratilmadi. "
        "Savollar 1., 2. va variantlar A), B), C), D) kabi ko'rinishda ekanini tekshiring."
    )
    if gemini_result.get('error') or gemini_result.get('provider_error'):
        detail = f"{detail} / {gemini_result.get('error') or gemini_result.get('provider_error')}"
    elif openai_result.get('error') or openai_result.get('provider_error'):
        detail = f"{detail} / {openai_result.get('error') or openai_result.get('provider_error')}"

    return {
        'ok': False,
        'error': detail,
        'questions': [],
        'pdf_text_chars': len(source_text),
        'page_count': 0,
        'used_pdf_vision': False,
    }


def extract_questions_from_pdf(pdf_bytes, subject, difficulty='medium', question_type='multiple_choice'):
    pdf_text, page_count = _extract_pdf_text(pdf_bytes)
    text_chunk_count = len(_split_pdf_text_chunks(pdf_text)) if pdf_text else 0
    # Check if AI keys are configured
    has_openai = bool(_openai_keys())
    has_gemini = bool(_gemini_keys())
    
    openai_result = {'ok': False}
    gemini_result = {'ok': False}
    
    if has_openai or has_gemini:
        if has_openai:
            openai_result = _openai_from_text(pdf_text, subject, difficulty, question_type)
            if openai_result.get('ok') and text_chunk_count <= 1:
                openai_result['pdf_text_chars'] = len(pdf_text)
                openai_result['page_count'] = page_count
                openai_result['used_pdf_vision'] = False
                openai_result['complete'] = True
                return openai_result
        
        if has_gemini:
            gemini_result = _gemini_extract(pdf_bytes, pdf_text, subject, difficulty, question_type)
            if gemini_result.get('ok'):
                if openai_result.get('ok') and len(openai_result.get('questions') or []) > len(gemini_result.get('questions') or []):
                    openai_result['pdf_text_chars'] = len(pdf_text)
                    openai_result['page_count'] = page_count
                    openai_result['used_pdf_vision'] = False
                    openai_result['complete'] = False
                    openai_result['warning'] = "Katta PDF bir martada ajratildi. Natijani asl PDF bilan solishtirib tekshiring."
                    openai_result['chunks'] = text_chunk_count
                    return openai_result
                if openai_result.get('provider_error') or openai_result.get('error'):
                    logger.info('PDF question extraction used Gemini after OpenAI failed: %s', openai_result.get('provider_error') or openai_result.get('error'))
                gemini_result['pdf_text_chars'] = len(pdf_text)
                gemini_result['page_count'] = page_count
                gemini_result['used_pdf_vision'] = bool(gemini_result.get('used_pdf_vision'))
                gemini_result['complete'] = gemini_result.get('complete', True)
                gemini_result['chunks'] = gemini_result.get('chunks') or max(text_chunk_count, 1)
                return gemini_result
                
        if openai_result.get('ok'):
            openai_result['pdf_text_chars'] = len(pdf_text)
            openai_result['page_count'] = page_count
            openai_result['used_pdf_vision'] = False
            openai_result['complete'] = False
            openai_result['warning'] = "Katta PDF bo'lgani uchun barcha savollar chiqqanini PDF bilan solishtirib tekshiring."
            openai_result['chunks'] = text_chunk_count
            return openai_result

    # Fallback to local regex-based parser
    parser_questions = _parse_questions_from_text(pdf_text, subject, difficulty, question_type)
    if parser_questions:
        return {
            'ok': True,
            'provider': 'parser',
            'questions': parser_questions,
            'pdf_text_chars': len(pdf_text),
            'page_count': page_count,
            'used_pdf_vision': False,
            'complete': True,
            'chunks': max(text_chunk_count, 1),
            'warning': (
                "PDF savollari matndan tez ajratildi. "
                "Javoblar topilmagan savollar saqlashdan oldin tekshirilishi kerak."
            ),
        }
        
    if not pdf_text:
        detail = (
            "PDFdan matn ajralmadi. Agar PDF skan/rasm bo'lsa, sifatliroq yoki matnli PDF yuklang. "
            "Gemini ham PDFdan savol topa olmadi."
        )
    else:
        detail = (
            "PDF matni o'qildi, lekin savol va variantlar aniq ajratilmadi. "
            "Savollar 1., 2. va variantlar A), B), C), D) kabi ko'rinishda ekanini tekshiring."
        )
        if gemini_result.get('error') or gemini_result.get('provider_error'):
            detail = f"{detail} / {gemini_result.get('error') or gemini_result.get('provider_error')}"
        elif openai_result.get('error') or openai_result.get('provider_error'):
            detail = f"{detail} / {openai_result.get('error') or openai_result.get('provider_error')}"
            
    return {
        'ok': False,
        'error': detail,
        'questions': [],
        'pdf_text_chars': len(pdf_text),
        'page_count': page_count,
        'used_pdf_vision': not bool(pdf_text),
    }
