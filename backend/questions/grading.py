"""Savol turi bo'yicha javobni baholash mantiqi.

Bir nechta joy (attempts/session_utils.py, practice/views.py) avval faqat
`chosen_idx == correct_answer` ni tekshirardi — bu yangi savol turlari
(multiple_select, fill_blank, fill_blanks, yes_no, essay) uchun noto'g'ri
edi. Bu modul yagona, izchil baholashni ta'minlaydi.

`grade_answer(question, chosen)` quyidagini qaytaradi:
    'correct'         — javob to'g'ri
    'wrong'           — javob berilgan, lekin noto'g'ri
    'blank'           — javob berilmagan
    'pending_review'  — qo'lda baholash kerak (essay)

`chosen` ko'rsatkichi savol turiga bog'liq:
  - mcq / yes_no            → option indeksi (int). MUHIM: option shuffle
                              bo'lgan joyda chaqiruvchi avval asl indeksga
                              o'girib beradi (de-shuffle).
  - multiple_select         → indekslar ro'yxati (list[int])
  - fill_blank              → matn (str)
  - fill_blanks             → {"1": "...", ...} dict yoki list
  - slider                  → raqamli qiymat (int/float). Variant yo'q, shu
                              sababli de-shuffle QILINMAYDI — xom son beriladi.
  - essay                   → har qanday qiymat (baholanmaydi)
"""
import json

# Natija konstantalari.
RESULT_CORRECT = 'correct'
RESULT_WRONG = 'wrong'
RESULT_BLANK = 'blank'
RESULT_PENDING = 'pending_review'


def _is_blank(value):
    if value is None:
        return True
    if isinstance(value, str) and value.strip() == '':
        return True
    if isinstance(value, (list, tuple, dict)) and len(value) == 0:
        return True
    return False


def _normalize_text(value):
    """fill_blank uchun case-insensitive solishtirish normalizatsiyasi."""
    return str(value).strip().casefold()


def _parse_correct_text(raw):
    """`correct_text` JSON bo'lsa parse qiladi, aks holda xom matn qaytaradi."""
    if raw is None:
        return ''
    if not isinstance(raw, str):
        return raw
    raw = raw.strip()
    if not raw:
        return ''
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        return raw


def public_slider_range(question):
    """slider savolining O'QUVCHIGA ko'rsatiladigan (javobsiz) sozlamasi.

    `correct_text` ichida to'g'ri javob ham bor
    ({"min","max","step","correct","tolerance"}) — uni butunligicha
    yuborib bo'lmaydi. Bu yerdan FAQAT `min`/`max`/`step` qaytadi,
    `correct`/`tolerance` HECH QACHON qaytmaydi (aks holda javob sizib
    chiqadi va slayder savoli ma'nosini yo'qotadi).

    Buzuq/yo'q sozlamada xavfsiz standart oraliq (0..100, qadam 1) beriladi —
    shunda o'quvchi hech bo'lmasa javob bera oladi, ekran bo'sh qolmaydi.
    """
    cfg = _parse_correct_text(getattr(question, 'correct_text', ''))
    if not isinstance(cfg, dict):
        cfg = {}
    try:
        s_min = int(cfg.get('min', 0) or 0)
        s_max = int(cfg.get('max', 100) or 100)
        s_step = int(cfg.get('step', 1) or 1)
    except (TypeError, ValueError):
        s_min, s_max, s_step = 0, 100, 1
    if s_max <= s_min:
        s_min, s_max = 0, 100
    if s_step <= 0:
        s_step = 1
    return {'min': s_min, 'max': s_max, 'step': s_step}


def _grade_multiple_select(question, chosen):
    correct_raw = _parse_correct_text(getattr(question, 'correct_text', ''))
    if not isinstance(correct_raw, (list, tuple)):
        return RESULT_WRONG
    try:
        correct_set = {int(x) for x in correct_raw}
    except (TypeError, ValueError):
        return RESULT_WRONG
    if not isinstance(chosen, (list, tuple, set)):
        return RESULT_WRONG
    try:
        chosen_set = {int(x) for x in chosen}
    except (TypeError, ValueError):
        return RESULT_WRONG
    return RESULT_CORRECT if chosen_set == correct_set else RESULT_WRONG


