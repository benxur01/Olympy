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


def _serialize_child(student, attempts_qs, weekly_digest_enabled=True):
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
        # `phone` ataylab qaytarilmaydi — ota-ona farzandning telefon raqamini
        # ko'rishi shart emas (PII). Bog'lanish telefon orqali yaratiladi,
        # ammo natijada raqamni qaytarib bermaymiz.
        'avatar_url': avatar_url,
        'streak_count': student.streak_count,
        'badges': student.get_badges(),
        'attempts': attempts,
        'weekly_digest_enabled': weekly_digest_enabled,
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
        # is_confirmed=False — student tasdiqlamaguncha link "kutilmoqda"
        # holatida bo'ladi va get_children/list_children'da ko'rinmaydi.
        ParentStudentLink.objects.create(
            parent=request.user, student=student, is_confirmed=False,
        )
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
        'is_confirmed': False,
        'detail': "So'rov yuborildi. Farzand tasdiqlagach ma'lumotlari ko'rinadi.",
    }, status=http_status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_children(request):
    """GET /api/me/parent/children/ — farzandlar ro'yxati + so'nggi natijalar."""
    from attempts.models import TestAttempt

    # Faqat student tasdiqlagan (is_confirmed=True) bog'lanishlar ko'rinadi —
    # student roziligisiz ota-ona uning ma'lumotlarini ko'ra olmaydi.
    links = (
        ParentStudentLink.objects
        .filter(parent=request.user, is_confirmed=True)
        .select_related('student')
        .order_by('-created_at')
    )
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
        payload.append(_serialize_child(student, attempts_by_user.get(student.id, []), link.weekly_digest_enabled))
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
    
    # Check if the child belongs to this parent va student tasdiqlagan.
    link_exists = ParentStudentLink.objects.filter(
        parent=request.user, student_id=student_id, is_confirmed=True,
    ).exists()
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


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def predict_child_success(request, student_id):
    """GET /api/me/parent/children/<student_id>/predictions/
    Ota-ona uchun farzandining AI muvaffaqiyat bashoratlarini qaytaradi.
    """
    from .models import ParentStudentLink
    from django.contrib.auth import get_user_model
    
    # Check link — faqat student tasdiqlagan bog'lanish uchun.
    link_exists = ParentStudentLink.objects.filter(
        parent=request.user, student_id=student_id, is_confirmed=True,
    ).exists()
    if not link_exists:
        return Response({'detail': "Ruxsat berilmagan yoki farzand bog'lanmagan"}, status=http_status.HTTP_403_FORBIDDEN)

    User = get_user_model()
    student = get_object_or_404(User, pk=student_id)

    from .views import calculate_predictions_for_user
    res = calculate_predictions_for_user(student)
    return Response(res)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def toggle_weekly_digest(request, student_id):
    """POST /api/me/parent/children/<student_id>/toggle-digest/
    Farzand uchun haftalik Telegram xabarlarini yoqish yoki o'chirish.
    """
    link = get_object_or_404(
        ParentStudentLink, parent=request.user, student_id=student_id,
        is_confirmed=True,
    )
    enabled = request.data.get('enabled', True)
    link.weekly_digest_enabled = bool(enabled)
    link.save(update_fields=['weekly_digest_enabled'])
    return Response({'ok': True, 'weekly_digest_enabled': link.weekly_digest_enabled})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def send_test_weekly_digest(request, student_id):
    """POST /api/me/parent/children/<student_id>/test-digest/
    Haftalik Telegram hisobotini ota-onaga test tariqasida darhol yuboradi.
    """
    link = get_object_or_404(
        ParentStudentLink, parent=request.user, student_id=student_id,
        is_confirmed=True,
    )
    chat_id = getattr(request.user, 'telegram_chat_id', '')
    if not chat_id:
        return Response({'detail': "Sizning Telegram profilingiz platforma bilan bog'lanmagan. Iltimos, Telegram orqali tizimga kiring."}, status=http_status.HTTP_400_BAD_REQUEST)

    student = link.student

    # Gather data
    from attempts.models import TestAttempt
    from django.db.models import Avg
    attempts = TestAttempt.objects.filter(user=student, disqualified=False)
    attempts_count = attempts.count()
    avg_score = attempts.aggregate(Avg('score'))['score__avg'] or 0
    avg_score = round(avg_score, 1)

    # Bashorat faqat o'rtacha ball asosida (accounts/views.py bilan bir xil
    # mantiq): imtihonlar soni bashoratni sun'iy oshirmasligi uchun
    # `attempts_count` koeffitsienti olib tashlandi.
    presidential_school = min(99, max(10, int(avg_score * 0.9)))
    al_xorazmiy = min(99, max(10, int(avg_score * 0.85)))
    dtm = min(99, max(10, int(avg_score * 1.05)))

    badges_list = ", ".join(b.get('title') for b in student.get_badges()) or "Yo'q"

    # Construct the message
    msg = (
        f"📊 *{student.full_name or 'Farzandingiz'} ning haftalik hisoboti* \n\n"
        f"🔥 *Streak (Faollik):* {student.streak_count} kun\n"
        f"🪙 *Olympy Coins (Tangalar):* {student.coins} ta\n"
        f"🌱 *Erishilgan nishonlar:* {badges_list}\n\n"
        f"📈 *O'rtacha imtihon ko'rsatkichi:* {avg_score}%\n"
        f"📝 *Jami topshirilgan testlar:* {attempts_count} ta\n\n"
        f"🎯 *AI Muvaffaqiyat Prognostikasi:* \n"
        f"├─ Prezident maktabi: *{presidential_school}%*\n"
        f"├─ Al-Xorazmiy olimpiadasi: *{al_xorazmiy}%*\n"
        f"└─ DTM testlari: *{dtm}%*\n\n"
        f"💡 _Tavsiya:_ Farzandingiz ushbu haftada ajoyib natijalar ko'rsatdi! Platforma obunasi orqali uning bilimini yanada oshirishda davom eting."
    )

    from notifications.services import send_telegram_markdown
    import threading
    def _send():
        try:
            send_telegram_markdown(chat_id, msg)
        except Exception:
            pass
    threading.Thread(target=_send, daemon=True).start()

    return Response({'ok': True, 'detail': "Haftalik hisobot Telegram profilingizga jo'natildi!"})


