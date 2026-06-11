"""O3: Do'st bilan duel — 10 savol, vaqtsiz, ikkala o'quvchi javob beradi.

Mount: `/api/duels/` (accounts/urls_me.py orqali, lekin alohida prefiks bilan
olympy_api/urls.py da). Premium o'quvchilar uchun.

O'yin oqimi:
1. POST /api/duels/                — challenger duel boshlaydi (10 savol tanlanadi)
2. GET  /api/duels/<id>/           — holat va savollar (to'g'ri javobsiz)
3. POST /api/duels/<id>/answer/    — har ikki o'quvchi savollarga javob beradi
4. GET  /api/duels/<id>/result/    — natija (ikkala o'quvchi ko'radi)
5. GET  /api/me/duels/             — o'z duellari tarixi

G'olib: kim ko'p to'g'ri javob bersa. Teng bo'lsa durang (winner=None).
"""
import random

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status as http_status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Duel, DuelAnswer, DuelQuestion
from .utils import is_user_premium

DUEL_QUESTION_COUNT = 10


def _premium_required():
    return Response(
        {
            'detail': "Bu funksiya premium o'quvchilar uchun. "
                      "Premium olish uchun markaz adminiga murojaat qiling.",
            'upgrade_required': True,
        },
        status=http_status.HTTP_403_FORBIDDEN,
    )


def _is_participant(duel, user):
    return user.id in (duel.challenger_id, duel.opponent_id)


def _pick_duel_questions(subject):
    """Duel uchun 10 ta tasodifiy savol tanlaydi (fan bo'yicha, agar berilsa).

    Yetarli savol bo'lmasa bor savollar bilan davom etamiz (bo'sh bo'lsa
    chaqiruvchi 400 qaytaradi).
    """
    from questions.models import Question

    qs = Question.objects.all()
    subject = (subject or '').strip()
    if subject:
        subject_qs = qs.filter(subject__iexact=subject)
        # Shu fanda yetarli savol bo'lsa — faqat shundan, aks holda umumiy.
        if subject_qs.count() >= DUEL_QUESTION_COUNT:
            qs = subject_qs
    # order_by('?') to'liq jadval skanini oldini olish uchun ID-asosli random.
    ids = list(qs.values_list('id', flat=True))
    if not ids:
        return []
    picked = random.sample(ids, min(DUEL_QUESTION_COUNT, len(ids)))
    by_id = {q.id: q for q in Question.objects.filter(id__in=picked)}
    return [by_id[i] for i in picked if i in by_id]


def _user_answer_count(duel, user_id):
    return DuelAnswer.objects.filter(duel=duel, user_id=user_id).count()


def _user_correct_count(duel, user_id):
    return DuelAnswer.objects.filter(duel=duel, user_id=user_id, is_correct=True).count()


