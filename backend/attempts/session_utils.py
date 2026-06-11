import random
from datetime import timedelta

from django.db import IntegrityError, transaction
from django.utils import timezone

from questions.grading import (
    RESULT_CORRECT,
    RESULT_PENDING,
    _parse_correct_text,
    grade_answer,
)
from questions.models import Question

from .models import TestSession


def session_end_time(session, olympiad):
    if not session or not olympiad.duration_minutes:
        return None
    return session.started_at + timedelta(minutes=olympiad.duration_minutes)


# Submit grace period: frontend timer 0 ga yetganda submit yuboradi, lekin
# sekin tarmoqda so'rov serverga muddat tugagandan KEYIN yetib borishi mumkin.
# 60 soniyalik grace oynasi — halol o'quvchining javoblari yo'qolmasligi uchun.
SUBMIT_GRACE_SECONDS = 60


def session_is_expired(session, olympiad, grace_seconds=0):
    """Sessiya muddati tugaganmi. `grace_seconds` — qo'shimcha imtiyoz oynasi.

    Submit oqimida SUBMIT_GRACE_SECONDS bilan chaqiriladi: frontend timeri
    0 ga yetganda yuborilgan so'rov sekin tarmoqda kechikib kelsa ham
    javoblar qabul qilinadi. Savol olish oqimida grace ishlatilmaydi.
    """
    end_time = session_end_time(session, olympiad)
    if not end_time:
        return False
    return timezone.now() > end_time + timedelta(seconds=grace_seconds)


def get_or_create_test_session(user, olympiad):
    rng = random.SystemRandom()
    # `select_for_update().get_or_create(...)` Django'da race condition'dan
    # to'liq himoyalamaydi: tezda ikki marta "Boshlash" bosilsa bir vaqtning
    # o'zida ikki tranzaksiya unique constraint'ga urilib, biri IntegrityError
    # otadi va student 500 xato ko'radi. Buni alohida try/except bilan
    # tutamiz va mavjud yozuvni qaytaramiz.
    try:
        with transaction.atomic():
            session, created = (
                TestSession.objects
                .select_for_update()
                .get_or_create(user=user, olympiad=olympiad)
            )
            if created or not session.question_order:
                questions = list(olympiad.questions.all().order_by('id'))
                question_ids = [q.id for q in questions]
                rng.shuffle(question_ids)
                option_orders = {}
                for question in questions:
                    order = list(range(len(question.options or [])))
                    rng.shuffle(order)
                    option_orders[str(question.id)] = order
                session.question_order = question_ids
                session.option_orders = option_orders
                session.save(update_fields=['question_order', 'option_orders'])
            return session
    except IntegrityError:
        # Boshqa so'rov bir vaqtda sessiya yaratdi — mavjudini qaytaramiz.
        return TestSession.objects.get(user=user, olympiad=olympiad)


def ordered_questions(session, olympiad):
    question_ids = [int(qid) for qid in (session.question_order or [])]
    if not question_ids:
        question_ids = list(olympiad.questions.values_list('id', flat=True))
    # Faqat shu olimpiada savollarini olamiz — avval id bo'yicha global
    # `in_bulk` qilinardi va savol boshqa olimpiadaga ko'chirilgan yoki
    # o'chirilgan bo'lsa eski savol ko'rsatilishi mumkin edi. Endi
    # olimpiada bog'liqligi cheklovi qo'shildi.
    by_id = Question.objects.filter(
        id__in=question_ids,
        olympiads=olympiad,
    ).in_bulk()
    return [by_id[qid] for qid in question_ids if qid in by_id]


