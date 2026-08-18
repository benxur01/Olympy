"""Speaking javobini yuklash/tinglash va Listening audio ijro hisobi.

Yuklash va ijro hisobi endpointlari imtihon DAVOM ETAYOTGAN paytda —
submit'dan OLDIN — chaqiriladi, ya'ni `TestAttempt` hali mavjud emas. Shu
sababli huquq tekshiruvi attempt bo'yicha emas, `TestSession` bo'yicha boradi
(`views.test_session_ping` bilan bir xil naqsh): sessiya bormi, muddati
tugamaganmi va savol aynan shu sessiyaga tegishlimi.

Ovoz yozuvining o'zi YOPIQ storage'da (`SpeakingAnswer` docstringi) va uni
faqat `speaking_answer_audio` beradi — imtihon tugagach, attempt bo'yicha.
"""
import logging

from django.conf import settings
from django.db import transaction
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from rest_framework import status as http_status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from olympiads.models import Olympiad
from questions.models import Question

from .models import SpeakingAnswer, TestAttempt, TestSession
from .session_utils import ordered_questions, resolve_exam_format, session_is_expired
from .views import _user_can_manage_olympiad

logger = logging.getLogger(__name__)

# Listening audio ijro chegaralari imtihon formati bo'yicha. YAGONA MANBA —
# frontend pleyeri (`ListeningAudioPlayer`) faqat ko'rsatkich uchun o'z
# hisobini yuritadi, ruxsatni esa har doim shu yerdan so'raydi.
#   ielts — rasmiy qoida: audio bir marta ijro etiladi
#   cefr  — ikki marta (pleyer "CEFR — 2 marta ijro" deb ko'rsatadi)
# Ro'yxatda yo'q format (standart olimpiada) cheklanmaydi.
LISTENING_PLAY_LIMITS = {
    'ielts': 1,
    'cefr': 2,
}


