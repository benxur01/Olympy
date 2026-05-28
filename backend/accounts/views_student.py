"""Premium o'quvchi (student) analitika endpoint'lari.

Barchasi `/api/me/` ostida mount qilinadi (accounts/urls_me.py). Har biri
faqat autentifikatsiyalangan foydalanuvchining O'Z ma'lumotlarini qaytaradi.
"""
from collections import OrderedDict

from rest_framework import status as http_status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from attempts.models import TestAttempt
from olympiads.models import Olympiad


def _premium_required_response():
    """Premium bo'lmagan o'quvchi uchun 403 javobi."""
    return Response(
        {
            'detail': "Bu funksiya premium o'quvchilar uchun. "
                      "Premium olish uchun markaz adminiga murojaat qiling.",
            'upgrade_required': True,
        },
        status=http_status.HTTP_403_FORBIDDEN,
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def history_chart(request):
    """GET /api/me/history-chart/ — oxirgi 10 olimpiada natijasi (grafik uchun).

    Javob: [{olympiad_name, score, max_score, date, rank, pct}]
    Eng yangi 10 ta olinadi, lekin grafik o'sish tartibida bo'lishi uchun
    eskidan yangiga qarab qaytariladi.
    """
    if not request.user.is_premium:
        return _premium_required_response()
    attempts = list(
        TestAttempt.objects
        .filter(user=request.user, olympiad__is_deleted=False)
        .select_related('olympiad')
        .order_by('-submitted_at')[:10]
    )
    attempts.reverse()  # eskidan yangiga
    data = []
    for a in attempts:
        olympiad = a.olympiad
        max_score = _olympiad_max_score(olympiad)
        pct = round((a.score / max_score) * 100, 1) if max_score else 0
        data.append({
            'olympiad_name': olympiad.title if olympiad else '—',
            'score': a.score,
            'max_score': max_score,
            'pct': pct,
            'rank': a.rank,
            'date': a.submitted_at.strftime('%Y-%m-%d') if a.submitted_at else '',
        })
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def competitor_analysis(request):
    """GET /api/me/competitor-analysis/?olympiad_id={id} — raqobatchi tahlili.

    Berilgan olimpiadada (yoki so'nggi qatnashilganda) foydalanuvchining
    o'rni, yuqorisidagi raqib bilan farqi va percentile.
    """
    if not request.user.is_premium:
        return _premium_required_response()
    olympiad_id = request.query_params.get('olympiad_id')
    my_attempt = None
    if olympiad_id:
        my_attempt = (
            TestAttempt.objects
            .filter(user=request.user, olympiad_id=olympiad_id, disqualified=False)
            .select_related('olympiad')
            .first()
        )
    if not my_attempt:
        # olympiad_id berilmagan yoki topilmagan — so'nggi attempt'ni olamiz.
        my_attempt = (
            TestAttempt.objects
            .filter(user=request.user, disqualified=False, olympiad__is_deleted=False)
            .select_related('olympiad')
            .order_by('-submitted_at')
            .first()
        )
    if not my_attempt:
        return Response({
            'my_rank': None,
            'total': 0,
            'above_me': None,
            'percentile': None,
        })

    olympiad = my_attempt.olympiad
    ranked = list(
        TestAttempt.objects
        .filter(olympiad=olympiad, disqualified=False)
        .select_related('user')
        .order_by('-score', 'time_spent', 'submitted_at')
    )
    total = len(ranked)
    my_index = next(
        (i for i, a in enumerate(ranked) if a.id == my_attempt.id),
        None,
    )
    my_rank = (my_index + 1) if my_index is not None else my_attempt.rank
    above_me = None
    if my_index is not None and my_index > 0:
        higher = ranked[my_index - 1]
        above_me = {
            'name': getattr(higher.user, 'full_name', '') or 'Raqib',
            'score': higher.score,
            'diff': max(0, higher.score - my_attempt.score),
        }
    # Percentile: men nechta foiz ishtirokchidan ustunman (o'zimni hisobga
    # olmaymiz). Birinchi o'rin => 100 ga yaqin.
    percentile = None
    if total > 0 and my_rank:
        below_count = total - my_rank
        percentile = round((below_count / total) * 100) if total else 0
    return Response({
        'olympiad_id': olympiad.id if olympiad else None,
        'olympiad_name': olympiad.title if olympiad else '—',
        'my_rank': my_rank,
        'my_score': my_attempt.score,
        'total': total,
        'above_me': above_me,
        'percentile': percentile,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def subject_weakness(request):
    """GET /api/me/subject-weakness/ — fan bo'yicha to'g'ri/noto'g'ri xaritasi.

    Har bir olimpiada fani bo'yicha to'g'ri/jami javoblar yig'iladi.
    Javob: [{subject, correct, total, pct}]
    """
    if not request.user.is_premium:
        return _premium_required_response()
    attempts = (
        TestAttempt.objects
        .filter(user=request.user, olympiad__is_deleted=False)
        .select_related('olympiad')
    )
    buckets = OrderedDict()
    for a in attempts:
        subject = (a.olympiad.subject if a.olympiad else '') or '—'
        b = buckets.setdefault(subject, {'subject': subject, 'correct': 0, 'total': 0})
        b['correct'] += a.correct_count or 0
        # total_questions ishonchli emas (eski attempt'larda 0 bo'lishi
        # mumkin) — correct + wrong dan ham foydalanamiz.
        answered = (a.correct_count or 0) + (a.wrong_count or 0)
        b['total'] += a.total_questions or answered
    result = []
    for b in buckets.values():
        total = b['total']
        pct = round((b['correct'] / total) * 100) if total else 0
        result.append({
            'subject': b['subject'],
            'correct': b['correct'],
            'total': total,
            'pct': pct,
        })
    result.sort(key=lambda x: x['pct'])
    return Response(result)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def readiness(request):
    """GET /api/me/readiness/?olympiad_id={id} — olimpiadaga tayyorlik %.

    Olimpiada fani bo'yicha foydalanuvchining tarixiy natijasidan tayyorlik
    foizi hisoblanadi. Zaif/kuchli fanlar umumiy subject-performance'dan
    olinadi.
    """
    if not request.user.is_premium:
        return _premium_required_response()
    olympiad_id = request.query_params.get('olympiad_id')
    if not olympiad_id:
        return Response({'detail': 'olympiad_id majburiy'},
                        status=http_status.HTTP_400_BAD_REQUEST)
    olympiad = (
        Olympiad.objects.filter(pk=olympiad_id, is_deleted=False).first()
    )
    if not olympiad:
        return Response({'detail': 'Olimpiada topilmadi'},
                        status=http_status.HTTP_404_NOT_FOUND)

    perf = _subject_performance(request.user)
    olympiad_subject = (olympiad.subject or '').strip()
    # Tayyorlik: shu olimpiada fanidagi tarixiy natija. Tarix bo'lmasa
    # umumiy o'rtacha; u ham bo'lmasa 0.
    if olympiad_subject and olympiad_subject in perf:
        readiness_pct = round(perf[olympiad_subject])
    elif perf:
        readiness_pct = round(sum(perf.values()) / len(perf))
    else:
        readiness_pct = 0

    weak = sorted(
        (s for s, p in perf.items() if p < 60),
        key=lambda s: perf[s],
    )
    strong = sorted(
        (s for s, p in perf.items() if p >= 80),
        key=lambda s: -perf[s],
    )
    return Response({
        'olympiad_id': olympiad.id,
        'readiness_pct': readiness_pct,
        'weak_subjects': weak[:5],
        'strong_subjects': strong[:5],
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def study_plan(request):
    """POST /api/me/study-plan/ — AI shaxsiy o'quv rejasi.

    Zaiflik xaritasidan zaif fanlar olinadi va Gemini'ga haftalik reja
    so'rovi yuboriladi. Javob: {"plan": ["1. ...", "2. ..."]}.
    """
    if not request.user.is_premium:
        return _premium_required_response()
    perf = _subject_performance(request.user)
    if not perf:
        return Response({
            'plan': [],
            'detail': "Hali yetarli natija yo'q. Avval bir nechta tadbirda qatnashing.",
        })
    weak_subjects = sorted(
        (s for s, p in perf.items() if p < 70),
        key=lambda s: perf[s],
    )
    if not weak_subjects:
        # Hammasi yaxshi — eng past 2 tasini olamiz.
        weak_subjects = sorted(perf, key=lambda s: perf[s])[:2]

    plan = _generate_study_plan_ai(
        getattr(request.user, 'full_name', '') or 'Oʻquvchi',
        weak_subjects,
        perf,
    )
    return Response({'plan': plan, 'weak_subjects': weak_subjects[:5]})


# ─── Helpers ───────────────────────────────────────────────────────────────


def _olympiad_max_score(olympiad):
    if not olympiad:
        return 100
    total = sum((q.score or 0) for q in olympiad.questions.all())
    return total if total > 0 else 100


def _subject_performance(user):
    """{subject: avg_correct_pct} — tarixiy natijalar bo'yicha."""
    attempts = (
        TestAttempt.objects
        .filter(user=user, olympiad__is_deleted=False)
        .select_related('olympiad')
    )
    buckets = {}
    for a in attempts:
        subject = (a.olympiad.subject if a.olympiad else '') or '—'
        b = buckets.setdefault(subject, {'correct': 0, 'total': 0})
        answered = (a.correct_count or 0) + (a.wrong_count or 0)
        b['correct'] += a.correct_count or 0
        b['total'] += a.total_questions or answered
    return {
        subj: (round((b['correct'] / b['total']) * 100, 1) if b['total'] else 0)
        for subj, b in buckets.items()
    }


def _generate_study_plan_ai(student_name, weak_subjects, perf):
    """Gemini orqali haftalik o'quv rejasi (3-5 tavsiya, o'zbek tilida).

    AI sozlanmagan yoki xatolik bo'lsa — oddiy fallback reja qaytariladi.
    """
    import json
    import urllib.parse
    import urllib.request

    from questions.ai_generation import _gemini_api_keys, _gemini_models

    keys = _gemini_api_keys()
    subj_str = ', '.join(
        f"{s} ({round(perf.get(s, 0))}%)" for s in weak_subjects
    )
    if not keys:
        return [
            f"{i}. {s} fanidan har kuni 30 daqiqa mashq qiling va asosiy "
            f"mavzularni takrorlang."
            for i, s in enumerate(weak_subjects[:5], start=1)
        ]

    prompt = (
        f"Siz tajribali o'qituvchisiz. {student_name} ismli o'quvchi quyidagi "
        f"fanlarda zaif: {subj_str}.\n"
        f"Shu o'quvchi uchun bir haftalik aniq o'quv rejasi tuzing. "
        f"3 tadan 5 tagacha qisqa, amaliy tavsiya bering. Har bir tavsiya "
        f"alohida qatorda, raqam bilan boshlansin (masalan '1. ...'). "
        f"Javob faqat o'zbek tilida bo'lsin va faqat tavsiyalar ro'yxati, "
        f"qo'shimcha sarlavha yoki izohsiz."
    )
    payload = {
        'contents': [{'role': 'user', 'parts': [{'text': prompt}]}],
        'generationConfig': {'maxOutputTokens': 1024},
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
                url,
                data=body,
                method='POST',
                headers={
                    'Content-Type': 'application/json',
                    'x-goog-api-key': api_key,
                },
            )
            try:
                with urllib.request.urlopen(req, timeout=45) as response:
                    raw = json.loads(response.read().decode('utf-8'))
                parts = (
                    ((raw.get('candidates') or [{}])[0].get('content') or {})
                    .get('parts') or []
                )
                text = ''.join(part.get('text') or '' for part in parts)
                lines = [
                    line.strip()
                    for line in text.splitlines()
                    if line.strip()
                ]
                if lines:
                    return lines[:5]
            except Exception:
                pass
    # Fallback
    return [
        f"{i}. {s} fanidan har kuni 30 daqiqa mashq qiling va asosiy "
        f"mavzularni takrorlang."
        for i, s in enumerate(weak_subjects[:5], start=1)
    ]
