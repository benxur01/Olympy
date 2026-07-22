"""Public (auth talab qilmaydi) yutuqlar portfoliosi verifikatsiyasi.

Portfolio PDF'idagi QR/URL (prolymp.uz/portfolio/verify/<uuid>) ochilganda kim
bo'lishidan qat'i nazar tekshirishi mumkin — shuning uchun `AllowAny`. Bu fayl
autentifikatsiyalangan `views_student` endpoint'laridan alohida saqlanadi
(attempts app'ida certificate_verify public view'i ajratilgani kabi).
"""
from django.db.models import Avg, Max
from rest_framework import status as http_status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from attempts.models import TestAttempt

from .models import User
from .views_student import _subject_performance


@api_view(['GET'])
@permission_classes([AllowAny])
def portfolio_verify(request, portfolio_uuid):
    """GET /api/portfolio/verify/{uuid}/ — yutuqlar portfoliosi haqiqiyligini tekshirish.

    PUBLIC (auth shart emas). UUID orqali o'quvchi topiladi va uning barcha
    vaqt yutuqlari (agregatsiya) qaytariladi:
      - UUID topilmadi → {valid: false, reason: "not_found"} 404
      - Topildi → {valid: true, student_name, ...all_time_stats} 200
    """
    student = (
        User.objects
        .filter(portfolio_uuid=portfolio_uuid)
        .first()
    )
    if not student:
        return Response(
            {'valid': False, 'reason': 'not_found'},
            status=http_status.HTTP_404_NOT_FOUND,
        )

    attempts = (
        TestAttempt.objects
        .filter(user=student, disqualified=False, olympiad__is_deleted=False)
    )
    agg = attempts.aggregate(avg=Avg('score'), best=Max('score'))
    total_olympiads = attempts.count()
    avg_score = round(agg['avg']) if agg['avg'] is not None else 0
    best_score = agg['best'] or 0

    # Fanlar bo'yicha kuchli tomonlar (eng yuqori foizli 5 fan).
    perf = _subject_performance(student)
    top_subjects = sorted(
        ({'subject': s, 'pct': round(p)} for s, p in perf.items() if s and s != '—'),
        key=lambda x: -x['pct'],
    )[:5]

    return Response({
        'valid': True,
        'reason': 'ok',
        'student_name': (student.full_name or 'Foydalanuvchi').strip(),
        'total_olympiads': total_olympiads,
        'avg_score': avg_score,
        'best_score': best_score,
        'top_subjects': top_subjects,
    })
