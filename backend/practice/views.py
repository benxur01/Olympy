"""Practice/Mashq rejimi endpoint'lari.

Bu rejim oddiy attempts'dan farqli: TestSession va TestAttempt yaratmaydi,
faqat random savollar tanlanadi va javoblar tekshiriladi. Session ma'lumoti
Django cache'da 1 soat saqlanadi.
"""
import secrets

from django.core.cache import cache
from django.db.models import Count
from django.shortcuts import get_object_or_404
from rest_framework import status as http_status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from attempts.models import TestAttempt
from centers.models import EducationCenter
from questions.models import Question


PRACTICE_CACHE_PREFIX = 'practice_session:'
PRACTICE_CACHE_TTL = 60 * 60  # 1 soat


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def practice_subjects(request):
    """GET /api/practice/subjects/?center=<id>

    Markazning savollar bankidagi fanlar ro'yxati va har bir fanning
    savol soni. Faqat yetarlicha savol bor fanlar ko'rsatiladi (>=1).
    """
    raw_center = request.query_params.get('center')
    if not raw_center:
        return Response(
            {'detail': 'center query parametri majburiy'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    try:
        center_id = int(raw_center)
    except (TypeError, ValueError):
        return Response(
            {'detail': "center parametri son bo'lishi kerak"},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    # Markaz tasdiqlangan bo'lishi kerak (public ma'lumot).
    get_object_or_404(EducationCenter, pk=center_id)
    rows = (
        Question.objects
        .filter(center_id=center_id)
        .values('subject')
        .annotate(question_count=Count('id'))
        .order_by('-question_count')
    )
    return Response([
        {'subject': r['subject'] or 'Umumiy', 'question_count': r['question_count']}
        for r in rows if r['question_count'] > 0
    ])


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def practice_start(request):
    """POST /api/practice/start/

    Body: {"center_id": <id>, "subject": "Matematika", "question_count": 20}

    Markazning shu fan savollaridan tasodifiy N ta tanlab qaytaradi.
    `correct_answer` qaytarmaydi — bu submit paytida tekshiriladi.
    """
    data = request.data or {}
    try:
        center_id = int(data.get('center_id'))
    except (TypeError, ValueError):
        return Response({'detail': "center_id majburiy"}, status=http_status.HTTP_400_BAD_REQUEST)
    subject = (data.get('subject') or '').strip()
    if not subject:
        return Response({'detail': "subject majburiy"}, status=http_status.HTTP_400_BAD_REQUEST)
    try:
        question_count = int(data.get('question_count') or 10)
    except (TypeError, ValueError):
        question_count = 10
    question_count = max(1, min(question_count, 100))

    get_object_or_404(EducationCenter, pk=center_id)

    # Random tanlash — DB darajasida `order_by('?')` kichik banklarda
    # qabul qilinadi. Katta banklarda bu sekin bo'lishi mumkin, ammo
    # practice uchun (1-2 marta foydalanish) maqbul.
    available = list(
        Question.objects
        .filter(center_id=center_id, subject__iexact=subject)
        .order_by('?')
        .values_list('id', flat=True)[:question_count]
    )
    if not available:
        return Response(
            {'detail': "Bu fan bo'yicha savol topilmadi"},
            status=http_status.HTTP_404_NOT_FOUND,
        )

    # Tartib bo'yicha savollarni olamiz — `available` allaqachon random.
    questions = list(Question.objects.filter(id__in=available).only(
        'id', 'text', 'options', 'difficulty', 'score',
    ))
    # available'dagi tartibga moslashtiramiz.
    qmap = {q.id: q for q in questions}
    ordered = [qmap[qid] for qid in available if qid in qmap]

    practice_id = secrets.token_urlsafe(16)
    cache.set(
        f'{PRACTICE_CACHE_PREFIX}{practice_id}',
        {
            'user_id': request.user.id,
            'center_id': center_id,
            'subject': subject,
            'question_ids': [q.id for q in ordered],
        },
        PRACTICE_CACHE_TTL,
    )

    return Response({
        'practice_id': practice_id,
        'subject': subject,
        'questions': [
            {
                'id': q.id,
                'text': q.text,
                'options': q.options or [],
                'difficulty': q.difficulty,
                'score': q.score,
            }
            for q in ordered
        ],
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def practice_submit(request):
    """POST /api/practice/submit/

    Body: {"practice_id": "...", "answers": {"<qid>": <chosen_idx>, ...}}
    Tekshirib, har bir savol uchun review va umumiy ball qaytaradi.
    """
    data = request.data or {}
    practice_id = (data.get('practice_id') or '').strip()
    if not practice_id:
        return Response({'detail': "practice_id majburiy"}, status=http_status.HTTP_400_BAD_REQUEST)
    answers = data.get('answers') or {}
    if not isinstance(answers, dict):
        return Response({'detail': "answers dict bo'lishi kerak"}, status=http_status.HTTP_400_BAD_REQUEST)

    session = cache.get(f'{PRACTICE_CACHE_PREFIX}{practice_id}')
    if not session:
        return Response(
            {'detail': "Practice session topilmadi yoki muddati o'tgan"},
            status=http_status.HTTP_404_NOT_FOUND,
        )
    if session.get('user_id') != request.user.id:
        return Response({'detail': 'Forbidden'}, status=http_status.HTTP_403_FORBIDDEN)

    question_ids = session.get('question_ids') or []
    questions = list(Question.objects.filter(id__in=question_ids).only(
        'id', 'text', 'options', 'difficulty', 'score', 'correct_answer',
    ))
    qmap = {q.id: q for q in questions}

    review = []
    correct_count = 0
    wrong_count = 0
    for qid in question_ids:
        q = qmap.get(qid)
        if not q:
            continue
        chosen_raw = answers.get(str(qid))
        if chosen_raw is None:
            chosen_raw = answers.get(qid)
        try:
            chosen_idx = int(chosen_raw) if chosen_raw is not None else None
        except (TypeError, ValueError):
            chosen_idx = None
        is_correct = (chosen_idx is not None and chosen_idx == q.correct_answer)
        if is_correct:
            correct_count += 1
        elif chosen_idx is not None:
            wrong_count += 1
        review.append({
            'id': q.id,
            'text': q.text,
            'options': q.options or [],
            'correct_answer': q.correct_answer,
            'chosen_answer': chosen_idx,
            'is_correct': is_correct,
            'difficulty': q.difficulty,
            'score': q.score,
        })

    total = len(review)
    score_pct = round((correct_count / total) * 100) if total else 0

    # Streak'ni locked user ustida yangilaymiz — parallel submit'larda
    # lost update bo'lmasligi uchun (race condition himoyasi).
    try:
        from django.contrib.auth import get_user_model
        from django.db import transaction
        User = get_user_model()
        with transaction.atomic():
            locked_user = User.objects.select_for_update().get(pk=request.user.pk)
            locked_user.update_streak()
            request.user.streak_count = locked_user.streak_count
    except Exception:
        import logging
        logging.getLogger(__name__).exception(
            'practice streak update failed for user=%s', request.user.pk,
        )

    # Submit qilingach session'ni o'chiramiz — qayta yuborishning oldini olish.
    cache.delete(f'{PRACTICE_CACHE_PREFIX}{practice_id}')

    return Response({
        'practice_id': practice_id,
        'subject': session.get('subject'),
        'score': score_pct,
        'correct_count': correct_count,
        'wrong_count': wrong_count,
        'total': total,
        'review': review,
        'streak_count': request.user.streak_count,
    })


def _collect_wrong_question_ids(user):
    """Foydalanuvchining barcha attempts'idagi noto'g'ri javob berilgan
    savol id'larini yig'adi.

    `TestAttempt.answers` — `{question_id_str: chosen_idx}` formatda. Savol
    noto'g'ri deb hisoblanadi:
      - foydalanuvchi javob bergan (chosen_idx mavjud), lekin
        `Question.correct_answer` ga teng emas.
    Yechilmagan savollar (chosen_idx is None) bu yerga kirmaydi — ular
    "xato" emas, balki "qoldirib ketilgan".

    Returns: set(question_id) — noyob savollar to'plami.
    """
    wrong_ids = set()
    attempts = TestAttempt.objects.filter(user=user).only('id', 'answers')
    attempt_answers = []  # [(attempt_id, {qid:int -> chosen_idx})]
    referenced_qids = set()

    for attempt in attempts:
        ans = attempt.answers or {}
        if not isinstance(ans, dict):
            continue
        normalised = {}
        for k, v in ans.items():
            try:
                qid = int(k)
            except (TypeError, ValueError):
                continue
            if v is None:
                continue
            try:
                chosen = int(v)
            except (TypeError, ValueError):
                continue
            normalised[qid] = chosen
            referenced_qids.add(qid)
        if normalised:
            attempt_answers.append(normalised)

    if not referenced_qids:
        return wrong_ids

    correct_map = dict(
        Question.objects
        .filter(id__in=referenced_qids)
        .values_list('id', 'correct_answer')
    )

    for normalised in attempt_answers:
        for qid, chosen in normalised.items():
            correct = correct_map.get(qid)
            if correct is None:
                continue
            if chosen != correct:
                wrong_ids.add(qid)
    return wrong_ids


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def wrong_answer_subjects(request):
    """GET /api/practice/wrong-answers/

    Joriy foydalanuvchining olimpiadalardagi noto'g'ri javob bergan
    savollarini fanlar bo'yicha guruhlab qaytaradi.

    Response: [{"subject": "Matematika", "question_count": 12}, ...]
    """
    wrong_ids = _collect_wrong_question_ids(request.user)
    if not wrong_ids:
        return Response([])

    rows = (
        Question.objects
        .filter(id__in=wrong_ids)
        .values('subject')
        .annotate(question_count=Count('id'))
        .order_by('-question_count')
    )
    return Response([
        {'subject': r['subject'] or 'Umumiy', 'question_count': r['question_count']}
        for r in rows if r['question_count'] > 0
    ])


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def wrong_answer_start(request):
    """POST /api/practice/wrong-answers/start/

    Body: {"subject": "Matematika", "question_count": 10}

    Foydalanuvchining shu fan bo'yicha noto'g'ri javob bergan
    savollaridan random tartibda N tasini qaytaradi. Mavjud practice
    cache mexanizmidan foydalanadi — submit oddiy /api/practice/submit/
    orqali amalga oshiriladi.
    """
    data = request.data or {}
    subject = (data.get('subject') or '').strip()
    if not subject:
        return Response(
            {'detail': "subject majburiy"},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    try:
        question_count = int(data.get('question_count') or 10)
    except (TypeError, ValueError):
        question_count = 10
    question_count = max(1, min(question_count, 50))

    wrong_ids = _collect_wrong_question_ids(request.user)
    if not wrong_ids:
        return Response(
            {'detail': "Sizda noto'g'ri javob bergan savollar yo'q"},
            status=http_status.HTTP_404_NOT_FOUND,
        )

    available = list(
        Question.objects
        .filter(id__in=wrong_ids, subject__iexact=subject)
        .order_by('?')
        .values_list('id', flat=True)[:question_count]
    )
    if not available:
        return Response(
            {'detail': "Bu fan bo'yicha noto'g'ri javob bergan savollaringiz topilmadi"},
            status=http_status.HTTP_404_NOT_FOUND,
        )

    questions = list(Question.objects.filter(id__in=available).only(
        'id', 'text', 'options', 'difficulty', 'score',
    ))
    qmap = {q.id: q for q in questions}
    ordered = [qmap[qid] for qid in available if qid in qmap]

    practice_id = secrets.token_urlsafe(16)
    cache.set(
        f'{PRACTICE_CACHE_PREFIX}{practice_id}',
        {
            'user_id': request.user.id,
            'center_id': None,
            'subject': subject,
            'question_ids': [q.id for q in ordered],
            'mode': 'wrong_answers',
        },
        PRACTICE_CACHE_TTL,
    )

    return Response({
        'practice_id': practice_id,
        'subject': subject,
        'questions': [
            {
                'id': q.id,
                'text': q.text,
                'options': q.options or [],
                'difficulty': q.difficulty,
                'score': q.score,
            }
            for q in ordered
        ],
    })
