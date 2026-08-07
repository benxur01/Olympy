import json
import logging
import secrets
import time
import urllib.parse
import urllib.request
from django.conf import settings
from rest_framework import status as http_status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.throttling import ScopedRateThrottle

from rest_framework.response import Response

from accounts.permissions import IsPlatformAdmin
from questions.ai_generation import _gemini_api_keys, _gemini_models
from .models import SupportMessage

logger = logging.getLogger('accounts.views_support')

# Gemini fallback loop (model x kalit) uchun qattiq umumiy vaqt byudjeti va
# har bir urinish uchun timeout. Bu qiymatlar bo'lmasa, ko'p model/kalit
# sozlangan holatda bitta so'rov gunicorn thread'ini minutlab band qilib
# qo'yishi mumkin edi (support_chat AllowAny bo'lgani uchun bu boshqa AI
# endpointlaridan farqli — pastdagi throttle_scope bilan birga DoS xavfini
# cheklaydi).
#
# DIQQAT: byudjet tekshiruvi har bir `urlopen` dan OLDIN bajariladi, uning
# ichida emas — ya'ni haqiqiy eng yomon holat `BUDGET + PER_REQUEST_TIMEOUT`.
# Avvalgi qiymatlarda bu 25+10 = 35 sekund edi: butun serverda atigi bir necha
# gunicorn thread bo'lgani uchun ikki-uch anonim tashrifchi AI chatni ochsa
# saytning qolgan qismi (login, dashboard) shuncha vaqt kutib qolardi.
# 4+8 = eng yomon holat ~12 sekund.
_SUPPORT_CHAT_PER_REQUEST_TIMEOUT = 4
_SUPPORT_CHAT_TOTAL_TIME_BUDGET = 8

# POST kirish chegaralari. `messages` to'g'ridan-to'g'ri Gemini `contents`
# ga uzatiladi va endpoint AllowAny — ilgari yagona chegara Django'ning
# tabiiy ~2.5MB body limiti edi, ya'ni bitta so'rov bilan megabaytlab matn
# (juda ko'p token) yuborish mumkin edi.
#
# DIQQAT — nega hamma joyda 400 emas: frontend (pages/AISupportWidget.jsx)
# har yuborishda BUTUN chat tarixini qayta jo'natadi, tarix esa GET orqali
# DB'dan cheklovsiz yuklanadi (SupportMessage.text — TextField). Shu sababli
# "xabarlar soni ko'p" yoki "eski xabar uzun" holatida 400 qaytarish uzoq
# muddatli foydalanuvchining chatini butunlay ishdan chiqarardi. Buning
# o'rniga oxirgi N xabardan iborat oyna olinadi (kontekst uchun yetarli), va
# 400 faqat aniq abuse ko'rsatkichlarida qaytariladi.
_SUPPORT_CHAT_MAX_MESSAGES = 40        # Gemini'ga ketadigan oxirgi xabarlar
_SUPPORT_CHAT_MAX_INPUT_MESSAGES = 400  # bundan ortig'i — abuse, 400
_SUPPORT_CHAT_MAX_TEXT_LEN = 4000      # bitta xabar matni (~1 sahifa savol)
_SUPPORT_CHAT_MAX_TOTAL_CHARS = 20000  # oynadagi umumiy matn hajmi

# Mehmon chat sessiyasi — server tomonida cryptographically random cookie.
# Klient `session_id` ni erkin yuborib boshqa mehmon chatini o'qiy olmasin.
GUEST_SUPPORT_COOKIE = 'olympy_support_sid'
GUEST_SUPPORT_COOKIE_MAX_AGE = 60 * 60 * 24 * 7  # 7 kun


def _valid_guest_session_id(value):
    """Faqat server chiqargan token_urlsafe formatini qabul qilamiz."""
    if not value or not isinstance(value, str):
        return False
    # secrets.token_urlsafe(32) ~ 43 belgi; 20..64 oralig'i + xavfsiz alfavit.
    if len(value) < 20 or len(value) > 64:
        return False
    allowed = set('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_')
    return all(c in allowed for c in value)


def _guest_session_from_request(request):
    """Cookie'dan guest session o'qiydi (query/body session_id e'tiborsiz)."""
    sid = request.COOKIES.get(GUEST_SUPPORT_COOKIE) or ''
    return sid if _valid_guest_session_id(sid) else None


def _set_guest_session_cookie(response, session_id):
    same_site = getattr(settings, 'JWT_COOKIE_SAMESITE', 'Lax')
    secure = (not settings.DEBUG) or (str(same_site).lower() == 'none')
    response.set_cookie(
        GUEST_SUPPORT_COOKIE,
        session_id,
        max_age=GUEST_SUPPORT_COOKIE_MAX_AGE,
        httponly=True,
        secure=secure,
        samesite=same_site,
        path='/',
    )
    return response


