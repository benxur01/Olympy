import json
import logging
import urllib.parse
import urllib.request
from django.conf import settings
from rest_framework import status as http_status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response

from questions.ai_generation import _gemini_api_keys, _gemini_models
from .models import SupportMessage

logger = logging.getLogger('accounts.views_support')


@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def support_chat(request):
    """GET/POST /api/support/chat/ — Gemini orqali AI yordamchi bilan suhbat endpointi (ommaviy).

    GET: Foydalanuvchining avvalgi chat tarixi (token bo'lsa user bo'yicha, bo'lmasa session_id bo'yicha).
    POST: Foydalanuvchining yangi savolini qabul qilib DB'ga yozadi, keyin Gemini orqali javob oladi.
    """
    user = request.user if request.user.is_authenticated else None
    session_id = request.GET.get('session_id') or request.data.get('session_id')

    # ─── GET: Chat tarixini yuklash ───
    if request.method == 'GET':
        if user:
            db_messages = SupportMessage.objects.filter(user=user).order_by('created_at')
        elif session_id:
            db_messages = SupportMessage.objects.filter(session_id=session_id).order_by('created_at')
        else:
            db_messages = []

        serialized = [
            {
                'role': m.role,
                'parts': [{'text': m.text}]
            }
            for m in db_messages
        ]
        return Response({'messages': serialized})

    # ─── POST: Yangi xabar yuborish ───
    messages = request.data.get('messages', [])

    if not messages:
        return Response(
            {'detail': "Suhbat xabarlari (messages) jo'natilishi shart."},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    keys = _gemini_api_keys()
    if not keys:
        return Response(
            {'reply': "Kechirasiz, hozirda AI yordamchi tizimda sozlanmagan. Iltimos, keyinroq urinib ko'ring."},
            status=http_status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    # Foydalanuvchining eng oxirgi yozgan savolini DB'ga saqlaymiz
    user_new_text = ""
    if messages and messages[-1].get('role') == 'user':
        parts = messages[-1].get('parts') or []
        user_new_text = "".join(part.get('text') or '' for part in parts).strip()

    if user_new_text:
        if user:
            SupportMessage.objects.create(user=user, role='user', text=user_new_text)
        elif session_id:
            SupportMessage.objects.create(session_id=session_id, role='user', text=user_new_text)

    # Foydalanuvchi ma'lumotlarini kontekst uchun yig'amiz
    if user:
        roles_list = []
        centers_list = []
        from centers.models import CenterMembership
        memberships = CenterMembership.objects.filter(user=user).select_related('center')
        for m in memberships:
            roles_list.append(f"{m.role} ({m.status})")
            if m.center:
                org_type = m.center.organization_type or "O'quv markaz"
                centers_list.append(
                    f"- Markaz ID: {m.center_id}, Nomi: '{m.center.name}', "
                    f"Turi: {org_type}, "
                    f"Markaz arizasi holati: {m.center.status or 'pending'}."
                )

        roles_str = ", ".join(roles_list) if roles_list else "Hech qanday rol biriktirilmagan"
        centers_str = "\n".join(centers_list) if centers_list else "- Bog'langan o'quv markazlar yo'q"

        user_info_prompt = (
            f"- Foydalanuvchi ismi: {user.first_name} {user.last_name} ({user.phone})\n"
            f"- Tizimdagi rollari va arizalari: {roles_str}\n"
            f"- Biriktirilgan o'quv markazlari holati:\n{centers_str}\n\n"
        )
    else:
        sess_name = session_id or "noma'lum"
        user_info_prompt = (
            "- Foydalanuvchi turi: Mehmon (Tizimga kirmagan/Ro'yxatdan o'tmagan)\n"
            f"- Anonim sessiya ID: {sess_name}\n"
            "Foydalanuvchi login qila olmayotgan yoki ro'yxatdan o'ta olmayotgan bo'lishi mumkin. "
            "Unga ro'yxatdan o'tish jarayoni, login qilish, parolni tiklash yoki OTP tasdiq olish haqidagi savollarda yordam bering.\n\n"
        )

    # AI uchun maxsus tizim prompti
    system_prompt = (
        "Siz Olympy platformasining virtual yordamchisisiz (AI Support Assistant). "
        "Sizning vazifangiz foydalanuvchining muammolarini hal qilish va savollariga o'zbek yoki rus tilida "
        "chiroyli, qisqa va professional javob berishdir. Google Support/Intercom kabi ishlang.\n\n"
        "Joriy foydalanuvchi haqida ma'lumot:\n"
        f"{user_info_prompt}"
        "Platformaning asosiy qoidalari va yordam uchun ma'lumotlar:\n"
        "1. O'quv markaz arizasi Platform Admin tomonidan tasdiqlanishi kerak. Odatda bu 1 kungacha vaqt oladi. Ariza kutilayotganda (pending) ham, direktor (owner) o'zining markaz sozlamalari va onboarding qismlari bilan tanishib tura oladi.\n"
        "2. Menejer (manager) va o'qituvchi (teacher) arizalarini o'sha markazning direktori (owner) o'zining arizalar (Requests) bo'limidan tasdiqlaydi.\n"
        "3. Talabalar (student) o'quv markazi tomonidan tashkil etilgan musobaqalarda qatnashish uchun markaz tomonidan tasdiqlanishi kerak.\n"
        "4. Platformadagi boshqa barcha muammolar yoki billing/to'lovlar bo'yicha savollarga yordam bering.\n"
        "5. Mehmonlar tizimga kirish uchun telefon raqami va parolidan foydalanishlari kerak. Agar parolini unutgan bo'lsa, parolni tiklash tugmasi orqali OTP kod yuborib tiklashi mumkin.\n\n"
        "DIQQAT: Faqat Olympy platformasiga tegishli savollarga javob bering. Chet mavzudagi (masalan, ovqat tayyorlash, dasturlash kodi yozish, matematika yechish va h.k.) savollarga muloyimlik bilan faqat Olympy tizimiga oid savollarga yordam bera olishingizni aytib javob bering."
    )

    payload = {
        'contents': messages,
        'systemInstruction': {
            'parts': [{'text': system_prompt}]
        },
        'generationConfig': {
            'maxOutputTokens': 1024,
            'temperature': 0.7,
        },
    }

    body = json.dumps(payload).encode('utf-8')
    last_error = ''

    for model in _gemini_models():
        model_path = urllib.parse.quote(model, safe='-_.~/')
        url = f'https://generativelanguage.googleapis.com/v1beta/models/{model_path}:generateContent'
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
                with urllib.request.urlopen(req, timeout=30) as response:
                    raw = json.loads(response.read().decode('utf-8'))
                parts = (((raw.get('candidates') or [{}])[0].get('content') or {}).get('parts') or [])
                reply = ''.join(part.get('text') or '' for part in parts)
                if reply:
                    # AI javobini ham DB'ga saqlaymiz
                    if user:
                        SupportMessage.objects.create(user=user, role='model', text=reply)
                    elif session_id:
                        SupportMessage.objects.create(session_id=session_id, role='model', text=reply)
                    return Response({'reply': reply})
            except Exception as e:
                last_error = str(e)
                logger.warning("Support AI Gemini call failed: %s", last_error)

    return Response(
        {'reply': "Kechirasiz, javob olishda xatolik yuz berdi. Iltimos, birozdan so'ng qayta urinib ko'ring."},
        status=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def admin_support_threads(request):
    """GET /api/admin/support/chats/ — Barcha yordam so'ragan foydalanuvchilar (shu jumladan mehmonlar)."""
    user = request.user
    is_admin = user.is_platform_admin or (hasattr(user, 'roles') and 'admin' in user.roles) or (hasattr(user, 'roles_detail') and 'admin' in user.roles_detail)
    if not is_admin:
        return Response({'detail': "Ruxsat etilmagan."}, status=http_status.HTTP_403_FORBIDDEN)

    from django.db.models import Max
    from accounts.models import User

    # Ro'yxatdan o'tganlar yozishmalari
    user_threads = SupportMessage.objects.filter(user__isnull=False).values('user').annotate(latest_message_time=Max('created_at'))
    # Mehmonlar yozishmalari
    guest_threads = SupportMessage.objects.filter(user__isnull=True).values('session_id').annotate(latest_message_time=Max('created_at'))

    results = []

    for item in user_threads:
        u_id = item['user']
        try:
            u = User.objects.get(pk=u_id)
        except User.DoesNotExist:
            continue

        last_msg = SupportMessage.objects.filter(user=u).order_by('-created_at').first()
        results.append({
            'chat_key': str(u.id),
            'is_guest': False,
            'full_name': f"{u.first_name} {u.last_name}" if u.first_name else u.full_name,
            'phone': u.phone,
            'last_message': last_msg.text if last_msg else '',
            'last_message_role': last_msg.role if last_msg else '',
            'updated_at': item['latest_message_time']
        })

    for item in guest_threads:
        sess_id = item['session_id']
        if not sess_id:
            continue

        last_msg = SupportMessage.objects.filter(session_id=sess_id).order_by('-created_at').first()
        results.append({
            'chat_key': sess_id,
            'is_guest': True,
            'full_name': f"Mehmon ({sess_id[:8]})",
            'phone': "Noma'lum",
            'last_message': last_msg.text if last_msg else '',
            'last_message_role': last_msg.role if last_msg else '',
            'updated_at': item['latest_message_time']
        })

    # Oxirgi xabar bo'yicha saralash
    results.sort(key=lambda x: x['updated_at'], reverse=True)

    # Datetime'ni seriyalash
    for r in results:
        r['updated_at'] = r['updated_at'].isoformat()

    return Response({'threads': results})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def admin_support_thread_detail(request, chat_key):
    """GET /api/admin/support/chats/<str:chat_key>/ — Tanlangan suhbatning to'liq chat tarixi."""
    user = request.user
    is_admin = user.is_platform_admin or (hasattr(user, 'roles') and 'admin' in user.roles) or (hasattr(user, 'roles_detail') and 'admin' in user.roles_detail)
    if not is_admin:
        return Response({'detail': "Ruxsat etilmagan."}, status=http_status.HTTP_403_FORBIDDEN)

    # Agar chat_key UUID bo'lsa yoki guest kaliti bo'lsa session_id bo'yicha filterlaymiz
    if '-' in chat_key or len(chat_key) > 10:
        db_messages = SupportMessage.objects.filter(session_id=chat_key).order_by('created_at')
    else:
        try:
            u_id = int(chat_key)
            db_messages = SupportMessage.objects.filter(user_id=u_id).order_by('created_at')
        except ValueError:
            db_messages = SupportMessage.objects.filter(session_id=chat_key).order_by('created_at')

    serialized = [
        {
            'role': m.role,
            'text': m.text,
            'created_at': m.created_at.isoformat()
        }
        for m in db_messages
    ]
    return Response({'messages': serialized})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def admin_support_send_reply(request, chat_key):
    """POST /api/admin/support/chats/<str:chat_key>/reply/ — Admin tomonidan foydalanuvchiga javob yozish."""
    user = request.user
    is_admin = user.is_platform_admin or (hasattr(user, 'roles') and 'admin' in user.roles) or (hasattr(user, 'roles_detail') and 'admin' in user.roles_detail)
    if not is_admin:
        return Response({'detail': "Ruxsat etilmagan."}, status=http_status.HTTP_403_FORBIDDEN)

    reply_text = request.data.get('text', '').strip()
    if not reply_text:
        return Response({'detail': "Xabar matni bo'sh bo'lishi mumkin emas."}, status=http_status.HTTP_400_BAD_REQUEST)

    from accounts.models import User

    # Mehmon yoki ro'yxatdan o'tgan foydalanuvchini aniqlaymiz
    if '-' in chat_key or len(chat_key) > 10:
        # Mehmon
        SupportMessage.objects.create(session_id=chat_key, role='admin', text=reply_text)
    else:
        try:
            u_id = int(chat_key)
            u = User.objects.get(pk=u_id)
            SupportMessage.objects.create(user=u, role='admin', text=reply_text)
        except (ValueError, User.DoesNotExist):
            SupportMessage.objects.create(session_id=chat_key, role='admin', text=reply_text)

    return Response({'status': 'sent', 'message': reply_text})

