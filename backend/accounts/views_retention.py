"""Foydalanuvchilarni tutib qolish (retention) endpoint'lari.

12 ta funksiya 3 guruhga bo'lingan:
  - Onboarding (OB1–OB4): birinchi kirish sehrgar, mini-test, peer taqqoslash,
    olimpiada taklifi.
  - Daily hooks (DH1–DH4): kunlik savollar, raqib harakati, streak ogohlantirish,
    haftalik musobaqa.
  - Long-term (LT1–LT4): olimpiada kalendari, o'sish yo'li, oylik taqqoslash,
    sinfdoshlar reytingi.

Barchasi `/api/...` ostida mount qilinadi (accounts/urls_me.py). Har biri faqat
autentifikatsiyalangan foydalanuvchining O'Z ma'lumotlari bilan ishlaydi.
"""
from collections import OrderedDict
from datetime import timedelta

from django.db.models import Avg, Count, Q, Sum
from django.utils import timezone
from rest_framework import status as http_status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from attempts.models import TestAttempt
from olympiads.models import Olympiad
from questions.models import Question

from .models import (
    DailyQuestion,
    DailyQuestionAnswer,
    Rival,
    WeeklyContest,
    WeeklyContestResult,
)
from .views_student import _olympiad_max_score, _subject_performance


# ─── Umumiy helper'lar ───────────────────────────────────────────────────────


def _format_time_until(delta):
    """timedelta'ni "2 soat 30 daqiqa" / "3 kun 5 soat" ko'rinishida qaytaradi."""
    total = int(delta.total_seconds())
    if total <= 0:
        return 'Hozir'
    days, rem = divmod(total, 86400)
    hours, rem = divmod(rem, 3600)
    minutes = rem // 60
    parts = []
    if days:
        parts.append(f'{days} kun')
    if hours:
        parts.append(f'{hours} soat')
    if minutes and not days:
        parts.append(f'{minutes} daqiqa')
    return ' '.join(parts) or 'Bir daqiqadan kam'


def _user_interest_subjects(user):
    """Foydalanuvchi qiziqadigan fanlar (onboarding) — bo'sh bo'lsa []."""
    subs = getattr(user, 'onboarding_subjects', None) or []
    return [s for s in subs if isinstance(s, str) and s.strip()]


def _week_bounds(today=None):
    """Joriy hafta (dushanba–yakshanba) chegaralarini qaytaradi."""
    today = today or timezone.now().date()
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)
    return week_start, week_end


# ═══════════════════════════════════════════════════════════════════════════
# ONBOARDING — OB1..OB4
# ═══════════════════════════════════════════════════════════════════════════

# OB1 maqsadlar ro'yxati — frontend bilan sinxron.
ONBOARDING_GOALS = {
    'school': "Maktab olimpiadasiga tayyorlanish",
    'district': "Tuman olimpiadasi",
    'region': "Viloyat/Respublika",
    'reinforce': "Faqat bilimni mustahkamlash",
}


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def complete_onboarding(request):
    """POST /api/me/complete-onboarding/ — {grade, subjects, goal}.

    Onboarding sehrgar tugaganda chaqiriladi: foydalanuvchining sinf, fanlar
    va maqsadini saqlaydi va `onboarding_completed=True` qiladi.
    """
    data = request.data or {}
    grade = data.get('grade')
    subjects = data.get('subjects') or []
    goal = data.get('goal')

    user = request.user
    update_fields = ['onboarding_completed']
    user.onboarding_completed = True

    if grade is not None:
        user.onboarding_grade = str(grade)[:10]
        update_fields.append('onboarding_grade')
    if isinstance(subjects, list):
        # Faqat string fanlar, dublikatsiz, maksimum 15 ta.
        cleaned = []
        for s in subjects:
            if isinstance(s, str) and s.strip() and s not in cleaned:
                cleaned.append(s.strip()[:80])
            if len(cleaned) >= 15:
                break
        user.onboarding_subjects = cleaned
        update_fields.append('onboarding_subjects')
    if goal is not None:
        user.onboarding_goal = str(goal)[:50]
        update_fields.append('onboarding_goal')

    user.save(update_fields=list(set(update_fields)))
    return Response({
        'onboarding_completed': True,
        'onboarding_grade': user.onboarding_grade,
        'onboarding_subjects': user.onboarding_subjects,
        'onboarding_goal': user.onboarding_goal,
    })