def _sanitize_support_messages(raw):
    """Klient yuborgan `messages` ni Gemini `contents` uchun xavfsiz shaklga keltiradi.

    Qaytaradi `(contents, error_detail)`: `error_detail` bo'sh bo'lmasa —
    chaqiruvchi 400 qaytarishi kerak va Gemini'ga umuman borilmaydi.
    """
    if not isinstance(raw, list):
        return [], "Suhbat xabarlari (messages) ro'yxat ko'rinishida bo'lishi kerak."
    if len(raw) > _SUPPORT_CHAT_MAX_INPUT_MESSAGES:
        return [], "Suhbat tarixi juda uzun. Iltimos, chatni yangidan boshlang."

    window = raw[-_SUPPORT_CHAT_MAX_MESSAGES:]
    last_index = len(window) - 1
    cleaned = []
    for index, item in enumerate(window):
        if not isinstance(item, dict):
            return [], "Xabar formati noto'g'ri."
        parts = item.get('parts')
        if not isinstance(parts, list):
            return [], "Xabar formati noto'g'ri."
        text = ''.join(
            part['text'] for part in parts
            if isinstance(part, dict) and isinstance(part.get('text'), str)
        ).strip()
        if not text:
            continue
        if len(text) > _SUPPORT_CHAT_MAX_TEXT_LEN:
            if index == last_index:
                # Bu — foydalanuvchi HOZIR yozgan savol, ya'ni yagona haqiqiy
                # yangi kirish. Faqat shu holatda aniq 400 beramiz.
                return [], (
                    f"Xabar juda uzun (maksimal {_SUPPORT_CHAT_MAX_TEXT_LEN} belgi)."
                )
            # Eski tarix cheklovsiz saqlangan bo'lishi mumkin — kesib
            # o'tkazamiz, aks holda mavjud chat butunlay ishlamay qolardi.
            text = text[:_SUPPORT_CHAT_MAX_TEXT_LEN]
        # Gemini `role` sifatida faqat 'user'/'model' ni qabul qiladi. DB'da
        # admin javoblari ham bor ('admin') va ular GET orqali frontend'ga
        # qaytadi — ularni model javobi sifatida uzatamiz.
        cleaned.append({
            'role': 'user' if item.get('role') == 'user' else 'model',
            'parts': [{'text': text}],
        })

    # Umumiy hajm byudjeti — eng eskisidan boshlab tashlaymiz. Har bir xabar
    # MAX_TEXT_LEN dan oshmagani uchun (MAX_TOTAL_CHARS dan kichik) oxirgi
    # yangi savol hech qachon tushib qolmaydi.
    total = sum(len(m['parts'][0]['text']) for m in cleaned)
    while cleaned and total > _SUPPORT_CHAT_MAX_TOTAL_CHARS:
        total -= len(cleaned.pop(0)['parts'][0]['text'])

    if not cleaned:
        return [], "Suhbat xabarlari (messages) jo'natilishi shart."
    return cleaned, ''


