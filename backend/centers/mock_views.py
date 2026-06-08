"""T4: Mock olimpiada — o'quvchi tomonidagi endpointlar.

Mount: `/api/mock-olympiads/` (olympy_api/urls.py orqali).

- start   — POST /api/mock-olympiads/<mock_id>/start/
- submit  — POST /api/mock-olympiads/<mock_id>/submit/
- results — GET  /api/mock-olympiads/<mock_id>/results/   (faqat markaz uchun)

Mock — mashq rejimi: vaqt cheklovi yumshoq (faqat ko'rsatma uchun), cheating
DQ logikasi yo'q. Har (mock, user) juftligi bitta MockAttempt.
"""
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status as http_status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from questions.grading import RESULT_CORRECT, grade_answer

from .models import CenterMembership, MockAttempt, MockOlympiad
from .services import user_can_manage_center


def _extract_mock_chosen(chosen, q_type):
    """Mock javob payload'idan baholash uchun xom qiymatni ajratadi.

    Olimpiada (session_utils._extract_chosen) bilan bir xil shartnoma, lekin
    mock savollar shuffle qilinmaydi — shu sababli de-shuffle yo'q. Eski
    (skalar) MCQ formatini ham qo'llab-quvvatlaydi.
    """
    if isinstance(chosen, dict):
        if q_type in ('mcq', 'yes_no'):
            return chosen.get('chosen_idx')
        if q_type == 'multiple_select':
            return chosen.get('selected')
        if q_type in ('fill_blank', 'essay'):
            return chosen.get('text')
        if q_type == 'fill_blanks':
            if 'blanks' in chosen:
                return chosen.get('blanks')
            return chosen
    return chosen