def questions_payload(session, olympiad):
    data = []
    option_orders = session.option_orders or {}
    for question in ordered_questions(session, olympiad):
        q_type = getattr(question, 'question_type', 'mcq') or 'mcq'
        # Kod (IT) savol — variant yo'q; o'rniga dasturlash tili, boshlang'ich
        # kod skelet va savol matni qaytariladi. expected_output (kutilgan
        # natija) JUDA MUHIM: u faqat ustoz/AI uchun, studentga sizdirilmaydi.
        if q_type == 'code':
            data.append({
                'id': question.id,
                'text': question.text,
                'options': [],
                'score': question.score,
                'question_type': 'code',
                'programming_language': getattr(question, 'programming_language', '') or '',
                'code_template': getattr(question, 'code_template', '') or '',
            })
            continue
        options = list(question.options or [])
        order = option_orders.get(str(question.id)) or list(range(len(options)))
        visible_options = [
            options[index]
            for index in order
            if isinstance(index, int) and 0 <= index < len(options)
        ]
        # Variantsiz turlar (fill_blank/fill_blanks/essay) — options bo'sh,
        # frontend question_type bo'yicha matn maydoni ko'rsatadi. yes_no va
        # multiple_select esa options ro'yxatini ishlatadi (yes_no — odatda
        # ["Ha","Yo'q"]). correct_answer/correct_text HECH QACHON yuborilmaydi —
        # baholash faqat serverda. fill_blanks uchun bo'sh joylar sonini
        # (blanks_count) to'g'ri javoblarni sizdirmasdan beramiz.
        item = {
            'id': question.id,
            'text': question.text,
            'options': visible_options,
            'score': question.score,
            'question_type': q_type,
        }
        if q_type == 'fill_blanks':
            correct = _parse_correct_text(getattr(question, 'correct_text', ''))
            item['blanks_count'] = len(correct) if isinstance(correct, dict) else 1
        data.append(item)
    return data


def session_timing_payload(session, olympiad):
    """Frontend timer'ni server vaqti bilan sinxronlash uchun.

    Avval frontend lokal `DURATION` dan teskari sanardi va savollar yuklash
    uzoq cho'zilsa server bilan sinxronligi yo'qoladi (server allaqachon
    `session.started_at + duration_minutes` ni boshlagan, lekin frontend
    apiQuestions kelgandan so'nggina timerni boshlaydi). Endi server
    timestamps qaytaradi va frontend `expires_at - now()` ni hisoblaydi.
    """
    started_at = session.started_at
    expires_at = session_end_time(session, olympiad)
    server_now = timezone.now()
    return {
        'started_at': started_at.isoformat() if started_at else None,
        'expires_at': expires_at.isoformat() if expires_at else None,
        'server_now': server_now.isoformat(),
        'duration_seconds': (
            int((expires_at - started_at).total_seconds())
            if expires_at and started_at else None
        ),
    }


def _deshuffle_index(chosen, order):
    """Shuffle qilingan variant indeksini asl (original) indeksga o'giradi.

    Student ko'rgan variantlar `order` bo'yicha aralashtirilgan; `order[chosen]`
    — asl variant indeksi. Noto'g'ri/diapazondan tashqari qiymatda None.
    """
    try:
        idx = int(chosen)
    except (TypeError, ValueError):
        return None
    if idx < 0 or idx >= len(order):
        return None
    return order[idx]


def _deshuffle_multi(chosen, order):
    """multiple_select uchun tanlangan indekslar ro'yxatini de-shuffle qiladi."""
    if not isinstance(chosen, (list, tuple, set)):
        return None
    result = []
    for c in chosen:
        original = _deshuffle_index(c, order)
        if original is not None:
            result.append(original)
    return result


def _extract_chosen(chosen, q_type):
    """Frontend yuborgan javob payload'idan baholash uchun xom qiymatni ajratadi.

    Yangi savol turlari uchun frontend obyekt-shaklli payload yuboradi:
      mcq / yes_no      → int yoki {"chosen_idx": int}
      multiple_select   → [idx, ...] yoki {"selected": [idx, ...]}
      fill_blank        → "matn" yoki {"text": "matn"}
      essay             → "matn" yoki {"text": "matn"}
      fill_blanks       → {"1": "...", ...} yoki {"blanks": {"1": "..."}}
    Eski (skalар/ro'yxat) formatlar ham backward-compat qo'llab-quvvatlanadi —
    shu sababli mavjud MCQ submit'lari buzilmaydi.
    """
    if isinstance(chosen, dict):
        if q_type in ('mcq', 'yes_no'):
            return chosen.get('chosen_idx')
        if q_type == 'multiple_select':
            return chosen.get('selected')
        if q_type in ('fill_blank', 'essay'):
            return chosen.get('text')
        if q_type == 'fill_blanks':
            # {"blanks": {...}} yoki to'g'ridan-to'g'ri {"1": "...", ...}.
            if 'blanks' in chosen:
                return chosen.get('blanks')
            return chosen
    return chosen


