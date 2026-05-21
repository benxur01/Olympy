from django.conf import settings
from django.shortcuts import get_object_or_404
from rest_framework import status as http_status
from rest_framework.decorators import api_view, parser_classes, permission_classes, throttle_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

from centers.models import CenterMembership

from .ai_generation import generate_questions
from .models import Question
from .pdf_generation import extract_questions_from_pdf
from .serializers import QuestionSerializer


class AiQuestionRateThrottle(UserRateThrottle):
    scope = 'ai_question'


def _user_can_create_for_center(user, center_id):
    """Teacher/Manager/Owner with approved membership can create questions."""
    if user.is_platform_admin:
        return True
    return CenterMembership.objects.filter(
        user=user, center_id=center_id,
        role__in=[
            CenterMembership.ROLE_TEACHER,
            CenterMembership.ROLE_MANAGER,
            CenterMembership.ROLE_OWNER,
        ],
        status=CenterMembership.STATUS_APPROVED,
    ).exists()


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
@parser_classes([JSONParser, MultiPartParser, FormParser])
def questions_list_create(request):
    """GET /api/questions/?center=<id>  — list questions for a center.
    POST /api/questions/                 — create one (approved teacher/manager/owner only).
    """
    if request.method == 'GET':
        raw_center = request.query_params.get('center')
        if not raw_center:
            return Response(
                {'detail': 'center query parametri majburiy'},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        # `?center=abc` kabi noto'g'ri qiymat berilsa, avval bu joyda
        # DB darajasida ValueError otilardi va 500 qaytarardi. Endi 400.
        try:
            center_id = int(raw_center)
        except (TypeError, ValueError):
            return Response(
                {'detail': "center parametri son bo'lishi kerak"},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        if not _user_can_create_for_center(request.user, center_id):
            return Response(
                {'detail': 'Forbidden'},
                status=http_status.HTTP_403_FORBIDDEN,
            )
        qs = Question.objects.filter(center_id=center_id)
        return Response(QuestionSerializer(qs, many=True).data)

    serializer = QuestionSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    center_id = serializer.validated_data['center'].id
    if not _user_can_create_for_center(request.user, center_id):
        return Response(
            {'detail': "Savol yaratish uchun o'qituvchi/manager arizangiz tasdiqlanishi kerak"},
            status=http_status.HTTP_403_FORBIDDEN,
        )
    question = serializer.save(created_by=request.user)
    return Response(QuestionSerializer(question).data,
                    status=http_status.HTTP_201_CREATED)


@api_view(['GET', 'PATCH', 'PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
@parser_classes([JSONParser, MultiPartParser, FormParser])
def question_detail(request, question_id):
    """GET/PATCH/PUT/DELETE /api/questions/{id}/

    Edit (qalam) tugmasi avval ulanmagan edi — endi PATCH bilan ishlaydi.
    DELETE ham qo'shildi: o'sha ruxsatga ega rolllar.
    """
    question = get_object_or_404(Question, pk=question_id)
    if not _user_can_create_for_center(request.user, question.center_id):
        return Response({'detail': 'Forbidden'}, status=http_status.HTTP_403_FORBIDDEN)
    if request.method == 'GET':
        return Response(QuestionSerializer(question).data)
    if request.method == 'DELETE':
        question.delete()
        return Response(status=http_status.HTTP_204_NO_CONTENT)
    # PATCH / PUT
    partial = request.method == 'PATCH'
    data = request.data
    # center maydonini tahrirlashga ruxsat bermaymiz — savol bir markazga
    # bog'liq bo'lib qoladi.
    if hasattr(data, 'copy'):
        data = data.copy()
    else:
        data = dict(data)
    data.pop('center', None)
    serializer = QuestionSerializer(question, data=data, partial=partial)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(QuestionSerializer(question).data)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def delete_all_questions(request):
    """DELETE /api/questions/delete-all/?center=<id>
    Delete all questions for a center (approved teacher/manager/owner only).
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
    if not _user_can_create_for_center(request.user, center_id):
        return Response(
            {'detail': 'Forbidden'},
            status=http_status.HTTP_403_FORBIDDEN,
        )
    deleted_count, _ = Question.objects.filter(center_id=center_id).delete()
    return Response(
        {'detail': f"{deleted_count} ta savol muvaffaqiyatli o'chirildi", 'deleted_count': deleted_count},
        status=http_status.HTTP_200_OK,
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([AiQuestionRateThrottle])
def generate_ai_questions(request):
    """POST /api/questions/generate-ai/ — preview AI questions before saving."""
    center_id = request.data.get('center')
    if not center_id:
        return Response(
            {'detail': 'center majburiy'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    if not _user_can_create_for_center(request.user, center_id):
        return Response(
            {'detail': "Savol yaratish uchun o'qituvchi/manager arizangiz tasdiqlanishi kerak"},
            status=http_status.HTTP_403_FORBIDDEN,
        )

    result = generate_questions(
        subject=request.data.get('subject'),
        topic=request.data.get('topic'),
        count=request.data.get('count', 10),
        difficulty=request.data.get('difficulty', 'medium'),
        question_type=request.data.get('question_type'),
    )
    if not result.get('ok'):
        status_code = (
            http_status.HTTP_400_BAD_REQUEST
            if result.get('error') in ("Fan va mavzu majburiy.",)
            else http_status.HTTP_503_SERVICE_UNAVAILABLE
        )
        return Response(
            {'detail': result.get('error') or "AI savol yarata olmadi"},
            status=status_code,
        )
    return Response({'questions': result['questions']})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
@throttle_classes([AiQuestionRateThrottle])
def preview_pdf_questions(request):
    """POST /api/questions/pdf-preview/ — extract questions from an uploaded PDF."""
    center_id = request.data.get('center')
    if not center_id:
        return Response(
            {'detail': 'center majburiy'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    if not _user_can_create_for_center(request.user, center_id):
        return Response(
            {'detail': "Savol yaratish uchun o'qituvchi/manager arizangiz tasdiqlanishi kerak"},
            status=http_status.HTTP_403_FORBIDDEN,
        )
    pdf_file = request.FILES.get('pdf') or request.FILES.get('file') or request.FILES.get('document')
    if not pdf_file:
        return Response({'detail': 'PDF fayl yuboring'}, status=http_status.HTTP_400_BAD_REQUEST)
    filename = str(getattr(pdf_file, 'name', '') or '').lower()
    content_type = str(getattr(pdf_file, 'content_type', '') or '').lower()
    if content_type != 'application/pdf' and not filename.endswith('.pdf'):
        return Response({'detail': 'Faqat PDF fayl qabul qilinadi'}, status=http_status.HTTP_400_BAD_REQUEST)
    max_bytes = getattr(settings, 'AI_QUESTION_PDF_MAX_BYTES', 20 * 1024 * 1024)
    if pdf_file.size and pdf_file.size > max_bytes:
        return Response(
            {'detail': f"PDF juda katta. Limit: {max_bytes // (1024 * 1024)} MB"},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    pdf_bytes = pdf_file.read()
    if not pdf_bytes:
        return Response({'detail': "PDF fayl bo'sh"}, status=http_status.HTTP_400_BAD_REQUEST)
    result = extract_questions_from_pdf(
        pdf_bytes=pdf_bytes,
        subject=request.data.get('subject') or '',
        difficulty=request.data.get('difficulty') or 'medium',
        question_type=request.data.get('question_type') or 'multiple_choice',
    )
    if not result.get('ok'):
        return Response(
            {
                'detail': result.get('error') or "PDFdan savollarni ajratib bo'lmadi",
                'pdf_text_chars': result.get('pdf_text_chars', 0),
                'page_count': result.get('page_count', 0),
                'used_pdf_vision': bool(result.get('used_pdf_vision')),
            },
            status=http_status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    return Response({
        'questions': result.get('questions') or [],
        'provider': result.get('provider') or '',
        'pdf_text_chars': result.get('pdf_text_chars', 0),
        'page_count': result.get('page_count', 0),
        'used_pdf_vision': bool(result.get('used_pdf_vision')),
        'complete': result.get('complete', True),
        'warning': result.get('warning') or '',
        'chunks': result.get('chunks', 1),
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def olympiad_questions(request, olympiad_id):
    from datetime import timedelta

    from django.utils import timezone

    from olympiads.models import Olympiad
    from olympiads.services import (
        maybe_finish_expired_olympiad,
        user_can_participate_in_event,
    )

    olympiad = get_object_or_404(Olympiad, pk=olympiad_id)
    # Celery worker bo'lmagan muhitda muddati o'tgan olimpiadani lazy yopish.
    # Status o'zgargan bo'lsa pastdagi tekshiruvlar to'g'ri ishlaydi.
    try:
        maybe_finish_expired_olympiad(olympiad)
        olympiad.refresh_from_db()
    except Exception:
        pass
    if olympiad.status != Olympiad.STATUS_ACTIVE:
        # Status'ga qarab aniqroq xabar — student "Olimpiada faol emas"
        # ko'rganida tushunmasdi (yakunlanganmi yoki hali boshlanmaganmi?).
        if olympiad.status == Olympiad.STATUS_FINISHED:
            detail = "Olimpiada yakunlangan"
        elif olympiad.status == Olympiad.STATUS_DRAFT:
            detail = "Olimpiada hali nashr qilinmagan"
        else:
            detail = "Olimpiada faol emas"
        return Response({'detail': detail}, status=http_status.HTTP_403_FORBIDDEN)
    # Time-window check (timezone-aware): the celery finisher may not have run
    # yet, so don't trust status alone.
    now = timezone.now()
    if olympiad.start_datetime and now < olympiad.start_datetime:
        return Response(
            {'detail': "Olimpiada hali boshlanmagan"},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    if olympiad.start_datetime and olympiad.duration_minutes:
        end_time = olympiad.start_datetime + timedelta(minutes=olympiad.duration_minutes)
        if now > end_time:
            return Response(
                {'detail': "Olimpiada vaqti tugagan"},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
    if not user_can_participate_in_event(request.user, olympiad):
        return Response({'detail': 'Forbidden'}, status=http_status.HTTP_403_FORBIDDEN)
    from attempts.models import TestAttempt
    from attempts.session_utils import (
        get_or_create_test_session,
        questions_payload,
        session_is_expired,
        session_timing_payload,
    )

    if TestAttempt.objects.filter(user=request.user, olympiad=olympiad).exists():
        return Response(
            {'detail': "Siz bu olimpiadaga allaqachon qatnashgansiz"},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    session = get_or_create_test_session(request.user, olympiad)
    if session.status == getattr(session, 'STATUS_DISQUALIFIED', 'disqualified'):
        return Response(
            {'detail': "Siz cheating qildingiz. Olimpiada yakunlandi."},
            status=http_status.HTTP_403_FORBIDDEN,
        )
    if session_is_expired(session, olympiad):
        return Response(
            {'detail': "Test vaqti tugagan"},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    # Avval bu yerda faqat questions arrayi qaytarilardi va frontend lokal
    # DURATION dan teskari sanardi. Endi questions ham, server timing'i ham
    # qaytariladi — bu frontend va server vaqti orasidagi drift'ni yo'qotadi.
    # Backward-compat: response.questions arrayi avvalgi roli bilan bir xil.
    return Response({
        'questions': questions_payload(session, olympiad),
        'session': session_timing_payload(session, olympiad),
    })
