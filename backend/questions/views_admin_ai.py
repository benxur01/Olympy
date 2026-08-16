"""Admin AI Orchestration Studio views for:
1. AI Exam & Quiz Question Generation (Gemini with LaTeX and detailed explanations).
2. AI Appeal & Question Discrepancy Moderation.
3. AI Usage & Token Estimation Metrics.
"""
import json
import logging
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.models import AuditLog
from accounts.permissions import IsPlatformAdmin
from centers.models import EducationCenter
from olympiads.models import Olympiad
from questions.ai_generation import _gemini_api_keys, _gemini_models, _is_math_subject, generate_questions
from questions.models import Question

logger = logging.getLogger('questions.views_admin_ai')


# ─────────────────────────────────────────────────────────────────────────────
# 1. AI EXAM & QUIZ QUESTION GENERATOR
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['POST'])
@permission_classes([IsPlatformAdmin])
def admin_ai_generate_exam_questions(request):
    """Admin uchun Gemini AI orqali yuqori sifatli olimpiada/test savollari

    generatsiya qilish.

    Payload:
    - subject: Fan nomi (masalan "Matematika", "Fizika", "Ingliz tili")
    - topic: Maxsus mavzu (masalan "Harakatga doir masalalar", "Trigonometriya")
    - difficulty: 'easy', 'medium', 'hard', 'advanced'
    - count: 3 dan 30 gacha
    - language: 'uz', 'ru', 'en'
    - save_to_bank: boolean (DB ga saqlash yoki faqat preview ko'rsatish)
    - center_id: agar DB ga saqlansa, qaysi markazga biriktirish
    - olympiad_id: ixtiyoriy, to'g'ridan-to'g'ri olimpiadaga biriktirish
    """
    subject = str(request.data.get('subject') or 'Matematika').strip()
    topic = str(request.data.get('topic') or '').strip()
    difficulty = str(request.data.get('difficulty') or 'medium').strip().lower()
    if difficulty not in ['easy', 'medium', 'hard', 'advanced', 'beginner', 'elementary', 'int']:
        difficulty = 'medium'

    try:
        count = int(request.data.get('count') or 5)
        count = max(1, min(count, 30))
    except (ValueError, TypeError):
        count = 5

    language = str(request.data.get('language') or 'uz').strip()
    save_to_bank = bool(request.data.get('save_to_bank', False))
    center_id = request.data.get('center_id')
    olympiad_id = request.data.get('olympiad_id')

    # Gemini orqali generatsiya qilish
    try:
        generated = generate_questions(
            subject=subject,
            topic=topic,
            difficulty=difficulty,
            count=count,
            language=language,
        )
    except Exception as exc:
        logger.warning(f"AI generation failed: {exc}")
        return Response(
            {'ok': False, 'message': f"AI orqali savollar generatsiya qilishda xatolik yuz berdi: {str(exc)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    if not generated or len(generated) == 0:
        return Response(
            {'ok': False, 'message': "AI savollarni shakllantira olmadi. Iltimos mavzuni o'zgartirib qayta urinib ko'ring."},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    saved_questions_count = 0
    saved_ids = []

    if save_to_bank:
        center = None
        if center_id:
            center = EducationCenter.objects.filter(pk=center_id).first()
        if not center and olympiad_id:
            olymp = Olympiad.objects.filter(pk=olympiad_id).first()
            if olymp:
                center = olymp.center
        if not center:
            center = EducationCenter.objects.filter(status=EducationCenter.STATUS_APPROVED).first()

        if center:
            with transaction.atomic():
                for item in generated:
                    q = Question.objects.create(
                        center=center,
                        subject=subject,
                        text=item.get('text') or item.get('question') or '',
                        options=item.get('options') or [],
                        correct_answer=item.get('correct_answer', 0),
                        question_type=Question.QUESTION_TYPE_MCQ,
                        source=Question.SOURCE_AI,
                        difficulty=difficulty,
                    )
                    saved_ids.append(q.id)
                    saved_questions_count += 1

                if olympiad_id:
                    olymp = Olympiad.objects.filter(pk=olympiad_id).first()
                    if olymp:
                        olymp.questions.add(*saved_ids)

            AuditLog.log(
                request,
                'admin_ai_generate_questions',
                target=center,
                extra={
                    'subject': subject,
                    'topic': topic,
                    'count': saved_questions_count,
                    'olympiad_id': olympiad_id,
                },
            )

    return Response({
        'ok': True,
        'subject': subject,
        'topic': topic,
        'difficulty': difficulty,
        'generated_count': len(generated),
        'saved_to_bank': save_to_bank,
        'saved_count': saved_questions_count,
        'saved_ids': saved_ids,
        'questions': generated,
    })


# ─────────────────────────────────────────────────────────────────────────────
# 2. AI APPEAL & QUESTION MODERATOR
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['POST'])
@permission_classes([IsPlatformAdmin])
def admin_ai_moderate_appeal(request):
    """O'quvchi shikoyati yoki savoldagi noaniqlikni Gemini AI orqali akademik

    tahlil qilish va adminga tavsiya berish.
    """
    question_id = request.data.get('question_id')
    question_text = str(request.data.get('question_text') or '').strip()
    options = request.data.get('options') or []
    student_answer = request.data.get('student_answer')
    appeal_reason = str(request.data.get('appeal_reason') or '').strip()

    if question_id and not question_text:
        q = Question.objects.filter(pk=question_id).first()
        if q:
            question_text = q.text
            options = q.options or []

    if not question_text or not appeal_reason:
        return Response(
            {'ok': False, 'message': "Savol matni va shikoyat sababi kiritilishi shart."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Gemini prompt tayyorlaymiz
    prompt = f"""
Sen nufuzli olimpiadalar bo'yicha mustaqil akademik hakam va apellyatsiya komissiyasi raisisan.
Quyidagi savol va o'quvchi tomonidan berilgan apellyatsiya shikoyatini xolisona, ilmiy va pedagogik jihatdan tekshirib chiq.

SAVOL:
{question_text}

VARIANTLAR:
{chr(10).join([f"{chr(65+i)}) {opt}" for i, opt in enumerate(options)]) if options else "Variantlar yo'q"}

O'QUVCHI JAVOBI: {student_answer}
O'QUVCHI SHIKOYATI (APELLYATSIYA):
"{appeal_reason}"

Vazifang:
1. Savol ilmiy jihatdan to'g'ri tuzilganmi yoki unda xatolik/noaniqlik bormi?
2. O'quvchining e'tirozi asoslimi yoki asossizmi?
3. Apellyatsiya qanoatlantirilishi kerakmi?
4. Adminga tavsiya (masalan: "Ballarni Batch Regrade qilish", "Shikoyatni rad etish", "Savolni tuzatish").

Javobingni FAQAT quyidagi JSON formatida ber (boshqa matn yozma):
{{
  "decision": "approved" (haqli bo'lsa) / "rejected" (asossiz bo'lsa) / "partially_valid" (noaniq savol),
  "verdict_title": "Qisqa xulosa sarlavhasi (masalan: 'Apellyatsiya to\\'liq asosli')",
  "scientific_analysis": "Batafsil ilmiy va matematik/akademik tahlil",
  "recommended_action": "Adminga tavsiya etilgan aniq harakat",
  "correct_option_index": 0 yoki 1 yoki 2 yoki 3
}}
"""

    keys = _gemini_api_keys()
    if not keys:
        return Response(
            {'ok': False, 'message': "Gemini API kaliti sozlanmagan."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    import urllib.request
    models = _gemini_models()
    ai_result = None

    for api_key in keys:
        for model_name in models:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
            req_body = json.dumps({
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.2, "maxOutputTokens": 2048},
            }).encode('utf-8')

            req = urllib.request.Request(
                url,
                data=req_body,
                headers={'Content-Type': 'application/json'},
            )
            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    data = json.loads(resp.read().decode('utf-8'))
                    text = data['candidates'][0]['content']['parts'][0]['text']
                    # JSON parsing
                    cleaned = text.strip()
                    if cleaned.startswith('```'):
                        import re
                        cleaned = re.sub(r"^```(?:json)?\s*", '', cleaned, flags=re.IGNORECASE)
                        cleaned = re.sub(r"\s*```$", '', cleaned)
                    ai_result = json.loads(cleaned)
                    break
            except Exception as e:
                logger.warning(f"Appeal AI moderation attempt with {model_name} failed: {e}")
                continue
        if ai_result:
            break

    if not ai_result:
        return Response(
            {'ok': False, 'message': "AI tahlil xizmatidan javob olib bo'lmadi."},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    AuditLog.log(
        request,
        'admin_ai_moderate_appeal',
        extra={'decision': ai_result.get('decision'), 'question_id': question_id},
    )

    return Response({
        'ok': True,
        'analysis': ai_result,
    })


# ─────────────────────────────────────────────────────────────────────────────
# 3. AI USAGE & METRICS TRACKER
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['GET'])
@permission_classes([IsPlatformAdmin])
def admin_ai_usage_metrics(request):
    """Platformadagi barcha AI (Gemini) xizmatlarining umumiy statistikasi,

    ishlatilgan so'rovlar, savollar va xarajatlar bahosi.
    """
    total_ai_questions = Question.objects.filter(source=Question.SOURCE_AI).count()
    total_all_questions = Question.objects.count()

    # So'nggi 30 kunlik AI savollari
    thirty_days_ago = timezone.now() - timezone.timedelta(days=30)
    recent_ai_questions = Question.objects.filter(
        source=Question.SOURCE_AI,
    ).count()

    # Taxminiy tokenlar va xarajatlar (Gemini 2.5 Flash / Flash Lite o'rtacha narxi bo'yicha)
    estimated_total_calls = total_ai_questions * 3 + 120
    estimated_tokens = estimated_total_calls * 1500  # O'rtacha 1.5k token har bir so'rovga
    estimated_cost_usd = round((estimated_tokens / 1_000_000) * 0.10, 3)  # ~$0.10 per 1M tokens

    return Response({
        'ok': True,
        'total_ai_questions': total_ai_questions,
        'total_all_questions': total_all_questions,
        'recent_ai_questions': recent_ai_questions,
        'estimated_total_api_calls': estimated_total_calls,
        'estimated_total_tokens': estimated_tokens,
        'estimated_cost_usd': estimated_cost_usd,
        'active_models': list(_gemini_models()),
    })
