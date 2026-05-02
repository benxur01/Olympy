import json
import logging
import secrets
import urllib.parse
import urllib.request
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.utils import timezone
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

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


@api_view(['POST'])
@permission_classes([AllowAny])
def register(request):
    """POST /api/auth/register/ — create a new user account."""
    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.save()
    token, _ = Token.objects.get_or_create(user=user)
    return Response({
        'token': token.key,
        'user': UserSerializer(user).data,
    }, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([AllowAny])
def login(request):
    """POST /api/auth/login/ — authenticate by normalized phone + password."""
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.validated_data['user']
    token, _ = Token.objects.get_or_create(user=user)
    return Response({
        'token': token.key,
        'user': UserSerializer(user).data,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def me(request):
    """GET /api/me/ — return the current authenticated user."""
    return Response(UserSerializer(request.user).data)


def _make_otp():
    return f'{secrets.randbelow(1_000_000):06d}'


def _send_telegram_message(chat_id, text, reply_markup=None):
    token = getattr(settings, 'TELEGRAM_BOT_TOKEN', '')
    if not token:
        safe_text = 'Tasdiqlash kodi: ******' if text.startswith('Tasdiqlash kodi:') else text
        logger.info('[telegram-local] chat=%s text=%s', chat_id, safe_text)
        return False
    payload = {'chat_id': chat_id, 'text': text}
    if reply_markup:
        payload['reply_markup'] = json.dumps(reply_markup)
    payload = urllib.parse.urlencode(payload).encode()
    url = f'https://api.telegram.org/bot{token}/sendMessage'
    try:
        req = urllib.request.Request(url, data=payload, method='POST')
        with urllib.request.urlopen(req, timeout=10):
            return True
    except Exception:
        logger.exception('Telegram sendMessage failed')
        return False


def _telegram_deep_link(verify_token):
    username = getattr(settings, 'TELEGRAM_BOT_USERNAME', '')
    if not username:
        return ''
    return f'https://t.me/{username}?start={verify_token}'


@api_view(['POST'])
@permission_classes([AllowAny])
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


@api_view(['POST'])
@permission_classes([AllowAny])
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


def _message_from_update(update):
    return update.get('message') or update.get('edited_message') or {}


def handle_telegram_update(update):
    """Process one Telegram update from either webhook or local polling."""
    update = update if isinstance(update, dict) else {}
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

    return {'ok': True}


@api_view(['POST'])
@permission_classes([AllowAny])
def telegram_webhook(request):
    """Telegram webhook for /start verify_token and contact share updates."""
    update = request.data if isinstance(request.data, dict) else {}
    if not update and request.body:
        try:
            update = json.loads(request.body.decode('utf-8'))
        except (TypeError, ValueError):
            update = {}
    return Response(handle_telegram_update(update))