@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
@throttle_classes([ScopedRateThrottle])
def support_chat(request):
    """GET/POST /api/support/chat/ — Gemini orqali AI yordamchi bilan suhbat endpointi (ommaviy).

    GET: Foydalanuvchining avvalgi chat tarixi (token bo'lsa user bo'yicha,
         mehmon uchun faqat HttpOnly cookie session).
    POST: Foydalanuvchining yangi savolini qabul qilib DB'ga yozadi, keyin Gemini orqali javob oladi.
    """
    user = request.user if request.user.is_authenticated else None
    guest_session_id = None if user else _guest_session_from_request(request)
    new_guest_cookie = None

    # ─── GET: Chat tarixini yuklash ───
    if request.method == 'GET':
        if user:
            db_messages = SupportMessage.objects.filter(user=user).order_by('created_at')
        elif guest_session_id:
            db_messages = SupportMessage.objects.filter(session_id=guest_session_id).order_by('created_at')
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
    # Body dict bo'lmasa (masalan JSON massiv yuborilsa) `.get` 500 berardi.
    data = request.data if isinstance(request.data, dict) else {}
    messages = data.get('messages')

    if not messages:
        return Response(
            {'detail': "Suhbat xabarlari (messages) jo'natilishi shart."},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    # Gemini'ga (va DB'ga) faqat tozalangan/chegaralangan ro'yxat boradi.
    messages, invalid = _sanitize_support_messages(messages)
    if invalid:
        return Response({'detail': invalid}, status=http_status.HTTP_400_BAD_REQUEST)

    keys = _gemini_api_keys()
    if not keys:
        return Response(
            {'reply': "Kechirasiz, hozirda AI yordamchi tizimda sozlanmagan. Iltimos, keyinroq urinib ko'ring."},
            status=http_status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    # Mehmon: cookie yo'q bo'lsa yangi sessiya chiqaramiz (klient session_id yubormaydi).
    if not user:
        if not guest_session_id:
            guest_session_id = secrets.token_urlsafe(32)
            new_guest_cookie = guest_session_id

    # Foydalanuvchining eng oxirgi yozgan savolini DB'ga saqlaymiz
    user_new_text = ""
    if messages and messages[-1].get('role') == 'user':
        parts = messages[-1].get('parts') or []
        user_new_text = "".join(part.get('text') or '' for part in parts).strip()

    if user_new_text:
        if user:
            SupportMessage.objects.create(user=user, role='user', text=user_new_text)
        elif guest_session_id:
            SupportMessage.objects.create(session_id=guest_session_id, role='user', text=user_new_text)

    # Foydalanuvchi konteksti — PII (telefon, email, to'liq ID) AI'ga yuborilMAYDI.
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
                    f"- Markaz: '{m.center.name}', "
                    f"Turi: {org_type}, "
                    f"Markaz arizasi holati: {m.center.status or 'pending'}."
                )

        roles_str = ", ".join(roles_list) if roles_list else "Hech qanday rol biriktirilmagan"
        centers_str = "\n".join(centers_list) if centers_list else "- Bog'langan o'quv markazlar yo'q"
        display_name = (user.first_name or '').strip() or (user.full_name or '').split()[:1]
        if isinstance(display_name, list):
            display_name = display_name[0] if display_name else 'Foydalanuvchi'

        user_info_prompt = (
            f"- Foydalanuvchi ismi (faqat ko'rsatish uchun): {display_name}\n"
            f"- Tizimdagi rollari va arizalari: {roles_str}\n"
            f"- Biriktirilgan o'quv markazlari holati:\n{centers_str}\n\n"
        )
    else:
        user_info_prompt = (
            "- Foydalanuvchi turi: Mehmon (Tizimga kirmagan/Ro'yxatdan o'tmagan)\n"
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
        "DIQQAT: Faqat Olympy platformasiga tegishli savollarga javob bering. Chet mavzudagi (masalan, ovqat tayyorlash, dasturlash kodi yozish, matematika yechish va h.k.) savollarga muloyimlik bilan faqat Olympy tizimiga oid savollarga yordam bera olishingizni aytib javob bering. "
        "Hech qachon foydalanuvchidan to'liq telefon raqami, parol yoki OTP so'ramang va ularni takrorlamang."
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
    loop_start = time.monotonic()

    def _finalize(resp):
        if new_guest_cookie:
            _set_guest_session_cookie(resp, new_guest_cookie)
        return resp

    for model in _gemini_models():
        if time.monotonic() - loop_start > _SUPPORT_CHAT_TOTAL_TIME_BUDGET:
            break
        model_path = urllib.parse.quote(model, safe='-_.~/')
        url = f'https://generativelanguage.googleapis.com/v1beta/models/{model_path}:generateContent'
        for api_key in keys:
            if time.monotonic() - loop_start > _SUPPORT_CHAT_TOTAL_TIME_BUDGET:
                break
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
                with urllib.request.urlopen(req, timeout=_SUPPORT_CHAT_PER_REQUEST_TIMEOUT) as response:
                    raw = json.loads(response.read().decode('utf-8'))
                parts = (((raw.get('candidates') or [{}])[0].get('content') or {}).get('parts') or [])
                reply = ''.join(part.get('text') or '' for part in parts)
                if reply:
                    # AI javobini ham DB'ga saqlaymiz
                    if user:
                        SupportMessage.objects.create(user=user, role='model', text=reply)
                    elif guest_session_id:
                        SupportMessage.objects.create(session_id=guest_session_id, role='model', text=reply)
                    return _finalize(Response({'reply': reply}))
            except Exception as e:
                last_error = str(e)
                logger.warning("Support AI Gemini call failed: %s", last_error)

    return _finalize(Response(
        {'reply': "Kechirasiz, javob olishda xatolik yuz berdi. Iltimos, birozdan so'ng qayta urinib ko'ring."},
        status=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
    ))


support_chat.cls.throttle_scope = 'support_chat'


@api_view(['GET'])
@permission_classes([IsPlatformAdmin])
def admin_support_threads(request):
    """GET /api/admin/support/chats/ — Barcha yordam so'ragan foydalanuvchilar (shu jumladan mehmonlar)."""
    from django.db.models import Max
    from accounts.models import User
    from accounts.utils import mask_phone

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
            'phone': mask_phone(u.normalized_phone or u.phone or ''),
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
@permission_classes([IsPlatformAdmin])
def admin_support_thread_detail(request, chat_key):
    """GET /api/admin/support/chats/<str:chat_key>/ — Tanlangan suhbatning to'liq chat tarixi."""
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
@permission_classes([IsPlatformAdmin])
def admin_support_send_reply(request, chat_key):
    """POST /api/admin/support/chats/<str:chat_key>/reply/ — Admin tomonidan foydalanuvchiga javob yozish."""
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
