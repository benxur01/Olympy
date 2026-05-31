from django.conf import settings
from django.shortcuts import get_object_or_404
from rest_framework import status as http_status
from rest_framework.decorators import api_view, parser_classes, permission_classes, throttle_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

from centers.models import CenterMembership

from .ai_generation import generate_questions, explain_question_ai, review_code_submission
from .models import Question
from .pdf_generation import extract_questions_from_pdf
from .serializers import QuestionSerializer


class AiQuestionRateThrottle(UserRateThrottle):
    scope = 'ai_question'


class CodeReviewRateThrottle(UserRateThrottle):
    """IT kod savolini AI baholash uchun 'code_review' scope (10/hour)."""
    scope = 'code_review'


class CodeRunRateThrottle(UserRateThrottle):
    """Judge0 kod runner ("Ishga tushirish") uchun 'code_run' scope (20/hour)."""
    scope = 'code_run'


class AiExplainRateThrottle(UserRateThrottle):
    """AI tushuntirish endpoint'i uchun 'ai' scope (settings'da 10/day).

    Eslatma: @api_view function-based view'da `throttle_scope` atributi
    WrappedAPIView'ga ko'chmaganligi va ScopedRateThrottle.allow_request
    scope'ni view'dan qayta o'qiganligi sababli, scope'ni shu yerda
    UserRateThrottle subclass orqali (per-foydalanuvchi) o'rnatamiz —
    AiQuestionRateThrottle bilan bir xil naqsh.
    """
    scope = 'ai'


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
        return Response(QuestionSerializer(qs, many=True, context={'request': request}).data)

    serializer = QuestionSerializer(data=request.data, context={'request': request})
    serializer.is_valid(raise_exception=True)
    center_id = serializer.validated_data['center'].id
    if not _user_can_create_for_center(request.user, center_id):
        return Response(
            {'detail': "Savol yaratish uchun o'qituvchi/manager arizangiz tasdiqlanishi kerak"},
            status=http_status.HTTP_403_FORBIDDEN,
        )
    question = serializer.save(created_by=request.user)
    return Response(QuestionSerializer(question, context={'request': request}).data,
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
        return Response(QuestionSerializer(question, context={'request': request}).data)
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
    serializer = QuestionSerializer(question, data=data, partial=partial, context={'request': request})
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(QuestionSerializer(question, context={'request': request}).data)


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
    ids_raw = request.query_params.get('ids')
    if ids_raw:
        try:
            ids = [int(x) for x in ids_raw.split(',') if x.strip()]
        except (ValueError, TypeError):
            return Response(
                {'detail': "ids parametri butun sonlar ro'yxati bo'lishi kerak"},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        deleted_count, _ = Question.objects.filter(center_id=center_id, id__in=ids).delete()
    else:
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


def _normalize_correct_answer(value):
    """A/B/C/D yoki 0/1/2/3 → indeks (0-based). Noma'lum qiymatda None."""
    if value is None:
        return None
    s = str(value).strip().upper()
    if not s:
        return None
    letter_map = {'A': 0, 'B': 1, 'C': 2, 'D': 3, 'E': 4, 'F': 5}
    if s in letter_map:
        return letter_map[s]
    try:
        i = int(s)
        if 0 <= i <= 9:
            return i
    except (TypeError, ValueError):
        pass
    return None


def _normalize_difficulty(value):
    if not value:
        return Question.DIFFICULTY_MEDIUM
    s = str(value).strip().lower()
    aliases = {
        'oson': 'easy', 'easy': 'easy', 'beginner': 'beginner', 'elementary': 'elementary',
        "o'rta": 'medium', "orta": 'medium', "o`rta": 'medium', 'medium': 'medium', 'int': 'int', 'intermediate': 'int',
        'qiyin': 'hard', 'hard': 'hard', 'advanced': 'advanced',
        'pre-int': 'pre-int', 'pre-intermediate': 'pre-int', 'upper-int': 'upper-int', 'upper-intermediate': 'upper-int',
    }
    return aliases.get(s, Question.DIFFICULTY_MEDIUM)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def import_questions_excel(request):
    """POST /api/questions/import/?center=<id>

    Excel (.xlsx) yoki CSV (.csv) faylidan savollar import qiladi.
    Format (birinchi qator — sarlavha, e'tiborga olinmaydi):
        savol | variant_a | variant_b | variant_c | variant_d | togri_javob | qiyinlik | fan
    `togri_javob`: A/B/C/D yoki 0/1/2/3.
    `qiyinlik`: easy/medium/hard yoki o'zbek nomlari (Oson/O'rta/Qiyin).
    `fan` bo'sh bo'lsa, ?subject= query parametri yoki "Umumiy" ishlatiladi.
    """
    raw_center = request.query_params.get('center') or request.data.get('center')
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
            {'detail': "Savol yaratish uchun o'qituvchi/manager arizangiz tasdiqlanishi kerak"},
            status=http_status.HTTP_403_FORBIDDEN,
        )

    upload = request.FILES.get('file') or request.FILES.get('upload') or request.FILES.get('excel')
    if not upload:
        return Response({'detail': 'Fayl yuboring (form key: file)'}, status=http_status.HTTP_400_BAD_REQUEST)

    filename = (getattr(upload, 'name', '') or '').lower()
    fallback_subject = (request.query_params.get('subject') or request.data.get('subject') or 'Umumiy').strip() or 'Umumiy'

    rows = []
    errors = []
    try:
        if filename.endswith('.csv'):
            import csv
            import io
            raw = upload.read()
            # BOM va encoding fallback
            for enc in ('utf-8-sig', 'utf-8', 'cp1251', 'latin-1'):
                try:
                    text = raw.decode(enc)
                    break
                except UnicodeDecodeError:
                    text = None
                    continue
            if text is None:
                return Response({'detail': "CSV fayl encoding'i aniqlanmadi"}, status=http_status.HTTP_400_BAD_REQUEST)
            # Avval ; bilan urinib ko'ramiz, agar bo'sh chiqsa , ga o'tamiz.
            try:
                dialect = csv.Sniffer().sniff(text[:2000], delimiters=',;\t|')
                reader = csv.reader(io.StringIO(text), dialect)
            except Exception:
                reader = csv.reader(io.StringIO(text))
            for r in reader:
                rows.append(r)
        elif filename.endswith('.xlsx') or filename.endswith('.xlsm'):
            try:
                from openpyxl import load_workbook
            except ImportError:
                return Response(
                    {'detail': "openpyxl o'rnatilmagan. Iltimos administratorga xabar bering."},
                    status=http_status.HTTP_503_SERVICE_UNAVAILABLE,
                )
            wb = load_workbook(upload, read_only=True, data_only=True)
            ws = wb.active
            for row in ws.iter_rows(values_only=True):
                rows.append(list(row))
        else:
            return Response(
                {'detail': "Faqat .xlsx yoki .csv fayl qabul qilinadi"},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
    except Exception as exc:
        return Response(
            {'detail': f"Faylni o'qib bo'lmadi: {exc}"},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    if not rows:
        return Response({'detail': "Faylda satr topilmadi"}, status=http_status.HTTP_400_BAD_REQUEST)

    # Birinchi qatorni heuristic'da header deb tashlaymiz: agar 6-ustun A-F
    # harf yoki 0-9 raqamga emas, balki matnga o'xshasa.
    first = rows[0]

    def _is_header(row):
        if not row or len(row) < 6:
            return False
        s5 = str(row[5] or '').strip().upper()
        if not s5:
            return True
        if s5 in ('A', 'B', 'C', 'D', 'E', 'F', '0', '1', '2', '3', '4', '5'):
            return False
        return True

    data_rows = rows[1:] if _is_header(first) else rows

    created = 0
    for idx, raw_row in enumerate(data_rows, start=2 if _is_header(first) else 1):
        if not raw_row:
            continue
        # Bo'sh qatorlarni o'tkazib yuboramiz.
        normalized = [('' if v is None else str(v).strip()) for v in raw_row]
        if not any(normalized):
            continue
        if len(normalized) < 6:
            errors.append({'row': idx, 'detail': "Yetarli ustun yo'q (kamida 6 ta kerak)"})
            continue
        text = normalized[0]
        if not text:
            errors.append({'row': idx, 'detail': "Savol matni bo'sh"})
            continue
        # variantlar: A, B, C, D (D ixtiyoriy bo'lsa ham — kamida 2 ta variant)
        options_raw = [normalized[1], normalized[2], normalized[3], normalized[4] if len(normalized) > 4 else '']
        options = [o for o in options_raw if o]
        if len(options) < 2:
            errors.append({'row': idx, 'detail': "Kamida 2 ta javob varianti kerak"})
            continue
        correct_idx = _normalize_correct_answer(normalized[5])
        if correct_idx is None or correct_idx >= len(options):
            errors.append({'row': idx, 'detail': f"To'g'ri javob ko'rsatkichi noto'g'ri: {normalized[5]}"})
            continue
        difficulty = _normalize_difficulty(normalized[6] if len(normalized) > 6 else '')
        subject = (normalized[7] if len(normalized) > 7 else '').strip() or fallback_subject
        try:
            Question.objects.create(
                center_id=center_id,
                subject=subject[:80],
                text=text,
                options=options,
                correct_answer=correct_idx,
                score=3,
                difficulty=difficulty,
                source=Question.SOURCE_MANUAL,
                created_by=request.user,
            )
            created += 1
        except Exception as exc:
            errors.append({'row': idx, 'detail': f"DB xatosi: {exc}"})

    return Response({
        'created': created,
        'errors': errors[:50],  # Frontend'da ko'p xato ko'rsatmaslik uchun cheklov
        'error_count': len(errors),
    })


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
def question_analytics(request):
    """GET /api/questions/analytics/?center=<id>
    Markazdagi savollar bo'yicha noto'g'ri javob statistikasi.

    Har bir savol uchun: question_id, text (qisqartirilgan, 80 belgi),
    subject, total_attempts, wrong_count, wrong_rate (%).
    Faqat wrong_rate >= 30% va total_attempts >= 3 bo'lganlar.
    wrong_rate kamayish tartibida, max 50 ta.
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

    from attempts.models import TestAttempt

    questions = list(
        Question.objects.filter(center_id=center_id)
        .only('id', 'text', 'subject', 'correct_answer')
    )
    if not questions:
        return Response([])

    qmap = {q.id: q for q in questions}
    total_count = {q.id: 0 for q in questions}
    wrong_count = {q.id: 0 for q in questions}

    answers_iter = (
        TestAttempt.objects
        .filter(olympiad__center_id=center_id, disqualified=False)
        .values_list('answers', flat=True)
    )

    for ans in answers_iter:
        if not isinstance(ans, dict):
            continue
        for k, v in ans.items():
            try:
                qid = int(k)
            except (TypeError, ValueError):
                continue
            q = qmap.get(qid)
            if not q:
                continue
            total_count[qid] = total_count.get(qid, 0) + 1
            try:
                chosen = int(v)
            except (TypeError, ValueError):
                # Javob berilmagan/noto'g'ri formatda — noto'g'ri deb hisoblaymiz.
                wrong_count[qid] = wrong_count.get(qid, 0) + 1
                continue
            if chosen != q.correct_answer:
                wrong_count[qid] = wrong_count.get(qid, 0) + 1

    rows = []
    for q in questions:
        total = total_count.get(q.id, 0)
        wrong = wrong_count.get(q.id, 0)
        if total < 3:
            continue
        rate = round((wrong / total) * 100.0, 1) if total else 0.0
        if rate < 30.0:
            continue
        text_short = (q.text or '')[:80]
        if q.text and len(q.text) > 80:
            text_short = text_short.rstrip() + '…'
        rows.append({
            'question_id': q.id,
            'text': text_short,
            'subject': q.subject or '',
            'total_attempts': total,
            'wrong_count': wrong,
            'wrong_rate': rate,
        })

    rows.sort(key=lambda r: -r['wrong_rate'])
    return Response(rows[:50])


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
    all_questions = questions_payload(session, olympiad)

    # Cheating-himoya: savollarni bitta-bitta yuklash. `q` param berilsa,
    # faqat o'sha indeksdagi savol qaytariladi — shu tariqa bir vaqtda
    # barcha savollarni ko'chirib olish (scrape) qiyinlashadi.
    q_param = request.query_params.get('q')
    if q_param is not None:
        try:
            q_index = int(q_param)
        except (TypeError, ValueError):
            return Response(
                {'detail': "Noto'g'ri savol indeksi"},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        if q_index < 0 or q_index >= len(all_questions):
            return Response(
                {'detail': "Savol indeksi diapazondan tashqarida"},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        return Response({
            'questions': [all_questions[q_index]],
            'question_index': q_index,
            'total_questions': len(all_questions),
            'session': session_timing_payload(session, olympiad),
        })

    return Response({
        'questions': all_questions,
        'session': session_timing_payload(session, olympiad),
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([CodeReviewRateThrottle])
def code_review(request):
    """POST /api/questions/code-review/ — IT kod savolini AI bilan baholaydi.

    Body: { question_id, submitted_code, language }. O'quvchi test paytida
    kodini sinash uchun AI feedback oladi (to'g'rilik 0-100, xatolar, tavsiya).
    Bu yerda natija SAQLANMAYDI — yakuniy kod javob va AI bahosi submit
    paytida CodeSubmission'ga yoziladi. Rate limit: 10/hour (code_review).
    """
    question_id = request.data.get('question_id')
    submitted_code = request.data.get('submitted_code') or ''
    language = (request.data.get('language') or '').strip().lower()
    if not question_id:
        return Response({'detail': 'question_id majburiy'}, status=http_status.HTTP_400_BAD_REQUEST)
    if not str(submitted_code).strip():
        return Response({'detail': 'Kod bo\'sh bo\'lishi mumkin emas'}, status=http_status.HTTP_400_BAD_REQUEST)

    question = get_object_or_404(Question, pk=question_id)
    if question.question_type != Question.QUESTION_TYPE_CODE:
        return Response(
            {'detail': 'Bu kod (IT) savoli emas'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    result = review_code_submission(
        question_text=question.text,
        submitted_code=submitted_code,
        language=language or question.programming_language,
        expected_output=question.expected_output or '',
    )
    return Response({
        'score': result.get('score'),
        'review': result.get('review') or '',
    })


def _normalize_output(text):
    """Test case taqqoslash uchun stdout/expected normalizatsiyasi.

    Trailing whitespace va satr oxiridagi bo'shliqlar Judge0 chiqishida tez-tez
    farq qiladi (masalan oxirgi '\\n'). Har bir satrning o'ng tomonini va butun
    matnning oxirini tozalaymiz — bu 'to'g'ri javob bo'sh joy tufayli xato'
    holatini oldini oladi.
    """
    if text is None:
        return ''
    lines = str(text).replace('\r\n', '\n').replace('\r', '\n').split('\n')
    return '\n'.join(line.rstrip() for line in lines).rstrip()


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([CodeRunRateThrottle])
def run_code_view(request):
    """POST /api/questions/run-code/ — kodni Judge0 orqali ishga tushiradi.

    Body: {
        source_code: str,
        language: str,
        stdin: str (ixtiyoriy),
        question_id: int (ixtiyoriy — test case'larni olish uchun)
    }

    `question_id` berilsa va savolda `test_cases` bo'lsa — har bir ko'rinadigan
    test case (max 5) uchun alohida run qilib o'tdi/o'tmadi natijasini qaytaradi.
    Test case polling backend'da bajariladi (frontend yuklamaydi). Rate limit:
    20/hour (code_run).
    """
    from .judge0_service import is_supported, run_code, run_code_batch

    source_code = request.data.get('source_code') or ''
    language = (request.data.get('language') or '').strip().lower()
    stdin = request.data.get('stdin') or ''
    question_id = request.data.get('question_id')

    if not str(source_code).strip():
        return Response(
            {'detail': "Kod bo'sh bo'lishi mumkin emas"},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    if not language:
        return Response(
            {'detail': "Dasturlash tili majburiy"},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    if not is_supported(language):
        return Response(
            {'detail': f"'{language}' tili qo'llab-quvvatlanmaydi"},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    # Test case'lar — faqat question_id berilgan va u kod savoli bo'lsa.
    test_cases = []
    if question_id:
        question = get_object_or_404(Question, pk=question_id)
        if question.question_type == Question.QUESTION_TYPE_CODE:
            raw = question.test_cases if isinstance(question.test_cases, list) else []
            # Max 5 ta visible test case (spec). is_hidden bayrog'ini saqlaymiz —
            # frontend yashirin test uchun input/expected'ni ko'rsatmaydi.
            test_cases = raw[:5]

    # Test case'lar bo'lmasa — oddiy bitta run (foydalanuvchi stdin'i bilan).
    if not test_cases:
        result = run_code(source_code, language, stdin=stdin)
        if not result.get('ok'):
            return Response(
                {'detail': result.get('error') or "Kodni ishga tushirib bo'lmadi"},
                status=http_status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response({
            'stdout': result.get('stdout', ''),
            'stderr': result.get('stderr', ''),
            'compile_output': result.get('compile_output', ''),
            'status': result.get('status', 'Unknown'),
            'time': result.get('time', 0),
            'memory': result.get('memory', 0),
            'test_results': [],
        })

    # Test case'lar bor — har biri uchun alohida run.
    # Batch so'rovlarini tayyorlaymiz.
    batch_subs = []
    for tc in test_cases:
        tc_input = '' if tc.get('input') is None else str(tc.get('input'))
        batch_subs.append({
            'source_code': source_code,
            'language': language,
            'stdin': tc_input
        })

    batch_results = run_code_batch(batch_subs)
    if not isinstance(batch_results, list) or len(batch_results) != len(test_cases):
        err_msg = "Kodni ishga tushirib bo'lmadi"
        if isinstance(batch_results, dict) and not batch_results.get('ok'):
            err_msg = batch_results.get('error') or err_msg
        return Response(
            {'detail': err_msg},
            status=http_status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    test_results = []
    first_error = None  # compile/runtime xatosini umumiy panelda ko'rsatish uchun
    passed_all = True
    last_status = 'Accepted'
    total_time = 0.0
    max_memory = 0

    for idx, tc in enumerate(test_cases):
        tc_input = '' if tc.get('input') is None else str(tc.get('input'))
        expected = '' if tc.get('expected_output') is None else str(tc.get('expected_output'))
        is_hidden = bool(tc.get('is_hidden'))
        
        result = batch_results[idx]
        if not result.get('ok'):
            # Judge0 umuman ishlamadi — to'liq xato qaytaramiz (qisman emas).
            return Response(
                {'detail': result.get('error') or "Kodni ishga tushirib bo'lmadi"},
                status=http_status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        total_time += float(result.get('time') or 0)
        max_memory = max(max_memory, int(result.get('memory') or 0))
        got = result.get('stdout', '')
        status_desc = result.get('status', 'Unknown')
        # Compile/runtime xatosi bo'lsa — birinchisini eslab qolamiz.
        if status_desc not in ('Accepted',) and (result.get('compile_output') or result.get('stderr')):
            if first_error is None:
                first_error = {
                    'stderr': result.get('stderr', ''),
                    'compile_output': result.get('compile_output', ''),
                }
        passed = (
            status_desc == 'Accepted'
            and _normalize_output(got) == _normalize_output(expected)
        )
        if not passed:
            passed_all = False
            last_status = status_desc if status_desc != 'Accepted' else 'Wrong Answer'
        entry = {
            'passed': passed,
            'is_hidden': is_hidden,
        }
        if not is_hidden:
            entry['input'] = tc_input
            entry['expected'] = expected
            entry['got'] = _normalize_output(got)
        test_results.append(entry)

    overall_status = 'Accepted' if passed_all else last_status
    return Response({
        'stdout': '',
        'stderr': (first_error or {}).get('stderr', ''),
        'compile_output': (first_error or {}).get('compile_output', ''),
        'status': overall_status,
        'time': round(total_time, 3),
        'memory': max_memory,
        'test_results': test_results,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([AiExplainRateThrottle])
def explain_question(request, question_id):
    """POST /api/questions/<id>/explain/

    Savol uchun yechim tushuntirishini qaytaradi. Agar tushuntirish bazada
    saqlanmagan bo'lsa, Gemini AI yordamida generatsiya qilinadi va keshlanadi.

    Rate limit: 'ai' scope (settings.REST_FRAMEWORK.DEFAULT_THROTTLE_RATES) —
    tashqi Gemini API'ga qimmat va sekin murojaat qiladi, abuse'dan himoyalanadi.
    """
    question = get_object_or_404(Question, pk=question_id)
    if question.explanation and question.explanation.strip():
        return Response({'explanation': question.explanation})

    explanation_text = explain_question_ai(
        question_text=question.text,
        options=question.options or [],
        correct_idx=question.correct_answer,
        subject=question.subject or '',
    )

    if explanation_text and "generatsiya qilinmadi" not in explanation_text:
        question.explanation = explanation_text
        question.save(update_fields=['explanation'])

    return Response({'explanation': explanation_text})