# ─── Student tomoni: ota-ona bog'lanish so'rovlarini boshqarish ───────────────


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_parent_requests(request):
    """GET /api/me/parent-requests/ — menga kelgan kutilayotgan ota-ona so'rovlari.

    Student o'ziga "farzand" sifatida qo'shmoqchi bo'lgan ota-onalarning
    tasdiqlanmagan (is_confirmed=False) so'rovlarini ko'radi.
    """
    links = (
        ParentStudentLink.objects
        .filter(student=request.user, is_confirmed=False)
        .select_related('parent')
        .order_by('-created_at')
    )
    payload = []
    for link in links:
        parent = link.parent
        avatar_url = ''
        try:
            if parent.avatar:
                avatar_url = parent.avatar.url
        except Exception:
            pass
        payload.append({
            'link_id': link.id,
            'parent_id': parent.id,
            'parent_name': parent.full_name or '',
            'parent_username': parent.username or '',
            'avatar_url': avatar_url,
            'created_at': link.created_at.isoformat() if link.created_at else '',
        })
    return Response(payload)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def confirm_parent(request):
    """POST /api/me/confirm-parent/ — body: {"link_id": <id>} yoki {"parent_id": <id>}, ixtiyoriy {"accept": true|false}

    Student o'ziga kelgan ota-ona bog'lanish so'rovini tasdiqlaydi (yoki rad
    etadi). Bu `respond_parent_request`'ning qulay, link_id'ni URL'ga
    qo'ymaydigan muqobili — frontend `link_id` yoki `parent_id` orqali
    chaqirishi mumkin. accept=False bo'lsa so'rov o'chiriladi.
    """
    data = request.data or {}
    link_id = data.get('link_id')
    parent_id = data.get('parent_id')
    qs = ParentStudentLink.objects.filter(student=request.user, is_confirmed=False)
    if link_id:
        link = qs.filter(pk=link_id).first()
    elif parent_id:
        link = qs.filter(parent_id=parent_id).order_by('-created_at').first()
    else:
        return Response(
            {'detail': "link_id yoki parent_id majburiy"},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    if not link:
        return Response(
            {'detail': "So'rov topilmadi yoki allaqachon ko'rib chiqilgan"},
            status=http_status.HTTP_404_NOT_FOUND,
        )
    accept = bool(data.get('accept', True))
    if not accept:
        link.delete()
        return Response({'ok': True, 'accepted': False})
    from django.utils import timezone
    link.is_confirmed = True
    link.confirmed_at = timezone.now()
    link.save(update_fields=['is_confirmed', 'confirmed_at'])
    return Response({'ok': True, 'accepted': True})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def respond_parent_request(request, link_id):
    """POST /api/me/parent-requests/<link_id>/respond/ — body: {"accept": true|false}

    Student o'ziga kelgan ota-ona bog'lanish so'rovini tasdiqlaydi yoki rad
    etadi. Tasdiqlanganda is_confirmed=True bo'ladi va ota-ona farzand
    ma'lumotlarini ko'ra oladi. Rad etilganda link o'chiriladi.
    """
    link = ParentStudentLink.objects.filter(
        pk=link_id, student=request.user, is_confirmed=False,
    ).first()
    if not link:
        return Response(
            {'detail': "So'rov topilmadi yoki allaqachon ko'rib chiqilgan"},
            status=http_status.HTTP_404_NOT_FOUND,
        )
    accept = bool((request.data or {}).get('accept', False))
    if not accept:
        link.delete()
        return Response({'ok': True, 'accepted': False})
    from django.utils import timezone
    link.is_confirmed = True
    link.confirmed_at = timezone.now()
    link.save(update_fields=['is_confirmed', 'confirmed_at'])
    return Response({'ok': True, 'accepted': True})


