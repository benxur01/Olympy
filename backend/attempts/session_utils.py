import random
from datetime import timedelta

from django.db import transaction
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


def ordered_questions(session, olympiad):
    question_ids = [int(qid) for qid in (session.question_order or [])]
    if not question_ids:
        question_ids = list(olympiad.questions.values_list('id', flat=True))
    by_id = Question.objects.in_bulk(question_ids)
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


def score_session_answers(session, olympiad, answers):
    answers = answers or {}
    option_orders = session.option_orders or {}
    correct = 0
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
        original_index = order[chosen]
        if original_index == question.correct_answer:
            correct += 1
            earned_score += question.score
    total = len(questions)
    max_possible = sum(question.score for question in questions)
    wrong = total - correct
    score = round((earned_score / max_possible) * 100) if max_possible else 0
    return {
        'total': total,
        'correct': correct,
        'wrong': wrong,
        'earned_score': earned_score,
        'max_possible': max_possible,
        'score': score,
    }
