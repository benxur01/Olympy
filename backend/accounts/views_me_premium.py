"""O'quvchilar uchun yangi premium funksiyalar (O1–O7).

Barchasi `/api/me/...` ostida mount qilinadi (accounts/urls_me.py). Har biri
faqat autentifikatsiyalangan foydalanuvchining O'Z ma'lumotlari bilan ishlaydi.
Ba'zilari `is_premium` tekshiruvini talab qiladi (O7).
"""
from django.contrib.auth import get_user_model
from django.db.models import Avg, Count, Max, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status as http_status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from attempts.models import TestAttempt
from .models import Achievement, DailyGoal, ParentStudentLink, Rival
from .utils import is_user_premium

MAX_RIVALS = 3


def _premium_required():
    return Response(
        {
            'detail': "Bu funksiya premium o'quvchilar uchun. "
                      "Premium olish uchun markaz adminiga murojaat qiling.",
            'upgrade_required': True,
        },
        status=http_status.HTTP_403_FORBIDDEN,
    )


# ─── O1. Kundalik streak ─────────────────────────────────────────────────────


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_streak(request):
    """GET /api/me/streak/ — {streak_count, last_streak_date, longest_streak}."""
    u = request.user
    return Response({
        'streak_count': u.streak_count or 0,
        'last_streak_date': u.last_active_date.isoformat() if u.last_active_date else None,
        'longest_streak': u.longest_streak or 0,
    })


# ─── O2. Raqib tanlash ───────────────────────────────────────────────────────