def _percentile_label(percent):
    """percent (0..100) → "top X%" matni."""
    if percent is None:
        return None
    top = max(1, round(100 - percent))
    return f'top {top}%'


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def onboarding_mini_test(request):
    """GET /api/onboarding/mini-test/ — qiziqadigan fanlar bo'yicha 5 ta savol.

    Javob: {subject, questions: [{id, text, options}]}. To'g'ri javob
    yuborilmaydi (submit'da tekshiriladi).
    """
    interest = _user_interest_subjects(request.user)
    qs = Question.objects.all()
    chosen_subject = ''
    if interest:
        subj_qs = qs.filter(subject__in=interest)
        if subj_qs.exists():
            qs = subj_qs
            chosen_subject = interest[0]
    # Random 5 ta. order_by('?') katta bazada og'ir, lekin mini-test kamdan-kam
    # (faqat onboarding) chaqiriladi va savollar soni cheklangan.
    questions = list(qs.order_by('?')[:5])
    if chosen_subject == '' and questions:
        chosen_subject = questions[0].subject or ''
    payload = [
        {
            'id': q.id,
            'text': q.text,
            'options': list(q.options or []),
            'subject': q.subject,
        }
        for q in questions
    ]
    return Response({
        'subject': chosen_subject,
        'total': len(payload),
        'questions': payload,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def onboarding_mini_test_submit(request):
    """POST /api/onboarding/mini-test/submit/ — {answers: [{question_id, selected_option}]}.

    Javob: {score, total, percentage, percentile, message}.
    Percentile: shu fandagi barcha foydalanuvchilarning o'rtacha balliga
    nisbatan foydalanuvchi natijasi qaysi foizda turishi.
    """
    answers = (request.data or {}).get('answers') or []
    if not isinstance(answers, list) or not answers:
        return Response({'detail': 'answers majburiy'},
                        status=http_status.HTTP_400_BAD_REQUEST)

    q_ids = []
    selected_map = {}
    for a in answers:
        try:
            qid = int(a.get('question_id'))
            sel = int(a.get('selected_option'))
        except (TypeError, ValueError, AttributeError):
            continue
        q_ids.append(qid)
        selected_map[qid] = sel

    questions = Question.objects.filter(id__in=q_ids)
    total = len(q_ids)
    score = 0
    subject = ''
    for q in questions:
        if not subject:
            subject = q.subject or ''
        if selected_map.get(q.id) == q.correct_answer:
            score += 1

    percentage = round((score / total) * 100) if total else 0

    # Percentile: shu fandagi olimpiadalarning o'rtacha foizi bilan taqqoslash.
    # Foydalanuvchi shu fandagi o'rtacha natijadan yuqori bo'lsa — yuqori
    # percentilda. Ma'lumot yetarli bo'lmasa percentage'ning o'zidan foydalanamiz.
    peer_avg_pct = None
    if subject:
        attempts = (
            TestAttempt.objects
            .filter(olympiad__subject=subject, disqualified=False,
                    olympiad__is_deleted=False, total_questions__gt=0)
        )
        rows = list(attempts.values_list('correct_count', 'total_questions')[:2000])
        if rows:
            pcts = [(c / t) * 100 for c, t in rows if t]
            if pcts:
                peer_avg_pct = sum(pcts) / len(pcts)

    if peer_avg_pct is not None and peer_avg_pct > 0:
        # Foydalanuvchi peer o'rtachasidan qancha yuqori — taxminiy percentile.
        ratio = percentage / peer_avg_pct if peer_avg_pct else 1
        est_percentile = min(99, max(1, round(50 * ratio)))
    else:
        est_percentile = percentage
    percentile = _percentile_label(est_percentile)

    subj_label = subject or 'umumiy'
    if percentage >= 80:
        message = f'Ajoyib! Siz {subj_label} fanidan {percentile} orasidasiz!'
    elif percentage >= 50:
        message = f'Yaxshi boshlanish! {subj_label} fanidan {percentile} orasidasiz.'
    else:
        message = f'Mashq qilsangiz tezda yuqoriga ko\'tarilasiz. Hozir {subj_label} fanidan {percentile}.'

    return Response({
        'score': score,
        'total': total,
        'percentage': percentage,
        'percentile': percentile,
        'subject': subject,
        'message': message,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def peer_comparison(request):
    """GET /api/me/peer-comparison/ — sinf bo'yicha taqqoslash.

    Bir xil onboarding_grade'dagi foydalanuvchilar orasida o'rin.
    Javob: {my_avg, peer_avg, my_rank_in_peers, total_peers, message}.
    """
    user = request.user
    grade = getattr(user, 'onboarding_grade', None)

    User = type(user)
    if grade:
        # Katta sinflarda peer soni minglab bo'lishi mumkin — taqqoslash uchun
        # 500 ta yetarli, qolganida ham GROUP BY + Python loop'ni cheklaymiz.
        # Admin userlarni chiqarib tashlaymiz.
        peer_ids = list(
            User.objects.filter(onboarding_grade=grade, is_active=True)
            .exclude(is_platform_admin=True)
            .values_list('id', flat=True)[:500]
        )
    else:
        peer_ids = []
    if not peer_ids:
        peer_ids = [user.id]

    # Har peer'ning o'rtacha balli (bitta GROUP BY so'rov, N+1 yo'q).
    rows = (
        TestAttempt.objects
        .filter(user_id__in=peer_ids, disqualified=False, olympiad__is_deleted=False)
        .values('user_id')
        .annotate(avg=Avg('score'))
    )
    avg_by_user = {r['user_id']: round(r['avg'] or 0, 1) for r in rows}
    my_avg = avg_by_user.get(user.id, 0)

    # Mendan yuqori o'rtachaga ega peer'lar soni → mening o'rnim.
    peers_with_data = [avg_by_user.get(pid, 0) for pid in peer_ids]
    total_peers = len(peer_ids)
    higher = sum(1 for a in peers_with_data if a > my_avg)
    my_rank = higher + 1

    other_avgs = [avg_by_user.get(pid, 0) for pid in peer_ids if pid != user.id]
    peer_avg = round(sum(other_avgs) / len(other_avgs), 1) if other_avgs else my_avg

    if total_peers > 1:
        below_pct = round(((total_peers - my_rank) / (total_peers - 1)) * 100) if total_peers > 1 else 0
        below_pct = max(0, min(100, below_pct))
        message = f'Siz sinfdoshlaringizning {below_pct}%idan yuqorisiz!'
    else:
        message = 'Sinfdoshlaringiz qo\'shilganda taqqoslash ko\'rinadi.'

    return Response({
        'my_avg': my_avg,
        'peer_avg': peer_avg,
        'my_rank_in_peers': my_rank,
        'total_peers': total_peers,
        'grade': grade,
        'message': message,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def suggested_olympiad(request):
    """GET /api/me/suggested-olympiad/ — yaqin 7 kun ichidagi mos olimpiada.

    Foydalanuvchi qiziqadigan fanlarga mos, bugun yoki kelgusi 7 kunda
    boshlanadigan eng yaqin olimpiada. Yo'q bo'lsa {olympiad_id: null}.
    """
    now = timezone.now()
    horizon = now + timedelta(days=7)
    qs = (
        Olympiad.objects
        .filter(
            event_type=Olympiad.EVENT_TYPE_OLYMPIAD,
            is_deleted=False,
            status__in=[Olympiad.STATUS_ACTIVE, Olympiad.STATUS_INACTIVE, Olympiad.STATUS_DRAFT],
            start_datetime__gte=now,
            start_datetime__lte=horizon,
        )
        .order_by('start_datetime')
    )
    interest = _user_interest_subjects(request.user)
    olympiad = None
    if interest:
        olympiad = qs.filter(subject__in=interest).first()
    if olympiad is None:
        olympiad = qs.first()

    if olympiad is None:
        return Response({
            'olympiad_id': None,
            'message': 'Hozircha yaqin olimpiada yo\'q',
        })

    time_until = _format_time_until(olympiad.start_datetime - now) if olympiad.start_datetime else ''
    return Response({
        'olympiad_id': olympiad.id,
        'name': olympiad.title,
        'subject': olympiad.subject,
        'starts_at': olympiad.start_datetime.isoformat() if olympiad.start_datetime else None,
        'time_until': time_until,
    })


# ═══════════════════════════════════════════════════════════════════════════
# DAILY HOOKS — DH1..DH4
# ═══════════════════════════════════════════════════════════════════════════


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def daily_questions(request):
    """GET /api/daily-questions/ — bugungi 3 ta savol + tugash vaqti.

    Javob: {date, ends_at, time_left, questions: [{id, question_id, text,
    options, subject, answered, selected_option, is_correct}]}.
    """
    today = timezone.now().date()
    items = list(
        DailyQuestion.objects
        .filter(date=today)
        .select_related('question')
        .order_by('id')
    )
    # Foydalanuvchining bugungi javoblari (bitta so'rov bilan).
    answered_map = {
        a.daily_question_id: a
        for a in DailyQuestionAnswer.objects.filter(
            user=request.user, daily_question__in=[i.id for i in items],
        )
    }
    questions = []
    for dq in items:
        q = dq.question
        ans = answered_map.get(dq.id)
        questions.append({
            'id': dq.id,
            'question_id': q.id if q else None,
            'text': q.text if q else '',
            'options': list(q.options or []) if q else [],
            'subject': dq.subject or (q.subject if q else ''),
            'answered': ans is not None,
            'selected_option': ans.selected_option if ans else None,
            'is_correct': ans.is_correct if ans else None,
            # To'g'ri javob faqat javob berilgandan keyin ko'rsatiladi.
            'correct_answer': (q.correct_answer if (q and ans) else None),
        })
    # Bugun 23:59 da tugaydi.
    now = timezone.now()
    end_of_day = now.replace(hour=23, minute=59, second=59, microsecond=0)
    return Response({
        'date': today.isoformat(),
        'ends_at': end_of_day.isoformat(),
        'time_left': _format_time_until(end_of_day - now),
        'total': len(questions),
        'questions': questions,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def daily_question_answer(request, daily_id):
    """POST /api/daily-questions/<id>/answer/ — {selected_option}.

    Javob: {is_correct, correct_answer, selected_option}.
    Bir savolga ikkinchi marta javob berib bo'lmaydi.
    """
    dq = (
        DailyQuestion.objects
        .filter(pk=daily_id)
        .select_related('question')
        .first()
    )
    if not dq:
        return Response({'detail': 'Savol topilmadi'}, status=http_status.HTTP_404_NOT_FOUND)

    try:
        selected = int((request.data or {}).get('selected_option'))
    except (TypeError, ValueError):
        return Response({'detail': 'selected_option majburiy'},
                        status=http_status.HTTP_400_BAD_REQUEST)

    if DailyQuestionAnswer.objects.filter(user=request.user, daily_question=dq).exists():
        return Response({'detail': 'Bu savolga allaqachon javob bergansiz'},
                        status=http_status.HTTP_400_BAD_REQUEST)

    correct = dq.question.correct_answer if dq.question else -1
    is_correct = (selected == correct)
    DailyQuestionAnswer.objects.create(
        user=request.user,
        daily_question=dq,
        selected_option=selected,
        is_correct=is_correct,
    )
    # Kunlik faollik streak'ini yangilaymiz (mavjud logikadan foydalanib).
    # Xatolik javobni buzmaydi (foydalanuvchiga ko'rsatilmaydi), lekin jim
    # yutilmasligi uchun log'ga yoziladi — aks holda streak yangilanmay
    # qolsa sababini topib bo'lmaydi.
    try:
        request.user.update_streak()
    except Exception:
        import logging
        logging.getLogger(__name__).exception(
            'Streak/coin yangilashda xato: user=%s', request.user.pk,
        )

    return Response({
        'is_correct': is_correct,
        'correct_answer': correct,
        'selected_option': selected,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def daily_questions_stats(request):
    """GET /api/daily-questions/stats/ — bugun nechta javob, to'g'ri, streak."""
    today = timezone.now().date()
    today_ids = list(
        DailyQuestion.objects.filter(date=today).values_list('id', flat=True)
    )
    answered_today = DailyQuestionAnswer.objects.filter(
        user=request.user, daily_question_id__in=today_ids,
    )
    answered_count = answered_today.count()
    correct_count = answered_today.filter(is_correct=True).count()
    return Response({
        'date': today.isoformat(),
        'total_today': len(today_ids),
        'answered_today': answered_count,
        'correct_today': correct_count,
        'all_answered': answered_count >= len(today_ids) and len(today_ids) > 0,
        'streak': request.user.streak_count or 0,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def rival_activity(request):
    """GET /api/me/rival-activity/ — raqiblarning oxirgi 24 soatlik faolligi.

    Javob: [{rival_id, rival_name, rival_score_change, my_score_change,
    ahead_by, message}].
    """
    since = timezone.now() - timedelta(hours=24)
    rivals_qs = (
        Rival.objects
        .filter(user=request.user)
        .select_related('rival_user')
    )
    rival_users = list(rivals_qs)
    if not rival_users:
        return Response([])

    # Mening oxirgi 24 soatdagi ball o'zgarishim (yangi attempt ballari yig'indisi).
    rival_ids = [r.rival_user_id for r in rival_users]
    all_ids = rival_ids + [request.user.id]

    # Har bir foydalanuvchi uchun oxirgi 24 soatdagi attempt'lar yig'indisi +
    # umumiy o'rtacha (taqqoslash uchun) — bitta GROUP BY so'rov.
    recent_rows = (
        TestAttempt.objects
        .filter(user_id__in=all_ids, disqualified=False,
                olympiad__is_deleted=False, submitted_at__gte=since)
        .values('user_id')
        .annotate(total=Sum('score'), cnt=Count('id'))
    )
    recent_by_user = {r['user_id']: (r['total'] or 0) for r in recent_rows}

    avg_rows = (
        TestAttempt.objects
        .filter(user_id__in=all_ids, disqualified=False, olympiad__is_deleted=False)
        .values('user_id')
        .annotate(avg=Avg('score'))
    )
    avg_by_user = {r['user_id']: round(r['avg'] or 0, 1) for r in avg_rows}

    my_change = recent_by_user.get(request.user.id, 0)
    my_avg = avg_by_user.get(request.user.id, 0)

    result = []
    for r in rival_users:
        ru = r.rival_user
        rival_change = recent_by_user.get(r.rival_user_id, 0)
        rival_avg = avg_by_user.get(r.rival_user_id, 0)
        ahead_by = round(my_avg - rival_avg, 1)  # musbat — men oldindaman
        name = getattr(ru, 'full_name', '') or 'Raqib'
        if rival_change > my_change and rival_change > 0:
            message = f'{name} bugun sizdan {rival_change - my_change} ball ko\'p oldi!'
        elif rival_change > 0:
            message = f'{name} bugun +{rival_change} ball oldi.'
        else:
            message = f'{name} bugun hali faol emas.'
        result.append({
            'rival_id': r.rival_user_id,
            'rival_name': name,
            'rival_score_change': rival_change,
            'my_score_change': my_change,
            'ahead_by': ahead_by,
            'message': message,
        })
    return Response(result)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def streak_warning(request):
    """GET /api/me/streak-warning/ — streak xavf ostidami.

    Agar bugun faol bo'lmagan va streak > 0 bo'lsa — ogohlantirish.
    Javob: {warning, streak_count, questions_needed, message}.
    """
    user = request.user
    today = timezone.now().date()
    streak = user.streak_count or 0
    QUESTIONS_NEEDED = 5

    if streak <= 0:
        return Response({'warning': False, 'streak_count': 0})

    if user.is_premium:
        return Response({
            'warning': False,
            'is_premium': True,
            'streak_count': streak,
            'message': 'Streakingiz Premium himoyasida!'
        })

    # Bugun allaqachon faol bo'lsa — ogohlantirish yo'q.
    if user.last_active_date == today:
        return Response({'warning': False, 'is_premium': False, 'streak_count': streak})

    return Response({
        'warning': True,
        'is_premium': False,
        'streak_count': streak,
        'questions_needed': QUESTIONS_NEEDED,
        'message': (
            f'Bugun {QUESTIONS_NEEDED} ta savol hal qil, '
            f'{streak} kunlik seriyangni saqla!'
        ),
    })


def _serialize_weekly_results(contest, me_id, limit=5):
    """Musobaqa natijalarini top-N + o'z o'rni bilan qaytaradi."""
    results = list(
        WeeklyContestResult.objects
        .filter(contest=contest)
        .select_related('user')
        .order_by('rank', '-score')
    )
    top = []
    my_entry = None
    for r in results:
        entry = {
            'rank': r.rank,
            'user_id': r.user_id,
            'full_name': getattr(r.user, 'full_name', '') or 'Foydalanuvchi',
            'score': r.score,
            'is_me': r.user_id == me_id,
        }
        if len(top) < limit:
            top.append(entry)
        if r.user_id == me_id:
            my_entry = entry
    return top, my_entry, len(results)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def weekly_contest(request):
    """GET /api/weekly-contest/ — joriy hafta reytingi (jonli hisoblanadi).

    Faol musobaqa uchun reyting real vaqtda shu hafta to'plangan ballardan
    hisoblanadi (finalize'ni kutmasdan). Javob: {week_start, week_end,
    status, top, my_entry, total}.
    """
    week_start, week_end = _week_bounds()
    contest = WeeklyContest.objects.filter(week_start=week_start).first()

    # Joriy hafta ballarini jonli hisoblaymiz (top 50).
    rows = (
        TestAttempt.objects
        .filter(disqualified=False, olympiad__is_deleted=False,
                submitted_at__date__gte=week_start, submitted_at__date__lte=week_end)
        .values('user_id')
        .annotate(total=Sum('score'))
        .order_by('-total')[:50]
    )
    user_ids = [r['user_id'] for r in rows]
    User = type(request.user)
    users = {u.id: u for u in User.objects.filter(id__in=user_ids)}
    top = []
    my_entry = None
    for i, r in enumerate(rows):
        u = users.get(r['user_id'])
        entry = {
            'rank': i + 1,
            'user_id': r['user_id'],
            'full_name': (getattr(u, 'full_name', '') or 'Foydalanuvchi') if u else 'Foydalanuvchi',
            'score': r['total'] or 0,
            'is_me': r['user_id'] == request.user.id,
        }
        if i < 5:
            top.append(entry)
        if r['user_id'] == request.user.id:
            my_entry = entry

    # Mening o'rnim top 50 dan tashqarida bo'lsa — alohida hisoblaymiz.
    if my_entry is None:
        my_total = (
            TestAttempt.objects
            .filter(user=request.user, disqualified=False, olympiad__is_deleted=False,
                    submitted_at__date__gte=week_start, submitted_at__date__lte=week_end)
            .aggregate(total=Sum('score'))['total'] or 0
        )
        if my_total > 0:
            higher = (
                TestAttempt.objects
                .filter(disqualified=False, olympiad__is_deleted=False,
                        submitted_at__date__gte=week_start, submitted_at__date__lte=week_end)
                .values('user_id')
                .annotate(total=Sum('score'))
                .filter(total__gt=my_total)
                .count()
            )
            my_entry = {
                'rank': higher + 1,
                'user_id': request.user.id,
                'full_name': getattr(request.user, 'full_name', '') or 'Foydalanuvchi',
                'score': my_total,
                'is_me': True,
            }

    return Response({
        'week_start': week_start.isoformat(),
        'week_end': week_end.isoformat(),
        'status': contest.status if contest else WeeklyContest.STATUS_ACTIVE,
        'top': top,
        'my_entry': my_entry,
        'total': len(user_ids),
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def weekly_contest_history(request):
    """GET /api/weekly-contest/history/ — o'tgan yakunlangan haftalar."""
    contests = list(
        WeeklyContest.objects
        .filter(status=WeeklyContest.STATUS_FINISHED)
        .order_by('-week_start')[:12]
    )
    data = []
    for c in contests:
        top, my_entry, total = _serialize_weekly_results(c, request.user.id, limit=3)
        data.append({
            'week_start': c.week_start.isoformat(),
            'week_end': c.week_end.isoformat(),
            'top': top,
            'my_entry': my_entry,
            'total': total,
        })
    return Response(data)


# ═══════════════════════════════════════════════════════════════════════════
# LONG-TERM — LT1..LT4
# ═══════════════════════════════════════════════════════════════════════════


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def olympiad_calendar(request):
    """GET /api/olympiad-calendar/?subject=&days= — kelgusi olimpiadalar.

    Default kelgusi 90 kun. Javob: {upcoming: [{id, name, subject, starts_at,
    days_until, registered}]}.
    """
    now = timezone.now()
    try:
        days = int(request.query_params.get('days') or 90)
    except (TypeError, ValueError):
        days = 90
    days = max(1, min(days, 365))
    horizon = now + timedelta(days=days)

    qs = (
        Olympiad.objects
        .filter(
            event_type=Olympiad.EVENT_TYPE_OLYMPIAD,
            is_deleted=False,
            status__in=[Olympiad.STATUS_ACTIVE, Olympiad.STATUS_INACTIVE, Olympiad.STATUS_DRAFT],
            start_datetime__gte=now,
            start_datetime__lte=horizon,
        )
        .order_by('start_datetime')
    )
    subject = (request.query_params.get('subject') or '').strip()
    if subject:
        qs = qs.filter(subject__iexact=subject)

    olympiads = list(qs[:200])
    # Foydalanuvchi qaysilarda qatnashganini bitta so'rovda aniqlaymiz.
    registered_ids = set(
        TestAttempt.objects
        .filter(user=request.user, olympiad_id__in=[o.id for o in olympiads])
        .values_list('olympiad_id', flat=True)
    )

    upcoming = []
    for o in olympiads:
        days_until = (o.start_datetime - now).days if o.start_datetime else None
        upcoming.append({
            'id': o.id,
            'name': o.title,
            'subject': o.subject,
            'starts_at': o.start_datetime.isoformat() if o.start_datetime else None,
            'days_until': max(0, days_until) if days_until is not None else None,
            'registered': o.id in registered_ids,
        })
    return Response({'upcoming': upcoming})


# LT2 bosqichlar — o'rtacha ballga ko'ra darajalar.
ROADMAP_LEVELS = [
    {'level': 'school', 'title': 'Maktab', 'required_score': 0},
    {'level': 'district', 'title': 'Tuman', 'required_score': 40},
    {'level': 'region', 'title': 'Viloyat', 'required_score': 65},
    {'level': 'republic', 'title': 'Respublika', 'required_score': 85},
]


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def roadmap(request):
    """GET /api/me/roadmap/ — o'sish yo'li (4 bosqich).

    O'rtacha ball asosida joriy bosqich aniqlanadi.
    Javob: {current_score, current_level, stages: [{level, title,
    required_score, current_score, is_achieved, next_milestone}]}.
    """
    avg = (
        TestAttempt.objects
        .filter(user=request.user, disqualified=False, olympiad__is_deleted=False)
        .aggregate(avg=Avg('score'))['avg']
    )
    current_score = round(avg or 0, 1)

    stages = []
    current_level = ROADMAP_LEVELS[0]['level']
    for i, lvl in enumerate(ROADMAP_LEVELS):
        is_achieved = current_score >= lvl['required_score']
        if is_achieved:
            current_level = lvl['level']
        next_milestone = None
        if i + 1 < len(ROADMAP_LEVELS):
            nxt = ROADMAP_LEVELS[i + 1]
            next_milestone = {
                'level': nxt['level'],
                'title': nxt['title'],
                'required_score': nxt['required_score'],
                'points_needed': max(0, round(nxt['required_score'] - current_score, 1)),
            }
        stages.append({
            'level': lvl['level'],
            'title': lvl['title'],
            'required_score': lvl['required_score'],
            'current_score': current_score,
            'is_achieved': is_achieved,
            'next_milestone': next_milestone,
        })
    return Response({
        'current_score': current_score,
        'current_level': current_level,
        'stages': stages,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def progress_comparison(request):
    """GET /api/me/progress-comparison/ — joriy oy vs o'tgan oy.

    Javob: {current_month: {attempts, avg_score}, last_month: {...},
    growth_percent, message}.
    """
    now = timezone.now()
    cur_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    # O'tgan oy boshi.
    if cur_start.month == 1:
        last_start = cur_start.replace(year=cur_start.year - 1, month=12)
    else:
        last_start = cur_start.replace(month=cur_start.month - 1)

    def _bucket(start, end):
        qs = TestAttempt.objects.filter(
            user=request.user, disqualified=False, olympiad__is_deleted=False,
            submitted_at__gte=start, submitted_at__lt=end,
        )
        agg = qs.aggregate(cnt=Count('id'), avg=Avg('score'))
        return {
            'attempts': agg['cnt'] or 0,
            'avg_score': round(agg['avg'] or 0, 1),
        }

    current_month = _bucket(cur_start, now + timedelta(seconds=1))
    last_month = _bucket(last_start, cur_start)

    cur_avg = current_month['avg_score']
    last_avg = last_month['avg_score']
    if last_avg > 0:
        growth_percent = round(((cur_avg - last_avg) / last_avg) * 100)
    elif cur_avg > 0:
        growth_percent = 100
    else:
        growth_percent = 0

    if last_month['attempts'] == 0:
        message = 'Bu sizning faol oyingiz — keyingi oy taqqoslash ko\'rinadi!'
    elif growth_percent > 0:
        message = (
            f'Bir oy oldin {last_avg} ball olgan edingiz, hozir {cur_avg} '
            f'— {growth_percent}% o\'sish!'
        )
    elif growth_percent < 0:
        message = (
            f'Bir oy oldin {last_avg} ball edi, hozir {cur_avg}. '
            f'Yana harakat qilsangiz tiklaysiz!'
        )
    else:
        message = f'Natijangiz barqaror: {cur_avg} ball.'

    return Response({
        'current_month': current_month,
        'last_month': last_month,
        'growth_percent': growth_percent,
        'message': message,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def classmates_leaderboard(request):
    """GET /api/me/classmates-leaderboard/ — sinfdoshlar reytingi (top 20).

    Bir xil onboarding_grade'dagi foydalanuvchilar. Grade yo'q bo'lsa umumiy
    leaderboard. Platform adminlar chiqariladi.
    Javob: [{rank, user_id, full_name, avg_score, streak, is_me}].
    """
    user = request.user
    grade = getattr(user, 'onboarding_grade', None)

    User = type(user)
    if grade:
        peer_qs = User.objects.filter(onboarding_grade=grade, is_active=True)
    else:
        peer_qs = User.objects.filter(is_active=True)
    # Platform adminlar sinfdoshlar reytingida ko'rinmasin.
    peer_qs = peer_qs.exclude(is_platform_admin=True)

    # Reyting top 20 ni ko'rsatadi — 500 ta peer aggregatsiya uchun yetarli,
    # cheksiz User querysini oldini olamiz (xotira/CPU himoyasi).
    peer_ids = list(peer_qs.values_list('id', flat=True)[:500])
    if user.id not in peer_ids:
        peer_ids.append(user.id)

    # Har foydalanuvchining o'rtacha balli (bitta GROUP BY so'rov).
    rows = (
        TestAttempt.objects
        .filter(user_id__in=peer_ids, disqualified=False, olympiad__is_deleted=False)
        .values('user_id')
        .annotate(avg=Avg('score'))
    )
    avg_by_user = {r['user_id']: round(r['avg'] or 0, 1) for r in rows}

    # Faqat natijasi bor foydalanuvchilar + men (natija bo'lmasa ham ko'rinaman).
    ranked_ids = sorted(
        avg_by_user.keys(),
        key=lambda uid: -avg_by_user[uid],
    )
    if user.id not in ranked_ids:
        ranked_ids.append(user.id)

    # Top 20 + men (top 20 dan tashqarida bo'lsam).
    top_ids = ranked_ids[:20]
    if user.id not in top_ids:
        top_ids = top_ids + [user.id]

    users = {u.id: u for u in User.objects.filter(id__in=top_ids)}
    result = []
    for i, uid in enumerate(ranked_ids):
        if uid not in top_ids:
            continue
        u = users.get(uid)
        result.append({
            'rank': i + 1,
            'user_id': uid,
            'full_name': (getattr(u, 'full_name', '') or 'Foydalanuvchi') if u else 'Foydalanuvchi',
            'avg_score': avg_by_user.get(uid, 0),
            'streak': (u.streak_count or 0) if u else 0,
            'is_me': uid == user.id,
        })
    result.sort(key=lambda x: x['rank'])
    return Response(result)
