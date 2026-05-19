import random
from datetime import timedelta

from django.db import IntegrityError, transaction
from django.utils import timezone

from questions.models import Question

from .models import TestSession


def session_end_time(session, olympiad):
    if not session or not olympiad.duration_minutes:
        return None
    return session.started_at + timedelta(minutes=olympiad.duration_minutes)


def session_is_expired(session, olympiad):
    end_time = session_end_time(session, olympiad)
    return bool(end_time and timezone.now() > end_time)


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
        options = list(question.options or [])
        order = option_orders.get(str(question.id)) or list(range(len(options)))
        visible_options = [
            options[index]
            for index in order
            if isinstance(index, int) and 0 <= index < len(options)
        ]
        data.append({
            'id': question.id,
            'text': question.text,
            'options': visible_options,
            'score': question.score,
        })
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


def score_session_answers(session, olympiad, answers):
    answers = answers or {}
    option_orders = session.option_orders or {}
    correct = 0
    answered = 0
    earned_score = 0
    questions = ordered_questions(session, olympiad)
    for question in questions:
        chosen = answers.get(str(question.id))
        if chosen is None:
            chosen = answers.get(question.id)
        if chosen is None:
            continue
        try:
            chosen = int(chosen)
        except (TypeError, ValueError):
            continue
        options = list(question.options or [])
        order = option_orders.get(str(question.id)) or list(range(len(options)))
        if chosen < 0 or chosen >= len(order):
            continue
        answered += 1
        original_index = order[chosen]
        if original_index == question.correct_answer:
            correct += 1
            earned_score += question.score
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
    }