def score_session_answers(session, olympiad, answers, attempt=None):
    """Sessiya javoblarini baholaydi.

    Kod (IT) savollar Judge0 test caslari bo'yicha avtomatik baholanadi va
    natija (`CodeSubmission.all_tests_passed`) submit paytida hali tayyor
    bo'lmaydi (Judge0 asinxron tugaydi). Shu sababli `attempt` argumenti
    ikkita rejimni boshqaradi:

      - `attempt is None` (submit oqimi, attempt hali yaratilmagan): kod
        savollar HISOBGA UMUMAN OLINMAYDI — na `correct`, na `total`, na
        `max_possible` ga kiradi. Aks holda kod balli majburan 0 bo'lib,
        `max_possible` ga esa kiritilib, student to'g'ri kod yozsa ham
        submit javobida foiz nohaq pasayardi (eski xato).
      - `attempt` berilgan (Judge0 callback'dan keyingi qayta hisoblash,
        `_recompute_attempt_score_for_submission`): shu attempt'ning kod
        submission'lari bo'yicha to'liq ball hisoblanadi va leaderboard /
        natijalar sahifasidagi qiymat yangilanadi.
    """
    answers = answers or {}
    option_orders = session.option_orders or {}
    correct = 0
    answered = 0
    earned_score = 0
    all_questions = ordered_questions(session, olympiad)
    # Qolgan barcha turlar (mcq, yes_no, multiple_select, fill_blank,
    # fill_blanks, essay) variantsiz/variantli — questions.grading.grade_answer
    # orqali izchil baholanadi. Variant indeksli turlarda
    # (mcq/yes_no/multiple_select) avval shuffle qilingan indeksni asl indeksga
    # o'giramiz (de-shuffle).
    non_code_questions = [
        q for q in all_questions
        if (getattr(q, 'question_type', 'mcq') or 'mcq') != 'code'
    ]
    code_questions = [
        q for q in all_questions
        if (getattr(q, 'question_type', 'mcq') or 'mcq') == 'code'
    ]
    # Essay savollar avtomatik baholanmaydi va hozircha qo'lda baholash
    # tizimi ham yo'q. Ularni `total` / `max_possible` ga kiritsak, o'quvchi
    # hech qachon 100% ololmaydi va natija abadiy "tekshirilmoqda" bo'lib
    # qoladi. Shu sababli essay'lar ball hisobidan butunlay chiqariladi —
    # keyinchalik qo'lda baholash qo'shilganda alohida hisoblanadi.
    essay_questions = [
        q for q in non_code_questions
        if (getattr(q, 'question_type', 'mcq') or 'mcq') == 'essay'
    ]
    gradeable_questions = [
        q for q in non_code_questions
        if (getattr(q, 'question_type', 'mcq') or 'mcq') != 'essay'
    ]
    for question in gradeable_questions:
        chosen = answers.get(str(question.id))
        if chosen is None:
            chosen = answers.get(question.id)

        q_type = getattr(question, 'question_type', 'mcq') or 'mcq'
        options = list(question.options or [])
        order = option_orders.get(str(question.id)) or list(range(len(options)))

        # Frontend obyekt-shaklli payload yuborishi mumkin ({"chosen_idx":..},
        # {"selected":[..]}, {"text":".."}) — xom qiymatni ajratamiz.
        chosen = _extract_chosen(chosen, q_type)

        # Variant indeksli turlar — shuffle qilingan indeksni asl indeksga
        # o'giramiz, shunda grade_answer correct_answer bilan to'g'ri solishtiradi.
        if q_type in ('mcq', 'yes_no'):
            chosen = _deshuffle_index(chosen, order)
        elif q_type == 'multiple_select':
            chosen = _deshuffle_multi(chosen, order)
        # fill_blank/fill_blanks/essay — matn/JSON, shuffle ta'sir qilmaydi.

        result = grade_answer(question, chosen)
        # RESULT_PENDING bu yerda kutilmaydi (essay'lar gradeable ro'yxatdan
        # chiqarilgan) — himoya uchun skip qilamiz.
        if result == RESULT_PENDING:
            continue
        if chosen is None:
            continue
        answered += 1
        if result == RESULT_CORRECT:
            correct += 1
            earned_score += question.score

    # Kod (IT) savollar bo'yicha avtomatik ball faqat `attempt` berilganda
    # hisoblanadi (Judge0 callback'dan keyingi qayta hisoblash). Submit oqimida
    # (`attempt is None`) kod savollar HISOBGA OLINMAYDI: ular `total` /
    # `max_possible` ga ham kirmaydi, shu sababli foiz faqat non-code savollar
    # bo'yicha hisoblanadi va kod balli keyinroq Judge0 tugagach
    # `_recompute_attempt_score_for_submission` orqali to'liq yangilanadi.
    scored_questions = list(gradeable_questions)
    if attempt is not None and code_questions:
        from .models import CodeSubmission
        latest_subs = {}
        for cs in (
            CodeSubmission.objects
            .filter(attempt=attempt)
            .order_by('-created_at')
        ):
            # order_by('-created_at') — birinchi ko'rilgan eng so'nggisi.
            latest_subs.setdefault(cs.question_id, cs)
        for question in code_questions:
            cs = latest_subs.get(question.id)
            if cs is not None and cs.all_tests_passed is True:
                correct += 1
                answered += 1
                earned_score += question.score
            elif cs is not None:
                # Javob yuborilgan, lekin test caslar o'tmadi (yoki hali
                # tekshirilmagan) — javob berilgan deb hisoblanadi.
                answered += 1
        # Kod savollar ham max_possible va total hisobiga kiradi: aralash
        # olimpiadada foiz to'g'ri chiqishi uchun (kodi to'g'ri o'quvchi
        # 100% dan oshmaydi).
        scored_questions += code_questions

    # Essay savollar: faqat ustoz/menejer BAHOLAGAN essay'lar hisobga kiradi
    # (`attempt` rejimida). Baholanmagan essay'lar avvalgidek total/max_possible
    # dan tashqarida qoladi — aks holda o'quvchi baho qo'yilguncha hech qachon
    # 100% ololmasdi. To'liq ball olgan essay `correct` deb sanaladi.
    if attempt is not None and essay_questions:
        from .models import EssayGrade
        essay_grades = {
            g.question_id: g
            for g in EssayGrade.objects.filter(attempt=attempt)
        }
        for question in essay_questions:
            grade = essay_grades.get(question.id)
            if grade is None:
                continue
            answered += 1
            earned = max(0, min(int(grade.score or 0), question.score))
            earned_score += earned
            if earned >= question.score:
                correct += 1
            scored_questions.append(question)

    questions = scored_questions
    total = len(questions)
    max_possible = sum(question.score for question in questions)
    # Avval `wrong = total - correct` edi va javob bermagan savollar ham
    # noto'g'ri sifatida hisoblanardi. Endi:
    #   - wrong  = javob berilgan, lekin noto'g'ri
    #   - blank  = umuman javob berilmagan
    # `total - correct` qiymatini saqlab qolish uchun backward-compat
    # `wrong_total` ham qaytaramiz (eski klientlar buni "all not correct"
    # sifatida ishlatishi mumkin).
    wrong = max(0, answered - correct)
    blank = max(0, total - answered)
    score = round((earned_score / max_possible) * 100) if max_possible else 0
    return {
        'total': total,
        'correct': correct,
        'wrong': wrong,
        'blank': blank,
        'answered': answered,
        'earned_score': earned_score,
        'max_possible': max_possible,
        'score': score,
        # Essay savollar soni — ular avtomatik ball hisobiga kirmaydi
        # (qo'lda baholash tizimi qo'shilguncha).
        'essay_count': len(essay_questions),
    }
