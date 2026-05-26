"""Ota-ona / Kuzatuvchi endpoint'lari.

Istalgan foydalanuvchi ota-ona vazifasini bajarishi mumkin — alohida ro'yxatdan
o'tish shart emas. Telefon raqam orqali farzandni topib link yaratadi.
"""
from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.shortcuts import get_object_or_404
from rest_framework import status as http_status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import ParentStudentLink
from .utils import normalize_phone


def _serialize_child(student, attempts_qs):
    avatar_url = ''
    try:
        if student.avatar:
            avatar_url = student.avatar.url
    except Exception:
        pass
    attempts = []
    for a in attempts_qs[:20]:
        attempts.append({
            'attempt_id': a.id,
            'olympiad_id': a.olympiad_id,
            'olympiad_title': a.olympiad.title if a.olympiad_id else '',
            'subject': a.olympiad.subject if a.olympiad_id else '',
            'score': a.score,
            'rank': a.rank,
            'correct_count': a.correct_count,
            'wrong_count': a.wrong_count,
            'total_questions': a.total_questions,
            'submitted_at': a.submitted_at.isoformat() if a.submitted_at else '',
        })
    return {
        'student_id': student.id,
        'full_name': student.full_name,
        'username': student.username or '',
        'phone': student.normalized_phone,
        'avatar_url': avatar_url,
        'streak_count': student.streak_count,
        'badges': student.get_badges(),
        'attempts': attempts,
    }


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def link_child(request):
    """POST /api/me/parent/link/ — body: {"student_phone": "+998901234567"}"""
    raw_phone = (request.data or {}).get('student_phone') or (request.data or {}).get('phone')
    if not raw_phone:
        return Response({'detail': "Telefon raqam majburiy"}, status=http_status.HTTP_400_BAD_REQUEST)
    norm = normalize_phone(raw_phone)
    if not norm:
        return Response({'detail': "Telefon raqam noto'g'ri"}, status=http_status.HTTP_400_BAD_REQUEST)
    User = get_user_model()
    student = User.objects.filter(normalized_phone=norm).first()
    if not student:
        return Response(
            {'detail': "Bu telefon raqam bilan foydalanuvchi topilmadi"},
            status=http_status.HTTP_404_NOT_FOUND,
        )
    if student.id == request.user.id:
        return Response(
            {'detail': "O'zingizni farzand sifatida qo'sha olmaysiz"},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    try:
        ParentStudentLink.objects.create(parent=request.user, student=student)
    except IntegrityError:
        return Response(
            {'detail': "Bu farzand allaqachon qo'shilgan"},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    # Yangi parent rolini foydalanuvchi roles ro'yxatiga qo'shamiz —
    # frontend "Ota-ona" rolini ko'rsata oladi.
    try:
        if hasattr(request.user, 'add_role'):
            request.user.add_role('parent')
    except Exception:
        pass
    return Response({
        'student_id': student.id,
        'full_name': student.full_name,
        'phone': student.normalized_phone,
    }, status=http_status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_children(request):
    """GET /api/me/parent/children/ — farzandlar ro'yxati + so'nggi natijalar."""
    from attempts.models import TestAttempt

    links = ParentStudentLink.objects.filter(parent=request.user).select_related('student').order_by('-created_at')
    student_ids = [l.student_id for l in links]
    attempts_by_user = {}
    if student_ids:
        attempts = (
            TestAttempt.objects
            .filter(user_id__in=student_ids)
            .select_related('olympiad')
            .order_by('-submitted_at')
        )
        for a in attempts:
            attempts_by_user.setdefault(a.user_id, []).append(a)
    payload = []
    for link in links:
        student = link.student
        payload.append(_serialize_child(student, attempts_by_user.get(student.id, [])))
    return Response(payload)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def unlink_child(request, student_id):
    """DELETE /api/me/parent/link/<student_id>/ — aloqani o'chirish."""
    link = ParentStudentLink.objects.filter(parent=request.user, student_id=student_id).first()
    if not link:
        return Response({'detail': "Bog'liqlik topilmadi"}, status=http_status.HTTP_404_NOT_FOUND)
    link.delete()
    # Boshqa farzand qolmagan bo'lsa, parent rolini olib tashlash mumkin.
    remaining = ParentStudentLink.objects.filter(parent=request.user).exists()
    if not remaining:
        try:
            if hasattr(request.user, 'remove_role'):
                request.user.remove_role('parent')
        except Exception:
            pass
    return Response(status=http_status.HTTP_204_NO_CONTENT)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def child_report_pdf(request, student_id):
    """GET /api/me/parent/children/<student_id>/report/ — farzandning oylik hisobotini PDF formatida yuklash."""
    from django.http import HttpResponse
    from django.contrib.auth import get_user_model
    from .reports import generate_monthly_report_pdf
    
    # Check if the child belongs to this parent
    link_exists = ParentStudentLink.objects.filter(parent=request.user, student_id=student_id).exists()
    if not link_exists:
        return Response({'detail': "Ruxsat berilmagan yoki farzand bog'lanmagan"}, status=http_status.HTTP_403_FORBIDDEN)
        
    User = get_user_model()
    student = get_object_or_404(User, pk=student_id)
    
    try:
        pdf_bytes = generate_monthly_report_pdf(student)
        # Ota-onaning Telegrami bog'langan bo'lsa, hisobotni bot orqali ham avtomatik yuboramiz
        chat_id = getattr(request.user, 'telegram_chat_id', '')
        if chat_id:
            from notifications.services import send_pdf_to_telegram
            cleaned_name = (student.full_name or 'o_quvchi').replace(' ', '_')
            filename_tg = f"hisobot-{cleaned_name}.pdf"
            caption_tg = f"📊 Farzandingiz {student.full_name or ''} ning oylik rivojlanish hisoboti."
            import threading
            def _send():
                try:
                    send_pdf_to_telegram(chat_id, pdf_bytes, filename_tg, caption_tg)
                except Exception:
                    pass
            threading.Thread(target=_send, daemon=True).start()
    except Exception as e:
        import logging
        logging.getLogger(__name__).exception("Report generation failed for student %s", student_id)
        return Response({'detail': f"Hisobot yaratib bo'lmadi: {str(e)}"}, status=http_status.HTTP_500_INTERNAL_SERVER_ERROR)
        
    response = HttpResponse(pdf_bytes, content_type='application/pdf')
    filename = f"hisobot-{student_id}.pdf"
    if student.full_name:
        cleaned_name = "".join(c for c in student.full_name if c.isalnum() or c in (' ', '-', '_')).strip().replace(' ', '_')
        filename = f"hisobot-{cleaned_name}.pdf"
        
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response
