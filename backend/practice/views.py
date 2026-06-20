"""Practice/Mashq rejimi endpoint'lari.

Bu rejim oddiy attempts'dan farqli: TestSession va TestAttempt yaratmaydi,
faqat random savollar tanlanadi va javoblar tekshiriladi. Session ma'lumoti
Django cache'da 1 soat saqlanadi.
"""
import random
import secrets

from django.core.cache import cache
from django.db.models import Count
from django.shortcuts import get_object_or_404
from rest_framework import status as http_status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from attempts.models import TestAttempt
from centers.models import CenterMembership, EducationCenter
from questions.grading import (
    RESULT_CORRECT,
    RESULT_PENDING,
    RESULT_WRONG,
    grade_answer,
)
from questions.models import Question


PRACTICE_CACHE_PREFIX = 'practice_session:'
PRACTICE_CACHE_TTL = 60 * 60  # 1 soat


def _user_is_center_member(user, center_id):
    """Foydalanuvchi shu markazga tasdiqlangan a'zomi (yoki egasi/admin)?

    Practice rejimi markazning savollar bankidan savol beradi — shu sababli
    faqat o'sha markazga aloqador foydalanuvchilar (har qanday rol: student,
    teacher, manager, owner yoki platforma admini) kira oladi. Aks holda
    boshqa markazning savollar banki sizib chiqadi (ma'lumotlar sizishi).
    """
    if getattr(user, 'is_platform_admin', False):
        return True
    if EducationCenter.objects.filter(pk=center_id, owner=user).exists():
        return True
    return CenterMembership.objects.filter(
        user=user,
        center_id=center_id,
        status=CenterMembership.STATUS_APPROVED,
    ).exists()


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
    get_object_or_404(EducationCenter, pk=center_id)
    # Faqat shu markazga a'zo foydalanuvchi savollar bankini ko'ra oladi —
    # aks holda boshqa markazning fan ro'yxati sizib chiqadi.
    if not _user_is_center_member(request.user, center_id):
        return Response(
            {'detail': 'Bu markazga kirish huquqingiz yo\'q'},
            status=http_status.HTTP_403_FORBIDDEN,
        )
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
    # Foydalanuvchi shu markazga a'zo bo'lishi shart — boshqa markazning
    # savollar bankidan mashq qilishga yo'l qo'yilmaydi (ma'lumotlar sizishi).
    if not _user_is_center_member(request.user, center_id):
        return Response(
            {'detail': 'Bu markazga kirish huquqingiz yo\'q'},
            status=http_status.HTTP_403_FORBIDDEN,
        )

    # Random tanlash: `order_by('?')` katta banklarda butun jadvalni
    # MySQL/Postgres'da sekin RANDOM() bilan saralashga majbur qiladi. Buning
    # o'rniga avval barcha ID'larni olib, Python darajasida random tanlaymiz.
    all_ids = list(
        Question.objects
        .filter(center_id=center_id, subject__iexact=subject)
        .values_list('id', flat=True)
    )
    available = random.sample(all_ids, min(question_count, len(all_ids))) if all_ids else []
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
        # Cache'dagi sessiya muddati tugagan yoki topilmadi. 410 GONE —
        # resurs avval mavjud bo'lib, endi yo'qligini bildiradi (404'dan
        # aniqroq semantika). Xabar `detail` kalitida (frontend
        # extractErrorMessage shuni o'qiydi); `error` ham qaytariladi.
        msg = "Sessiya muddati tugagan yoki topilmadi. Qaytadan boshlang."
        return Response(
            {'detail': msg, 'error': msg},
            status=http_status.HTTP_410_GONE,
        )
    if session.get('user_id') != request.user.id:
        return Response({'detail': 'Forbidden'}, status=http_status.HTTP_403_FORBIDDEN)

    question_ids = session.get('question_ids') or []
    questions = list(Question.objects.filter(id__in=question_ids).only(
        'id', 'text', 'options', 'difficulty', 'score', 'correct_answer',
        'question_type', 'correct_text',
    ))
    qmap = {q.id: q for q in questions}

    review = []
    correct_count = 0
    wrong_count = 0
    pending_count = 0
    for qid in question_ids:
        q = qmap.get(qid)
        if not q:
            continue
        chosen_raw = answers.get(str(qid))
        if chosen_raw is None:
            chosen_raw = answers.get(qid)

        # Practice'da option shuffle yo'q — chosen_raw to'g'ridan-to'g'ri asl
        # javob (mcq/yes_no uchun indeks, boshqa turlar uchun matn/ro'yxat).
        # Savol turiga qarab grade_answer to'g'ri baholaydi.
        result = grade_answer(q, chosen_raw)
        is_correct = (result == RESULT_CORRECT)
        if is_correct:
            correct_count += 1
        elif result == RESULT_WRONG:
            wrong_count += 1
        elif result == RESULT_PENDING:
            pending_count += 1

        # MCQ/yes_no uchun chosen_answer indeks sifatida ko'rsatiladi (eski
        # frontend bilan moslik); boshqa turlar uchun xom javob qaytariladi.
        try:
            chosen_display = int(chosen_raw) if chosen_raw is not None else None
        except (TypeError, ValueError):
            chosen_display = chosen_raw
        review.append({
            'id': q.id,
            'text': q.text,
            'options': q.options or [],
            'question_type': getattr(q, 'question_type', 'mcq') or 'mcq',
            'correct_answer': q.correct_answer,
            'chosen_answer': chosen_display,
            'is_correct': is_correct,
            'pending_review': result == RESULT_PENDING,
            'difficulty': q.difficulty,
            'score': q.score,
        })

    total = len(review)
    # Essay (pending_review) savollar avtomatik baholanmaydi — foiz hisobidan
    # chiqaramiz, aks holda baholanmagan savol natijani adolatsiz pasaytiradi.
    gradable = total - pending_count
    score_pct = round((correct_count / gradable) * 100) if gradable else 0

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
        'pending_count': pending_count,
        'total': total,
        'review': review,
        'streak_count': request.user.streak_count,
    })