def _resolve_session_question(request, section=None):
    """`olympiad` + `question` ni sessiya bo'yicha tekshiradi.

    Qaytaradi `(session, olympiad, question, error)` — xato bo'lsa dastlabki
    uchtasi None va `error` tayyor DRF javobi bo'ladi.
    """
    # GET'da (hisoblamaydigan holat so'rovi) parametrlar query string'da keladi.
    data = request.query_params if request.method == 'GET' else (request.data or {})
    try:
        olympiad_id = int(data.get('olympiad'))
        question_id = int(data.get('question'))
    except (TypeError, ValueError):
        return None, None, None, Response(
            {'detail': "olympiad va question majburiy"},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    olympiad = get_object_or_404(Olympiad, pk=olympiad_id)
    session = TestSession.objects.filter(user=request.user, olympiad=olympiad).first()
    if not session:
        return None, None, None, Response(
            {'detail': "Test sessiya topilmadi"},
            status=http_status.HTTP_404_NOT_FOUND,
        )
    if session_is_expired(session, olympiad):
        return None, None, None, Response(
            {'detail': "Test vaqti tugagan"},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    # Savol shu sessiyaning savollari orasida bo'lishi shart — aks holda
    # boshqa olimpiadaning (yoki boshqa o'quvchining) savoli id'si bilan
    # fayl yuklash mumkin bo'lardi.
    question = next(
        (q for q in ordered_questions(session, olympiad) if q.id == question_id),
        None,
    )
    if question is None:
        return None, None, None, Response(
            {'detail': "Savol bu sessiyaga tegishli emas"},
            status=http_status.HTTP_404_NOT_FOUND,
        )
    if section is not None and question.section != section:
        return None, None, None, Response(
            {'detail': "Savol bo'limi mos emas"},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    return session, olympiad, question, None


@api_view(['POST'])
@parser_classes([MultiPartParser])
@permission_classes([IsAuthenticated])
def upload_speaking_answer(request):
    """POST /api/attempts/speaking-answer/ — Speaking javob audiosini saqlaydi.

    FormData: `olympiad`, `question`, `audio`.
    Javob: 201 {"saved": true, "question": <id>, "answer_ref": "speaking-answer:<id>"}.

    Fayl YOPIQ storage'ga tushadi (`SpeakingAnswer`) va javobda HECH QANDAY
    ochiq URL qaytmaydi — ovoz shaxsiy ma'lumot va uni faqat
    `speaking_answer_audio` autentifikatsiya bilan beradi. Frontend `answer_ref`
    ni shu savolning javobi sifatida saqlaydi va submit paytida qolgan javoblar
    bilan birga yuboradi; u shunchaki "yozuv bor" belgisi — fayl qidirishda
    ISHLATILMAYDI (server yozuvni user+olimpiada+savol bo'yicha o'zi topadi),
    shu sababli uni soxtalashtirish hech narsa bermaydi.

    Qayta yozib yuborilsa eski yozuv almashtiriladi: har (user, olimpiada,
    savol) uchligi uchun aynan bitta fayl qoladi.
    """
    _session, olympiad, question, error = _resolve_session_question(
        request, section=Question.SECTION_SPEAKING,
    )
    if error is not None:
        return error

    audio = request.FILES.get('audio')
    if not audio:
        return Response(
            {'detail': 'Audio faylini yuboring'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    content_type = getattr(audio, 'content_type', '') or ''
    if content_type and not content_type.startswith('audio/'):
        return Response(
            {'detail': 'Faqat audio fayl qabul qilinadi'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    max_bytes = getattr(settings, 'SPEAKING_AUDIO_MAX_BYTES', 25 * 1024 * 1024)
    if audio.size and audio.size > max_bytes:
        return Response(
            {'detail': f"Audio juda katta. Limit: {max_bytes // (1024 * 1024)} MB"},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    # `get_or_create` — unique cheklovdagi poygani o'zi hal qiladi (tezda ikki
    # marta bosilsa yoki sekin tarmoqda so'rov takrorlansa ikkala so'rov ham
    # yozuv yaratishga urinardi va ikkinchisi IntegrityError bilan 500 berardi;
    # `get_or_create_test_session` dagi bilan bir xil stsenariy).
    answer, created = SpeakingAnswer.objects.get_or_create(
        user=request.user, olympiad=olympiad, question=question,
        defaults={'audio': audio, 'content_type': content_type or 'audio/webm'},
    )
    if not created:
        # Qayta yozish: eski faylni ATAYIN o'chiramiz. `FileField.save()` yangi
        # faylni yangi nom bilan yozadi va eskisi storage'da yetim qolib,
        # o'quvchining eski ovozi cheksiz saqlanib qolardi.
        #
        # Qator QULFLANADI (`listening_play` dagi inkrement bilan bir xil
        # sabab): qulfsiz ikkita bir vaqtdagi qayta-yuklash (tarmoq qayta
        # urinishi + qo'lda qayta yozish) bir xil ESKI nomni o'qib, ikkalasi
        # ham yangi fayl yozardi — yutqazganining fayli hech qaysi qatorga
        # bog'lanmay storage'da abadiy qolardi (`post_delete` signali faqat
        # QATOR o'chganda ishlaydi, maydon ustiga yozilganda emas). Qulf
        # ichida qatorni qayta o'qiymiz, ya'ni o'chiriladigan nom har doim
        # AYNAN o'sha paytdagi joriy fayl.
        with transaction.atomic():
            answer = SpeakingAnswer.objects.select_for_update().get(pk=answer.pk)
            old = answer.audio
            if old:
                try:
                    old.delete(save=False)
                except Exception:
                    logger.exception(
                        'eski speaking yozuvini o\'chirib bo\'lmadi id=%s', answer.pk,
                    )
            # Yuqoridagi urinishda fayl qisman o'qilgan bo'lishi mumkin (poyga
            # yo'li) — boshidan yozamiz.
            audio.seek(0)
            answer.audio = audio
            answer.content_type = content_type or 'audio/webm'
            answer.save(update_fields=['audio', 'content_type', 'updated_at'])

    return Response(
        {
            'saved': True,
            'question': question.id,
            'answer_ref': f'speaking-answer:{question.id}',
        },
        status=http_status.HTTP_201_CREATED,
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def speaking_answer_audio(request, attempt_id, question_id):
    """GET /api/attempts/<attempt_id>/speaking-answer/<question_id>/

    Ovozli javobni striming qiladi. Yagona kirish nuqtasi — fayl yopiq
    storage'da yotadi va unga na `/media/`, na Cloudinary havolasi olib
    bormaydi (`views_evidence.admin_evidence_image` bilan bir xil naqsh).

    Ruxsat: javob EGASI bo'lgan o'quvchi yoki o'sha olimpiadani baholay
    oladigan teacher/manager/owner (+ platforma admini). Ro'yxat aynan
    `views._user_can_manage_olympiad` dan olinadi — insho baholash ruxsati
    bilan BIR XIL manba, alohida qoida yozilmagan.

    Fayl yo'li so'rovdan UMUMAN olinmaydi: u `attempt` (kimning javobi, qaysi
    olimpiada) va `question_id` bo'yicha DB'dan topiladi, ya'ni path traversal
    yuzasi yo'q.

    404: attempt yo'q, shu savolga yozuv yo'q yoki fayl diskdan yo'qolgan —
    uchalasi ham chaqiruvchi uchun bir xil ma'noda ("tinglaydigan yozuv yo'q").
    """
    attempt = get_object_or_404(
        TestAttempt.objects.select_related('olympiad', 'olympiad__center'),
        pk=attempt_id,
    )
    is_owner = attempt.user_id == request.user.id
    if not (is_owner or _user_can_manage_olympiad(request.user, attempt.olympiad)):
        return Response({'detail': 'Forbidden'}, status=http_status.HTTP_403_FORBIDDEN)

    answer = SpeakingAnswer.objects.filter(
        user_id=attempt.user_id,
        olympiad_id=attempt.olympiad_id,
        question_id=question_id,
    ).first()
    if answer is None or not answer.audio:
        raise Http404('Ovozli javob topilmadi')

    try:
        # Fayl butunlay xotiraga o'qilmaydi — `FileResponse` uni bo'laklab
        # uzatadi va oqim tugagach yopadi.
        handle = answer.audio.open('rb')
    except OSError:
        # Fayl diskdan yo'qolgan, DB qatori esa turibdi — 500 emas, 404.
        raise Http404('Ovozli javob fayli topilmadi')

    response = FileResponse(
        handle, content_type=answer.content_type or 'audio/webm',
    )
    response['Content-Disposition'] = (
        f'inline; filename="speaking-{attempt.id}-{question_id}.webm"'
    )
    # Shaxsiy ma'lumot: brauzer ham, oradagi proksi ham keshlamasin.
    response['Cache-Control'] = 'private, no-store, max-age=0'
    return response


def _play_allowed(olympiad, play_count):
    """Hisobi `play_count` bo'lgan ijro chegaraga sig'adimi.

    Ikkala oqim ham bitta savolga javob beradi — "shu ijro ruxsat etiladimi":
      * POST hisobni OSHIRGANDAN keyingi qiymat bilan chaqiradi (shu ijro
        allaqachon hisobga kirgan),
      * GET esa mavjud hisobga +1 qo'shib (keyingi ijro).
    """
    limit = LISTENING_PLAY_LIMITS.get(resolve_exam_format(olympiad))
    return limit is None or play_count <= limit


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def listening_play(request):
    """/api/attempts/listening-play/ — listening audio ijro hisobi.

    POST (body: {"olympiad": <id>, "question": <id>}) — yangi ijro qayd
    qilinadi, hisob BIR ga oshadi.
    GET (?olympiad=<id>&question=<id>) — hisob OSHMAYDI, faqat joriy holat
    qaytadi. Frontend uni pleyer mount bo'lganda chaqiradi: hisoblaydigan
    variant bo'lsa, o'quvchi hech narsa bosmasdan turib yagona ijro huquqini
    yo'qotardi.

    Ikkalasining javobi bir xil: 200 {"play_count": N, "allowed": <bool>}.

    Limitni SERVER hal qiladi (`LISTENING_PLAY_LIMITS`): frontend'dagi
    hisoblagichni sahifani yangilash bilan nolga qaytarish mumkin edi.

    Limit oshib ketganda ham 4xx EMAS, 200 qaytariladi (`allowed: false`) —
    frontend xato ko'rsatmasdan shunchaki tugmani o'chiradi.

    `_resolve_session_question` bu yerda `section` bilan chaqirilmaydi:
    endpoint audio ijro etilganda chaqiriladi va audio IELTS bo'lmagan
    olimpiada savolida (section bo'sh) ham bo'lishi mumkin — bunday savolda
    bo'lim tekshiruvi so'rovni nohaq 400 qilardi.
    """
    session, olympiad, question, error = _resolve_session_question(request)
    if error is not None:
        return error

    key = str(question.id)
    if request.method == 'GET':
        play_count = int((session.listening_play_counts or {}).get(key) or 0)
        return Response({
            'play_count': play_count,
            'allowed': _play_allowed(olympiad, play_count + 1),
        })

    # Atomik inkrement. JSONField'ni `F()` bilan oshirib bo'lmaydi, shuning
    # uchun qatorni `select_for_update()` bilan qulflab o'qish+yozishni bitta
    # tranzaksiyada bajaramiz. Aks holda bir vaqtda kelgan ikkita so'rov bir
    # xil eski qiymatni o'qib, hisob 1 martagina oshardi (poyga holati) va
    # o'quvchi audioni ortiqcha tinglay olardi.
    with transaction.atomic():
        locked = TestSession.objects.select_for_update().get(pk=session.pk)
        counts = dict(locked.listening_play_counts or {})
        play_count = int(counts.get(key) or 0) + 1
        counts[key] = play_count
        locked.listening_play_counts = counts
        locked.save(update_fields=['listening_play_counts'])

    return Response({
        'play_count': play_count,
        'allowed': _play_allowed(olympiad, play_count),
    })
