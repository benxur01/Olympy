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

from .models import CenterMembership, MockAttempt, MockOlympiad
from .services import user_can_manage_center


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

    attempt, _created = MockAttempt.objects.get_or_create(
        mock=mock, user=request.user,
    )
    if attempt.submitted_at is not None:
        return Response(
            {'detail': 'Siz bu mashqni allaqachon yakunlagansiz', 'attempt_id': attempt.id},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    questions = [
        {
            'id': q.id,
            'text': q.text,
            'options': q.options,
            'subject': q.subject,
        }
        for q in mock.questions.all().order_by('id')
    ]
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
    for q in questions:
        chosen = answers.get(str(q.id))
        if chosen is None:
            chosen = answers.get(q.id)
        try:
            chosen_idx = int(chosen) if chosen is not None else None
        except (TypeError, ValueError):
            chosen_idx = None
        if chosen_idx is not None:
            clean_answers[str(q.id)] = chosen_idx
            if chosen_idx == q.correct_answer:
                correct += 1

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