def _user_is_center_student(user, center):
    """Foydalanuvchi shu markazning tasdiqlangan o'quvchisimi."""
    return CenterMembership.objects.filter(
        user=user,
        center=center,
        role=CenterMembership.ROLE_STUDENT,
        status=CenterMembership.STATUS_APPROVED,
    ).exists()


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def start_mock(request, mock_id):
    """POST /api/mock-olympiads/<mock_id>/start/ — o'quvchi mock'ni boshlaydi.

    MockAttempt yaratadi (idempotent: allaqachon bor bo'lsa o'shani qaytaradi).
    Javob: {attempt_id, title, time_limit_minutes, started_at,
            questions: [{id, text, options, subject}]}
    Savollarning to'g'ri javobi YUBORILMAYDI (xavfsizlik).
    """
    mock = get_object_or_404(
        MockOlympiad.objects.select_related('center'), pk=mock_id,
    )
    if not mock.is_active:
        return Response({'detail': 'Mock olimpiada faol emas'}, status=http_status.HTTP_400_BAD_REQUEST)
    # Faqat markaz o'quvchisi yoki menejeri (test uchun) boshlay oladi.
    if not _user_is_center_student(request.user, mock.center) and not user_can_manage_center(request.user, mock.center):
        return Response(
            {'detail': "Bu mashq olimpiadasi shu markaz o'quvchilari uchun"},
            status=http_status.HTTP_403_FORBIDDEN,
        )

    # Mavjud attempt qaytarilsa, foydalanuvchi to'xtatgan joydan davom etadi
    # (javoblar va `started_at` saqlanadi). Qayta boshlash uchun frontend
    # `restart: true` yuboradi — faqat hali topshirilmagan (submitted_at is
    # None) attempt reset qilinadi; yakunlangan urinish quyida 400 bilan
    # bloklanadi, shu sababli topshirilgandan keyin restart ta'sir qilmaydi.
    attempt, created = MockAttempt.objects.get_or_create(
        mock=mock, user=request.user,
    )
    if not created and request.data.get('restart') and attempt.submitted_at is None:
        attempt.answers = {}
        attempt.started_at = timezone.now()
        attempt.submitted_at = None
        attempt.score = 0
        attempt.correct_count = 0
        attempt.total_questions = 0
        attempt.save(update_fields=[
            'answers', 'started_at', 'submitted_at',
            'score', 'correct_count', 'total_questions',
        ])
    if attempt.submitted_at is not None:
        return Response(
            {'detail': 'Siz bu mashqni allaqachon yakunlagansiz', 'attempt_id': attempt.id},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    from questions.grading import _parse_correct_text
    questions = []
    for q in mock.questions.all().order_by('id'):
        q_type = getattr(q, 'question_type', 'mcq') or 'mcq'
        item = {
            'id': q.id,
            'text': q.text,
            'options': q.options,
            'subject': q.subject,
            'question_type': q_type,
        }
        # fill_blanks uchun bo'sh joylar soni — to'g'ri javoblarni sizdirmasdan.
        if q_type == 'fill_blanks':
            correct = _parse_correct_text(getattr(q, 'correct_text', ''))
            item['blanks_count'] = len(correct) if isinstance(correct, dict) else 1
        questions.append(item)
    return Response({
        'attempt_id': attempt.id,
        'title': mock.title,
        'subject': mock.subject or '',
        'time_limit_minutes': mock.time_limit_minutes,
        'started_at': attempt.started_at.isoformat() if attempt.started_at else None,
        'questions': questions,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def submit_mock(request, mock_id):
    """POST /api/mock-olympiads/<mock_id>/submit/ — javoblarni topshirish.

    Body: {answers: {question_id: chosen_option_index}}.
    Server javoblarni baholaydi (correct_answer'ga qarab). Javob:
    {score, correct_count, total_questions, percentage}.
    """
    mock = get_object_or_404(
        MockOlympiad.objects.select_related('center').prefetch_related('questions'),
        pk=mock_id,
    )
    if not _user_is_center_student(request.user, mock.center) and not user_can_manage_center(request.user, mock.center):
        return Response(
            {'detail': "Bu mashq olimpiadasi shu markaz o'quvchilari uchun"},
            status=http_status.HTTP_403_FORBIDDEN,
        )

    attempt = MockAttempt.objects.filter(mock=mock, user=request.user).first()
    if attempt is None:
        return Response(
            {'detail': "Avval mashqni boshlang"},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    if attempt.submitted_at is not None:
        return Response(
            {'detail': 'Siz bu mashqni allaqachon yakunlagansiz'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    answers = (request.data or {}).get('answers') or {}
    if not isinstance(answers, dict):
        answers = {}

    questions = list(mock.questions.all())
    total = len(questions)
    correct = 0
    clean_answers = {}
    # Baholash savol turiga qarab grade_answer orqali — mcq/yes_no/
    # multiple_select/fill_blank/fill_blanks barchasi to'g'ri baholanadi.
    # essay (RESULT_PENDING) avtomatik baholanmaydi: 0 ball, "noto'g'ri" emas.
    # Mock savollar shuffle qilinmaydi, shu sababli de-shuffle shart emas.
    for q in questions:
        chosen = answers.get(str(q.id))
        if chosen is None:
            chosen = answers.get(q.id)
        q_type = getattr(q, 'question_type', 'mcq') or 'mcq'
        chosen = _extract_mock_chosen(chosen, q_type)
        if chosen is None:
            continue
        # Saqlashda javobni o'z holicha qoldiramiz (matn/ro'yxat/dict/int) —
        # natijalar ekranida qayta ko'rsatish uchun.
        clean_answers[str(q.id)] = chosen
        result = grade_answer(q, chosen)
        if result == RESULT_CORRECT:
            correct += 1
        # RESULT_PENDING (essay) va RESULT_WRONG/RESULT_BLANK — correct emas.

    score = round((correct / total) * 100) if total else 0
    attempt.answers = clean_answers
    attempt.score = score
    attempt.correct_count = correct
    attempt.total_questions = total
    attempt.submitted_at = timezone.now()
    attempt.save(update_fields=[
        'answers', 'score', 'correct_count', 'total_questions', 'submitted_at',
    ])

    return Response({
        'attempt_id': attempt.id,
        'score': score,
        'correct_count': correct,
        'total_questions': total,
        'percentage': score,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def get_or_create_practice_mock(request, olympiad_id):
    """POST /api/centers/practice-mock/<olympiad_id>/ — o'tib ketgan olimpiadani
    mashq rejimida ochish.

    Tugagan (status='finished') real olimpiadadan bir martalik MockOlympiad
    nusxasini yaratadi (keyingi so'rovlarda qayta ishlatiladi) va o'quvchi uchun
    MockAttempt tayyorlaydi. Mashq rejimi leaderboard'ga ham, markaz reytingiga
    ham TA'SIR QILMAYDI — barchasi MockOlympiad/MockAttempt qatlamida qoladi.

    Javob: {mock_id, attempt_id, status, title}.
    """
    from olympiads.models import Olympiad

    olympiad = get_object_or_404(
        Olympiad.objects.select_related('center'),
        pk=olympiad_id,
        status=Olympiad.STATUS_FINISHED,
        is_deleted=False,
    )

    # Mashqqa kirish ruxsati real olimpiada ko'rinishi bilan bir xil bo'lishi
    # kerak: ochiq olimpiada (event_type='olympiad') hammaga, markaz musobaqasi
    # esa faqat shu markazning tasdiqlangan o'quvchisiga/menejeriga.
    is_public = olympiad.event_type == Olympiad.EVENT_TYPE_OLYMPIAD
    if not is_public:
        allowed = (
            _user_is_center_student(request.user, olympiad.center)
            or user_can_manage_center(request.user, olympiad.center)
        )
        if not allowed:
            return Response(
                {'detail': "Bu musobaqani mashq qilish uchun shu markaz tasdig'i kerak"},
                status=http_status.HTTP_403_FORBIDDEN,
            )

    # Manba olimpiada uchun mashq nusxasi bir marta yaratiladi — keyin barcha
    # o'quvchilar shu bitta MockOlympiad'ni ulashadi (savollar bir xil).
    mock, created = MockOlympiad.objects.get_or_create(
        source_olympiad=olympiad,
        center=olympiad.center,
        defaults={
            'title': f'{olympiad.title} (mashq)',
            'subject': olympiad.subject or '',
            'time_limit_minutes': olympiad.duration_minutes or 30,
            'is_active': True,
        },
    )
    if created:
        # Olimpiada savollarini mashq nusxasiga ko'chiramiz (ManyToMany — bir xil
        # Question obyektlariga havola, nusxalanmaydi). Faqat yaratilganda.
        question_ids = list(olympiad.questions.values_list('id', flat=True))
        if question_ids:
            mock.questions.set(question_ids)

    attempt, _ = MockAttempt.objects.get_or_create(
        mock=mock, user=request.user,
    )

    return Response({
        'mock_id': mock.id,
        'attempt_id': attempt.id,
        'status': 'submitted' if attempt.submitted_at is not None else 'in_progress',
        'title': mock.title,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def mock_results(request, mock_id):
    """GET /api/mock-olympiads/<mock_id>/results/ — faqat markaz uchun natijalar.

    Javob: [{user_id, full_name, score, correct_count, total_questions,
             submitted_at}]
    """
    mock = get_object_or_404(
        MockOlympiad.objects.select_related('center'), pk=mock_id,
    )
    if not user_can_manage_center(request.user, mock.center):
        return Response({'detail': 'Forbidden'}, status=http_status.HTTP_403_FORBIDDEN)

    attempts = (
        MockAttempt.objects
        .filter(mock=mock, submitted_at__isnull=False)
        .select_related('user')
        .order_by('-score', 'submitted_at')
    )
    data = [
        {
            'user_id': a.user_id,
            'full_name': a.user.full_name or a.user.normalized_phone or '—',
            'score': a.score,
            'correct_count': a.correct_count,
            'total_questions': a.total_questions,
            'submitted_at': a.submitted_at.isoformat() if a.submitted_at else None,
        }
        for a in attempts
    ]
    return Response(data)
