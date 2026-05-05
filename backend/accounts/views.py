import json
import logging
import os
import secrets
import urllib.parse
import urllib.request
from datetime import timedelta

from django.conf import settings
from django.core.exceptions import PermissionDenied, ValidationError
from django.contrib.auth.hashers import check_password, make_password
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from .models import PhoneVerification
from .serializers import (
    LoginSerializer,
    RegisterSerializer,
    StartTelegramPhoneVerificationSerializer,
    UserSerializer,
    VerifyOtpSerializer,
)
from .utils import normalize_phone


logger = logging.getLogger('accounts.telegram')


def _jwt_payload(user):
    # Avval har bir login token_version ni 1 ga oshirar va shu sababli
    # foydalanuvchining boshqa qurilmadagi sessiyasi avtomatik chiqarib
    # yuborilardi. Endi token_version faqat aniq xavfsizlik hodisalarida
    # (admin tomonidan bloklash, parol o'zgartirish, majburiy logout)
    # oshiriladi — login multi-device flow ni buzmaydi.
    if not user.token_version:
        user.token_version = 1
        user.save(update_fields=['token_version'])
    refresh = RefreshToken.for_user(user)
    refresh['token_version'] = user.token_version
    return {
        'token': str(refresh.access_token),
        'refresh': str(refresh),
        'cookie_auth': True,
    }


def bump_token_version(user):
    """Foydalanuvchining barcha mavjud JWT'larini bekor qilish.

    Admin bloklash, parol o'zgartirish va shunga o'xshash xavfsizlik
    hodisalarida chaqiriladi. token_version oshgach, eski tokenlar
    OlympyJWTAuthentication'da rad etiladi.
    """
    user.token_version = (user.token_version or 0) + 1
    user.save(update_fields=['token_version'])
    return user.token_version


def _set_auth_cookies(response, payload):
    same_site = getattr(settings, 'JWT_COOKIE_SAMESITE', 'Lax')
    # SameSite=None faqat Secure cookie bilan ishlaydi — aks holda brauzer
    # cookie'ni rad etadi. Dev rejimda DEBUG=True va same_site Lax bo'lsa
    # secure=False qoldirish kifoya. Production rejimida (DEBUG=False) yoki
    # SameSite=None bo'lsa secure=True kerak.
    secure = (not settings.DEBUG) or (str(same_site).lower() == 'none')
    response.set_cookie(
        getattr(settings, 'JWT_ACCESS_COOKIE_NAME', 'olympy_access'),
        payload['token'],
        max_age=int(settings.SIMPLE_JWT['ACCESS_TOKEN_LIFETIME'].total_seconds()),
        httponly=True,
        secure=secure,
        samesite=same_site,
    )
    response.set_cookie(
        getattr(settings, 'JWT_REFRESH_COOKIE_NAME', 'olympy_refresh'),
        payload['refresh'],
        max_age=int(settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds()),
        httponly=True,
        secure=secure,
        samesite=same_site,
    )
    return response


def _clear_auth_cookies(response):
    response.delete_cookie(getattr(settings, 'JWT_ACCESS_COOKIE_NAME', 'olympy_access'))
    response.delete_cookie(getattr(settings, 'JWT_REFRESH_COOKIE_NAME', 'olympy_refresh'))
    return response


def _recent_verified_phone(normalized_phone):
    recent_window = timezone.now() - timedelta(minutes=10)
    return PhoneVerification.objects.filter(
        normalized_phone=normalized_phone,
        verified_at__isnull=False,
        verified_at__gte=recent_window,
    ).order_by('-verified_at').first()