def _collect_wrong_question_ids(user):
    """Foydalanuvchining barcha attempts'idagi noto'g'ri javob berilgan
    savol id'larini yig'adi.

    `TestAttempt.answers` — `{question_id_str: javob}` formatda; javob savol
    turiga qarab int (mcq indeks), list (multiple_select), str (fill_blank)
    yoki obyekt-shaklli payload bo'lishi mumkin. Savol noto'g'ri deb
    hisoblanadi: foydalanuvchi javob bergan, lekin grade_answer natijasi
    RESULT_WRONG. Yechilmagan savollar (javob None) bu yerga kirmaydi —
    ular "xato" emas, balki "qoldirib ketilgan".

    Returns: set(question_id) — noyob savollar to'plami.
    """
    wrong_ids = set()
    # Xotira himoyasi: faol foydalanuvchining minglab attempt'i bo'lishi mumkin —
    # barchasini (answers JSON bilan) RAM'ga yuklash og'ir. Eng so'nggi 500 ta
    # urinish "noto'g'ri javoblar" mashqi uchun yetarlicha keng (foydalanuvchi
    # bundan eskini deyarli takrorlamaydi), ammo cheksiz o'sishni to'sadi.
    MAX_ATTEMPTS = 500
    attempts = (
        TestAttempt.objects
        .filter(user=user)
        .only('id', 'answers', 'olympiad_id', 'submitted_at')
        .order_by('-submitted_at')[:MAX_ATTEMPTS]
    )
    attempt_answers = []  # [(olympiad_id, {qid:int -> xom javob})]
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
            # Avval faqat int(v) qabul qilinardi — multiple_select (list),
            # fill_blank (str) kabi turlar jimgina skip bo'lardi. Endi xom
            # qiymat saqlanadi va pastda grade_answer bilan baholanadi.
            normalised[qid] = v
            referenced_qids.add(qid)
        if normalised:
            attempt_answers.append((attempt.olympiad_id, normalised))

    if not referenced_qids:
        return wrong_ids

    question_map = Question.objects.filter(id__in=referenced_qids).in_bulk()

    # Variant indeksli turlarda (mcq/yes_no/multiple_select) attempt'dagi
    # javob shuffle qilingan indeks — sessiyadagi option_orders bilan asl
    # indeksga o'giramiz, aks holda to'g'ri javob ham "xato" deb belgilanardi.
    from attempts.models import TestSession
    from attempts.session_utils import (
        _deshuffle_index,
        _deshuffle_multi,
        _extract_chosen,
    )
    session_orders = {
        olympiad_id: (orders or {})
        for olympiad_id, orders in (
            TestSession.objects
            .filter(user=user)
            .values_list('olympiad_id', 'option_orders')
        )
    }

    for olympiad_id, normalised in attempt_answers:
        orders = session_orders.get(olympiad_id) or {}
        for qid, chosen in normalised.items():
            question = question_map.get(qid)
            if question is None:
                continue
            q_type = getattr(question, 'question_type', 'mcq') or 'mcq'
            # Kod va essay avtomatik baholanmaydi — "xato" deb belgilamaymiz.
            if q_type in ('code', 'essay'):
                continue
            chosen = _extract_chosen(chosen, q_type)
            options = list(question.options or [])
            order = orders.get(str(qid)) or list(range(len(options)))
            if q_type in ('mcq', 'yes_no'):
                chosen = _deshuffle_index(chosen, order)
            elif q_type == 'multiple_select':
                chosen = _deshuffle_multi(chosen, order)
            if grade_answer(question, chosen) == RESULT_WRONG:
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

    # `order_by('?')` o'rniga ID'larni olib Python'da random tanlaymiz
    # (katta banklarda DB-level RANDOM() saralashidan tezroq va arzonroq).
    all_ids = list(
        Question.objects
        .filter(id__in=wrong_ids, subject__iexact=subject)
        .values_list('id', flat=True)
    )
    available = random.sample(all_ids, min(question_count, len(all_ids))) if all_ids else []
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