def _user_avg_and_rank(user_id):
    """Foydalanuvchining global o'rtacha balli va taxminiy reytingi.

    Reyting: shu foydalanuvchidan yuqori o'rtacha ballga ega foydalanuvchilar
    soni + 1. Faqat valid (diskvalifikatsiya bo'lmagan) attempts hisoblanadi.
    """
    my_avg = (
        TestAttempt.objects
        .filter(user_id=user_id, disqualified=False, olympiad__is_deleted=False)
        .aggregate(avg=Avg('score'))['avg']
    )
    if my_avg is None:
        return 0.0, None
    my_avg = round(my_avg, 1)
    # Har foydalanuvchining o'rtacha balli (GROUP BY) — mendan yuqorilarni
    # sanaymiz. Katta bazada bu og'irroq, lekin reyting aniq bo'lishi uchun
    # zarur; natija frontend'da kamdan-kam (faqat raqiblar sahifasida) so'raladi.
    higher = 0
    rows = (
        TestAttempt.objects
        .filter(disqualified=False, olympiad__is_deleted=False)
        .values('user_id')
        .annotate(avg=Avg('score'))
    )
    for r in rows:
        if (r['avg'] or 0) > my_avg:
            higher += 1
    return my_avg, higher + 1


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def rivals(request):
    """GET/POST /api/me/rivals/ — raqiblar ro'yxati / raqib qo'shish.

    GET: [{rival_id, full_name, my_score, rival_score, my_rank, rival_rank}]
    POST: body {rival_id} — yangi raqib qo'shish (max 3 ta).
    """
    if request.method == 'POST':
        rival_id = (request.data or {}).get('rival_id')
        if not rival_id:
            return Response({'detail': 'rival_id majburiy'}, status=http_status.HTTP_400_BAD_REQUEST)
        try:
            rival_id = int(rival_id)
        except (TypeError, ValueError):
            return Response({'detail': "rival_id son bo'lishi kerak"}, status=http_status.HTTP_400_BAD_REQUEST)
        if rival_id == request.user.id:
            return Response({'detail': "O'zingizni raqib qila olmaysiz"}, status=http_status.HTTP_400_BAD_REQUEST)
        User = get_user_model()
        rival_user = User.objects.filter(pk=rival_id, is_active=True).first()
        if not rival_user:
            return Response({'detail': 'Foydalanuvchi topilmadi'}, status=http_status.HTTP_404_NOT_FOUND)
        current_count = Rival.objects.filter(user=request.user).count()
        if Rival.objects.filter(user=request.user, rival_user=rival_user).exists():
            return Response({'detail': "Bu foydalanuvchi allaqachon raqib"}, status=http_status.HTTP_400_BAD_REQUEST)
        if current_count >= MAX_RIVALS:
            return Response(
                {'detail': f"Maksimum {MAX_RIVALS} ta raqib qo'shish mumkin"},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        Rival.objects.create(user=request.user, rival_user=rival_user)
        return Response(
            {'rival_id': rival_user.id, 'full_name': rival_user.full_name or '—'},
            status=http_status.HTTP_201_CREATED,
        )

    # GET — raqiblar ro'yxati + taqqoslash.
    rival_links = (
        Rival.objects.filter(user=request.user)
        .select_related('rival_user')
        .order_by('-created_at')
    )
    my_score, my_rank = _user_avg_and_rank(request.user.id)
    data = []
    for link in rival_links:
        ru = link.rival_user
        r_score, r_rank = _user_avg_and_rank(ru.id)
        data.append({
            'rival_id': ru.id,
            'full_name': ru.full_name or '—',
            'avatar_url': (ru.avatar.url if ru.avatar else ''),
            'my_score': my_score,
            'rival_score': r_score,
            'my_rank': my_rank,
            'rival_rank': r_rank,
        })
    return Response(data)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def remove_rival(request, rival_id):
    """DELETE /api/me/rivals/<rival_id>/ — raqibni o'chirish."""
    link = Rival.objects.filter(user=request.user, rival_user_id=rival_id).first()
    if not link:
        return Response({'detail': 'Raqib topilmadi'}, status=http_status.HTTP_404_NOT_FOUND)
    link.delete()
    return Response(status=http_status.HTTP_204_NO_CONTENT)


# ─── O3. Mavzu (fan) tayyor indikatori ───────────────────────────────────────


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def subject_readiness(request):
    """GET /api/me/subject-readiness/ — fan bo'yicha tayyorlik indikatori.

    Javob: [{subject, readiness_percent, attempts_count, recommendation}]
    Tayyorlik = shu fandagi o'rtacha to'g'rilik foizi.
    """
    attempts = (
        TestAttempt.objects
        .filter(user=request.user, disqualified=False, olympiad__is_deleted=False)
        .select_related('olympiad')
    )
    buckets = {}
    for a in attempts:
        subject = (a.olympiad.subject if a.olympiad else '') or '—'
        b = buckets.setdefault(subject, {'correct': 0, 'total': 0, 'attempts': 0})
        answered = (a.correct_count or 0) + (a.wrong_count or 0)
        b['correct'] += a.correct_count or 0
        b['total'] += a.total_questions or answered
        b['attempts'] += 1

    result = []
    for subject, b in buckets.items():
        pct = round((b['correct'] / b['total']) * 100) if b['total'] else 0
        if pct >= 80:
            rec = 'Tayyor!'
        elif pct >= 60:
            rec = 'Yaxshi ketmoqda'
        else:
            rec = "Ko'proq mashq qiling"
        result.append({
            'subject': subject,
            'readiness_percent': pct,
            'attempts_count': b['attempts'],
            'recommendation': rec,
        })
    result.sort(key=lambda x: -x['readiness_percent'])
    return Response(result)


# ─── O5. Yutuqlar (achievements) ─────────────────────────────────────────────


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_achievements(request):
    """GET /api/me/achievements/ — foydalanuvchining barcha yutuqlari."""
    from .achievements import achievement_payload

    items = Achievement.objects.filter(user=request.user).order_by('-achieved_at')
    return Response([achievement_payload(a) for a in items])


# ─── O6. Ota-onaga haftalik xulosa (endpoint varianti) ───────────────────────


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def weekly_summary(request):
    """GET /api/me/weekly-summary/?student_id=<id>

    Ota-ona uchun farzandning oxirgi 7 kundagi xulosasi. `student_id`
    berilmasa va foydalanuvchining o'zi student bo'lsa — o'z xulosasini
    qaytaradi. Faqat tasdiqlangan ota-ona-farzand bog'lanishi uchun.
    Javob: {full_name, olympiads_count, average_score, streak, best_score}
    """
    from datetime import timedelta
    from django.utils import timezone

    student_id = request.query_params.get('student_id')
    if student_id:
        try:
            student_id = int(student_id)
        except (TypeError, ValueError):
            return Response({'detail': "student_id son bo'lishi kerak"}, status=http_status.HTTP_400_BAD_REQUEST)
        # Faqat tasdiqlangan bog'lanish bo'lsa ko'rsatamiz.
        link_ok = ParentStudentLink.objects.filter(
            parent=request.user, student_id=student_id, is_confirmed=True,
        ).exists()
        if not link_ok:
            return Response(
                {'detail': "Ruxsat berilmagan yoki farzand bog'lanmagan"},
                status=http_status.HTTP_403_FORBIDDEN,
            )
        User = get_user_model()
        student = get_object_or_404(User, pk=student_id)
    else:
        student = request.user

    week_ago = timezone.now() - timedelta(days=7)
    qs = TestAttempt.objects.filter(
        user=student, disqualified=False, submitted_at__gte=week_ago,
    )
    agg = qs.aggregate(avg=Avg('score'), best=Max('score'), total=Count('id'))
    return Response({
        'full_name': student.full_name or '—',
        'olympiads_count': agg['total'] or 0,
        'average_score': round(agg['avg'] or 0, 1),
        'streak': student.streak_count or 0,
        'best_score': agg['best'] or 0,
    })


# ─── O7. Olimpiada tavsiyasi ─────────────────────────────────────────────────


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def recommended_olympiads(request):
    """GET /api/me/recommended-olympiads/ — zaif fanlar bo'yicha tavsiya.

    Foydalanuvchining past balli fanlarini aniqlab, shu fanlardagi
    boshlanmagan (upcoming) olimpiadalarni tavsiya qiladi. Premium uchun.
    Javob: [{olympiad_id, name, subject, starts_at, reason}]
    """
    from django.utils import timezone
    from olympiads.models import Olympiad

    if not is_user_premium(request.user):
        return _premium_required()

    # Fan kesimida o'rtacha ball.
    subject_rows = (
        TestAttempt.objects
        .filter(user=request.user, disqualified=False, olympiad__is_deleted=False)
        .values('olympiad__subject')
        .annotate(avg=Avg('score'))
    )
    subject_avg = {
        (r['olympiad__subject'] or '').strip(): round(r['avg'] or 0, 1)
        for r in subject_rows if (r['olympiad__subject'] or '').strip()
    }
    # Zaif fanlar: o'rtacha ball < 70. Tarix bo'lmasa bo'sh set.
    weak_subjects = {s for s, avg in subject_avg.items() if avg < 70}

    now = timezone.now()
    # "upcoming" = active/draft holatdagi, start_datetime kelajakda bo'lgan
    # olimpiadalar. Modelда alohida 'upcoming' status yo'q — start_datetime
    # bo'yicha aniqlaymiz.
    upcoming_qs = (
        Olympiad.objects
        .filter(is_deleted=False, start_datetime__gt=now)
        .filter(status__in=[Olympiad.STATUS_ACTIVE, Olympiad.STATUS_DRAFT, Olympiad.STATUS_INACTIVE])
        .select_related('center')
        .order_by('start_datetime')
    )

    # Foydalanuvchi allaqachon qatnashgan olimpiadalarni chiqarib tashlaymiz.
    attempted_ids = set(
        TestAttempt.objects.filter(user=request.user).values_list('olympiad_id', flat=True)
    )

    recommended = []
    fallback = []
    for o in upcoming_qs:
        if o.id in attempted_ids:
            continue
        subject = (o.subject or '').strip()
        item = {
            'olympiad_id': o.id,
            'name': o.title,
            'subject': subject,
            'starts_at': o.start_datetime.isoformat() if o.start_datetime else None,
            'center_name': o.center.name if o.center_id else '',
        }
        if subject in weak_subjects:
            item['reason'] = f"{subject} bo'yicha ko'proq mashq kerak"
            recommended.append(item)
        else:
            item['reason'] = 'Yangi olimpiada'
            fallback.append(item)
        if len(recommended) >= 10:
            break

    # Zaif fan bo'yicha yetarli tavsiya bo'lmasa — qolgan upcoming'lar bilan
    # to'ldiramiz (lekin 10 tadan oshmaydi).
    if len(recommended) < 10:
        recommended.extend(fallback[: 10 - len(recommended)])
    return Response(recommended)


# ─── O1. Xato daftari (Error Notebook) ───────────────────────────────────────


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def error_notebook(request):
    """GET /api/me/error-notebook/?subject=&page=

    O'quvchining barcha urinishlaridagi noto'g'ri javob berilgan savollar.
    Premium uchun. Pagination: sahifada 20 ta. Filtr: ?subject=.
    Javob: {count, page, page_size, results: [{question_id, question_text,
            subject, wrong_answer, correct_answer, attempt_date, olympiad_name}]}
    """
    from questions.models import Question

    if not is_user_premium(request.user):
        return _premium_required()

    subject = (request.query_params.get('subject') or '').strip()

    # Barcha (diskvalifikatsiya bo'lmagan) urinishlarni olimpiada bilan birga
    # olamiz — N+1 yo'q.
    attempts = list(
        TestAttempt.objects
        .filter(user=request.user, disqualified=False, olympiad__is_deleted=False)
        .select_related('olympiad')
        .order_by('-submitted_at')
    )

    # Har attemptdagi savol id'larini yig'ib, bitta so'rovda savollarni olamiz.
    all_qids = set()
    for a in attempts:
        for k in (a.answers or {}).keys():
            try:
                all_qids.add(int(k))
            except (TypeError, ValueError):
                continue
    questions_qs = Question.objects.filter(pk__in=all_qids)
    if subject:
        questions_qs = questions_qs.filter(subject__iexact=subject)
    qmap = {q.id: q for q in questions_qs}

    rows = []
    seen = set()  # bir savol bir marta (eng so'nggi urinish bo'yicha)
    for a in attempts:
        olympiad_name = a.olympiad.title if a.olympiad else '—'
        attempt_date = a.submitted_at.isoformat() if a.submitted_at else None
        for k, v in (a.answers or {}).items():
            try:
                qid = int(k)
                chosen = int(v)
            except (TypeError, ValueError):
                continue
            q = qmap.get(qid)
            if not q or qid in seen:
                continue
            if chosen == q.correct_answer:
                continue
            seen.add(qid)
            options = q.options or []

            def _opt(idx):
                if isinstance(options, list) and 0 <= idx < len(options):
                    return options[idx]
                return None

            rows.append({
                'question_id': q.id,
                'question_text': q.text,
                'subject': q.subject or '',
                'wrong_answer': chosen,
                'wrong_answer_text': _opt(chosen),
                'correct_answer': q.correct_answer,
                'correct_answer_text': _opt(q.correct_answer),
                'attempt_date': attempt_date,
                'olympiad_name': olympiad_name,
            })

    # Pagination — sahifada 20 ta.
    page_size = 20
    try:
        page = max(1, int(request.query_params.get('page') or 1))
    except (TypeError, ValueError):
        page = 1
    total = len(rows)
    start = (page - 1) * page_size
    end = start + page_size
    return Response({
        'count': total,
        'page': page,
        'page_size': page_size,
        'results': rows[start:end],
    })


# ─── O2. Kunlik maqsad (Daily Goal) ──────────────────────────────────────────


def _serialize_goal(goal):
    remaining = max(0, (goal.target_questions or 0) - (goal.completed_questions or 0))
    return {
        'date': goal.date.isoformat() if goal.date else None,
        'target_questions': goal.target_questions,
        'completed_questions': goal.completed_questions,
        'remaining': remaining,
        'is_achieved': goal.is_achieved,
        'xp_bonus': goal.xp_bonus,
    }


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def daily_goal(request):
    """GET/POST /api/me/daily-goal/

    GET: bugungi maqsad holati (yo'q bo'lsa target=0 bilan bo'sh holat).
    POST: bugungi maqsadni belgilash {target_questions: 20}. Har kuni yangi.
    """
    today = timezone.now().date()

    if request.method == 'POST':
        try:
            target = int((request.data or {}).get('target_questions') or 0)
        except (TypeError, ValueError):
            return Response(
                {'detail': "target_questions son bo'lishi kerak"},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        if target < 1:
            return Response(
                {'detail': "target_questions kamida 1 bo'lishi kerak"},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        target = min(target, 500)
        goal, _created = DailyGoal.objects.get_or_create(
            user=request.user, date=today,
            defaults={'target_questions': target},
        )
        if not _created:
            # Maqsadni yangilash — agar allaqachon bajarilgan bo'lsa, qayta
            # bajarilmagan holatga tushishi mumkin (yangi target kattaroq bo'lsa).
            goal.target_questions = target
            goal.is_achieved = goal.completed_questions >= target
            goal.save(update_fields=['target_questions', 'is_achieved'])
        return Response(_serialize_goal(goal), status=http_status.HTTP_200_OK)

    # GET — bugungi holat.
    goal = DailyGoal.objects.filter(user=request.user, date=today).first()
    if goal is None:
        return Response({
            'date': today.isoformat(),
            'target_questions': 0,
            'completed_questions': 0,
            'remaining': 0,
            'is_achieved': False,
            'xp_bonus': 0,
        })
    return Response(_serialize_goal(goal))


# ─── O5. "Kuchli tomonlarim" karta ───────────────────────────────────────────


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def strength_card(request):
    """GET /api/me/strength-card/ — eng yuqori avg_score bo'lgan 3 ta fan.

    Barcha userlar uchun (premium emas ham). Javob:
    {user, top_subjects: [{subject, avg_score, attempts}], share_text}
    """
    rows = (
        TestAttempt.objects
        .filter(user=request.user, disqualified=False, olympiad__is_deleted=False)
        .values('olympiad__subject')
        .annotate(avg=Avg('score'), attempts=Count('id'))
    )
    subjects = []
    for r in rows:
        subject = (r['olympiad__subject'] or '').strip()
        if not subject:
            continue
        subjects.append({
            'subject': subject,
            'avg_score': round(r['avg'] or 0),
            'attempts': r['attempts'] or 0,
        })
    subjects.sort(key=lambda s: (-s['avg_score'], -s['attempts']))
    top = subjects[:3]

    user_name = request.user.full_name or "O'quvchi"
    if top:
        parts = [f"{s['subject']} ({s['avg_score']}%)" for s in top]
        if len(parts) == 1:
            subj_str = parts[0]
        else:
            subj_str = ', '.join(parts[:-1]) + ' va ' + parts[-1]
        share_text = f"Men Olympy da {subj_str} fanlarida kuchliman!"
    else:
        share_text = "Men Olympy da o'qishni boshladim!"

    return Response({
        'user': user_name,
        'top_subjects': top,
        'share_text': share_text,
    })


# ─── O6. Olimpiada tayyorgarlik plani (AI) ───────────────────────────────────


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([ScopedRateThrottle])
def olympiad_prep_plan(request):
    """POST /api/me/olympiad-prep-plan/ — olimpiadaga AI tayyorgarlik rejasi.

    Body: {olympiad_id}. O'quvchining zaif fanlari + olimpiadagacha kunlar
    asosida kunlik reja generatsiya qiladi (Gemini). Premium, throttle 5/day.
    Javob: {olympiad_name, days_left, focus_subjects, daily_plan: [{day, tasks}]}
    """
    from olympiads.models import Olympiad
    from accounts.views_student import _subject_performance

    if not is_user_premium(request.user):
        return _premium_required()

    olympiad_id = (request.data or {}).get('olympiad_id')
    if not olympiad_id:
        return Response({'detail': 'olympiad_id majburiy'}, status=http_status.HTTP_400_BAD_REQUEST)
    olympiad = Olympiad.objects.filter(pk=olympiad_id, is_deleted=False).first()
    if not olympiad:
        return Response({'detail': 'Olimpiada topilmadi'}, status=http_status.HTTP_404_NOT_FOUND)

    now = timezone.now()
    if olympiad.start_datetime:
        delta = olympiad.start_datetime - now
        days_left = max(0, delta.days)
    else:
        days_left = 7  # sana belgilanmagan bo'lsa standart 7 kunlik reja
    # Reja uzunligini oqilona cheklaymiz (1..14 kun).
    plan_days = max(1, min(days_left or 1, 14))

    perf = _subject_performance(request.user)
    olympiad_subject = (olympiad.subject or '').strip()
    # Fokus fanlar: olimpiada fani + eng zaif 2 ta fan.
    focus = []
    if olympiad_subject:
        focus.append(olympiad_subject)
    weak_sorted = sorted((s for s in perf), key=lambda s: perf[s])
    for s in weak_sorted:
        if s not in focus:
            focus.append(s)
        if len(focus) >= 3:
            break
    if not focus:
        focus = [olympiad_subject] if olympiad_subject else ["Umumiy tayyorgarlik"]

    daily_plan = _generate_prep_plan_ai(
        olympiad.title, focus, plan_days, perf,
    )

    return Response({
        'olympiad_id': olympiad.id,
        'olympiad_name': olympiad.title,
        'days_left': days_left,
        'focus_subjects': focus,
        'daily_plan': daily_plan,
    })


olympiad_prep_plan.cls.throttle_scope = 'ai_prep'


def _generate_prep_plan_ai(olympiad_name, focus_subjects, plan_days, perf):
    """Gemini orqali kunlik tayyorgarlik rejasi.

    Qaytaradi: [{day: 1, tasks: ["...", "..."]}]. AI yo'q/xato bo'lsa oddiy
    fallback reja qaytariladi.
    """
    import json
    import urllib.parse
    import urllib.request

    from questions.ai_generation import _gemini_api_keys, _gemini_models

    def _fallback():
        plan = []
        for d in range(1, plan_days + 1):
            subj = focus_subjects[(d - 1) % len(focus_subjects)]
            plan.append({
                'day': d,
                'tasks': [
                    f"{subj} fanidan 30-45 daqiqa nazariy takrorlash",
                    f"{subj} bo'yicha 10-15 ta mashq savol yechish",
                ],
            })
        return plan

    keys = _gemini_api_keys()
    if not keys:
        return _fallback()

    subj_str = ', '.join(
        f"{s} ({round(perf.get(s, 0))}%)" for s in focus_subjects
    )
    prompt = (
        f"Siz tajribali olimpiada murabbiyisiz. O'quvchi '{olympiad_name}' "
        f"olimpiadasiga tayyorlanmoqda. {plan_days} kun qoldi. "
        f"O'quvchining fokus fanlari va hozirgi darajasi: {subj_str}.\n"
        f"Aniq {plan_days} kunlik tayyorgarlik rejasini tuz. Har kun uchun "
        f"2-3 ta qisqa, amaliy vazifa ber. Javobni QAT'IY JSON ko'rinishida "
        f"qaytar: {{\"daily_plan\": [{{\"day\": 1, \"tasks\": [\"...\", \"...\"]}}]}}. "
        f"Vazifalar faqat o'zbek tilida bo'lsin. Boshqa matn yoki izoh qo'shma."
    )
    payload = {
        'contents': [{'role': 'user', 'parts': [{'text': prompt}]}],
        'generationConfig': {
            'maxOutputTokens': 2048,
            'responseMimeType': 'application/json',
        },
    }
    body = json.dumps(payload).encode('utf-8')
    for model in _gemini_models():
        model_path = urllib.parse.quote(model, safe='-_.~/')
        url = (
            f'https://generativelanguage.googleapis.com/v1beta/models/'
            f'{model_path}:generateContent'
        )
        for api_key in keys:
            req = urllib.request.Request(
                url, data=body, method='POST',
                headers={'Content-Type': 'application/json', 'x-goog-api-key': api_key},
            )
            try:
                with urllib.request.urlopen(req, timeout=45) as response:
                    raw = json.loads(response.read().decode('utf-8'))
                parts = (
                    ((raw.get('candidates') or [{}])[0].get('content') or {})
                    .get('parts') or []
                )
                text = ''.join(part.get('text') or '' for part in parts).strip()
                if not text:
                    continue
                parsed = json.loads(text)
                plan = parsed.get('daily_plan')
                if isinstance(plan, list) and plan:
                    # Normallashtiramiz: day int, tasks list[str].
                    clean = []
                    for i, item in enumerate(plan[:plan_days], start=1):
                        tasks = item.get('tasks') if isinstance(item, dict) else None
                        if not isinstance(tasks, list):
                            continue
                        clean.append({
                            'day': item.get('day') or i,
                            'tasks': [str(t) for t in tasks if str(t).strip()][:4],
                        })
                    if clean:
                        return clean
            except Exception:
                pass
    return _fallback()


# ─── O4. AI tahlil audio (Telegram) ──────────────────────────────────────────


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([ScopedRateThrottle])
def ai_audio_analysis(request):
    """POST /api/me/ai-audio-analysis/ — AI tahlilni Telegram orqali yuborish.

    Body: {attempt_id}. Mavjud AI tahlil matnini oladi (yo'q bo'lsa yangidan
    generatsiya qiladi). gTTS bo'lsa audio (voice) qilib, bo'lmasa matn xabar
    sifatida o'quvchining Telegram'iga yuboradi. Premium, throttle 3/day.
    Javob: {status: "sent"|"text_only"|"no_telegram", message}
    """
    from attempts.models import AttemptAIAnalysis, TestAttempt
    from questions.ai_generation import analyze_attempt_ai

    if not is_user_premium(request.user):
        return _premium_required()

    attempt_id = (request.data or {}).get('attempt_id')
    if not attempt_id:
        return Response({'detail': 'attempt_id majburiy'}, status=http_status.HTTP_400_BAD_REQUEST)
    attempt = (
        TestAttempt.objects
        .filter(pk=attempt_id, user=request.user)
        .select_related('olympiad')
        .first()
    )
    if not attempt:
        return Response({'detail': 'Urinish topilmadi'}, status=http_status.HTTP_404_NOT_FOUND)

    # Avval saqlangan AI tahlil bor bo'lsa undan foydalanamiz (qayta
    # generatsiya qilmaymiz — Gemini chaqiruvini tejaymiz).
    analysis = AttemptAIAnalysis.objects.filter(attempt=attempt).first()
    if analysis and analysis.status == AttemptAIAnalysis.STATUS_READY and analysis.analysis_text:
        analysis_text = analysis.analysis_text
    else:
        olympiad = attempt.olympiad
        summary = {
            'olympiad_title': olympiad.title if olympiad else '',
            'subject': olympiad.subject if olympiad else '',
            'score': attempt.score,
            'correct': attempt.correct_count,
            'wrong': attempt.wrong_count,
            'total': attempt.total_questions,
        }
        mistakes = []
        if olympiad:
            from attempts.views import _build_attempt_mistakes
            mistakes = _build_attempt_mistakes(attempt, olympiad, attempt.answers or {})
        analysis_text = analyze_attempt_ai(summary, mistakes)

    chat_id = getattr(request.user, 'telegram_chat_id', '')
    if not chat_id:
        return Response({
            'status': 'no_telegram',
            'message': "Telegram ulanmagan. Avval Telegram hisobingizni bog'lang.",
        })

    # gTTS mavjud bo'lsa audio (voice) yuboramiz, aks holda matn.
    audio_sent = _try_send_voice(chat_id, analysis_text)
    if audio_sent:
        return Response({'status': 'sent', 'message': 'Audio tahlil Telegram orqali yuborildi.'})

    # Matn xabar (fallback).
    from notifications.services import _send_telegram_to_user
    text_msg = f"🎓 Olympy AI tahlil:\n\n{analysis_text}"
    ok = _send_telegram_to_user(request.user, text_msg)
    if ok:
        return Response({'status': 'text_only', 'message': 'Tahlil matn ko\'rinishida yuborildi (audio mavjud emas).'})
    return Response({
        'status': 'text_only',
        'message': 'Tahlil tayyor, lekin Telegram yuborishda muammo bo\'ldi.',
    })


ai_audio_analysis.cls.throttle_scope = 'ai_audio'


def _try_send_voice(chat_id, text):
    """gTTS orqali audio yaratib Telegram sendVoice bilan yuboradi.

    gTTS o'rnatilmagan yoki xato bo'lsa False qaytaradi (chaqiruvchi matn
    yuborishga o'tadi). Hech qachon exception otmaydi.
    """
    try:
        import io
        from gtts import gTTS
    except Exception:
        return False
    try:
        import urllib.request

        from django.conf import settings

        token = (
            getattr(settings, 'TELEGRAM_MANAGER_BOT_TOKEN', '')
            or getattr(settings, 'TELEGRAM_BOT_TOKEN', '')
        )
        if not token:
            return False

        buf = io.BytesIO()
        gTTS(text=text[:1500], lang='uz').write_to_fp(buf)
        audio_bytes = buf.getvalue()
        if not audio_bytes:
            return False

        boundary = '----OlympyAIAudioBoundary'
        parts = []
        parts.append(f'--{boundary}'.encode())
        parts.append(b'Content-Disposition: form-data; name="chat_id"\r\n')
        parts.append(str(chat_id).encode())
        parts.append(f'--{boundary}'.encode())
        parts.append('Content-Disposition: form-data; name="caption"\r\n'.encode())
        parts.append('🎓 Olympy AI tahlil'.encode('utf-8'))
        parts.append(f'--{boundary}'.encode())
        parts.append(
            b'Content-Disposition: form-data; name="voice"; filename="analysis.mp3"'
        )
        parts.append(b'Content-Type: audio/mpeg\r\n')

        raw_body = b''
        for item in parts:
            raw_body += item + b'\r\n'
        raw_body += audio_bytes + b'\r\n'
        raw_body += f'--{boundary}--\r\n'.encode()

        url = f'https://api.telegram.org/bot{token}/sendVoice'
        req = urllib.request.Request(
            url, raw_body,
            headers={'Content-Type': f'multipart/form-data; boundary={boundary}'},
            method='POST',
        )
        with urllib.request.urlopen(req, timeout=20):
            return True
    except Exception:
        import logging
        logging.getLogger(__name__).exception('AI audio sendVoice failed')
        return False