@api_view(['POST'])
@permission_classes([AllowAny])
def register(request):
    """POST /api/auth/register/ — create a new user account.

    A PhoneVerification row that was verified in the last 10 minutes is
    required: this prevents reusing an old verification to register again
    later (e.g. after the original account was deleted or the phone changed
    hands).
    """
    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    verified = _recent_verified_phone(serializer.validated_data['phone'])
    if not verified:
        return Response(
            {'detail': 'Telefon raqami tasdiqlanmagan yoki tasdiq muddati tugagan'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    user = serializer.save()
    if verified.telegram_chat_id:
        _link_user_to_telegram(
            user,
            verified.telegram_chat_id,
            verified.telegram_user_id,
        )
    payload = _jwt_payload(user)
    response = Response({
        **payload,
        'user': UserSerializer(user).data,
    }, status=status.HTTP_201_CREATED)
    return _set_auth_cookies(response, payload)


@api_view(['POST'])
@permission_classes([AllowAny])
def register_organization(request):
    """POST /api/auth/register-organization/ — create user + pending center.

    The submitted user becomes the center owner/director after Platform Admin
    approval. The user account, center, and owner membership are created in one
    transaction so partial organization registration does not leave an orphaned
    account.
    """
    user_serializer = RegisterSerializer(data={
        'full_name': request.data.get('full_name'),
        'phone': request.data.get('phone'),
        'password': request.data.get('password'),
    })
    user_serializer.is_valid(raise_exception=True)

    center_payload = request.data.get('center')
    if not isinstance(center_payload, dict):
        center_payload = request.data
    from centers.serializers import CenterRegisterSerializer, EducationCenterSerializer

    center_serializer = CenterRegisterSerializer(data=center_payload)
    center_serializer.is_valid(raise_exception=True)

    verified = _recent_verified_phone(user_serializer.validated_data['phone'])
    if not verified:
        return Response(
            {'detail': 'Telefon raqami tasdiqlanmagan yoki tasdiq muddati tugagan'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    with transaction.atomic():
        user = user_serializer.save()
        if verified.telegram_chat_id:
            _link_user_to_telegram(
                user,
                verified.telegram_chat_id,
                verified.telegram_user_id,
            )
        from centers.services import create_pending_center_for_owner

        center = create_pending_center_for_owner(user, center_serializer.validated_data)

    payload = _jwt_payload(user)
    response = Response({
        **payload,
        'user': UserSerializer(user).data,
        'center': EducationCenterSerializer(center).data,
    }, status=status.HTTP_201_CREATED)
    return _set_auth_cookies(response, payload)


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([ScopedRateThrottle])
def login(request):
    """POST /api/auth/login/ — authenticate by normalized phone + password."""
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.validated_data['user']
    payload = _jwt_payload(user)
    response = Response({
        **payload,
        'user': UserSerializer(user).data,
    })
    return _set_auth_cookies(response, payload)


login.cls.throttle_scope = 'auth'


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([ScopedRateThrottle])
def refresh_token(request):
    refresh = (
        request.data.get('refresh')
        or request.COOKIES.get(getattr(settings, 'JWT_REFRESH_COOKIE_NAME', 'olympy_refresh'))
    )
    if not refresh:
        return Response({'detail': 'Refresh token topilmadi'}, status=status.HTTP_401_UNAUTHORIZED)
    serializer = TokenRefreshSerializer(data={'refresh': refresh})
    serializer.is_valid(raise_exception=True)
    payload = serializer.validated_data
    if 'refresh' not in payload:
        payload['refresh'] = refresh
    payload['cookie_auth'] = True
    response = Response(payload)
    return _set_auth_cookies(response, {
        'token': payload['access'],
        'refresh': payload['refresh'],
    })


refresh_token.cls.throttle_scope = 'auth'


@api_view(['POST'])
@permission_classes([AllowAny])
def logout(request):
    response = Response({'ok': True})
    return _clear_auth_cookies(response)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def me(request):
    """GET /api/me/ — return the current authenticated user."""
    return Response(UserSerializer(request.user).data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def admin_users_list(request):
    """GET /api/admin/users/ — Platform Admin only.

    Returns every platform user with their roles_detail so the admin panel
    can render an authoritative table without falling back to mock data.
    """
    if not request.user.is_platform_admin:
        return Response({'detail': 'Forbidden'},
                        status=status.HTTP_403_FORBIDDEN)
    from django.contrib.auth import get_user_model

    User = get_user_model()
    qs = User.objects.all().order_by('-created_at')
    return Response(UserSerializer(qs, many=True).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def admin_set_user_active(request, user_id):
    """POST /api/admin/users/{id}/set-active/ — block or unblock a user.

    Body: {"is_active": true|false}. Platform Admin only. Cannot disable
    yourself or another platform admin (defensive).
    """
    if not request.user.is_platform_admin:
        return Response({'detail': 'Forbidden'},
                        status=status.HTTP_403_FORBIDDEN)
    from django.contrib.auth import get_user_model

    User = get_user_model()
    target = User.objects.filter(pk=user_id).first()
    if not target:
        return Response({'detail': 'Foydalanuvchi topilmadi'},
                        status=status.HTTP_404_NOT_FOUND)
    if target.id == request.user.id:
        return Response({'detail': "O'zingizni bloklab bo'lmaydi"},
                        status=status.HTTP_400_BAD_REQUEST)
    if target.is_platform_admin:
        return Response({'detail': "Boshqa adminni bloklab bo'lmaydi"},
                        status=status.HTTP_400_BAD_REQUEST)
    desired = request.data.get('is_active')
    if not isinstance(desired, bool):
        return Response({'detail': "is_active bool bo'lishi kerak"},
                        status=status.HTTP_400_BAD_REQUEST)
    target.is_active = desired
    target.save(update_fields=['is_active'])
    # Bloklangan foydalanuvchining mavjud JWT tokenlari avtomatik bekor
    # bo'lishi uchun token_version ni oshiramiz. Aks holda is_active=False
    # bo'lsa-da, eski token muddati tugamaguncha API ga kirib turaverardi.
    if not desired:
        bump_token_version(target)
    return Response(UserSerializer(target).data)


def _make_otp():
    return f'{secrets.randbelow(1_000_000):06d}'


def _telegram_api_call(method, payload, timeout=10):
    token = getattr(settings, 'TELEGRAM_BOT_TOKEN', '')
    if not token:
        logger.info('[telegram-local] method=%s payload=%s', method, payload)
        return None
    encoded = {}
    for key, value in (payload or {}).items():
        if isinstance(value, (dict, list)):
            encoded[key] = json.dumps(value)
        else:
            encoded[key] = value
    data = urllib.parse.urlencode(encoded).encode()
    url = f'https://api.telegram.org/bot{token}/{method}'
    try:
        req = urllib.request.Request(url, data=data, method='POST')
        with urllib.request.urlopen(req, timeout=timeout) as response:
            result = json.loads(response.read().decode('utf-8'))
        if not result.get('ok'):
            logger.warning('Telegram %s returned not ok: %s', method, result.get('description'))
            return None
        return result.get('result')
    except Exception:
        logger.exception('Telegram %s failed', method)
        return None


def _telegram_api_post(method, payload):
    return _telegram_api_call(method, payload) is not None


def _send_telegram_message(chat_id, text, reply_markup=None):
    if not getattr(settings, 'TELEGRAM_BOT_TOKEN', ''):
        safe_text = 'Tasdiqlash kodi: ******' if text.startswith('Tasdiqlash kodi:') else text
        logger.info('[telegram-local] chat=%s text=%s', chat_id, safe_text)
        return False
    payload = {'chat_id': chat_id, 'text': text}
    if reply_markup:
        payload['reply_markup'] = reply_markup
    return _telegram_api_post('sendMessage', payload)


def _answer_callback_query(callback_query_id, text, show_alert=False):
    if not callback_query_id:
        return False
    return _telegram_api_post('answerCallbackQuery', {
        'callback_query_id': callback_query_id,
        'text': text,
        'show_alert': bool(show_alert),
    })


def _clear_inline_keyboard(message):
    chat = message.get('chat') or {}
    chat_id = chat.get('id')
    message_id = message.get('message_id')
    if not chat_id or not message_id:
        return False
    return _telegram_api_post('editMessageReplyMarkup', {
        'chat_id': chat_id,
        'message_id': message_id,
        'reply_markup': {'inline_keyboard': []},
    })


def _download_telegram_file(file_id, max_bytes):
    token = getattr(settings, 'TELEGRAM_BOT_TOKEN', '')
    if not token or not file_id:
        return None, '', "Telegram bot token sozlanmagan."
    file_info = _telegram_api_call('getFile', {'file_id': file_id})
    if not file_info:
        return None, '', "Telegram fayl ma'lumoti olinmadi."
    file_size = int(file_info.get('file_size') or 0)
    if file_size and file_size > max_bytes:
        return None, '', f"Fayl juda katta. Limit: {max_bytes // (1024 * 1024)} MB."
    file_path = file_info.get('file_path') or ''
    if not file_path:
        return None, '', "Telegram fayl yo'lini qaytarmadi."
    url = f'https://api.telegram.org/file/bot{token}/{file_path}'
    try:
        with urllib.request.urlopen(url, timeout=20) as response:
            data = response.read(max_bytes + 1)
    except Exception:
        logger.exception('Telegram file download failed')
        return None, '', "Rasmni yuklab bo'lmadi."
    if len(data) > max_bytes:
        return None, '', f"Fayl juda katta. Limit: {max_bytes // (1024 * 1024)} MB."
    ext = file_path.rsplit('.', 1)[-1].lower() if '.' in file_path else ''
    mime_type = {
        'png': 'image/png',
        'webp': 'image/webp',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
    }.get(ext, 'image/jpeg')
    return data, mime_type, ''


def _telegram_image_file_id(message):
    photos = message.get('photo') or []
    if photos:
        best = sorted(
            photos,
            key=lambda item: (
                int(item.get('file_size') or 0),
                int(item.get('width') or 0) * int(item.get('height') or 0),
            ),
            reverse=True,
        )[0]
        return best.get('file_id'), int(best.get('file_size') or 0), 'image/jpeg'
    document = message.get('document') or {}
    mime_type = document.get('mime_type') or ''
    if mime_type.startswith('image/'):
        return document.get('file_id'), int(document.get('file_size') or 0), mime_type
    return '', 0, ''


def _link_user_to_telegram(user, chat_id, telegram_user_id):
    if telegram_user_id:
        type(user).objects.exclude(pk=user.pk).filter(
            telegram_user_id=str(telegram_user_id),
        ).update(telegram_chat_id='', telegram_user_id='', telegram_linked_at=None)
    user.telegram_chat_id = str(chat_id or '')
    user.telegram_user_id = str(telegram_user_id or '')
    user.telegram_linked_at = timezone.now()
    user.save(update_fields=[
        'telegram_chat_id', 'telegram_user_id', 'telegram_linked_at',
    ])
    return user


def _telegram_deep_link(verify_token):
    username = getattr(settings, 'TELEGRAM_BOT_USERNAME', '')
    if not username:
        return ''
    return f'https://t.me/{username}?start={verify_token}'


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([ScopedRateThrottle])
def start_telegram_phone_verification(request):
    """Start phone verification and return Telegram deep link."""
    serializer = StartTelegramPhoneVerificationSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    normalized_phone = serializer.validated_data['phone']
    PhoneVerification.objects.filter(
        normalized_phone=normalized_phone,
        verified_at__isnull=True,
        otp_expires_at__lt=timezone.now(),
    ).delete()
    verification = PhoneVerification.objects.create(
        normalized_phone=normalized_phone,
        verify_token=secrets.token_urlsafe(32),
        max_attempts=getattr(settings, 'PHONE_VERIFICATION_MAX_ATTEMPTS', 5),
    )
    return Response({
        'verification_id': verification.id,
        'phone': normalized_phone,
        'verify_token': verification.verify_token,
        'telegram_deep_link': _telegram_deep_link(verification.verify_token),
        'bot_username': getattr(settings, 'TELEGRAM_BOT_USERNAME', ''),
    }, status=status.HTTP_201_CREATED)


start_telegram_phone_verification.cls.throttle_scope = 'auth'


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([ScopedRateThrottle])
def start_telegram_account_link(request):
    """Start Telegram linking for an already authenticated account."""
    normalized_phone = request.user.normalized_phone
    PhoneVerification.objects.filter(
        normalized_phone=normalized_phone,
        verified_at__isnull=True,
        otp_expires_at__lt=timezone.now(),
    ).delete()
    verification = PhoneVerification.objects.create(
        normalized_phone=normalized_phone,
        verify_token=secrets.token_urlsafe(32),
        max_attempts=1,
    )
    return Response({
        'verification_id': verification.id,
        'phone': normalized_phone,
        'verify_token': verification.verify_token,
        'telegram_deep_link': _telegram_deep_link(verification.verify_token),
        'bot_username': getattr(settings, 'TELEGRAM_BOT_USERNAME', ''),
        'telegram_linked': bool(request.user.telegram_chat_id),
    }, status=status.HTTP_201_CREATED)


start_telegram_account_link.cls.throttle_scope = 'auth'


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([ScopedRateThrottle])
def verify_otp(request):
    """Verify Telegram-delivered OTP for a normalized phone number."""
    serializer = VerifyOtpSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    normalized_phone = serializer.validated_data['phone']
    otp = serializer.validated_data['otp']
    verification = PhoneVerification.objects.filter(
        normalized_phone=normalized_phone,
        verified_at__isnull=True,
        otp_hash__gt='',
    ).order_by('-created_at').first()

    if not verification:
        return Response({'detail': 'Verification not found'},
                        status=status.HTTP_400_BAD_REQUEST)
    if verification.attempts_count >= verification.max_attempts:
        return Response({'detail': 'Too many attempts'},
                        status=status.HTTP_429_TOO_MANY_REQUESTS)
    if verification.otp_is_expired:
        return Response({'detail': 'OTP expired'},
                        status=status.HTTP_400_BAD_REQUEST)

    verification.attempts_count += 1
    if not check_password(otp, verification.otp_hash):
        verification.save(update_fields=['attempts_count', 'updated_at'])
        return Response({'detail': 'OTP noto\'g\'ri'},
                        status=status.HTTP_400_BAD_REQUEST)

    verification.verified_at = timezone.now()
    verification.save(update_fields=['attempts_count', 'verified_at', 'updated_at'])
    return Response({'verified': True, 'phone': normalized_phone})


verify_otp.cls.throttle_scope = 'auth'


def _message_from_update(update):
    return update.get('message') or update.get('edited_message') or {}


def _callback_query_from_update(update):
    return update.get('callback_query') or {}


def _handle_telegram_callback(callback):
    callback_id = str(callback.get('id') or '')
    sender = callback.get('from') or {}
    telegram_user_id = str(sender.get('id') or '')
    data = callback.get('data') or ''
    message = callback.get('message') or {}

    parts = data.split(':')
    if len(parts) != 3 or parts[0] != 'membership' or parts[1] not in ('approve', 'reject'):
        _answer_callback_query(callback_id, "Noma'lum buyruq", show_alert=True)
        return {'ok': True}

    decision = 'approved' if parts[1] == 'approve' else 'rejected'
    try:
        membership_id = int(parts[2])
    except (TypeError, ValueError):
        _answer_callback_query(callback_id, "Ariza topilmadi", show_alert=True)
        return {'ok': True}

    from django.contrib.auth import get_user_model
    from centers.models import CenterMembership
    from centers.services import decide_membership

    User = get_user_model()
    actor = User.objects.filter(telegram_user_id=telegram_user_id).first()
    if not actor:
        _answer_callback_query(
            callback_id,
            "Avval botni profilingizga ulang.",
            show_alert=True,
        )
        return {'ok': True}

    membership = (
        CenterMembership.objects
        .select_related('user', 'center')
        .filter(pk=membership_id)
        .first()
    )
    if not membership:
        _answer_callback_query(callback_id, "Ariza topilmadi", show_alert=True)
        return {'ok': True}

    try:
        membership = decide_membership(membership, actor, decision)
    except PermissionDenied:
        _answer_callback_query(callback_id, "Bu arizani tasdiqlash huquqingiz yo'q", show_alert=True)
        return {'ok': True}
    except ValidationError as exc:
        detail = '; '.join(exc.messages) if hasattr(exc, 'messages') else str(exc)
        _answer_callback_query(callback_id, detail or "Ariza ko'rib chiqilgan", show_alert=True)
        return {'ok': True}

    _clear_inline_keyboard(message)
    if decision == 'approved':
        text = f"✅ {membership.user.full_name} tasdiqlandi."
    else:
        text = f"❌ {membership.user.full_name} rad etildi."
    _answer_callback_query(callback_id, text)
    chat_id = (message.get('chat') or {}).get('id') or actor.telegram_chat_id
    if chat_id:
        location = ' · '.join(part for part in [
            membership.center.country or "O'zbekiston",
            membership.center.region,
            membership.center.district or membership.center.city,
        ] if part)
        _send_telegram_message(
            chat_id,
            (
                f"{text}\n"
                f"Tashkilot: {membership.center.name}\n"
                f"Turi: {membership.center.organization_type}\n"
                f"Manzil: {location}"
            ),
        )
    return {'ok': True}


def _handle_ai_roster_message(message, telegram_user_id, chat_id):
    text = (message.get('caption') or message.get('text') or '').strip()
    if text.startswith('/'):
        return False
    file_id, file_size, detected_mime = _telegram_image_file_id(message)
    if not text and not file_id:
        return False
    # AI quota'ni tejash uchun: faqat rasm yuborilgan bo'lsa yoki matnda
    # aniq trigger so'z bo'lsa AI'ga uzatamiz. Avval har bir oddiy "Salom"
    # xabari ham AI'ga yuborilardi va kunlik limitni tezda yo'q qilardi.
    has_image = bool(file_id)
    text_lower = text.lower()
    AI_TRIGGER_KEYWORDS = (
        "ro'yxat", "ro'yxati", 'roster',
        "ism", 'ismlar',
        "o'quvchi", "o'quvchilar",
        'student', 'students',
    )
    has_trigger = any(kw in text_lower for kw in AI_TRIGGER_KEYWORDS)
    if not has_image and not has_trigger:
        return False

    from django.contrib.auth import get_user_model
    from centers.ai_roster import (
        approve_roster_names,
        extract_names_from_payload,
        format_approval_summary,
    )

    User = get_user_model()
    actor = User.objects.filter(
        telegram_user_id=str(telegram_user_id or ''),
        is_active=True,
    ).first()
    if not actor:
        _send_telegram_message(
            chat_id,
            "Avval sayt panelidan Botni ulash tugmasini bosing va telefon raqamingizni yuboring.",
        )
        return True

    image_bytes = None
    mime_type = detected_mime or 'image/jpeg'
    if file_id:
        max_bytes = getattr(settings, 'AI_ROSTER_MAX_IMAGE_BYTES', 5 * 1024 * 1024)
        if file_size and file_size > max_bytes:
            _send_telegram_message(chat_id, f"Rasm juda katta. Limit: {max_bytes // (1024 * 1024)} MB.")
            return True
        image_bytes, mime_type, error = _download_telegram_file(file_id, max_bytes)
        if error:
            _send_telegram_message(chat_id, f"⚠ {error}")
            return True

    extraction = extract_names_from_payload(
        text=text,
        image_bytes=image_bytes,
        mime_type=mime_type,
    )
    if not extraction.get('ok'):
        _send_telegram_message(chat_id, f"⚠ {extraction.get('error')}")
        return True

    summary = approve_roster_names(
        actor,
        extraction.get('entries') or extraction.get('names') or [],
        source='telegram_roster',
    )
    _send_telegram_message(chat_id, format_approval_summary(summary))
    return True


def handle_telegram_update(update):
    """Process one Telegram update from either webhook or local polling."""
    update = update if isinstance(update, dict) else {}
    callback = _callback_query_from_update(update)
    if callback:
        return _handle_telegram_callback(callback)

    message = _message_from_update(update)
    chat = message.get('chat') or {}
    sender = message.get('from') or {}
    chat_id = str(chat.get('id') or '')
    telegram_user_id = str(sender.get('id') or '')
    text = message.get('text') or ''

    if text.startswith('/start'):
        parts = text.split(maxsplit=1)
        verify_token = parts[1].strip() if len(parts) > 1 else ''
        verification = PhoneVerification.objects.filter(
            verify_token=verify_token,
            verified_at__isnull=True,
        ).first()
        if verification and chat_id:
            verification.telegram_chat_id = chat_id
            verification.telegram_user_id = telegram_user_id
            verification.save(update_fields=['telegram_chat_id', 'telegram_user_id', 'updated_at'])
            _send_telegram_message(chat_id, 'Telefon raqamingizni yuboring.', {
                'keyboard': [[{'text': 'Telefon raqamni yuborish', 'request_contact': True}]],
                'resize_keyboard': True,
                'one_time_keyboard': True,
            })
        return {'ok': True}

    contact = message.get('contact') or {}
    if contact and chat_id:
        contact_user_id = str(contact.get('user_id') or '')
        contact_phone = normalize_phone(contact.get('phone_number'))
        verification = PhoneVerification.objects.filter(
            telegram_chat_id=chat_id,
            verified_at__isnull=True,
        ).order_by('-created_at').first()
        same_telegram_user = bool(contact_user_id) and contact_user_id == telegram_user_id
        if verification and same_telegram_user and contact_phone == verification.normalized_phone:
            from django.contrib.auth import get_user_model

            User = get_user_model()
            existing_user = User.objects.filter(normalized_phone=verification.normalized_phone).first()
            if existing_user:
                _link_user_to_telegram(existing_user, chat_id, telegram_user_id)
                verification.verified_at = timezone.now()
                verification.save(update_fields=['verified_at', 'updated_at'])
                _send_telegram_message(
                    chat_id,
                    "Telegram bot hisobingizga ulandi. Endi arizalarni botdan tasdiqlashingiz mumkin.",
                )
                return {'ok': True}

            otp = _make_otp()
            ttl = getattr(settings, 'PHONE_VERIFICATION_OTP_TTL_SECONDS', 300)
            verification.otp_hash = make_password(otp)
            verification.otp_expires_at = timezone.now() + timedelta(seconds=ttl)
            verification.attempts_count = 0
            verification.save(update_fields=[
                'otp_hash', 'otp_expires_at', 'attempts_count', 'updated_at',
            ])
            _send_telegram_message(chat_id, f'Tasdiqlash kodi: {otp}')
        else:
            _send_telegram_message(chat_id, 'Telefon raqam mos kelmadi.')
        return {'ok': True}

    if _handle_ai_roster_message(message, telegram_user_id, chat_id):
        return {'ok': True}

    return {'ok': True}


@api_view(['POST'])
@permission_classes([AllowAny])
def telegram_webhook(request):
    """Telegram webhook for /start, contact share, and inline callbacks.

    Production (DEBUG=False) requires TELEGRAM_WEBHOOK_SECRET; without it the
    endpoint refuses every call so that a misconfigured deploy can't be
    abused. In dev (DEBUG=True) the secret is optional to keep the local
    polling/mock flow intact.
    """
    secret = os.environ.get('TELEGRAM_WEBHOOK_SECRET', '')
    if not settings.DEBUG and not secret:
        logger.error('TELEGRAM_WEBHOOK_SECRET is required in production')
        return Response({'detail': 'Server misconfigured'},
                        status=status.HTTP_503_SERVICE_UNAVAILABLE)
    if secret and request.headers.get('X-Telegram-Bot-Api-Secret-Token', '') != secret:
        return Response({'detail': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)

    update = request.data if isinstance(request.data, dict) else {}
    if not update and request.body:
        try:
            update = json.loads(request.body.decode('utf-8'))
        except (TypeError, ValueError):
            update = {}
    return Response(handle_telegram_update(update))