def _maybe_complete_duel(duel, total_questions):
    """Ikkala o'quvchi ham barcha savollarga javob bersa duelni yakunlaydi.

    G'olibni aniqlaydi (ko'p to'g'ri javob). Teng bo'lsa winner=None (durang).
    Idempotent: allaqachon completed bo'lsa hech narsa qilmaydi.
    """
    if duel.status == Duel.STATUS_COMPLETED:
        return
    ch_answered = _user_answer_count(duel, duel.challenger_id)
    op_answered = _user_answer_count(duel, duel.opponent_id)
    if ch_answered < total_questions or op_answered < total_questions:
        return
    ch_correct = _user_correct_count(duel, duel.challenger_id)
    op_correct = _user_correct_count(duel, duel.opponent_id)
    if ch_correct > op_correct:
        winner_id = duel.challenger_id
    elif op_correct > ch_correct:
        winner_id = duel.opponent_id
    else:
        winner_id = None
    duel.status = Duel.STATUS_COMPLETED
    duel.winner_id = winner_id
    duel.completed_at = timezone.now()
    duel.save(update_fields=['status', 'winner_id', 'completed_at'])


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_duel(request):
    """POST /api/duels/ — duel boshlash. Body: {opponent_id, subject}."""
    if not is_user_premium(request.user):
        return _premium_required()

    body = request.data or {}
    opponent_id = body.get('opponent_id')
    subject = (body.get('subject') or '').strip()
    if not opponent_id:
        return Response({'detail': 'opponent_id majburiy'}, status=http_status.HTTP_400_BAD_REQUEST)
    try:
        opponent_id = int(opponent_id)
    except (TypeError, ValueError):
        return Response({'detail': "opponent_id son bo'lishi kerak"}, status=http_status.HTTP_400_BAD_REQUEST)
    if opponent_id == request.user.id:
        return Response({'detail': "O'zingiz bilan duel o'ynay olmaysiz"}, status=http_status.HTTP_400_BAD_REQUEST)

    User = get_user_model()
    opponent = User.objects.filter(pk=opponent_id, is_active=True).first()
    if not opponent:
        return Response({'detail': 'Raqib topilmadi'}, status=http_status.HTTP_404_NOT_FOUND)

    questions = _pick_duel_questions(subject)
    if len(questions) < 1:
        return Response(
            {'detail': "Duel uchun savollar topilmadi"},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    with transaction.atomic():
        duel = Duel.objects.create(
            challenger=request.user,
            opponent=opponent,
            subject=subject,
            status=Duel.STATUS_PENDING,
        )
        DuelQuestion.objects.bulk_create([
            DuelQuestion(duel=duel, question=q, order=i)
            for i, q in enumerate(questions, start=1)
        ])

    return Response(
        _serialize_duel_detail(duel, request.user),
        status=http_status.HTTP_201_CREATED,
    )


def _serialize_duel_detail(duel, user):
    """Duel holati + savollar (to'g'ri javobsiz) + foydalanuvchi progressi."""
    dqs = list(
        DuelQuestion.objects.filter(duel=duel)
        .select_related('question')
        .order_by('order')
    )
    total = len(dqs)
    # Foydalanuvchining javob bergan savol id'lari.
    my_answered_qids = set(
        DuelAnswer.objects
        .filter(duel=duel, user=user)
        .values_list('question_id', flat=True)
    )
    questions = []
    for dq in dqs:
        q = dq.question
        questions.append({
            'order': dq.order,
            'question_id': q.id,
            'text': q.text,
            'options': q.options,
            'subject': q.subject,
            'answered': q.id in my_answered_qids,
        })
    return {
        'id': duel.id,
        'subject': duel.subject or '',
        'status': duel.status,
        'challenger': {
            'id': duel.challenger_id,
            'full_name': duel.challenger.full_name or '—',
        },
        'opponent': {
            'id': duel.opponent_id,
            'full_name': duel.opponent.full_name or '—',
        },
        'total_questions': total,
        'my_answered': len(my_answered_qids),
        'my_finished': total > 0 and len(my_answered_qids) >= total,
        'questions': questions,
        'created_at': duel.created_at.isoformat() if duel.created_at else None,
    }


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def duel_detail(request, duel_id):
    """GET /api/duels/<id>/ — holat va savollar (faqat ishtirokchilar uchun)."""
    duel = get_object_or_404(
        Duel.objects.select_related('challenger', 'opponent'), pk=duel_id,
    )
    if not _is_participant(duel, request.user):
        return Response({'detail': 'Forbidden'}, status=http_status.HTTP_403_FORBIDDEN)
    return Response(_serialize_duel_detail(duel, request.user))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def answer_duel(request, duel_id):
    """POST /api/duels/<id>/answer/ — javob berish.

    Body: {question_id, selected_option}. Har savolga bir marta javob beriladi.
    Ikkala o'quvchi tugatgach duel avtomatik yakunlanadi.
    """
    duel = get_object_or_404(
        Duel.objects.select_related('challenger', 'opponent'), pk=duel_id,
    )
    if not _is_participant(duel, request.user):
        return Response({'detail': 'Forbidden'}, status=http_status.HTTP_403_FORBIDDEN)
    if duel.status == Duel.STATUS_COMPLETED:
        return Response({'detail': 'Duel allaqachon yakunlangan'}, status=http_status.HTTP_400_BAD_REQUEST)

    body = request.data or {}
    question_id = body.get('question_id')
    selected_option = body.get('selected_option')
    if question_id is None or selected_option is None:
        return Response(
            {'detail': 'question_id va selected_option majburiy'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    try:
        question_id = int(question_id)
        selected_option = int(selected_option)
    except (TypeError, ValueError):
        return Response(
            {'detail': "question_id va selected_option son bo'lishi kerak"},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    # Savol shu duelga tegishli bo'lishi shart.
    dq = (
        DuelQuestion.objects
        .filter(duel=duel, question_id=question_id)
        .select_related('question')
        .first()
    )
    if not dq:
        return Response(
            {'detail': 'Bu savol duelga tegishli emas'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    is_correct = (selected_option == dq.question.correct_answer)

    # Bir savolga bir marta — get_or_create idempotent (unique constraint).
    _answer, created = DuelAnswer.objects.get_or_create(
        duel=duel, user=request.user, question_id=question_id,
        defaults={'selected_option': selected_option, 'is_correct': is_correct},
    )
    if not created:
        return Response(
            {'detail': 'Bu savolga allaqachon javob berdingiz'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    total = DuelQuestion.objects.filter(duel=duel).count()
    # Ikkala o'quvchi ham tugatgan bo'lsa yakunlaymiz.
    with transaction.atomic():
        locked = Duel.objects.select_for_update().get(pk=duel.pk)
        _maybe_complete_duel(locked, total)
        duel = locked

    my_answered = _user_answer_count(duel, request.user.id)
    return Response({
        'is_correct': is_correct,
        'correct_answer': dq.question.correct_answer,
        'my_answered': my_answered,
        'total_questions': total,
        'my_finished': my_answered >= total,
        'duel_status': duel.status,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def duel_result(request, duel_id):
    """GET /api/duels/<id>/result/ — natija (ikkala o'quvchi ko'ra oladi)."""
    duel = get_object_or_404(
        Duel.objects.select_related('challenger', 'opponent', 'winner'), pk=duel_id,
    )
    if not _is_participant(duel, request.user):
        return Response({'detail': 'Forbidden'}, status=http_status.HTTP_403_FORBIDDEN)

    total = DuelQuestion.objects.filter(duel=duel).count()
    # Bitta GROUP BY bilan har o'quvchining to'g'ri/jami javoblari.
    rows = (
        DuelAnswer.objects
        .filter(duel=duel)
        .values('user_id')
        .annotate(
            answered=Count('id'),
            correct=Count('id', filter=Q(is_correct=True)),
        )
    )
    stats = {r['user_id']: r for r in rows}

    def _side(user, label):
        s = stats.get(user.id, {})
        return {
            'user_id': user.id,
            'full_name': user.full_name or '—',
            'role': label,
            'correct': s.get('correct', 0),
            'answered': s.get('answered', 0),
        }

    result = {
        'id': duel.id,
        'subject': duel.subject or '',
        'status': duel.status,
        'total_questions': total,
        'challenger': _side(duel.challenger, 'challenger'),
        'opponent': _side(duel.opponent, 'opponent'),
        'winner_id': duel.winner_id,
        'is_draw': duel.status == Duel.STATUS_COMPLETED and duel.winner_id is None,
        'completed_at': duel.completed_at.isoformat() if duel.completed_at else None,
    }
    if duel.winner_id == request.user.id:
        result['my_outcome'] = 'win'
    elif duel.status == Duel.STATUS_COMPLETED and duel.winner_id is None:
        result['my_outcome'] = 'draw'
    elif duel.status == Duel.STATUS_COMPLETED:
        result['my_outcome'] = 'loss'
    else:
        result['my_outcome'] = 'pending'
    return Response(result)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_duels(request):
    """GET /api/me/duels/ — o'z duellari tarixi (challenger yoki opponent)."""
    duels = (
        Duel.objects
        .filter(Q(challenger=request.user) | Q(opponent=request.user))
        .select_related('challenger', 'opponent', 'winner')
        .order_by('-created_at')[:100]
    )
    data = []
    for d in duels:
        is_challenger = d.challenger_id == request.user.id
        opponent = d.opponent if is_challenger else d.challenger
        if d.status == Duel.STATUS_COMPLETED:
            if d.winner_id == request.user.id:
                outcome = 'win'
            elif d.winner_id is None:
                outcome = 'draw'
            else:
                outcome = 'loss'
        else:
            outcome = 'pending'
        data.append({
            'id': d.id,
            'subject': d.subject or '',
            'status': d.status,
            'opponent_id': opponent.id,
            'opponent_name': opponent.full_name or '—',
            'outcome': outcome,
            'created_at': d.created_at.isoformat() if d.created_at else None,
            'completed_at': d.completed_at.isoformat() if d.completed_at else None,
        })
    return Response(data)