def _grade_fill_blank(question, chosen):
    # fill_blank — bitta matnli javob; case-insensitive solishtirish.
    # correct_text odatda oddiy matn, lekin xato bilan JSON saqlangan bo'lsa
    # ham xom string sifatida solishtiramiz (parse qilmaymiz).
    correct_raw = getattr(question, 'correct_text', '') or ''
    if _normalize_text(chosen) == _normalize_text(correct_raw):
        return RESULT_CORRECT
    return RESULT_WRONG


def _grade_fill_blanks(question, chosen):
    correct = _parse_correct_text(getattr(question, 'correct_text', ''))
    if not isinstance(correct, dict) or not correct:
        return RESULT_WRONG
    # Javob dict yoki list bo'lishi mumkin — kalitlarni stringga keltiramiz.
    if isinstance(chosen, (list, tuple)):
        chosen_map = {str(i + 1): v for i, v in enumerate(chosen)}
    elif isinstance(chosen, dict):
        chosen_map = {str(k): v for k, v in chosen.items()}
    else:
        return RESULT_WRONG
    # Har bir bo'sh joy case-insensitive to'g'ri bo'lishi kerak.
    for key, expected in correct.items():
        if _normalize_text(chosen_map.get(str(key), '')) != _normalize_text(expected):
            return RESULT_WRONG
    return RESULT_CORRECT


def _grade_slider(question, chosen):
    """slider — o'quvchi surgan raqam `correct` ± `tolerance` ichidami.

    `correct_text` JSON sozlama saqlaydi:
        {"min": 0, "max": 100, "step": 1, "correct": 42, "tolerance": 5}
    `correct_answer` bu tur uchun ISHLATILMAYDI (0 ga qotirilgan) — shu sababli
    _grade_index bu yerga tushmasligi kerak.

    Buzuq/yo'q sozlama yoki raqam bo'lmagan javob istisno tashlamaydi, oddiy
    RESULT_WRONG qaytaradi — bitta buzuq savol butun baholashni to'xtatmasin.
    """
    cfg = _parse_correct_text(getattr(question, 'correct_text', ''))
    if not isinstance(cfg, dict):
        return RESULT_WRONG
    try:
        correct = float(cfg['correct'])
        tolerance = abs(float(cfg.get('tolerance') or 0))
    except (KeyError, TypeError, ValueError):
        return RESULT_WRONG
    # bool int'ning kichik turi — True/False javobni son deb qabul qilmaymiz.
    if isinstance(chosen, bool):
        return RESULT_WRONG
    try:
        value = float(chosen)
    except (TypeError, ValueError):
        return RESULT_WRONG
    return RESULT_CORRECT if abs(value - correct) <= tolerance else RESULT_WRONG


def _grade_index(question, chosen):
    """mcq / yes_no — option indeksi correct_answer bilan solishtiriladi.

    yes_no: 0=Yes (Ha), 1=No (Yo'q) — correct_answer shu indeks bo'yicha.
    """
    try:
        chosen_idx = int(chosen)
    except (TypeError, ValueError):
        return RESULT_WRONG
    return RESULT_CORRECT if chosen_idx == question.correct_answer else RESULT_WRONG


def grade_answer(question, chosen):
    """Savol turiga qarab javobni baholaydi. RESULT_* qiymat qaytaradi.

    `chosen` — chaqiruvchi tomonidan tayyorlangan javob (option shuffle
    bo'lgan joyda avval asl indeksga o'girilgan bo'lishi kerak).
    """
    q_type = (getattr(question, 'question_type', 'mcq') or 'mcq')

    # Javob umuman berilmagan bo'lsa — barcha turlar uchun blank.
    if _is_blank(chosen):
        return RESULT_BLANK

    # To'ldirilgan essay hech qachon avtomatik baholanmaydi — qo'lda ko'riladi.
    if q_type == 'essay':
        return RESULT_PENDING

    if q_type == 'multiple_select':
        return _grade_multiple_select(question, chosen)
    if q_type == 'fill_blank':
        return _grade_fill_blank(question, chosen)
    if q_type == 'fill_blanks':
        return _grade_fill_blanks(question, chosen)
    if q_type == 'slider':
        return _grade_slider(question, chosen)
    # mcq, yes_no va boshqa indeksli turlar (default).
    return _grade_index(question, chosen)
