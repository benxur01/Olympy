import io
import json
import logging
import os
import secrets
import threading
import time
import urllib.parse
import urllib.request
from datetime import timedelta

import jwt
from django.conf import settings
from django.core.exceptions import ObjectDoesNotExist, PermissionDenied, ValidationError
from django.contrib.auth.hashers import check_password, make_password
from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes, throttle_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from .email_utils import send_email_verification_code
from .models import AuditLog, EmailVerification, LoginEvent, PhoneVerification
from .permissions import IsPlatformAdmin
from .throttling import PasswordChangePerUserThrottle
from .serializers import (
    ChangePasswordSerializer,
    ConfirmEmailLinkSerializer,
    ConfirmPasswordResetSerializer,
    LoginSerializer,
    RegisterSerializer,
    StartEmailLinkSerializer,
    StartPasswordResetSerializer,
    StartTelegramPhoneVerificationSerializer,
    UpdateProfileSerializer,
    UserSerializer,
    VerifyOtpSerializer,
)
from .utils import delete_replaced_image_file, mask_phone, normalize_phone


# Pillow decompression-bomb limitini modul yuklanishida BIR MARTA o'rnatamiz.
# Avval bu avatar yuklash funksiyasi ichida har chaqiruvda global
# PilImage.MAX_IMAGE_PIXELS'ga yozilardi — bu thread-safe emas (bir nechta
# worker thread bir vaqtda global o'zgaruvchiga yozardi). Modul darajasida bir
# marta o'rnatish yetarli va xavfsiz.
try:
    from PIL import Image as _PilImageModule
    _PilImageModule.MAX_IMAGE_PIXELS = 50 * 1024 * 1024  # 50 MP limit
except Exception:
    pass


logger = logging.getLogger('accounts.telegram')
# Xavfsizlik audit loggeri: OTP tekshiruv muvaffaqiyatsizliklari shu yerda
# yoziladi (LOGGING'dagi 'security' logger). OTP qiymati HECH QACHON loglanmaydi.
security_logger = logging.getLogger('security')


def _jwt_payload(user):
    # Avval har bir login token_version ni 1 ga oshirar va shu sababli
    # foydalanuvchining boshqa qurilmadagi sessiyasi avtomatik chiqarib
    # yuborilardi. Endi token_version faqat aniq xavfsizlik hodisalarida
    # (admin tomonidan bloklash, parol o'zgartirish, majburiy logout)
    # oshiriladi — login multi-device flow ni buzmaydi.
    refresh = RefreshToken.for_user(user)
    refresh['token_version'] = user.token_version
    return {
        'token': str(refresh.access_token),
        'refresh': str(refresh),
        'cookie_auth': True,
        # REFRESH tokenning jti'si — `RefreshToken.for_user` yaratgan
        # `OutstandingToken.jti` bilan aynan bir xil (access tokenning jti'si
        # BOSHQA va blacklist jadvalida kuzatilmaydi). LoginEvent shu qiymatni
        # saqlaydi, shuning uchun keyinchalik aynan bitta seansni blacklist
        # qilish mumkin.
        'jti': str(refresh['jti']),
    }


def _should_expose_tokens_in_body(request):
    """JWT body'da qaytarilsinmi?

    Production default: faqat HttpOnly cookie (XSS blast radius'ni kamaytiradi).
    DEBUG yoki JWT_EXPOSE_TOKENS_IN_BODY=1 yoki klient header
    `X-Olympy-Auth-Storage: 1` (Telegram WebView cookie-less) — body'da ham.
    """
    if getattr(settings, 'JWT_EXPOSE_TOKENS_IN_BODY', False):
        return True
    header = (request.headers.get('X-Olympy-Auth-Storage') or '').strip().lower()
    return header in ('1', 'true', 'yes', 'bearer')


def _auth_response(request, user, *, extra=None, status_code=status.HTTP_200_OK):
    """Cookie o'rnatadi; tokenlarni body'da faqat kerak bo'lganda qaytaradi."""
    payload = _jwt_payload(user)
    # Kirish tarixi (admin paneli "Kirish tarixi") aynan shu yerda yoziladi:
    # _auth_response — yangi sessiya beriladigan YAGONA joy (login, Google
    # login, ro'yxatdan o'tish, parol tiklash). `token/refresh/` bu yerdan
    # o'tmaydi, shuning uchun tarix avtomatik yangilanishlar bilan to'lmaydi.
    # Yozuv muvaffaqiyatsiz bo'lsa ham autentifikatsiya buzilmasligi kerak —
    # AuditLog.log bilan bir xil yondashuv.
    try:
        # X-Forwarded-For'dan OXIRGI qiymat olinadi: proxy (Render) mijoz
        # yuborgan headerni saqlab oxiriga haqiqiy IP'ni qo'shadi, ya'ni
        # birinchi element spoof qilinishi mumkin. Bir xil mantiq —
        # olympy_api.security_logging._client_ip.
        forwarded = [
            p.strip() for p in request.META.get('HTTP_X_FORWARDED_FOR', '').split(',') if p.strip()
        ]
        LoginEvent.objects.create(
            user=user,
            ip_address=(forwarded[-1] if forwarded else request.META.get('REMOTE_ADDR')) or None,
            user_agent=(request.META.get('HTTP_USER_AGENT') or '')[:255],
            jti=payload['jti'],
        )
    except Exception:
        security_logger.exception('LoginEvent yozilmadi user_id=%s', user.pk)
    body = {
        'cookie_auth': True,
        'user': UserSerializer(user, context={'request': request}).data,
    }
    if extra:
        body.update(extra)
    if _should_expose_tokens_in_body(request):
        body['token'] = payload['token']
        body['refresh'] = payload['refresh']
    response = Response(body, status=status_code)
    return _set_auth_cookies(response, payload)


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
    # samesite ni o'rnatishdagi bilan bir xil yuboramiz: SameSite=None (cross-
    # site) rejimida atributsiz Set-Cookie (brauzer default Lax) cross-site
    # javobda rad etiladi va cookie o'chmay qolardi. Django 3.1+ delete_cookie
    # samesite='None' bo'lsa Secure flag'ni o'zi qo'shadi.
    same_site = getattr(settings, 'JWT_COOKIE_SAMESITE', 'Lax')
    response.delete_cookie(
        getattr(settings, 'JWT_ACCESS_COOKIE_NAME', 'olympy_access'),
        samesite=same_site,
    )
    response.delete_cookie(
        getattr(settings, 'JWT_REFRESH_COOKIE_NAME', 'olympy_refresh'),
        samesite=same_site,
    )
    return response


def _recent_verified_phone(normalized_phone):
    """So'nggi 10 daqiqada REGISTRATION maqsadida OTP orqali tasdiqlangan telefon.

    `consumed_at` bo'sh bo'lgan yozuvlar hisobga olinadi — register muvaffaqiyatli
    bo'lgach verification iste'mol qilinadi (qayta ishlatib bo'lmaydi).
    """
    recent_window = timezone.now() - timedelta(minutes=10)
    qs = PhoneVerification.objects.filter(
        normalized_phone=normalized_phone,
        purpose=PhoneVerification.PURPOSE_REGISTRATION,
        verified_at__isnull=False,
        verified_at__gte=recent_window,
    )
    # Agar modelda consumed_at bo'lsa — faqat iste'mol qilinmaganlarni olamiz.
    if hasattr(PhoneVerification, 'consumed_at'):
        qs = qs.filter(consumed_at__isnull=True)
    return qs.order_by('-verified_at').first()


def _consume_phone_verification(verification):
    """Register muvaffaqiyatidan keyin OTP tasdiqini bir martalik qilish.

    Avval verification qatorini o'chirish o'rniga `consumed_at` yoziladi
    (migration mavjud bo'lsa). Yo'q bo'lsa — qator o'chiriladi yoki
    verified_at eskiqilinadi (qayta ishlatib bo'lmasin).
    """
    if not verification:
        return
    try:
        if hasattr(verification, 'consumed_at'):
            verification.consumed_at = timezone.now()
            verification.save(update_fields=['consumed_at', 'updated_at'])
            return
    except Exception:
        pass
    # Fallback: tasdiq oynasidan tashqariga surib, qayta register'da
    # _recent_verified_phone topa olmasin.
    try:
        verification.verified_at = timezone.now() - timedelta(minutes=30)
        verification.save(update_fields=['verified_at', 'updated_at'])
    except Exception:
        try:
            verification.delete()
        except Exception:
            pass


@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    """GET /api/health/ — uptime monitoring.

    Public javob: faqat ``status`` (ok | degraded) — ichki topologiya
    (db/redis/celery) ochiq chiqmasin. Batafsil: platform admin cookie/JWT
    yoki ``?token=HEALTH_CHECK_TOKEN`` / header ``X-Health-Token``.
    """
    detailed = {'status': 'ok', 'db': 'ok', 'redis': 'ok'}
    try:
        from django.db import connection
        connection.ensure_connection()
    except Exception:
        detailed['db'] = 'error'
        detailed['status'] = 'degraded'
    try:
        from django.core.cache import cache
        cache.set('health', '1', 5)
        if cache.get('health') != '1':
            detailed['redis'] = 'error'
    except Exception:
        detailed['redis'] = 'error'
    try:
        if getattr(settings, 'CELERY_TASK_ALWAYS_EAGER', False):
            detailed['celery'] = 'eager'
        else:
            import time
            from django.core.cache import cache
            heartbeat = cache.get('celery_heartbeat')
            if heartbeat is None or (time.time() - float(heartbeat)) > 60:
                detailed['celery'] = 'down'
            else:
                detailed['celery'] = 'ok'
    except Exception:
        detailed['celery'] = 'unknown'

    # Batafsil faqat ishonchli chaqiruvchilarga.
    health_token = (getattr(settings, 'HEALTH_CHECK_TOKEN', None) or os.environ.get('HEALTH_CHECK_TOKEN') or '').strip()
    provided = (
        (request.query_params.get('token') or '')
        or (request.headers.get('X-Health-Token') or '')
    ).strip()
    is_admin = bool(
        getattr(request.user, 'is_authenticated', False)
        and getattr(request.user, 'is_platform_admin', False)
    )
    import hmac as _hmac
    token_ok = bool(health_token and provided and _hmac.compare_digest(provided, health_token))
    if is_admin or token_ok:
        return Response(detailed)
    return Response({'status': detailed['status']})


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([ScopedRateThrottle])
def register(request):
    """POST /api/auth/register/ — create a new user account.

    A PhoneVerification row that was verified in the last 10 minutes is
    required: this prevents reusing an old verification to register again
    later (e.g. after the original account was deleted or the phone changed
    hands).

    Ixtiyoriy join: agar so'rovda `center_id` va `role` bo'lsa, foydalanuvchi
    yaratilgach shu markazga pending arizasi ham bir tranzaksiyada
    yaratiladi. Avval frontend register + joinCenter ni alohida chaqirar va
    ikkinchisi xato bersa "yetim" hisob qolardi. Endi muvaffaqiyatsiz join
    butun register'ni rollback qiladi.
    """
    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    verified = _recent_verified_phone(serializer.validated_data['phone'])
    if not verified:
        return Response(
            {'detail': 'Telefon raqami tasdiqlanmagan yoki tasdiq muddati tugagan'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Optional join params
    join_center_id = request.data.get('center_id') or request.data.get('center')
    if join_center_id is not None:
        try:
            join_center_id = int(join_center_id)
        except (ValueError, TypeError):
            return Response({'detail': "Noto'g'ri markaz ID."}, status=status.HTTP_400_BAD_REQUEST)
    join_role = (request.data.get('join_role') or '').strip().lower()
    join_subject = (request.data.get('join_subject') or request.data.get('subject') or '').strip()
    membership_data = None
    # Ixtiyoriy referral kodi: foydalanuvchi `?ref=XXXX` havola orqali kelsa,
    # ro'yxatdan o'tgach ikkala tarafga ham bonus coin beriladi (use_referral
    # bilan bir xil logika). Bo'sh/yo'q bo'lsa jimgina o'tib ketamiz.
    referral_code = str(request.data.get('referral_code') or '').strip().upper()

    # Xavfsizlik: register orqali faqat 'student' rolida ariza yuborish mumkin.
    # Manager/teacher uchun ariza alohida (faqat owner tasdiqi yo'li bilan).
    if join_role and join_role not in ('student',):
        return Response(
            {'detail': "join_role faqat 'student' bo'lishi mumkin"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        with transaction.atomic():
            user = serializer.save()
            # Yangi foydalanuvchi uchun 1 oylik premium sinov muddati.
            # `is_premium=True` ham qo'yamiz, shunda questions/centers kabi
            # `is_premium` flag'iga qaragan tekshiruvlar sinov davrida ochiq
            # bo'ladi. Sinov tugaganida /me lazy-expiry va Celery task flag'ni
            # qaytaradi (agar admin/obuna premiumi bo'lmasa).
            user.is_premium = True
            user.premium_trial_end = timezone.now() + timedelta(days=30)
            user.save(update_fields=['is_premium', 'premium_trial_end'])
            if verified.telegram_chat_id:
                _link_user_to_telegram(
                    user,
                    verified.telegram_chat_id,
                    verified.telegram_user_id,
                )
            if referral_code:
                # Referral bonusi register tranzaksiyasining bir qismi, lekin
                # uning xatosi (masalan, noto'g'ri kod) hisob ochishni buzmasin:
                # savepoint (nested atomic) + try/except. Yangi foydalanuvchi
                # hali hech qanday kod ishlatmagan, shuning uchun faqat o'zining
                # kodi emasligini va kodning mavjudligini tekshiramiz.
                try:
                    with transaction.atomic():
                        from django.contrib.auth import get_user_model
                        from .models import ReferralCode
                        User = get_user_model()
                        referral = (
                            ReferralCode.objects.filter(code=referral_code)
                            .select_related('user')
                            .first()
                        )
                        if referral and referral.user_id != user.id:
                            bonus = referral.bonus_coins or 50
                            referral.used_by.add(user)
                            # Lost update'ni oldini olish uchun lock bilan.
                            inviter = User.objects.select_for_update().get(pk=referral.user_id)
                            invited = User.objects.select_for_update().get(pk=user.pk)
                            inviter.coins = (inviter.coins or 0) + bonus
                            invited.coins = (invited.coins or 0) + bonus
                            inviter.save(update_fields=['coins'])
                            invited.save(update_fields=['coins'])
                            user.coins = invited.coins
                except Exception:
                    logger.exception(
                        'register referral bonus xatosi: code=%s user=%s',
                        referral_code, user.id,
                    )
            if join_center_id and join_role:
                from centers.models import CenterMembership, EducationCenter
                from centers.serializers import (
                    CenterMembershipSerializer,
                    JoinRequestSerializer,
                )
                join_serializer = JoinRequestSerializer(data={
                    'role': join_role,
                    'subject': join_subject,
                })
                join_serializer.is_valid(raise_exception=True)
                # Avval get_object_or_404 ishlatilardi va markaz topilmasa /
                # rejected bo'lsa butun register tranzaksiyasi rollback bo'lib
                # foydalanuvchi hisob ocha olmasdi. Endi mavjud bo'lmagan
                # markaz uchun ariza yaratmasdan davom etamiz — foydalanuvchi
                # keyin saytdan markazni tanlab qo'shilishi mumkin.
                center = EducationCenter.objects.filter(
                    pk=join_center_id,
                    status=EducationCenter.STATUS_APPROVED,
                ).first()
                if center is not None:
                    membership = CenterMembership.objects.create(
                        user=user,
                        center=center,
                        role=join_serializer.validated_data['role'],
                        subject=join_serializer.validated_data.get('subject', ''),
                        approval_code=secrets.token_hex(3).upper(),
                        status=CenterMembership.STATUS_PENDING,
                    )
                    membership_data = CenterMembershipSerializer(membership).data
                    # Notification fan-out: same logic as join_center view.
                    from notifications.services import (
                        send_staff_join_request_notification,
                        send_student_join_request_notification,
                    )
                    if membership.role == CenterMembership.ROLE_STUDENT:
                        managers = CenterMembership.objects.filter(
                            center=center, role=CenterMembership.ROLE_MANAGER,
                            status=CenterMembership.STATUS_APPROVED,
                        ).select_related('user')
                        for m in managers:
                            send_student_join_request_notification(m.user, user, center, membership)
                        if center.owner_id:
                            send_student_join_request_notification(center.owner, user, center, membership)
                    elif membership.role in (CenterMembership.ROLE_TEACHER, CenterMembership.ROLE_MANAGER):
                        if center.owner_id:
                            send_staff_join_request_notification(
                                center.owner, user, center,
                                role=membership.role,
                                subject=membership.subject or '',
                                membership=membership,
                            )
    except ValidationError as exc:
        detail = '; '.join(exc.messages) if hasattr(exc, 'messages') else str(exc)
        return Response({'detail': detail}, status=status.HTTP_400_BAD_REQUEST)

    # OTP tasdiqini bir martalik qilish — xuddi shu verified yozuv bilan
    # qayta register-organization yoki parallel hisob ochilmasin.
    _consume_phone_verification(verified)

    extra = {}
    if membership_data:
        extra['membership'] = membership_data
    return _auth_response(request, user, extra=extra or None, status_code=status.HTTP_201_CREATED)


register.cls.throttle_scope = 'register'


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([ScopedRateThrottle])
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
        'age_confirmed': request.data.get('age_confirmed', False),
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

    _consume_phone_verification(verified)

    return _auth_response(
        request,
        user,
        extra={'center': EducationCenterSerializer(center).data},
        status_code=status.HTTP_201_CREATED,
    )


register_organization.cls.throttle_scope = 'register'


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([ScopedRateThrottle])
def login(request):
    """POST /api/auth/login/ — authenticate by normalized phone + password.

    Agar foydalanuvchida 2FA yoqilgan bo'lsa, parol to'g'ri bo'lganidan keyin
    qo'shimcha `totp_code` talab qilinadi. Kod yuborilmagan bo'lsa
    `requires_2fa: true` qaytariladi (token berilmaydi) — frontend kod so'rab,
    o'sha telefon+parol+kod bilan qayta yuboradi.
    """
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.validated_data['user']

    if user.totp_enabled and user.totp_secret:
        totp_code = str(request.data.get('totp_code', '')).strip()
        if not totp_code:
            # Parol to'g'ri, lekin 2FA kodi kerak — token bermaymiz.
            return Response({'requires_2fa': True})
        import pyotp
        totp = pyotp.TOTP(user.totp_secret)
        if not totp.verify(totp_code, valid_window=1):
            security_logger.warning(
                'login failed (wrong 2FA code) user_id=%s', user.pk,
            )
            return Response(
                {'detail': "Noto'g'ri 2FA kod", 'requires_2fa': True},
                status=status.HTTP_400_BAD_REQUEST,
            )

    return _auth_response(request, user)


login.cls.throttle_scope = 'auth'


# Google ID Token'ni MAHALLIY (kriptografik) tekshirish uchun JWKS klienti.
# Avval har bir Google login'da `oauth2.googleapis.com/tokeninfo` ga bloklovchi
# HTTP so'rov yuborilardi — bu har bir kirishga tarmoq round-trip qo'shar edi
# (Google hujjatlarida ham bu endpoint faqat debug/test uchun deb ko'rsatilgan
# va rate-limit qilinadi). Endi token Google'ning ochiq imzo kalitlari bilan
# joyida tekshiriladi.
#
# Klient MODUL darajasida bir marta yaratiladi — asosiy tezlik yutug'i shunda:
# `PyJWKClient` kalitlarni worker process ichida keshlaydi, shuning uchun
# tarmoqqa faqat kalitlar eskirganda chiqiladi. Kalit rotatsiyasi xavfsiz:
# token'dagi `kid` keshda topilmasa, klient JWKS'ni avtomatik yangilab qayta
# qidiradi.
GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs'
GOOGLE_ISSUERS = ('https://accounts.google.com', 'accounts.google.com')
# `timeout` ATAYIN qisqa (avval 10s edi). Bu kutish gunicorn thread'ini band
# qilib turadi, web konteynerda esa jami 6 ta thread bor (render_start.sh) —
# ya'ni har bir sekund butun sayt uchun sig'im. Google'ning JWKS'i global CDN
# endpoint'i: 3 sekundda javob bermasa, kutishning ma'nosi yo'q, 503 qaytarib
# thread'ni bo'shatgan afzal (support_chat'dagi byudjet bilan bir xil mantiq).
_google_jwks_client = jwt.PyJWKClient(
    GOOGLE_JWKS_URL,
    cache_keys=True,
    lifespan=3600,
    timeout=3,
)

# ─── Noma'lum `kid` uchun tarmoq chiqishini cheklash ─────────────────────────
# MUAMMO: `PyJWKClient.get_signing_key(kid)` faqat MUVAFFAQIYATLI natijani
# keshlaydi (lru_cache istisnolarni saqlamaydi). Kalit keshda topilmasa u
# JWKS'ni `refresh=True` bilan qayta yuklaydi — ya'ni `kid`i Google'nikiga mos
# kelmaydigan HAR BIR token (soxta, buzilgan, boshqa provayderdan kelgan yoki
# oddiy skaner trafigi) `www.googleapis.com` ga BLOKLOVCHI HTTPS so'rov
# yuborishga majbur qiladi. O'lchangan: bir xil noma'lum `kid` bilan 5 so'rov →
# 5 ta tarmoq chiqishi (haqiqiy `kid` bilan 5 so'rov → 1 ta).
#
# Bu endpoint `AllowAny` va throttle faqat IP bo'yicha (10/min), shuning uchun
# bir nechta manba osongina 6 ta thread'ning hammasini shu kutishga bog'lab
# qo'yishi mumkin — o'shanda sayt bo'ylab (jumladan HAQIQIY Google login uchun)
# so'rovlar navbatda kutadi. Aynan shu "bir necha thread'ni bloklash" naqshi.
#
# YECHIM: allaqachon hal qilingan `kid`lar to'plamini yuritamiz — ular uchun
# `get_signing_key` lru_cache'dan qaytadi va tarmoqqa umuman chiqilmaydi.
# Noma'lum `kid` esa tarmoqqa faqat oynada BIR MARTA chiqa oladi; qolganlari
# darhol (tarmoqsiz) rad etiladi. Kalit rotatsiyasi buzilmaydi: Google yangi
# kalitga o'tsa, birinchi kirish uni yuklab oladi va keyingilari keshdan
# ishlaydi — eng yomon holatda rotatsiya bir oyna davomida sekinlashadi.
_GOOGLE_JWKS_REFRESH_INTERVAL = 60  # sekund
_google_known_kids = set()
_google_jwks_lock = threading.Lock()
_google_jwks_next_refresh_at = 0.0


class GoogleJwksThrottled(jwt.PyJWKClientConnectionError):
    """Noma'lum `kid` — oyna ichida tarmoqqa qayta chiqilmadi.

    `PyJWKClientConnectionError` dan meros oladi, chunki natija mijoz uchun
    aynan bir xil: kalitni tasdiqlab bo'lmadi, qayta urinib ko'rish kerak
    (503). Alohida tur faqat LOG darajasini ajratish uchun — bu kutilgan
    holat (soxta token / skaner trafigi), haqiqiy tarmoq nosozligi emas.
    """


def _google_signing_key(id_token):
    """Token `kid`iga mos Google ochiq kalitini qaytaradi.

    Ma'lum `kid` — tarmoqsiz (kesh). Noma'lum `kid` — tarmoqqa chiqish
    `_GOOGLE_JWKS_REFRESH_INTERVAL` bilan cheklangan; oyna ichida ikkinchi
    urinish `GoogleJwksThrottled` bilan rad etiladi (view uni 503 — qayta
    urinsa bo'ladigan holat deb qaytaradi).
    """
    global _google_jwks_next_refresh_at

    kid = jwt.get_unverified_header(id_token).get('kid')
    if not kid:
        raise jwt.PyJWKClientError("Google tokenida `kid` sarlavhasi yo'q")
    if kid in _google_known_kids:
        return _google_jwks_client.get_signing_key(kid)

    with _google_jwks_lock:
        now = time.monotonic()
        if now < _google_jwks_next_refresh_at:
            raise GoogleJwksThrottled(f'unknown kid {kid!r} within refresh window')
        _google_jwks_next_refresh_at = now + _GOOGLE_JWKS_REFRESH_INTERVAL

    key = _google_jwks_client.get_signing_key(kid)
    _google_known_kids.add(kid)
    return key


def _google_user_lookup(google_phone):
    """Google identifikatori bo'yicha foydalanuvchi (yoki ``None``).

    `.order_by()` ATAYIN: `User.Meta.ordering = ['-created_at']` bo'lgani uchun
    `.first()` so'rovga `ORDER BY created_at DESC` qo'shib yuborardi. `created_at`
    da indeks yo'q, izlanayotgan ikkala ustun esa UNIQUE — ya'ni mos keladigan
    qator ko'pi bilan bitta. Tartib hech narsani o'zgartirmaydi, lekin
    PostgreSQL rejasiga indekssiz sort kaliti qo'shadi.
    """
    from django.contrib.auth import get_user_model
    from django.db import models

    return get_user_model().objects.filter(
        models.Q(normalized_phone=google_phone) | models.Q(phone=google_phone)
    ).order_by().first()


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([ScopedRateThrottle])
def google_login(request):
    """POST /api/auth/google/ — Google OAuth2 login via ID Token verification.
    Body: { "id_token": "...", "role": "student" }
    """
    id_token = request.data.get('id_token') or request.data.get('token') or request.data.get('credential')
    if not id_token:
        return Response({'detail': "Google ID Token ko'rsatilmadi."}, status=status.HTTP_400_BAD_REQUEST)

    import hashlib
    from django.contrib.auth import get_user_model

    User = get_user_model()

    google_client_id = getattr(settings, 'GOOGLE_CLIENT_ID', None)

    try:
        signing_key = _google_signing_key(id_token)
        # `jwt.decode` imzo, muddat (`exp`) va `iss` ni ham shu yerda tekshiradi
        # — ya'ni tokeninfo endpoint'i Google tomonida bajargan tekshiruvlarning
        # hammasi saqlanib qoladi.
        #
        # `verify_aud`: eski kod audience'ni faqat `if google_client_id and aud`
        # bo'lganda solishtirardi, ya'ni GOOGLE_CLIENT_ID sozlanmagan muhitda
        # tekshiruv butunlay o'tkazib yuborilardi. PyJWT esa `audience=None`
        # bo'lsa tokendagi `aud` claim'ini AKSINCHA rad etadi — shuning uchun
        # bu holatda audience tekshiruvi ataylab o'chiriladi (eski xatti-harakat).
        token_info = jwt.decode(
            id_token,
            signing_key.key,
            algorithms=['RS256'],
            audience=google_client_id,
            issuer=GOOGLE_ISSUERS,
            options={'verify_aud': bool(google_client_id)},
        )
    except jwt.ExpiredSignatureError:
        return Response({'detail': "Google tokeni muddati tugagan. Qaytadan urinib ko'ring."}, status=status.HTTP_401_UNAUTHORIZED)
    except jwt.InvalidAudienceError as exc:
        logger.warning("Google token audience mismatch: expected=%s (%s)", google_client_id, exc)
        return Response({'detail': "Google Client ID mos kelmadi."}, status=status.HTTP_401_UNAUTHORIZED)
    except GoogleJwksThrottled as exc:
        # KUTILGAN holat: noma'lum `kid` oyna ichida qayta tarmoqqa chiqara
        # olmadi (deyarli har doim soxta token yoki skaner trafigi). Javob
        # `PyJWKClientConnectionError` bilan bir xil — 503, qayta urinsa
        # bo'ladi — lekin log darajasi WARNING: aks holda bu oddiy fon
        # trafigi production loglarini (va Sentry'ni) ERROR bilan to'ldirardi.
        logger.warning('Google JWKS refresh throttled: %s', exc)
        return Response(
            {'detail': "Google bilan bog'lanib bo'lmadi. Birozdan so'ng qayta urinib ko'ring."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    except jwt.PyJWKClientConnectionError as exc:
        # Google'ning JWKS endpoint'iga chiqa olmadik (tarmoq/timeout) — bu
        # SERVER tomonidagi vaqtinchalik nosozlik, foydalanuvchi tokeni bilan
        # bog'liq emas. Buni 401 "tokeningiz yaroqsiz" deb qaytarish ikki
        # marta zarar qiladi: foydalanuvchiga yolg'on sabab ko'rsatiladi va
        # frontend buni qayta urinib ko'rilmaydigan yakuniy rad javobi deb
        # biladi. 503 — halol va qayta urinsa bo'ladigan holat.
        logger.error("Google JWKS fetch failed (%s): %s", GOOGLE_JWKS_URL, exc)
        return Response(
            {'detail': "Google bilan bog'lanib bo'lmadi. Birozdan so'ng qayta urinib ko'ring."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    except Exception as exc:
        # Yaroqsiz imzo/issuer, buzilgan yoki mos kalit topilmagan token —
        # eski kod kabi 401 bilan yopiladi (fail-closed). Sabab tashxis uchun
        # istisno TURI bilan birga yoziladi: aks holda "Invalid issuer" kabi
        # KONFIGURATSIYA xatosi ham, buzilgan token ham loglarda bir xil
        # ko'rinardi.
        logger.warning("Google token verification error [%s]: %s", type(exc).__name__, exc)
        return Response({'detail': "Google tokeni yaroqsiz yoki tasdiqlanmadi."}, status=status.HTTP_401_UNAUTHORIZED)

    email = (token_info.get('email') or '').strip().lower()
    sub = token_info.get('sub') or ''
    if not sub:
        return Response({'detail': "Google foydalanuvchi ma'lumoti yetarsiz."}, status=status.HTTP_400_BAD_REQUEST)

    name = (token_info.get('name') or '').strip()
    given_name = (token_info.get('given_name') or '').strip()
    family_name = (token_info.get('family_name') or '').strip()

    desired_role = (request.data.get('role') or 'student').strip().lower()
    if desired_role not in ('student', 'teacher', 'manager', 'owner'):
        desired_role = 'student'

    # Google `sub` bevosita `phone`/`normalized_phone` (max_length=20) ga
    # sig'maydi (haqiqiy sub ~21 raqam → "google_" bilan ~28 belgi) va email
    # `username` (max_length=32) dan uzun bo'lishi mumkin. Shu sababli sub'dan
    # deterministik, qisqa va DB'ga xavfsiz identifikator hosil qilamiz —
    # aks holda PostgreSQL'da "value too long" (500) yuzaga keladi.
    sub_digest = hashlib.sha256(sub.encode('utf-8')).hexdigest()
    google_phone = f"google_{sub_digest[:13]}"      # 7 + 13 = 20 belgi (phone maks.)
    google_username = f"google_{sub_digest[:12]}"   # 7 + 12 = 19 belgi (username maks. 32)

    user = _google_user_lookup(google_phone)

    if user:
        # Parol bilan login oqimidagi kabi: muddatli blok tugagan bo'lsa
        # kirishdan oldin ochiladi (LoginSerializer.validate bilan bir xil).
        user.release_expired_suspension()
        if not user.is_active:
            return Response({'detail': "Hisob bloklangan yoki o'chirilgan."}, status=status.HTTP_403_FORBIDDEN)
        # `student` va `owner` — o'zaro istisno qiluvchi (mutually exclusive)
        # identifikatsiya turlari. Bir Gmail o'quvchi (student) sifatida
        # ro'yxatdan o'tgan bo'lsa, o'sha Gmail bilan tashkilot (owner) sifatida
        # qayta ro'yxatdan o'tishga ruxsat berilmaydi va aksincha. Boshqa
        # rollar (teacher, manager) bu cheklovga tushmaydi.
        current_roles = user.roles or []
        if desired_role == 'owner' and 'student' in current_roles:
            return Response(
                {'detail': "Siz bu Gmail orqali allaqachon o'quvchi sifatida ro'yxatdan o'tgansiz. Boshqa Gmail hisobidan tashkilot sifatida ro'yxatdan o'ting."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if desired_role == 'student' and 'owner' in current_roles:
            return Response(
                {'detail': "Siz bu Gmail orqali allaqachon tashkilot sifatida ro'yxatdan o'tgansiz. Boshqa Gmail hisobidan o'quvchi sifatida ro'yxatdan o'ting."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if desired_role and desired_role not in current_roles:
            user.add_role(desired_role)
        return _auth_response(request, user)

    try:
        with transaction.atomic():
            # Avval `User.objects.create(...)` + `user.save()` chaqirilardi —
            # bu ikkita DB yozuvi (INSERT, so'ng butun qatorni qayta yozadigan
            # UPDATE) demakdi, chunki parol faqat obyekt saqlangandan KEYIN
            # o'rnatilardi. Parolni INSERT'dan oldin qo'yamiz: bitta yozuv
            # yetarli (`set_unusable_password` hash hisoblamaydi — u tasodifiy
            # "!" prefiksli qiymat yozadi, ya'ni tekin).
            user = User(
                phone=google_phone,
                normalized_phone=google_phone,
                username=google_username,
                full_name=name or (email.split('@')[0] if email else "Google User"),
                first_name=given_name,
                last_name=family_name,
                roles=[desired_role],
                is_active=True,
                is_premium=True,
                premium_trial_end=timezone.now() + timedelta(days=30),
            )
            user.set_unusable_password()
            user.save(force_insert=True)
    except IntegrityError:
        # Bir vaqtda ikkita birinchi login (race) — mavjud yozuvni qaytaramiz.
        user = _google_user_lookup(google_phone)
        if not user:
            raise
        return _auth_response(request, user)

    return _auth_response(request, user, status_code=status.HTTP_201_CREATED)


google_login.cls.throttle_scope = 'auth'



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
    # Avval bu yerda faqat JWT signature tekshirilardi va bloklangan
    # foydalanuvchi yoki token_version bumped bo'lgan token ham yangilanardi
    # — natijada admin user'ni bloklab qo'ysa-da, refresh orqali 7 kun
    # ichida kirib turaverishi mumkin edi. Endi:
    #   1) refresh token payload'idan user_id va token_version olamiz
    #   2) DB'da user mavjud, faol va token_version mos kelishini tekshiramiz
    # Aks holda 401 qaytaramiz — bu JWT'ning lifetime'ini token_version
    # mexanizmiga bog'laydi.
    from rest_framework_simplejwt.tokens import RefreshToken as RT
    from rest_framework_simplejwt.exceptions import TokenError, InvalidToken
    try:
        decoded = RT(refresh)
    except (TokenError, InvalidToken):
        return Response({'detail': 'Refresh token yaroqsiz'}, status=status.HTTP_401_UNAUTHORIZED)
    user_id = decoded.get('user_id')
    token_version = decoded.get('token_version')
    from django.contrib.auth import get_user_model
    User = get_user_model()
    user = User.objects.filter(pk=user_id).first()
    if not user or not user.is_active:
        return Response({'detail': 'Foydalanuvchi faol emas'}, status=status.HTTP_401_UNAUTHORIZED)
    if token_version is None or int(token_version) != int(user.token_version or 0):
        return Response({'detail': 'Token bekor qilingan, qayta kiring'}, status=status.HTTP_401_UNAUTHORIZED)

    serializer = TokenRefreshSerializer(data={'refresh': refresh})
    serializer.is_valid(raise_exception=True)
    payload = serializer.validated_data
    if 'refresh' not in payload:
        payload['refresh'] = refresh
    cookie_payload = {
        'token': payload['access'],
        'refresh': payload['refresh'],
    }
    body = {'cookie_auth': True}
    # Access yangilanganini klient bilishi uchun (storage fallback).
    # Production cookie-only: tokenlarni body'dan yashiramiz.
    if _should_expose_tokens_in_body(request):
        body['access'] = payload['access']
        body['refresh'] = payload['refresh']
        body['token'] = payload['access']
    response = Response(body)
    return _set_auth_cookies(response, cookie_payload)


refresh_token.cls.throttle_scope = 'auth'


@api_view(['POST'])
@permission_classes([AllowAny])
def logout(request):
    # Avval logout `bump_token_version` chaqirardi va bu BARCHA qurilmalardan
    # chiqarib yuborardi (yo'qotgan telefon stsenariysi uchun yaxshi, lekin
    # oddiy "Chiqish" tugmasi uchun haddan tashqari agressiv).
    # Endi faqat joriy refresh token blacklist qilinadi — qolgan qurilmalar
    # ishlashda davom etadi. Token versionini oshirishni `change_password`
    # va admin bloklash uchun qoldirdik.
    refresh = (
        request.data.get('refresh')
        or request.COOKIES.get(getattr(settings, 'JWT_REFRESH_COOKIE_NAME', 'olympy_refresh'))
    )
    if refresh:
        try:
            token = RefreshToken(refresh)
            token.blacklist()
        except Exception:
            # Yaroqsiz / muddati o'tgan / allaqachon blacklist — sukutda o'tamiz
            pass
    response = Response({'ok': True})
    return _clear_auth_cookies(response)


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def me(request):
    """GET/PATCH /api/me/ — current authenticated user.

    GET: foydalanuvchi ma'lumotlarini qaytaradi.
    PATCH: first_name / last_name / username'ni yangilashga ruxsat beradi.
    is_active=False user uchun 401 qaytaramiz: bloklangan foydalanuvchining
    JWT'si OlympyJWTAuthentication tomonidan token_version mismatch sababli
    rad etiladi, lekin xavfsizlik qatlamini ikki marta qo'yamiz.
    """
    if not request.user.is_active:
        return Response({'detail': 'Hisob bloklangan'}, status=status.HTTP_401_UNAUTHORIZED)

    # Muddati o'tgan obunalarni yopish va premium statuslarini yangilash
    # (lazy expiration). Avval 3 ta alohida DB so'rovi bor edi (expired
    # exists + active exists + org active exists). Endi foydalanuvchining
    # barcha aktiv obunalarini select_related('plan') bilan BITTA so'rovda
    # olamiz va expired/active/organization tekshiruvlarini Python ichida
    # bajaramiz. user.save() faqat is_premium haqiqatan o'zgarganda chaqiriladi.
    #
    # Caching: bu blok HAR sahifa yuklanishida ishlaydi. Obuna holati kamdan
    # kam o'zgaradi, shuning uchun "yaqin orada hech narsa muddati o'tmaydi"
    # signalini 60 soniyaga cache'laymiz. Cache mavjud bo'lsa (va undagi
    # `recheck_at` hali kelmagan bo'lsa) — UserSubscription so'rovini butunlay
    # o'tkazib yuboramiz. Cache obuna o'zgarganda (billing webhook, admin
    # toggle premium) invalidate qilinadi.
    from django.core.cache import cache
    from .utils import subscription_cache_key

    now = timezone.now()
    sub_cache_key = subscription_cache_key(request.user.id)
    sub_cache = cache.get(sub_cache_key)
    recheck_at = sub_cache.get('recheck_at') if isinstance(sub_cache, dict) else None
    skip_subscription_sync = bool(recheck_at and recheck_at > now.timestamp())

    if not skip_subscription_sync:
        from billing.models import UserSubscription
        from centers.models import EducationCenter

        active_subs = list(
            UserSubscription.objects
            .filter(user=request.user, is_active=True)
            .select_related('plan')
        )
        expired_ids = [s.id for s in active_subs if s.end_date and s.end_date <= now]
        if expired_ids:
            UserSubscription.objects.filter(id__in=expired_ids).update(is_active=False)
        # Muddati o'tmagan (hali amal qiluvchi) aktiv obunalar.
        still_active = [
            s for s in active_subs
            if s.id not in expired_ids and s.end_date and s.end_date > now
        ]
        # Premium sinov muddati hali amal qilyaptimi? Sinovli foydalanuvchida
        # odatda UserSubscription yozuvi umuman bo'lmaydi, shuning uchun bu
        # tekshiruv `expired_ids` dan mustaqil.
        trial_active = bool(
            request.user.premium_trial_end and request.user.premium_trial_end > now
        )
        # Premium flag'ni o'chirish sharti: hech qanday amal qiluvchi obuna
        # YO'Q va sinov muddati ham tugagan, lekin flag hali True. Bu sinov
        # tugashini ham, obuna tugashini ham bitta joyda qoplaydi.
        if request.user.is_premium and not still_active and not trial_active:
            request.user.is_premium = False
            request.user.save(update_fields=['is_premium'])

        # Markaz premiumini faqat aktiv obuna (expired_ids bo'lsa) holatida
        # qayta hisoblaymiz — sinov markaz premiumiga ta'sir qilmaydi.
        if expired_ids:
            has_active_org = any(
                s.plan and s.plan.plan_type == 'organization'
                for s in still_active
            )
            if not has_active_org:
                EducationCenter.objects.filter(owner=request.user).update(is_premium=False)

        # Keyingi tekshiruv vaqtini hisoblaymiz: aktiv obunalar ichidagi eng
        # yaqin tugash vaqti, sinov tugash vaqti yoki 60 soniya — qaysi biri
        # kichik bo'lsa. Shunda obuna/sinov aynan tugaganda darhol qayta
        # tekshiriladi, aks holda 60 soniya so'rovsiz o'tadi.
        candidate_ts = [s.end_date.timestamp() for s in still_active if s.end_date]
        if trial_active and request.user.premium_trial_end:
            candidate_ts.append(request.user.premium_trial_end.timestamp())
        next_expiry_ts = min(candidate_ts, default=None)
        recheck_ts = now.timestamp() + 60
        if next_expiry_ts is not None:
            recheck_ts = min(recheck_ts, next_expiry_ts)
        cache.set(sub_cache_key, {'recheck_at': recheck_ts}, 60)

    if request.method == 'PATCH':
        serializer = UpdateProfileSerializer(
            data=request.data,
            context={'user': request.user, 'request': request},
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        user = request.user
        update_fields = []
        if 'first_name' in data:
            user.first_name = (data.get('first_name') or '').strip()
            update_fields.append('first_name')
        if 'last_name' in data:
            user.last_name = (data.get('last_name') or '').strip()
            update_fields.append('last_name')
        if 'username' in data:
            new_username = data.get('username')
            # Serializer validate_username bo'sh string'ni '' qilib qaytaradi
            # — bu yerda NULL'ga aylantiramiz (save()'da ham backstop bor).
            user.username = new_username or None
            if isinstance(new_username, str) and new_username.strip() == '':
                user.username = None
            update_fields.append('username')
        # Eslatma: telefon raqam bu endpoint orqali o'zgartirilmaydi —
        # UpdateProfileSerializer 'phone' maydonini qabul qilmaydi (tasdiqsiz
        # almashtirish hisobni o'g'irlash xavfini tug'diradi). Telefonni
        # almashtirish kelajakda alohida OTP-tasdiqlangan endpoint orqali.
        # first/last yangilangan bo'lsa save() ichida full_name avtomatik
        # qayta hisoblanadi — shu sababli update_fields ga full_name'ni ham
        # qo'shamiz, aks holda save(update_fields=...) uni DB'ga yozmaydi.
        if 'first_name' in data or 'last_name' in data:
            update_fields.append('full_name')

        # Eslatma: username o'zgarishi token_version'ni OSHIRMAYDI. Avval
        # username yangilanganda token_version bump qilinardi va bu
        # foydalanuvchining boshqa qurilmalardagi (hatto shu qurilmadagi)
        # barcha sessiyalarini bekor qilardi — oddiy profil tahriri uchun
        # ortiqcha. token_version faqat parol o'zgarganda yoki logout'da
        # oshiriladi (xavfsizlik hodisalari). Username — shunchaki ko'rinish
        # maydoni, sessiyaga ta'sir qilmaydi.
        if update_fields:
            # save() ichidagi normalize/auto-full_name logikasi ishlashi
            # uchun update_fields'ga normalized_phone va phone qo'shilmaydi
            # (mavjud qiymatlar saqlanadi).
            # Race condition: serializer validate_username unique tekshirsa
            # ham, parallel PATCH so'rovida ikkalasi ham tekshiruvdan o'tib,
            # biri IntegrityError (500) olishi mumkin edi — endi 400.
            try:
                user.save(update_fields=list(set(update_fields)))
            except IntegrityError:
                return Response(
                    {'username': ['Bu username band.']},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        return Response(UserSerializer(user, context={'request': request}).data)

    return Response(UserSerializer(request.user, context={'request': request}).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([PasswordChangePerUserThrottle])
def change_my_password(request):
    """POST /api/auth/me/change-password/ — eski parol bilan yangisini almashtirish.

    Muvaffaqiyatli o'zgartirilgandan keyin token_version oshiriladi (boshqa
    qurilmalardagi sessiyalar bekor bo'ladi) va shu so'rov uchun yangi
    JWT cookie'lar o'rnatiladi.
    """
    if not request.user.is_active:
        return Response({'detail': 'Hisob bloklangan'}, status=status.HTTP_401_UNAUTHORIZED)
    serializer = ChangePasswordSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    old_password = serializer.validated_data['old_password']
    new_password = serializer.validated_data['new_password']

    user = request.user
    if not check_password(old_password, user.password):
        return Response({'detail': "Eski parol noto'g'ri"},
                        status=status.HTTP_400_BAD_REQUEST)
    if old_password == new_password:
        return Response({'detail': "Yangi parol eski paroldan farq qilishi kerak"},
                        status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        from django.contrib.auth import get_user_model
        User = get_user_model()
        locked = User.objects.select_for_update().get(pk=user.pk)
        locked.set_password(new_password)
        locked.save(update_fields=['password'])
        # Bump token_version => boshqa qurilmalardagi JWT'lar bekor bo'ladi.
        bump_token_version(locked)
        user = locked

    return _auth_response(request, user, extra={'password_changed': True})


def _verify_account_delete_credentials(request, user):
    """Parol (+ ixtiyoriy 2FA) tekshiruvi. Xato bo'lsa Response, OK bo'lsa None."""
    password = (request.data.get('password') or '').strip()
    if not password:
        return Response(
            {'detail': "Hisobni o'chirish uchun parolni tasdiqlang"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not user.check_password(password):
        security_logger.warning(
            'account_delete failed (wrong password) user_id=%s', user.pk,
        )
        return Response(
            {'detail': "Parol noto'g'ri"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if user.totp_enabled and user.totp_secret:
        totp_code = str(request.data.get('totp_code') or request.data.get('code') or '').strip()
        if not totp_code:
            return Response(
                {'detail': "2FA kodi talab qilinadi", 'requires_2fa': True},
                status=status.HTTP_400_BAD_REQUEST,
            )
        import pyotp
        if not pyotp.TOTP(user.totp_secret).verify(totp_code, valid_window=1):
            security_logger.warning(
                'account_delete failed (wrong 2FA) user_id=%s', user.pk,
            )
            return Response(
                {'detail': "Noto'g'ri 2FA kod", 'requires_2fa': True},
                status=status.HTTP_400_BAD_REQUEST,
            )
    return None


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def delete_my_account(request):
    """DELETE /api/auth/me/ — soft-delete (grace period ichida tiklash mumkin).

    Xavfsizlik: parol (va 2FA yoqilgan bo'lsa TOTP) majburiy.
    Soft-delete: is_active=False + deleted_at. Grace (default 30 kun) o'tgach
    Celery hard-delete qiladi. To'lov yozuvlari hard-delete da SET_NULL.
    """
    user = request.user
    if not user.is_active or getattr(user, 'deleted_at', None):
        return Response({'detail': 'Hisob bloklangan yoki o\'chirilgan'}, status=status.HTTP_401_UNAUTHORIZED)
    if user.is_platform_admin:
        return Response(
            {'detail': "Platform admin o'z hisobini o'chira olmaydi"},
            status=status.HTTP_403_FORBIDDEN,
        )

    cred_err = _verify_account_delete_credentials(request, user)
    if cred_err is not None:
        return cred_err

    from centers.models import EducationCenter
    if EducationCenter.objects.filter(owner_id=user.id).exists():
        return Response(
            {'detail': "Siz tashkilot egasisiz. Hisobni o'chirishdan oldin "
                       "tashkilot egaligini boshqa foydalanuvchiga o'tkazing."},
            status=status.HTTP_409_CONFLICT,
        )

    grace_days = int(getattr(settings, 'ACCOUNT_DELETE_GRACE_DAYS', 30))
    now = timezone.now()
    restorable_until = now + timedelta(days=grace_days)

    AuditLog.log(request, 'account_delete', target=user, extra={
        'phone': mask_phone(user.normalized_phone),
        'soft_delete': True,
        'restorable_until': restorable_until.isoformat(),
    })

    with transaction.atomic():
        from django.contrib.auth import get_user_model
        User = get_user_model()
        locked = User.objects.select_for_update().get(pk=user.pk)
        locked.is_active = False
        locked.deleted_at = now
        locked.token_version = (locked.token_version or 0) + 1
        locked.save(update_fields=['is_active', 'deleted_at', 'token_version'])

    response = Response({
        'detail': (
            f"Hisobingiz o'chirildi. {grace_days} kun ichida telefon va parol "
            "bilan tiklash mumkin."
        ),
        'soft_deleted': True,
        'restorable_until': restorable_until.isoformat(),
        'grace_days': grace_days,
    })
    return _clear_auth_cookies(response)


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([ScopedRateThrottle])
def restore_my_account(request):
    """POST /api/auth/restore/ — soft-deleted hisobni grace ichida tiklash.

    Body: { phone, password, totp_code? }
    """
    raw_phone = (request.data.get('phone') or '').strip()
    password = (request.data.get('password') or '').strip()
    norm = normalize_phone(raw_phone)
    if not norm or not password:
        return Response(
            {'detail': "Telefon va parol majburiy"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    from django.contrib.auth import get_user_model
    User = get_user_model()
    user = User.objects.filter(normalized_phone=norm).first()
    if not user or not user.deleted_at:
        # Enumeration himoyasi — bir xil xabar.
        return Response(
            {'detail': "Tiklash mumkin emas yoki muddat tugagan"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    grace_days = int(getattr(settings, 'ACCOUNT_DELETE_GRACE_DAYS', 30))
    deadline = user.deleted_at + timedelta(days=grace_days)
    if timezone.now() > deadline:
        return Response(
            {'detail': "Tiklash muddati tugagan"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not user.check_password(password):
        security_logger.warning(
            'account_restore failed (wrong password) user_id=%s phone=%s',
            user.pk, mask_phone(norm),
        )
        return Response(
            {'detail': "Telefon yoki parol noto'g'ri"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if user.totp_enabled and user.totp_secret:
        totp_code = str(request.data.get('totp_code') or request.data.get('code') or '').strip()
        if not totp_code:
            return Response(
                {'detail': "2FA kodi talab qilinadi", 'requires_2fa': True},
                status=status.HTTP_400_BAD_REQUEST,
            )
        import pyotp
        if not pyotp.TOTP(user.totp_secret).verify(totp_code, valid_window=1):
            return Response(
                {'detail': "Noto'g'ri 2FA kod", 'requires_2fa': True},
                status=status.HTTP_400_BAD_REQUEST,
            )

    with transaction.atomic():
        locked = User.objects.select_for_update().get(pk=user.pk)
        if not locked.deleted_at:
            return Response({'detail': "Hisob allaqachon faol"}, status=status.HTTP_400_BAD_REQUEST)
        locked.deleted_at = None
        locked.is_active = True
        locked.token_version = (locked.token_version or 0) + 1
        locked.save(update_fields=['deleted_at', 'is_active', 'token_version'])
        user = locked

    AuditLog.log(request, 'account_delete', target=user, extra={
        'phone': mask_phone(user.normalized_phone),
        'restored': True,
    })
    return _auth_response(request, user, extra={'restored': True})


restore_my_account.cls.throttle_scope = 'auth'


@api_view(['POST', 'DELETE'])
@parser_classes([JSONParser, MultiPartParser, FormParser])
@permission_classes([IsAuthenticated])
def update_my_avatar(request):
    """POST /api/auth/me/avatar/ — upload current user's profile image.
    DELETE /api/auth/me/avatar/ — delete current user's profile image.
    """
    if request.method == 'DELETE':
        if request.user.avatar:
            request.user.avatar.delete(save=False)
        request.user.avatar = None
        request.user.save(update_fields=['avatar'])
        return Response(UserSerializer(request.user, context={'request': request}).data)

    image = (
        request.FILES.get('avatar')
        or request.FILES.get('image')
        or request.FILES.get('photo')
    )
    if not image:
        return Response({'detail': 'Rasm faylini yuboring'}, status=status.HTTP_400_BAD_REQUEST)
    if image.content_type and not image.content_type.startswith('image/'):
        return Response({'detail': 'Faqat rasm fayl qabul qilinadi'}, status=status.HTTP_400_BAD_REQUEST)
    max_bytes = getattr(settings, 'PROFILE_IMAGE_MAX_BYTES', 5 * 1024 * 1024)
    if image.size and image.size > max_bytes:
        return Response(
            {'detail': f"Rasm juda katta. Limit: {max_bytes // (1024 * 1024)} MB"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    # Magic byte tekshiruvi: content_type spoof qilinishi mumkin, shuning uchun
    # Pillow yordamida fayl haqiqatan ham rasm ekanini tasdiqlaymiz.
    # Decompression bomb himoyasi: Pillow default MAX_IMAGE_PIXELS=89M, lekin
    # avatar uchun 50MP yetarli — qattiqroq cheklov DoS'ni to'sadi. `verify()`
    # faqat header'ni tekshiradi, `load()` esa to'liq dekompressiyani urinib,
    # bomb'ni shu yerda ushlab qoladi (DecompressionBombError).
    try:
        # MAX_IMAGE_PIXELS modul darajasida (fayl boshida) bir marta o'rnatilgan
        # — bu yerda thread-unsafe global yozuv yo'q.
        from PIL import Image as PilImage
        img = PilImage.open(io.BytesIO(image.read()))
        img.load()
        image.seek(0)
    except Exception:
        return Response({'detail': 'Yaroqsiz rasm fayli'}, status=status.HTTP_400_BAD_REQUEST)
    # Almashtirilgan avatar storage'da yetim qolmasin (DELETE oqimidagi
    # tozalash bilan bir xil maqsad). Eski nomni yozishdan OLDIN olamiz,
    # o'chirishni esa save'dan KEYIN — save xato bersa eski rasm joyida qoladi.
    old_avatar_name = request.user.avatar.name if request.user.avatar else ''
    request.user.avatar = image
    request.user.save(update_fields=['avatar'])
    delete_replaced_image_file(request.user.avatar, old_avatar_name)
    return Response(UserSerializer(request.user, context={'request': request}).data)


def _filter_admin_users_by_search(qs, search):
    """`?search=` filtri — telefon yoki ism bo'yicha.

    Optimizatsiya: telefon raqamlari uchun `icontains` B-tree indeksdan
    foydalanmaydi (har qatorni to'liq skanerlash). Qidiruv matnida raqam ko'p
    bo'lsa, uni telefon deb hisoblab `normalized_phone__startswith` ishlatamiz
    — bu indeksli prefiks qidiruvi. Ism qidiruvi uchun `icontains` qoladi
    (aloxida trigram indeks pg_trgm talab qiladi — bu yerda qo'shilmaydi).

    Ro'yxat (`admin_users_list`) va CSV eksport (`admin_users_export`) bir xil
    natija berishi uchun ajratilgan: aks holda eksport admin ekranda ko'rgan
    to'plamdan boshqa qatorlarni chiqarib berardi.
    """
    if not search:
        return qs
    import re as _re

    digits = _re.sub(r'\D', '', search)
    # 3+ raqam va matnning ko'p qismi raqam bo'lsa — telefon qidiruvi.
    looks_like_phone = len(digits) >= 3 and len(digits) >= len(search.replace(' ', '')) - 2
    if not looks_like_phone:
        return qs.filter(full_name__icontains=search)
    norm = normalize_phone(search)
    if norm:
        # To'liq normalizatsiya bo'ldi (+<davlat kodi><raqam>) — aniq prefiks.
        return qs.filter(normalized_phone__startswith=norm)
    if search.lstrip().startswith('+'):
        # Xalqaro qisman raqam ('+' bilan boshlangan, lekin hali to'liq emas)
        # — kiritilgan raqamlar bo'yicha prefiks qidiruvi.
        return qs.filter(normalized_phone__startswith=f'+{digits}')
    # Qisman raqam, davlat kodisiz — orqaga moslik uchun O'zbekiston abonent
    # raqami deb prefiks qidiramiz.
    return qs.filter(normalized_phone__startswith=f'+998{digits[-9:]}')


@api_view(['GET'])
@permission_classes([IsPlatformAdmin])
def admin_users_list(request):
    """GET /api/admin/users/ — Platform Admin only.

    Returns every platform user with their roles_detail so the admin panel
    can render an authoritative table without falling back to mock data.
    Pagination majburiy: 10K+ foydalanuvchi bo'lsa to'liq ro'yxat 1+ MB
    response qaytarib brauzerni bog'lab qo'yardi.
    """
    from django.contrib.auth import get_user_model

    User = get_user_model()
    from django.db.models import Count, Prefetch, Q as DQ
    from centers.models import CenterMembership
    from billing.models import UserSubscription
    # N+1'ni oldini olamiz:
    #  - badges uchun har user'ga 2 ta TestAttempt count so'rovi o'rniga
    #    queryset darajasida annotate (UserSerializer.get_badges shularni o'qiydi);
    #  - roles_detail uchun har user'ga CenterMembership so'rovi o'rniga
    #    select_related('center') bilan prefetch.
    qs = (
        User.objects.all()
        # Platform adminlar statistikaga kirmasin: foydalanuvchilar soni,
        # faol/o'quvchilar hisobi va o'sish grafigi shu ro'yxatdan keladi.
        .exclude(is_platform_admin=True)
        .annotate(
            attempts_100_count=Count(
                'attempts',
                filter=DQ(attempts__score=100, attempts__disqualified=False),
                distinct=True,
            ),
            total_attempts_count=Count(
                'attempts',
                filter=DQ(attempts__disqualified=False),
                distinct=True,
            ),
        )
        .prefetch_related(
            Prefetch(
                'memberships',
                queryset=CenterMembership.objects.select_related('center').order_by('-created_at'),
            ),
            Prefetch(
                'subscriptions',
                queryset=UserSubscription.objects.filter(is_active=True).select_related('plan').order_by('-end_date'),
                to_attr='prefetched_active_subscriptions',
            ),
        )
        .order_by('-created_at')
    )
    # Optional search query: phone yoki ism bo'yicha (CSV eksport bilan
    # bo'lishilgan filtr).
    qs = _filter_admin_users_by_search(qs, request.query_params.get('search', '').strip())
    # O9: admin paneli uchun katta paginator — default 100 elem, ?page_size=
    # bilan max 200. Avval 50 limit bilan admin har sahifani alohida
    # varaqlardi va katta tashkilotlarda 1000+ foydalanuvchini ko'rish
    # noqulay edi.
    from olympy_api.pagination import LargePageNumberPagination
    paginator = LargePageNumberPagination()
    paginator.page_size = 100
    page = paginator.paginate_queryset(qs, request)
    if page is not None:
        return paginator.get_paginated_response(UserSerializer(page, many=True, context={'request': request}).data)
    return Response(UserSerializer(qs, many=True, context={'request': request}).data)


# CSV eksportning qator chegarasi. Filtr bo'sh bo'lsa so'rov butun jadvalni
# tortadi — o'n minglab foydalanuvchida bu bitta web worker'ni uzoq band qilib,
# javobni ham xotirada to'liq yig'ardi. 5000 qator qo'lda ishlash uchun yetarli
# (undan kattasi allaqachon tahlil vositasining ishi). Chegaradan oshsa javob
# `X-Export-Truncated: 1` sarlavhasi bilan keladi va panel adminni ogohlantiradi.
ADMIN_EXPORT_MAX_ROWS = 5000

ADMIN_EXPORT_HEADERS = [
    'ID', "To'liq ism", 'Telefon', 'Rollar', 'Holat', 'Premium', "Ro'yxatdan o'tgan",
]


def _csv_text(value):
    """Excel formula injection himoyasi.

    `full_name` foydalanuvchining o'zi yozadigan matn: `=`/`+`/`-`/`@` bilan
    boshlansa Excel uni FORMULA deb hisoblaydi va admin faylni ochganda
    bajarishga urinadi. Bir tirnoq qo'shilsa Excel qiymatni matn sifatida
    ko'rsatadi (ekranda tirnoq ko'rinmaydi).
    """
    text = str(value or '')
    return f"'{text}" if text[:1] in ('=', '+', '-', '@') else text


@api_view(['GET'])
@permission_classes([IsPlatformAdmin])
def admin_users_export(request):
    """GET /api/admin/users/export/ — filtrlangan ro'yxatni CSV qilib beradi.

    Faqat Platform Admin uchun. `admin_users_list` bilan BIR XIL filtr
    (`?search=`) va bir xil tartib — admin ekranda ko'rgan to'plamni yuklab
    oladi. Ustunlar: ID, ism, telefon, rollar, holat, premium, ro'yxatdan
    o'tgan sana.

    Paginatsiya yo'q (fayl yaxlit bo'lishi kerak), o'rniga
    `ADMIN_EXPORT_MAX_ROWS` chegarasi bor.
    """
    import csv

    from django.contrib.auth import get_user_model
    from django.http import HttpResponse

    User = get_user_model()
    qs = _filter_admin_users_by_search(
        # `admin_users_list` bilan bir xil asos: platforma adminlari ro'yxatga
        # ham, eksportga ham kirmaydi.
        User.objects.exclude(is_platform_admin=True).order_by('-created_at'),
        request.query_params.get('search', '').strip(),
    ).only(
        'id', 'full_name', 'normalized_phone', 'roles',
        'is_active', 'is_premium', 'created_at',
    )
    # Chegaradan bitta ko'p o'qiymiz — qo'shimcha COUNT so'rovisiz kesilganini
    # bilish uchun.
    rows = list(qs[:ADMIN_EXPORT_MAX_ROWS + 1])
    truncated = len(rows) > ADMIN_EXPORT_MAX_ROWS
    rows = rows[:ADMIN_EXPORT_MAX_ROWS]

    response = HttpResponse(content_type='text/csv; charset=utf-8')
    response['Content-Disposition'] = (
        f'attachment; filename="olympy-foydalanuvchilar-{timezone.now():%Y-%m-%d}.csv"'
    )
    if truncated:
        response['X-Export-Truncated'] = '1'
    # UTF-8 BOM — Excel CSV'ni avtomatik UTF-8 sifatida tan oladi
    # (olympiads/views.py dagi eksport bilan bir xil naqsh).
    response.write('﻿')
    writer = csv.writer(response)
    writer.writerow(ADMIN_EXPORT_HEADERS)
    for u in rows:
        writer.writerow([
            u.id,
            _csv_text(u.full_name),
            # Raqam maskalanmaydi: eksport faqat platforma admini uchun va
            # aynan bog'lanish ma'lumoti sifatida kerak (audit jurnalidan
            # farqli — u uzoq saqlanadi, shu sababli u yerda maskalangan).
            _csv_text(u.normalized_phone),
            ', '.join(u.roles or []),
            'Faol' if u.is_active else 'Bloklangan',
            'Ha' if u.is_premium else "Yo'q",
            timezone.localtime(u.created_at).strftime('%Y-%m-%d') if u.created_at else '',
        ])
    return response


@api_view(['GET'])
@permission_classes([IsPlatformAdmin])
def admin_user_detail(request, user_id):
    """GET /api/admin/users/{id}/ — bitta foydalanuvchining to'liq profili.

    Admin panelidagi "Batafsil" oynasi uchun: ro'yxat qatori faqat qisqacha
    ma'lumot beradi (ism/telefon/rol/holat), bu yerda esa UserSerializer'ning
    to'liq to'plami (rollar detali, ro'yxatdan o'tgan sana, is_active,
    is_premium/is_premium_active, joriy tarif) yangi holatda keladi.

    Blok sababi va muddati ATAYLAB `UserSerializer` ga qo'shilmagan: o'sha
    serializer markaz egasi/menejerga qaytariladigan a'zo javoblarida ham
    ishlatiladi (centers/views.py) va platforma admini yozgan izoh u yerga
    chiqib ketmasligi kerak. Shu sababli maydonlar faqat shu admin
    endpoint'ida javobga qo'shiladi.
    """
    from django.contrib.auth import get_user_model
    from django.db.models import Prefetch
    from centers.models import CenterMembership

    User = get_user_model()
    target = (
        User.objects
        .prefetch_related(
            Prefetch(
                'memberships',
                queryset=CenterMembership.objects.select_related('center').order_by('-created_at'),
            ),
        )
        .filter(pk=user_id)
        .first()
    )
    if not target:
        return Response({'detail': 'Foydalanuvchi topilmadi'},
                        status=status.HTTP_404_NOT_FOUND)
    data = UserSerializer(target, context={'request': request}).data
    data['block_reason'] = target.block_reason or None
    data['blocked_until'] = target.blocked_until.isoformat() if target.blocked_until else None
    return Response(data)


@api_view(['GET'])
@permission_classes([IsPlatformAdmin])
def admin_user_login_history(request, user_id):
    """GET /api/admin/users/{id}/login-history/ — oxirgi 20 ta kirish.

    "Batafsil" oynasidagi "Kirish tarixi" bloki uchun. LoginEvent faqat shu
    funksiya ishga tushirilgandan KEYINGI kirishlarni qamraydi — eskilarini
    tiklab bo'lmaydi (ma'lumot umuman saqlanmagan), shuning uchun bo'sh
    ro'yxat normal holat va UI'da "hali ma'lumot yo'q" deb ko'rsatiladi.

    Sahifalash yo'q: 20 ta oxirgi yozuv "kim, qachon, qayerdan kirdi"
    savoliga javob berish uchun yetarli. Chuqurroq tekshiruv kerak bo'lsa
    LoginEvent jadvalidan to'g'ridan-to'g'ri o'qiladi.

    `user_id` javobda qaytariladi — panel ochiq modal qaysi foydalanuvchiga
    tegishli ekanini tekshiradi (ketma-ket ochilgan oynalarda eski javob
    ko'rinib qolmasin).
    """
    from django.contrib.auth import get_user_model

    User = get_user_model()
    if not User.objects.filter(pk=user_id).exists():
        return Response({'detail': 'Foydalanuvchi topilmadi'},
                        status=status.HTTP_404_NOT_FOUND)
    events = LoginEvent.objects.filter(user_id=user_id).order_by('-created_at')[:20]
    return Response({
        'user_id': int(user_id),
        'events': [{
            'id': e.id,
            'ip': e.ip_address,
            'user_agent': e.user_agent,
            'created_at': e.created_at.isoformat(),
        } for e in events],
    })


# "Batafsil" oynasidagi kontent bloklarining qator chegarasi.
# `admin_user_login_history` dagi 20 bilan bir xil sabab: bu ko'rinish
# "hisob nima yaratgan va nima topshirgan" savoliga javob berish uchun, to'liq
# katalog emas. Butun ro'yxat kerak bo'lsa markaz paneli (savol banki,
# olimpiadalar ro'yxati) ochiladi.
ADMIN_CONTENT_HISTORY_LIMIT = 20


@api_view(['GET'])
@permission_classes([IsPlatformAdmin])
def admin_user_content_history(request, user_id):
    """GET /api/admin/users/{id}/content-history/ — hisobning kontent tarixi.

    "Batafsil" oynasidagi "Kontent va faollik" bloki uchun: shikoyat kelgan
    hisob nima YARATGANI (savollar, olimpiadalar) va nima TOPSHIRGANI (test
    urinishlari) bir joyda ko'rinadi. Avval admin bu savolga faqat markaz
    panelini qo'lda ochib javob topardi. Shu ro'yxatdan bitta element hisobga
    tegmasdan o'chiriladi (`admin_delete_user_content`).

    Har blok oxirgi `ADMIN_CONTENT_HISTORY_LIMIT` ta yozuv bilan cheklangan
    (sahifalash yo'q — `admin_user_login_history` dagi bilan bir xil sabab),
    lekin `totals` HAQIQIY umumiy sonni beradi: kesilgan ro'yxat adminga "bor
    yo'g'i shuncha" degan noto'g'ri taassurot qoldirmasin.

    Arxivlangan savol va soft-delete qilingan olimpiada ro'yxatdan
    CHIQARILMAYDI: admin ularga allaqachon chora ko'rilganini bilishi kerak
    (aks holda "o'chirdimmi yoki yo'qmi" savoli har safar qaytadi) — holat
    `is_active` / `is_deleted` bayroqlari bilan uzatiladi.

    `user_id` javobda qaytariladi — ketma-ket ochilgan oynalarda eski javob
    ko'rinib qolmasin (boshqa "Batafsil" endpointlari bilan bir xil).
    """
    from django.contrib.auth import get_user_model
    from attempts.models import TestAttempt
    from olympiads.models import Olympiad
    from questions.models import Question

    User = get_user_model()
    if not User.objects.filter(pk=user_id).exists():
        return Response({'detail': 'Foydalanuvchi topilmadi'},
                        status=status.HTTP_404_NOT_FOUND)

    questions = (
        Question.objects
        .filter(created_by_id=user_id)
        .select_related('center')
        .order_by('-created_at')
    )
    olympiads = (
        Olympiad.objects
        .filter(created_by_id=user_id)
        .select_related('center')
        .order_by('-created_at')
    )
    attempts = (
        TestAttempt.objects
        .filter(user_id=user_id)
        .select_related('olympiad')
        .order_by('-submitted_at')
    )
    limit = ADMIN_CONTENT_HISTORY_LIMIT
    return Response({
        'user_id': int(user_id),
        'totals': {
            'questions': questions.count(),
            'olympiads': olympiads.count(),
            'attempts': attempts.count(),
        },
        'questions': [{
            'id': q.id,
            # Savol matni juda uzun bo'lishi mumkin — ro'yxat qatoriga
            # sig'adigan qismini yuboramiz (to'liq matn savol bankida).
            'text': q.text[:160],
            'subject': q.subject,
            'center_name': q.center.name,
            'source': q.source,
            'is_active': q.is_active,
            'created_at': q.created_at.isoformat(),
        } for q in questions[:limit]],
        'olympiads': [{
            'id': o.id,
            'title': o.title,
            'subject': o.subject,
            'center_name': o.center.name,
            'status': o.status,
            'is_deleted': o.is_deleted,
            'created_at': o.created_at.isoformat(),
        } for o in olympiads[:limit]],
        'attempts': [{
            'id': a.id,
            'olympiad_title': a.olympiad.title,
            'score': a.score,
            'disqualified': a.disqualified,
            'submitted_at': a.submitted_at.isoformat(),
        } for a in attempts[:limit]],
    })


# `admin_delete_user_content` qabul qiladigan kontent turlari — aynan
# `admin_user_content_history` yaratilgan kontent sifatida qaytaradigan ikkita
# blok. Urinishlar (`attempts`) ATAYLAB yo'q: ular foydalanuvchi YARATGAN
# kontent emas, balki baholash natijasi — ularni o'chirish leaderboard va
# sertifikatlarni buzadi (hisoblarni birlashtirishdagi bilan bir xil qoida).
ADMIN_CONTENT_TYPES = ('question', 'olympiad')


@api_view(['DELETE'])
@permission_classes([IsPlatformAdmin])
def admin_delete_user_content(request, user_id, content_type, content_id):
    """DELETE /api/admin/users/{id}/content/{type}/{content_id}/ — bitta element.

    `type` — `ADMIN_CONTENT_TYPES` dan biri. Hisobga UMUMAN tegilmaydi:
    bloklash, seanslar, rollar va premium o'zgarmaydi. Bu chora sifatsiz yoki
    nomaqbul kontentni hisobni yopmasdan olib tashlash uchun — shikoyat kelgan
    bitta savol butun o'qituvchi hisobini bloklashga arzimaydi.

    Element AYNAN shu foydalanuvchi yaratgan bo'lishi shart (`created_by`),
    aks holda 404. URL'da `user_id` shuning uchun bor: admin "Batafsil"
    oynasida KO'RGAN qatorni o'chiradi va tasodifiy ID bilan boshqa markazning
    kontentiga tegib ketmaydi.

    O'chirish qoidasi kontent turining O'Z qoidasi bilan bir xil — admin yo'li
    markaz xodimining yo'lidan boshqacha natija bermasligi kerak:
      * savol foydalanishda bo'lsa (faol/tugagan olimpiadada, kod yuborish
        yoki essay bahosi bor) o'chirilmaydi, ARXIVLANADI
        (`questions.views.question_detail` bilan bir xil tekshiruv);
      * olimpiada har doim soft-delete (`is_deleted=True`,
        `olympiads.views.olympiad_detail` dagidek), faol tadbir esa umuman
        rad etiladi — o'quvchilar hozir topshirayotgan imtihonni olib qo'yish
        ularning ishini yo'qotadi.

    Javobdagi `archived` — QATOR SAQLANDIMI degani: savol arxivlangan yoki
    olimpiada soft-delete bo'lgan bo'lsa `true`, faqat foydalanishda bo'lmagan
    savol o'chirilganda `false` (yagona hard-delete yo'li).
    """
    from django.contrib.auth import get_user_model

    User = get_user_model()
    owner = User.objects.filter(pk=user_id).first()
    if not owner:
        return Response({'detail': 'Foydalanuvchi topilmadi'},
                        status=status.HTTP_404_NOT_FOUND)
    if content_type not in ADMIN_CONTENT_TYPES:
        return Response({'detail': "Kontent turi noto'g'ri (savol yoki olimpiada)"},
                        status=status.HTTP_400_BAD_REQUEST)

    if content_type == 'question':
        from questions.models import Question
        # Qoida ikki joyda takrorlanmasin: himoyalanganlik tekshiruvi savol
        # o'chirish yo'lining o'z moduldagi manbasidan olinadi (aylanma
        # importni oldini olish uchun funksiya ichida).
        from questions.views import _question_is_protected

        item = Question.objects.filter(pk=content_id, created_by_id=owner.id).first()
        if not item:
            return Response({'detail': 'Savol topilmadi'},
                            status=status.HTTP_404_NOT_FOUND)
        archived = _question_is_protected(item)
        detail = (
            "Savol foydalanishda bo'lgani uchun o'chirilmadi, balki arxivlandi: "
            "u savol bankidan olib tashlandi, lekin mavjud natijalar va baholar "
            "uchun saqlab qolindi."
            if archived else "Savol o'chirildi"
        )
    else:
        from olympiads.models import Olympiad

        item = Olympiad.objects.filter(pk=content_id, created_by_id=owner.id).first()
        if not item:
            return Response({'detail': 'Olimpiada topilmadi'},
                            status=status.HTTP_404_NOT_FOUND)
        if item.status == Olympiad.STATUS_ACTIVE:
            return Response(
                {'detail': "Faol tadbirni o'chirish mumkin emas. Avval uni nofaol qiling."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Olimpiada hech qachon hard-delete qilinmaydi — natijalar unga
        # bog'langan holda qoladi.
        archived = True
        detail = "Olimpiada o'chirildi"

    # Audit yozuvi amaldan OLDIN: savol hard-delete bo'lsa keyin `pk` yo'qoladi
    # va `extra` da id qolmasdi. Yozuv KONTENT EGASIGA bog'lanadi — "Amallar
    # tarixi" foydalanuvchi bo'yicha qidiriladi.
    AuditLog.log(request, 'admin_content_delete', target=owner, extra={
        'content_type': content_type,
        'content_id': int(content_id),
        'center_id': item.center_id,
        'archived': archived,
    })
    if not archived:
        item.delete()
    elif content_type == 'question':
        item.is_active = False
        item.save(update_fields=['is_active'])
    else:
        item.is_deleted = True
        item.save(update_fields=['is_deleted'])

    return Response({
        'content_type': content_type,
        'content_id': int(content_id),
        'archived': archived,
        'detail': detail,
    })


@api_view(['POST'])
@permission_classes([IsPlatformAdmin])
def admin_warn_user(request, user_id):
    """POST /api/admin/users/{id}/warn/ — rasmiy ogohlantirish yuborish.

    Body: {"reason": "...", "message": "..."}. Bu bloklashdan OLDINGI qadam:
    hisob holati (`is_active`, `token_version`, `blocked_until`) umuman
    o'zgarmaydi — foydalanuvchi faqat xabarnoma oladi va xatosini o'zi
    tuzatish imkoniyatini topadi. Avval admin qo'lida faqat blok bor edi va
    kichik qoidabuzarlik ham hisobni yopishga olib kelardi.

    `reason` — ICHKI izoh: faqat audit jurnaliga tushadi, foydalanuvchi uni
    ko'rmaydi. `message` — foydalanuvchi o'qiydigan matn (xabarnoma tanasi).
    Ikkalasi ham majburiy: sababsiz ogohlantirish keyingi blok qaroriga asos
    bo'la olmaydi, matnsizi esa foydalanuvchiga hech narsa tushuntirmaydi.
    """
    from django.contrib.auth import get_user_model
    from notifications.models import Notification

    User = get_user_model()
    target = User.objects.filter(pk=user_id).first()
    if not target:
        return Response({'detail': 'Foydalanuvchi topilmadi'},
                        status=status.HTTP_404_NOT_FOUND)
    reason = str(request.data.get('reason') or '').strip()
    if not reason:
        return Response({'detail': 'Ogohlantirish sababini kiriting'},
                        status=status.HTTP_400_BAD_REQUEST)
    message = str(request.data.get('message') or '').strip()
    if not message:
        return Response({'detail': "Foydalanuvchiga yuboriladigan matnni kiriting"},
                        status=status.HTTP_400_BAD_REQUEST)

    warning = Notification.objects.create(
        user=target,
        # `center` ixtiyoriy va ATAYLAB bo'sh: ogohlantirishni platforma
        # admini yuboradi, u hech qaysi markaz nomidan chiqmaydi.
        center=None,
        type=Notification.TYPE_ACCOUNT_WARNING,
        title='Ogohlantirish',
        message=message,
    )
    AuditLog.log(request, 'admin_user_warn', target=target, extra={
        'phone': mask_phone(target.normalized_phone),
        'reason': reason,
        'message': message,
    })
    return Response({
        'id': warning.id,
        'created_at': warning.created_at.isoformat(),
    }, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsPlatformAdmin])
def admin_user_warnings(request, user_id):
    """GET /api/admin/users/{id}/warnings/ — yuborilgan ogohlantirishlar.

    "Batafsil" oynasidagi "Ogohlantirishlar tarixi" bloki uchun: bloklash
    qarorini qabul qilishdan oldin admin bu foydalanuvchi avval necha marta
    va nima uchun ogohlantirilganini ko'rishi kerak.

    Sabab (`reason`) bu yerda QAYTARILMAYDI — u ichki izoh bo'lib faqat audit
    jurnalida qoladi; bu ro'yxat foydalanuvchiga yuborilgan matnning o'zini
    ko'rsatadi. `is_read` esa xabar o'qilganini bildiradi (ogohlantirish
    yetib bormagan bo'lsa, blok o'rniga yana bir marta yozish mumkin).

    `user_id` javobda qaytariladi — `admin_user_login_history` bilan bir xil
    sabab: ketma-ket ochilgan oynalarda eski javob ko'rinib qolmasin.
    """
    from django.contrib.auth import get_user_model
    from notifications.models import Notification

    User = get_user_model()
    if not User.objects.filter(pk=user_id).exists():
        return Response({'detail': 'Foydalanuvchi topilmadi'},
                        status=status.HTTP_404_NOT_FOUND)
    warnings = (
        Notification.objects
        .filter(user_id=user_id, type=Notification.TYPE_ACCOUNT_WARNING)
        .order_by('-created_at')[:50]
    )
    return Response({
        'user_id': int(user_id),
        'warnings': [{
            'id': w.id,
            'title': w.title,
            'message': w.message,
            'is_read': w.is_read,
            'created_at': w.created_at.isoformat(),
        } for w in warnings],
    })


@api_view(['GET'])
@permission_classes([IsPlatformAdmin])
def admin_user_sessions(request, user_id):
    """GET /api/admin/users/{id}/sessions/ — foydalanuvchining seanslari.

    "Batafsil" oynasidagi "Faol seanslar" bloki uchun. "Kirish tarixi" dan
    farqi shundaki, u O'TMISHNI ko'rsatadi (har bir kirish hodisasi), bu esa
    HOZIRGI holatni: qaysi qurilma hozir ham hisobga kira oladi. Shu sababli
    har bir qatorda "Yakunlash" tugmasi mumkin bo'ladi
    (`admin_force_logout_session`).

    `jti` bo'sh yozuvlar ATAYLAB tushib qoladi: bu maydon qo'shilishidan
    oldingi kirishlar uchun refresh tokenni topib bo'lmaydi, ya'ni ularni
    alohida yakunlash imkoni yo'q — "faol" deb ko'rsatish esa admin bosa
    olmaydigan tugmani va'da qilardi.

    Seans FAOL deb hisoblanadi, agar shu `jti` uchun OutstandingToken bor
    bo'lsa, muddati o'tmagan bo'lsa VA blacklistda bo'lmasa. Ikkala jadval
    ham BITTA so'rovda o'qiladi va Python tomonda birlashtiriladi — qator
    boshiga so'rov (N+1) yo'q.

    `user_id` javobda qaytariladi — `admin_user_login_history` bilan bir xil
    sabab: ketma-ket ochilgan oynalarda eski javob ko'rinib qolmasin.
    """
    from django.contrib.auth import get_user_model
    from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

    User = get_user_model()
    if not User.objects.filter(pk=user_id).exists():
        return Response({'detail': 'Foydalanuvchi topilmadi'},
                        status=status.HTTP_404_NOT_FOUND)
    events = list(
        LoginEvent.objects
        .filter(user_id=user_id)
        .exclude(jti='')
        .order_by('-created_at')[:50]
    )
    jtis = [e.jti for e in events]
    # `OutstandingToken.jti` unikal — dict xavfsiz.
    expires_by_jti = dict(
        OutstandingToken.objects.filter(jti__in=jtis).values_list('jti', 'expires_at')
    )
    blacklisted_jtis = set(
        BlacklistedToken.objects
        .filter(token__jti__in=jtis)
        .values_list('token__jti', flat=True)
    )
    now = timezone.now()
    return Response({
        'user_id': int(user_id),
        'sessions': [{
            'login_event_id': e.id,
            'ip_address': e.ip_address,
            'user_agent': e.user_agent,
            'created_at': e.created_at.isoformat(),
            'is_active': (
                e.jti in expires_by_jti
                and expires_by_jti[e.jti] > now
                and e.jti not in blacklisted_jtis
            ),
            # Token topilmasa (muddati o'tib tozalangan) — muddat ham noma'lum.
            'expires_at': (
                expires_by_jti[e.jti].isoformat() if e.jti in expires_by_jti else None
            ),
        } for e in events],
    })


@api_view(['POST'])
@permission_classes([IsPlatformAdmin])
def admin_force_logout_session(request, user_id, login_event_id):
    """POST /api/admin/users/{id}/sessions/{login_event_id}/force-logout/

    BITTA seansni yakunlaydi. `admin_force_logout_user` dan farqi: u
    `token_version` ni oshirib BARCHA qurilmalarni bir yo'la chiqaradi, bu
    esa faqat shu kirishda berilgan refresh tokenni blacklistga qo'shadi —
    qolgan qurilmalar ishlashda davom etadi. Tipik holat: foydalanuvchi
    begona qurilmada ochiq qolgan seansni ko'rsatadi, lekin o'z telefonidan
    chiqib qolishni xohlamaydi.

    Blacklist yozuvi to'g'ridan-to'g'ri OutstandingToken ustidan yaratiladi:
    `logout` dagidek `RefreshToken(...)` orqali qilib bo'lmaydi, chunki admin
    qo'lida token satrining o'zi yo'q (va hech qachon bo'lmasligi ham kerak)
    — faqat `LoginEvent.jti` bor.

    KELISHILGAN CHEGARA — mahsulot bilan tasdiqlangan, tuzatilishi kerak
    bo'lgan xato EMAS: blacklist refresh tokenni bekor qiladi, ya'ni bu seans
    boshqa YANGI access token ola olmaydi. Lekin allaqachon berilgan JORIY
    access token o'z muddati tugagunicha ishlayveradi — SIMPLE_JWT
    ['ACCESS_TOKEN_LIFETIME'] = 30 daqiqa, ya'ni chiqarish eng ko'pi 30
    daqiqagacha kechikishi mumkin. Sababi: har bir so'rovdagi tekshiruv
    global `token_version` da'vosiga qaraydi, seans-ma-seans blacklist
    holatiga emas (aks holda har bir so'rov qo'shimcha DB o'qishini talab
    qilardi). Zudlik bilan uzish kerak bo'lsa "Barcha qurilmalardan
    chiqarish" ishlatiladi.
    """
    from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

    # `user_id` ham shartda: boshqa foydalanuvchining seans ID'si tasodifan
    # (yoki ataylab) yuborilsa 404 qaytadi, begona seans yakunlanib ketmaydi.
    login_event = (
        LoginEvent.objects
        .select_related('user')  # audit yozuvi uchun — alohida so'rovsiz
        .filter(pk=login_event_id, user_id=user_id)
        .first()
    )
    if not login_event:
        return Response({'detail': 'Seans topilmadi'},
                        status=status.HTTP_404_NOT_FOUND)
    if not login_event.jti:
        return Response(
            {'detail': "Bu seans eski, alohida yakunlab bo'lmaydi — "
                       "'Barcha qurilmalardan chiqarish' funksiyasidan foydalaning"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    outstanding = OutstandingToken.objects.filter(jti=login_event.jti).first()
    if not outstanding:
        # Muddati o'tgan yoki `flushexpiredtokens` bilan tozalangan: bekor
        # qilinadigan narsa qolmagan. Jimgina "muvaffaqiyat" qaytarish
        # adminni chalg'itardi ("yakunladim" deb o'ylardi) — aniq aytamiz.
        return Response({'detail': "Bu seans allaqachon tugagan — bekor qilinadigan token yo'q"},
                        status=status.HTTP_400_BAD_REQUEST)

    BlacklistedToken.objects.get_or_create(token=outstanding)
    AuditLog.log(request, 'admin_force_logout_session', target=login_event.user, extra={
        'login_event_id': login_event.id,
        'ip_address': login_event.ip_address,
    })
    return Response({'login_event_id': login_event.id, 'is_active': False})


# Blok muddati uchun ruxsat etilgan variantlar (kun). Admin panelidagi
# tugmalar bilan bir xil — `admin_toggle_user_premium` dagi qat'iy ro'yxat
# naqshi: ixtiyoriy son qabul qilinsa, terish xatosi (masalan 3650) sezilmay
# o'tib ketardi. Muddat berilmasa blok doimiy bo'ladi.
BLOCK_DURATION_DAYS = (1, 7, 14, 30)


def _parse_suspension_payload(data):
    """Bloklash/ochish tanasini tekshiradi.

    Qaytaradi: `(is_active, reason, blocked_until, error)`. `error` None
    bo'lmasa qolgan qiymatlar ma'nosiz. Bitta va ommaviy endpointlar bir xil
    qoidalarga bo'ysunishi uchun ajratildi (majburiy sabab, faqat ruxsat
    etilgan muddat).
    """
    desired = data.get('is_active')
    if not isinstance(desired, bool):
        return None, '', None, "is_active bool bo'lishi kerak"
    if desired:
        # Blok ochildi — sabab va muddat endi ma'nosiz, tozalaymiz (aks holda
        # keyingi safar "Batafsil" oynasida eski sabab ko'rinib qolardi).
        return True, '', None, None
    reason = str(data.get('reason') or '').strip()
    if not reason:
        return None, '', None, 'Bloklash sababini kiriting'
    duration_days = data.get('duration_days')
    blocked_until = None
    if duration_days not in (None, ''):
        try:
            days = int(duration_days)
        except (TypeError, ValueError):
            days = None
        if days not in BLOCK_DURATION_DAYS:
            return None, '', None, "Blok muddati noto'g'ri (faqat 1, 7, 14 yoki 30 kun)"
        blocked_until = timezone.now() + timedelta(days=days)
    # max_length=255 — uzun matn DB darajasida xato bermasin.
    return False, reason[:255], blocked_until, None


def _apply_suspension(request, target, is_active, reason, blocked_until, bulk=False):
    """Blok holatini yozadi, seanslarni bekor qiladi va jurnalga tushiradi."""
    target.block_reason = reason
    target.blocked_until = blocked_until
    target.is_active = is_active
    # Bloklash ham, qayta tiklash ham mavjud JWT tokenlarni darhol
    # bekor qiladi. Block paytida bu majburiy (bloklangan user eski token
    # bilan kirmasin), unblock paytida ham xavfsizlik nuqtai nazaridan
    # foydali — admin to'g'irlash uchun bloklab keyin tiklagan bo'lsa,
    # avvalgi tokenlar qayta ishlashi kerak emas.
    target.token_version = (target.token_version or 0) + 1
    target.save(update_fields=[
        'is_active', 'token_version', 'block_reason', 'blocked_until',
    ])
    extra = {
        'is_active': is_active,
        'phone': mask_phone(target.normalized_phone),
        # Blokni ochishda ikkalasi ham None — jurnalda "doimiy blok" va
        # "blok ochildi" yozuvlari bir xil ko'rinmasligi uchun `is_active`
        # bilan birga o'qiladi.
        'reason': target.block_reason or None,
        'blocked_until': target.blocked_until.isoformat() if target.blocked_until else None,
    }
    if bulk:
        # Ommaviy amal ham HAR BIR foydalanuvchi uchun alohida yozuv qoldiradi
        # (jurnal per-user granular bo'lib qolsin — "Amallar tarixi" target
        # bo'yicha qidiriladi). `bulk` faqat kelib chiqishini belgilaydi.
        extra['bulk'] = True
    AuditLog.log(request, 'user_block', target=target, extra=extra)


@api_view(['POST'])
@permission_classes([IsPlatformAdmin])
def admin_set_user_active(request, user_id):
    """POST /api/admin/users/{id}/set-active/ — block or unblock a user.

    Body: {"is_active": true|false, "reason": "...", "duration_days": 1|7|14|30}.
    Platform Admin only. Cannot disable yourself or another platform admin
    (defensive).

    Bloklashda `reason` MAJBURIY: sabab foydalanuvchi bilan ishlashda ham
    (nega bloklangan degan savolga javob), blokni ochish qarorida ham kerak.
    `duration_days` ixtiyoriy — berilmasa (yoki null) blok doimiy, berilsa
    o'sha muddatdan keyin blok o'z-o'zidan ochiladi
    (`User.release_expired_suspension`: login paytida lazy, va kunlik
    `accounts.expire_stale_suspensions` task orqali). Blokni ochishda sabab
    ham, muddat ham tozalanadi.
    """
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
    desired, reason, blocked_until, error = _parse_suspension_payload(request.data)
    if error:
        return Response({'detail': error}, status=status.HTTP_400_BAD_REQUEST)

    _apply_suspension(request, target, desired, reason, blocked_until)
    return Response(UserSerializer(target, context={'request': request}).data)


# Bitta ommaviy so'rovdagi maksimal foydalanuvchi soni. Har bir id alohida
# UPDATE + AuditLog yozuvidan o'tadi, shu sababli cheksiz ro'yxat bitta
# so'rovni daqiqalarga cho'zib yuborardi. 200 — admin ro'yxatining maksimal
# sahifa hajmi (`LargePageNumberPagination`), ya'ni admin bir ekranda ko'rgan
# qatorlarni bir yo'la qamrab oladi.
BULK_ACTION_MAX_USERS = 200


def _parse_bulk_user_ids(raw):
    """`user_ids` ni tekshiradi. Qaytaradi: `(ids, error)` (takrorlarsiz)."""
    if not isinstance(raw, list) or not raw:
        return None, "user_ids bo'sh bo'lmagan ro'yxat bo'lishi kerak"
    ids = []
    for value in raw:
        try:
            uid = int(value)
        except (TypeError, ValueError):
            return None, "user_ids faqat sonlardan iborat bo'lishi kerak"
        if uid not in ids:
            ids.append(uid)
    if len(ids) > BULK_ACTION_MAX_USERS:
        return None, (
            f"Bir vaqtda {BULK_ACTION_MAX_USERS} tadan ko'p foydalanuvchini "
            "tanlab bo'lmaydi"
        )
    return ids, None


def _resolve_bulk_targets(request, ids):
    """id'larni foydalanuvchilarga aylantiradi. Qaytaradi: `(targets, failed)`.

    Himoyalar bitta foydalanuvchilik endpointlar bilan bir xil: o'zini ham,
    boshqa platforma adminini ham ommaviy amal chetlab o'tadi (admin tanlovga
    tasodifan tushib qolsa butun hisob o'zgarib ketmasin). Farqi shundaki bu
    yerda butun so'rov 400 bilan qulamaydi — mos kelmagan id `failed`
    ro'yxatiga tushadi, qolganlari bajariladi.
    """
    from django.contrib.auth import get_user_model

    User = get_user_model()
    found = {u.id: u for u in User.objects.filter(pk__in=ids)}
    targets, failed = [], []
    for uid in ids:
        target = found.get(uid)
        if target is None:
            failed.append({'id': uid, 'reason': 'Foydalanuvchi topilmadi'})
        elif target.id == request.user.id:
            failed.append({'id': uid, 'reason': "O'zingizga qo'llab bo'lmaydi"})
        elif target.is_platform_admin:
            failed.append({'id': uid, 'reason': "Admin hisobiga qo'llab bo'lmaydi"})
        else:
            targets.append(target)
    return targets, failed


@api_view(['POST'])
@permission_classes([IsPlatformAdmin])
def admin_bulk_set_user_active(request):
    """POST /api/admin/users/bulk-set-active/ — bir nechta hisobni bloklash/ochish.

    Body: {"user_ids": [...], "is_active": true|false, "reason": "...",
    "duration_days": 1|7|14|30}. Sabab/muddat qoidalari bitta foydalanuvchilik
    `admin_set_user_active` bilan bir xil (`_parse_suspension_payload`).

    Javob: {"succeeded": [id, ...], "failed": [{"id": .., "reason": ".."}]}.
    Qisman muvaffaqiyat NORMAL holat — tanlovga admin hisobi yoki o'chirilgan
    id tushib qolsa qolgan foydalanuvchilar baribir qayta ishlanadi, panel esa
    nima o'tkazib yuborilganini ko'rsatadi.
    """
    ids, error = _parse_bulk_user_ids(request.data.get('user_ids'))
    if error:
        return Response({'detail': error}, status=status.HTTP_400_BAD_REQUEST)
    desired, reason, blocked_until, error = _parse_suspension_payload(request.data)
    if error:
        return Response({'detail': error}, status=status.HTTP_400_BAD_REQUEST)

    targets, failed = _resolve_bulk_targets(request, ids)
    succeeded = []
    for target in targets:
        _apply_suspension(request, target, desired, reason, blocked_until, bulk=True)
        succeeded.append(target.id)
    return Response({'succeeded': succeeded, 'failed': failed})


@api_view(['POST'])
@permission_classes([IsPlatformAdmin])
def admin_delete_user(request, user_id):
    """POST /api/admin/users/{id}/delete/ — hisobni admin nomidan o'chirish.

    Body: {"reason": "..."} — ixtiyoriy ICHKI izoh, faqat audit jurnaliga
    tushadi (foydalanuvchi uni ko'rmaydi, `admin_warn_user` dagi `reason`
    bilan bir xil ma'no).

    Bu `delete_my_account` ning admin yo'li: telefonini yoki parolini
    yo'qotgan foydalanuvchi hisobini o'zi o'chira olmaydi va support'ga
    murojaat qiladi. Parol/2FA so'ralmaydi — bu yerda admin huquqining o'zi
    hujjat (`IsPlatformAdmin`), foydalanuvchining maxfiy ma'lumoti esa
    adminda umuman yo'q.

    Bloklashning O'RNINI BOSMAYDI: qoidabuzar hisob uchun `set-active`
    (sababli, muddatli blok) qoladi. Farqi shundaki o'chirilgan hisob grace
    muddati (`ACCOUNT_DELETE_GRACE_DAYS`, default 30 kun) tugagach Celery
    tomonidan butunlay yo'q qilinadi va shu muddat ichida foydalanuvchining
    O'ZI telefon va parol bilan tiklab olishi mumkin
    (`restore_my_account`) — ya'ni bu quvib chiqarish emas, "hisobimni
    yoping" so'roviga javob.

    Cheklovlar boshqa admin amallari bilan bir xil:
      * o'zini o'chirish yo'q (`admin_set_user_active` dagidek),
      * boshqa platforma adminini o'chirish yo'q — admin qatlamini bir-biriga
        ochib qo'ymaslik uchun,
      * allaqachon o'chirilgan hisob 400 qaytaradi: aks holda takroriy so'rov
        grace soatini jimgina qaytadan boshlab yuborardi,
      * markaz egasini o'chirish yo'q (`delete_my_account` dagi bilan bir xil
        409) — `EducationCenter.owner` PROTECT va markaz egasiz qolmasligi
        kerak, avval egalik boshqa hisobga o'tkaziladi.

    Soft-delete: `is_active=False` + `deleted_at` + `token_version` oshadi —
    barcha qurilmalardagi JWT'lar `admin_force_logout_user` dagidek darhol
    bekor bo'ladi. Hech qanday qator O'CHIRILMAYDI (urinishlar, to'lovlar,
    audit izi joyida qoladi).
    """
    from django.contrib.auth import get_user_model
    from centers.models import EducationCenter

    User = get_user_model()
    target = User.objects.filter(pk=user_id).first()
    if not target:
        return Response({'detail': 'Foydalanuvchi topilmadi'},
                        status=status.HTTP_404_NOT_FOUND)
    if target.id == request.user.id:
        return Response({'detail': "O'z hisobingizni bu yerdan o'chirib bo'lmaydi"},
                        status=status.HTTP_400_BAD_REQUEST)
    if target.is_platform_admin:
        return Response({'detail': "Boshqa adminning hisobini o'chirib bo'lmaydi"},
                        status=status.HTTP_400_BAD_REQUEST)
    if target.deleted_at:
        return Response({'detail': "Bu hisob allaqachon o'chirilgan"},
                        status=status.HTTP_400_BAD_REQUEST)
    if EducationCenter.objects.filter(owner_id=target.id).exists():
        return Response(
            {'detail': "Bu foydalanuvchi tashkilot egasi. Hisobni o'chirishdan "
                       "oldin tashkilot egaligini boshqa foydalanuvchiga o'tkazing."},
            status=status.HTTP_409_CONFLICT,
        )

    # max_length yo'q (JSONField), lekin blok sababi bilan bir xil chegara —
    # jurnalga cheksiz matn tushmasin.
    reason = str(request.data.get('reason') or '').strip()[:255]
    grace_days = int(getattr(settings, 'ACCOUNT_DELETE_GRACE_DAYS', 30))
    now = timezone.now()
    restorable_until = now + timedelta(days=grace_days)

    AuditLog.log(request, 'admin_account_delete', target=target, extra={
        'phone': mask_phone(target.normalized_phone),
        'soft_delete': True,
        'reason': reason or None,
        'restorable_until': restorable_until.isoformat(),
    })

    with transaction.atomic():
        locked = User.objects.select_for_update().get(pk=target.pk)
        locked.is_active = False
        locked.deleted_at = now
        locked.token_version = (locked.token_version or 0) + 1
        locked.save(update_fields=['is_active', 'deleted_at', 'token_version'])

    return Response({
        'detail': (
            f"Hisob o'chirildi. {grace_days} kun ichida foydalanuvchi uni "
            "telefon va parol bilan tiklashi mumkin, keyin butunlay yo'q qilinadi."
        ),
        'soft_deleted': True,
        'restorable_until': restorable_until.isoformat(),
        'grace_days': grace_days,
    })


# Tashkilotga bog'langan rollar: bunday hisobda SHAXSIY premium (`is_premium`
# flag + UserSubscription) hech qanday imkoniyat ochmaydi — o'qituvchi/manager
# ko'radigan premium funksiyalar `billing.SubscriptionService(center)` orqali
# MARKAZ obunasini (markaz egasining organization obunasi yoki
# `EducationCenter.is_premium`) o'qiydi. `owner` bu ro'yxatda ATAYLAB yo'q:
# markaz egasiga berilgan premium markazga tarqaladi (quyidagi
# `EducationCenter.objects.filter(owner=target).update(is_premium=True)`) va
# organization obunasi ham aynan uning nomiga yoziladi.
ORG_BOUND_PREMIUM_ROLES = {'teacher', 'manager'}

# Shaxsiy premium haqiqatan ishlaydigan rollar: o'quvchi funksiyalari
# `billing.student_tier_at_least` orqali foydalanuvchining O'Z obunasiga
# tayanadi, owner esa yuqoridagi sababga ko'ra. Roli umuman yo'q (ro'yxatdan
# endi o'tgan) foydalanuvchi ham shaxsiy premium oladi — u ham o'quvchi
# endpoint'laridan foydalanadi.
INDIVIDUAL_PREMIUM_ROLES = {'student', 'owner'}

ORG_BOUND_PREMIUM_ERROR = (
    "O'qituvchi va manager hisoblariga shaxsiy premium berib bo'lmaydi — "
    "ularning premium imkoniyatlari markazning (tashkilotning) obunasidan "
    "keladi. Markaz egasiga tashkilot obunasini bering yoki markaz "
    "sozlamalaridan premiumni yoqing."
)


@api_view(['POST'])
@permission_classes([IsPlatformAdmin])
def admin_toggle_user_premium(request, user_id):
    """POST /api/admin/users/{id}/toggle-premium/ — premium holatini boshqarish.

    Faqat Platform Admin uchun.
    Payload: { "duration": 30|90|180|365|0|-1, "plan_type": "student"|"organization" }
    """
    from django.contrib.auth import get_user_model
    from billing.models import SubscriptionPlan, UserSubscription
    from centers.models import EducationCenter

    User = get_user_model()
    target = User.objects.filter(pk=user_id).first()
    if not target:
        return Response({'detail': 'Foydalanuvchi topilmadi'},
                        status=status.HTTP_404_NOT_FOUND)

    duration = request.data.get('duration')
    plan_type = request.data.get('plan_type', 'student')

    # Tashkilotga bog'langan hisobga (o'qituvchi/manager, va shu bilan birga
    # hech qanday shaxsiy roli bo'lmagan) premium berish faqat chalg'ituvchi DB
    # yozuvi qoldirardi — real tekshiruvlar markaz obunasiga qaraydi. Bekor
    # qilishga (-1, va mavjud premiumni o'chiruvchi eski toggle) ruxsat
    # beramiz: bu tuzatishdan oldin berilgan ta'sirsiz yozuvlarni admin
    # panelidan tozalash imkoni qolishi kerak.
    target_roles = set(target.roles or [])
    if target_roles & ORG_BOUND_PREMIUM_ROLES and not target_roles & INDIVIDUAL_PREMIUM_ROLES:
        revoking = str(duration) == '-1' or (duration is None and target.is_premium)
        if not revoking:
            return Response({'detail': ORG_BOUND_PREMIUM_ERROR},
                            status=status.HTTP_400_BAD_REQUEST)

    if duration is None:
        # Eski toggle mantiqini saqlaymiz (orqaga moslik uchun).
        # Atomic: is_premium flag, EducationCenter va UserSubscription
        # yangilanishlari yarmida xatolik bo'lsa nomuvofiq holat qolmasin.
        with transaction.atomic():
            target.is_premium = not target.is_premium
            update_fields = ['is_premium']
            if target.is_premium:
                EducationCenter.objects.filter(owner=target).update(is_premium=True)
            else:
                EducationCenter.objects.filter(owner=target).update(is_premium=False)
                UserSubscription.objects.filter(user=target, is_active=True).update(is_active=False, end_date=timezone.now())
                # Trial muddati hali tugamagan bo'lsa `is_premium_active`
                # (is_premium OR trial_active) hamon True qaytarardi va
                # frontend bekor qilingandan keyin ham "Premium" ko'rsatardi.
                if target.premium_trial_end and target.premium_trial_end > timezone.now():
                    target.premium_trial_end = timezone.now()
                    update_fields.append('premium_trial_end')
            target.save(update_fields=update_fields)
        from .utils import invalidate_user_subscription_cache
        invalidate_user_subscription_cache(target.id)
        AuditLog.log(request, 'user_premium_toggle', target=target, extra={
            'mode': 'toggle',
            'is_premium': target.is_premium,
        })
        return Response(UserSerializer(target, context={'request': request}).data)

    try:
        duration = int(duration)
    except ValueError:
        return Response({'detail': "Davomiylik butun son bo'lishi kerak"}, status=status.HTTP_400_BAD_REQUEST)

    if duration == -1:
        # Premium bekor qilish. Atomic: is_premium flag, UserSubscription va
        # EducationCenter yangilanishlari yarmida xatolik bo'lsa nomuvofiq
        # holat (masalan flag o'chgan, lekin obuna aktivligicha) qolmasin.
        with transaction.atomic():
            target.is_premium = False
            update_fields = ['is_premium']
            # Trial muddati hali tugamagan bo'lsa `is_premium_active` property
            # (is_premium OR trial_active) hamon True qaytarardi va admin
            # "bekor qilgan"dan keyin ham foydalanuvchi Premium bo'lib
            # ko'rinaverardi (frontend shu maydondan foydalanadi).
            if target.premium_trial_end and target.premium_trial_end > timezone.now():
                target.premium_trial_end = timezone.now()
                update_fields.append('premium_trial_end')
            target.save(update_fields=update_fields)
            UserSubscription.objects.filter(user=target, is_active=True).update(is_active=False, end_date=timezone.now())
            EducationCenter.objects.filter(owner=target).update(is_premium=False)
    elif duration == 0:
        # Cheksiz premium (Umrbod). Atomic: flag, UserSubscription va
        # EducationCenter birga.
        # plan_type'dan qat'iy nazar, foydalanuvchi markaz egasi bo'lsa
        # markaz ham premium bo'lishi kerak (aks holda 'student' plan bilan
        # umrbod bergan markaz egasiga markaz premiumlari berilmay qolardi).
        #
        # MUHIM: avval bu yerda UserSubscription yozuvi YARATILMASDI — faqat
        # `is_premium` flag o'rnatilardi. Natijada foydalanuvchida boshqa,
        # muddati o'tgan obuna bo'lsa /me endpoint'idagi lazy expiry
        # (still_active=[] bo'lganda) `is_premium`ni qaytarib False qilib,
        # umrbod premium o'z-o'zidan o'chib qolardi. Endi amal qiluvchi obuna
        # yozuvi yaratamiz.
        #
        # Eslatma: UserSubscription.end_date NOT NULL (modelni o'zgartirib
        # migration qilmaslik uchun) — shu sababli "umrbod"ni juda uzoq
        # kelajakdagi sana (~100 yil) bilan ifodalaymiz. Mavjud barcha
        # `end_date__gt=now` / `end_date > now` taqqoslashlari (is_premium
        # sync, lazy expiry, billing) buni doim amal qiluvchi deb sanaydi.
        now = timezone.now()
        lifetime_end = now + timedelta(days=365 * 100)
        # Umrbod uchun plan'ni topishga harakat qilamiz (organization markaz
        # premiumlari uchun plan_type='organization' bo'lishi muhim). Topilmasa
        # plan=None bilan ham obuna yaratamiz — markaz premiumini quyida
        # to'g'ridan-to'g'ri o'rnatamiz.
        lifetime_plan = SubscriptionPlan.objects.filter(
            plan_type=plan_type, is_active=True,
        ).order_by('-duration_days').first()
        with transaction.atomic():
            target.is_premium = True
            target.save(update_fields=['is_premium'])
            # Avvalgi aktiv obunalarni yopamiz — bir nechta aktiv obuna
            # lazy expiry'ni chalkashtirmasin.
            UserSubscription.objects.filter(
                user=target, is_active=True,
            ).update(is_active=False, end_date=now)
            UserSubscription.objects.create(
                user=target,
                plan=lifetime_plan,
                start_date=now,
                end_date=lifetime_end,
                is_active=True,
            )
            EducationCenter.objects.filter(owner=target).update(is_premium=True)
    elif duration in [30, 90, 180, 365]:
        # Muddatli premium. Atomic: eski obunani yopish va yangisini yaratish
        # bitta tranzaksiyada — yarim holatda (eski yopilgan, yangi yaratilmagan)
        # foydalanuvchi premiumsiz qolib ketmasin.
        with transaction.atomic():
            UserSubscription.objects.filter(user=target, is_active=True).update(is_active=False, end_date=timezone.now())

            plan_name = request.data.get('plan_name')
            plan = None
            if plan_name:
                plan = SubscriptionPlan.objects.filter(
                    plan_type=plan_type,
                    duration_days=duration,
                    name__istartswith=plan_name,
                    is_active=True
                ).first()

            if not plan:
                plan = SubscriptionPlan.objects.filter(
                    plan_type=plan_type,
                    duration_days=duration,
                    is_active=True
                ).order_by('-price').first()

            now = timezone.now()
            end_date = now + timedelta(days=duration)
            UserSubscription.objects.create(
                user=target,
                plan=plan,
                start_date=now,
                end_date=end_date,
                is_active=True
            )
    else:
        return Response({'detail': "Noma'lum muddat ko'rsatildi (faqat 30, 90, 180, 365, 0 yoki -1 bo'lishi mumkin)"}, status=status.HTTP_400_BAD_REQUEST)

    # Obuna/premium holati o'zgardi — /me endpoint'dagi subscription cache'ni
    # bekor qilamiz, aks holda foydalanuvchi 60 soniya eski holatni ko'rardi.
    from .utils import invalidate_user_subscription_cache
    invalidate_user_subscription_cache(target.id)

    target.refresh_from_db()
    AuditLog.log(request, 'user_premium_toggle', target=target, extra={
        'mode': 'duration',
        'duration': duration,
        'plan_type': plan_type,
        'is_premium': target.is_premium,
    })
    return Response(UserSerializer(target, context={'request': request}).data)


# Admin paneldan boshqariladigan system-wide rollar. `admin` checkboxi
# alohida — u User.roles listiga emas, is_platform_admin flag'iga yoziladi
# (frontend ham roles.admin'ni is_platform_admin'dan oladi).
ALLOWED_ROLE_KEYS = ['student', 'teacher', 'manager', 'owner']


def _normalize_role_keys(raw_roles):
    """Ruxsat etilgan rollarni filtrlab, tartibni saqlab tozalaydi."""
    normalized = []
    for role in raw_roles:
        if role in ALLOWED_ROLE_KEYS and role not in normalized:
            normalized.append(role)
    return normalized


@api_view(['PATCH'])
@permission_classes([IsPlatformAdmin])
def admin_set_user_roles(request, user_id):
    """PATCH /api/admin/users/{id}/set-roles/ — system-wide rollarni almashtirish.

    Faqat Platform Admin uchun. Body: {"roles": ["student", "teacher", ...],
    "is_platform_admin": true|false}. `roles` User.roles JSONField'ini
    to'liq almashtiradi (faqat ALLOWED_ROLE_KEYS qabul qilinadi); `admin`
    kaliti yuborilsa yoki is_platform_admin=True bo'lsa — platform admin
    huquqi beriladi.

    Eslatma: bu CenterMembership (markaz a'zoligi) tasdiqlash holatiga
    tegmaydi — u alohida owner/manager oqimi orqali boshqariladi. Bu yerda
    faqat foydalanuvchining markazsiz, platforma darajasidagi rollari
    o'rnatiladi.
    """
    from django.contrib.auth import get_user_model

    User = get_user_model()
    target = User.objects.filter(pk=user_id).first()
    if not target:
        return Response({'detail': 'Foydalanuvchi topilmadi'},
                        status=status.HTTP_404_NOT_FOUND)

    raw_roles = request.data.get('roles')
    if not isinstance(raw_roles, list):
        return Response({'detail': "roles ro'yxat (list) bo'lishi kerak"},
                        status=status.HTTP_400_BAD_REQUEST)

    # `admin` kaliti roles ichida kelishi yoki alohida is_platform_admin
    # bool'i bilan yuborilishi mumkin — ikkalasini ham qo'llab-quvvatlaymiz.
    wants_admin = ('admin' in raw_roles)
    is_admin_flag = request.data.get('is_platform_admin')
    if isinstance(is_admin_flag, bool):
        wants_admin = is_admin_flag

    normalized_roles = _normalize_role_keys(raw_roles)

    # Xavfsizlik: admin o'zining platform admin huquqini bu yerdan olib
    # tashlay olmaydi (o'zini tasodifan tizimdan chiqarib qo'ymasin).
    if target.id == request.user.id and target.is_platform_admin and not wants_admin:
        return Response(
            {'detail': "O'zingizdan platform admin huquqini olib tashlay olmaysiz"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    update_fields = []
    if list(target.roles or []) != normalized_roles:
        target.roles = normalized_roles
        update_fields.append('roles')
    if bool(target.is_platform_admin) != bool(wants_admin):
        target.is_platform_admin = bool(wants_admin)
        update_fields.append('is_platform_admin')
        # Platform admin huquqi olib tashlansa, mavjud JWT'lar darhol bekor
        # bo'lishi uchun token_version oshiramiz (eski token bilan admin
        # endpoint'larga kira olmasin).
        if not wants_admin:
            target.token_version = (target.token_version or 0) + 1
            update_fields.append('token_version')

    if update_fields:
        target.save(update_fields=list(set(update_fields)))
        AuditLog.log(request, 'user_role_change', target=target, extra={
            'roles': normalized_roles,
            'is_platform_admin': bool(wants_admin),
        })

    return Response(UserSerializer(target, context={'request': request}).data)


@api_view(['PATCH'])
@permission_classes([IsPlatformAdmin])
def admin_bulk_set_user_roles(request):
    """PATCH /api/admin/users/bulk-set-roles/ — bir nechta hisobga bir xil rol.

    Body: {"user_ids": [...], "roles": ["student", ...]}. Javob shakli
    `admin_bulk_set_user_active` bilan bir xil.

    `is_platform_admin` ATAYLAB qabul qilinmaydi: platform admin huquqini bir
    yo'la ko'p hisobga tarqatish (yoki olib tashlash) ommaviy amal uchun
    haddan tashqari xavfli — u bitta foydalanuvchilik `admin_set_user_roles`
    da qoladi. Shu sababli `admin` kaliti ham `_normalize_role_keys` tomonidan
    tashlab yuboriladi.
    """
    ids, error = _parse_bulk_user_ids(request.data.get('user_ids'))
    if error:
        return Response({'detail': error}, status=status.HTTP_400_BAD_REQUEST)
    raw_roles = request.data.get('roles')
    if not isinstance(raw_roles, list):
        return Response({'detail': "roles ro'yxat (list) bo'lishi kerak"},
                        status=status.HTTP_400_BAD_REQUEST)
    normalized_roles = _normalize_role_keys(raw_roles)

    targets, failed = _resolve_bulk_targets(request, ids)
    succeeded = []
    for target in targets:
        # Rollari allaqachon bir xil bo'lsa yozuv ham, jurnal ham kerak emas
        # (bitta foydalanuvchilik endpoint bilan bir xil xulq), lekin natija
        # baribir muvaffaqiyatli — kerakli holat allaqachon o'rnatilgan.
        if list(target.roles or []) != normalized_roles:
            target.roles = normalized_roles
            target.save(update_fields=['roles'])
            AuditLog.log(request, 'user_role_change', target=target, extra={
                'roles': normalized_roles,
                # Ommaviy amal bu flag'ga TEGMAYDI — targetlar baribir admin
                # emas, shuning uchun jurnalda o'zgarmagan holat qoladi.
                'is_platform_admin': bool(target.is_platform_admin),
                'bulk': True,
            })
        succeeded.append(target.id)
    return Response({'succeeded': succeeded, 'failed': failed})


# Admin qo'lda bergan parol uchun alifbo. Chalkashadigan belgilar (0/O, 1/l/I)
# ataylab olib tashlangan — bu parol admin tomonidan tashqi kanal orqali
# (telefon, xat) qo'lda yetkaziladi, shu sababli xato o'qilmasligi muhim.
RECOVERY_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'


def _make_recovery_password():
    """Kriptografik tasodifiy, lekin qo'lda ko'chirib yozib bo'ladigan parol.

    12 belgi 4 talik uchta blokka bo'linadi (``Ab7k-Mn3p-Qr9t``). Manba
    faqat `secrets` (CSPRNG) — `random` moduli parol yasash uchun yaroqsiz.
    """
    return '-'.join(
        ''.join(secrets.choice(RECOVERY_PASSWORD_ALPHABET) for _ in range(4))
        for _ in range(3)
    )


@api_view(['POST'])
@permission_classes([IsPlatformAdmin])
def admin_reset_user_password(request, user_id):
    """POST /api/admin/users/{id}/reset-password/ — parolni majburan tiklash.

    Faqat Platform Admin uchun. Autentifikatsiya telefon raqamga bog'langan:
    ro'yxatdagi raqamini yo'qotgan (va email bog'lamagan) foydalanuvchi uchun
    o'z-o'ziga xizmat yo'li yo'q — `start_password_reset` joriy
    `normalized_phone` ga jonli Telegram OTP talab qiladi. Shaxsi tashqi
    kanal orqali tasdiqlangandan keyin admin shu endpoint bilan yangi parol
    beradi.

    Yangi parol javobda BIR MARTA ochiq qaytariladi (admin uni foydalanuvchiga
    xavfsiz kanal orqali yetkazadi) va boshqa hech qayerda — audit log, server
    loglari — saqlanmaydi. Parolni keyin qayta o'qib olish endpoint'i ataylab
    yo'q.
    """
    from django.contrib.auth import get_user_model

    User = get_user_model()
    target = User.objects.filter(pk=user_id).first()
    if not target:
        return Response({'detail': 'Foydalanuvchi topilmadi'},
                        status=status.HTTP_404_NOT_FOUND)
    if target.id == request.user.id:
        return Response({'detail': "O'z parolingizni bu yerdan tiklab bo'lmaydi"},
                        status=status.HTTP_400_BAD_REQUEST)
    if target.is_platform_admin:
        return Response({'detail': "Boshqa adminning parolini tiklab bo'lmaydi"},
                        status=status.HTTP_400_BAD_REQUEST)

    new_password = _make_recovery_password()
    target.set_password(new_password)
    # Hisobni o'zlashtirgan shaxs eski parol bilan olingan JWT bilan ishlashda
    # davom etmasin — parolni tiklashning butun maqsadi shu.
    target.token_version = (target.token_version or 0) + 1
    target.save(update_fields=['password', 'token_version'])
    # extra'da faqat metadata: yangi parol audit logga HECH QACHON tushmaydi.
    AuditLog.log(request, 'admin_password_reset', target=target, extra={
        'phone': mask_phone(target.normalized_phone),
    })
    return Response({
        'new_password': new_password,
        'user': UserSerializer(target, context={'request': request}).data,
    })


@api_view(['POST'])
@permission_classes([IsPlatformAdmin])
def admin_change_user_phone(request, user_id):
    """POST /api/admin/users/{id}/change-phone/ — telefon raqamni almashtirish.

    Faqat Platform Admin uchun. Body: {"phone": "..."}. O'z-o'ziga xizmat
    qiladigan "raqamni o'zgartirish" oqimi yo'q, shu sababli raqamini
    butunlay yo'qotgan foydalanuvchini hisobiga qaytarishning yagona yo'li —
    admin qo'lda almashtirishi (shaxsi tashqi kanal orqali tasdiqlangandan
    keyin).

    Ro'yxatdan o'tish oqimidan tashqarida ishlaydi, shu sababli
    normalizatsiya va `normalized_phone` yagonaligini qo'lda tekshiramiz —
    `UserManager._create_user` bu tekshiruvlarni faqat yaratish paytida
    bajaradi.
    """
    from django.contrib.auth import get_user_model

    User = get_user_model()
    target = User.objects.filter(pk=user_id).first()
    if not target:
        return Response({'detail': 'Foydalanuvchi topilmadi'},
                        status=status.HTTP_404_NOT_FOUND)
    if target.id == request.user.id:
        return Response({'detail': "O'z raqamingizni bu yerdan o'zgartirib bo'lmaydi"},
                        status=status.HTTP_400_BAD_REQUEST)
    if target.is_platform_admin:
        return Response({'detail': "Boshqa adminning raqamini o'zgartirib bo'lmaydi"},
                        status=status.HTTP_400_BAD_REQUEST)

    new_phone = normalize_phone(request.data.get('phone'))
    if not new_phone:
        return Response({'detail': "Telefon raqam noto'g'ri"},
                        status=status.HTTP_400_BAD_REQUEST)
    if User.objects.filter(normalized_phone=new_phone).exclude(pk=target.pk).exists():
        return Response({'detail': "Bu telefon raqam avval ro'yxatdan o'tgan"},
                        status=status.HTTP_409_CONFLICT)

    old_phone = target.normalized_phone
    # `phone`, `normalized_phone` va `token_version` birga o'zgaradi —
    # yarim holatda (masalan normalized_phone yangi, phone eski) qolmasin.
    with transaction.atomic():
        target.phone = new_phone
        target.normalized_phone = new_phone
        # Eski raqam bilan olingan JWT sessiyalar ham bekor bo'lsin.
        target.token_version = (target.token_version or 0) + 1
        target.save(update_fields=['phone', 'normalized_phone', 'token_version'])
        # Eski raqamda boshlangan, hali tasdiqlanmagan sessiyalar (parol
        # tiklash / Telegram bog'lash) o'chiriladi: hisob yangi raqamga
        # o'tgandan keyin eski raqam egasidagi jonli OTP bilan hisobga ta'sir
        # qilish yo'li qolmasin. Registration maqsadidagi yozuvlar mavjud
        # hisobga tegmaydi, shuning uchun ularga aralashmaymiz (eski raqamni
        # keyinchalik olgan odam ro'yxatdan o'tishini buzmaslik uchun).
        # Tasdiqlanmaganini o'chirish — boshqa oqimlardagi (masalan
        # `start_password_reset`) tozalash naqshi bilan bir xil.
        PhoneVerification.objects.filter(
            normalized_phone=old_phone,
            purpose__in=[
                PhoneVerification.PURPOSE_PASSWORD_RESET,
                PhoneVerification.PURPOSE_ACCOUNT_LINK,
            ],
            verified_at__isnull=True,
        ).delete()

    # Xom raqam hech qachon loglanmaydi — faqat maskalangan ko'rinishi.
    AuditLog.log(request, 'admin_phone_change', target=target, extra={
        'old_phone': mask_phone(old_phone),
        'new_phone': mask_phone(new_phone),
    })
    return Response(UserSerializer(target, context={'request': request}).data)


@api_view(['POST'])
@permission_classes([IsPlatformAdmin])
def admin_reset_user_totp(request, user_id):
    """POST /api/admin/users/{id}/reset-2fa/ — 2FA'ni majburan o'chirish.

    Faqat Platform Admin uchun. O'z-o'ziga xizmat qiladigan `totp_disable`
    joriy TOTP kodini yoki parolni talab qiladi — telefonini (autentifikator
    ilovasini) yo'qotgan foydalanuvchi uchun bu yo'l yopiq: kod yo'q, parol
    esa login paytida baribir 2FA'ga borib taqaladi. Shaxsi tashqi kanal
    orqali tasdiqlangandan keyin admin shu endpoint bilan 2FA'ni o'chiradi;
    foydalanuvchi kirib, profilidan qaytadan yoqadi.

    Kalit ham o'chiriladi (`encrypted_totp_secret`), faqat `totp_enabled`
    emas: eski kalit qolsa foydalanuvchi qayta yoqqanda o'sha yo'qolgan
    ilovadagi kalitni tiklab qo'yardi.

    `admin_reset_user_password` bilan bir xil cheklovlar: o'zining va boshqa
    adminning 2FA'sini bu yerdan o'chirib bo'lmaydi — 2FA xavfsizlik
    to'sig'i, uni panel orqali admin ustidan olib tashlash imkoniyati
    qolmasligi kerak (admin hisobi shell orqali tiklanadi).
    """
    from django.contrib.auth import get_user_model

    User = get_user_model()
    target = User.objects.filter(pk=user_id).first()
    if not target:
        return Response({'detail': 'Foydalanuvchi topilmadi'},
                        status=status.HTTP_404_NOT_FOUND)
    if target.id == request.user.id:
        return Response({'detail': "O'z 2FA'ngizni bu yerdan o'chirib bo'lmaydi"},
                        status=status.HTTP_400_BAD_REQUEST)
    if target.is_platform_admin:
        return Response({'detail': "Boshqa adminning 2FA'sini o'chirib bo'lmaydi"},
                        status=status.HTTP_400_BAD_REQUEST)
    if not target.totp_enabled:
        return Response({'detail': "Bu foydalanuvchida 2FA yoqilmagan"},
                        status=status.HTTP_400_BAD_REQUEST)

    target.totp_enabled = False
    target.totp_secret = ''  # property — `encrypted_totp_secret`ni bo'shatadi
    # Hisobni o'zlashtirgan shaxs 2FA'ni yoqib egasini quvib chiqargan bo'lishi
    # mumkin — bunday holatda uning jonli sessiyasi ham tugashi kerak.
    target.token_version = (target.token_version or 0) + 1
    target.save(update_fields=['totp_enabled', 'encrypted_totp_secret', 'token_version'])
    AuditLog.log(request, 'admin_totp_reset', target=target, extra={
        'phone': mask_phone(target.normalized_phone),
    })
    return Response(UserSerializer(target, context={'request': request}).data)


@api_view(['POST'])
@permission_classes([IsPlatformAdmin])
def admin_force_logout_user(request, user_id):
    """POST /api/admin/users/{id}/force-logout/ — barcha seanslarni yakunlash.

    Faqat Platform Admin uchun. `token_version` oshadi — foydalanuvchining
    barcha qurilmalaridagi JWT'lar (access ham, refresh ham) darhol bekor
    bo'ladi, lekin hisob holati (`is_active`, rollar, parol) o'zgarmaydi.
    Bu bloklashning yengil muqobili: qurilma o'g'irlangan yoki hisob birov
    bilan bo'lishilgan deb gumon qilinganda foydalanuvchini butunlay
    bloklamasdan chiqarib yuborish kerak bo'ladi.

    Bloklash/parol tiklashdan farqli o'laroq boshqa ADMINGA ham ruxsat
    berilgan: o'g'irlangan qurilma holatida admin sessiyasini tezda
    yakunlash imkoniyati aynan shu yerda kerak (bu amal hech qanday huquqni
    o'zgartirmaydi, faqat qaytadan kirishni talab qiladi). Faqat o'zini
    bundan istisno qilamiz — admin panel ochiq turgan holda o'zini chiqarib
    yuborishi tasodifiy va chalg'ituvchi bo'lardi.
    """
    from django.contrib.auth import get_user_model

    User = get_user_model()
    target = User.objects.filter(pk=user_id).first()
    if not target:
        return Response({'detail': 'Foydalanuvchi topilmadi'},
                        status=status.HTTP_404_NOT_FOUND)
    if target.id == request.user.id:
        return Response({'detail': "O'z seanslaringizni bu yerdan yakunlab bo'lmaydi"},
                        status=status.HTTP_400_BAD_REQUEST)

    bump_token_version(target)
    AuditLog.log(request, 'admin_force_logout', target=target, extra={
        'phone': mask_phone(target.normalized_phone),
    })
    return Response(UserSerializer(target, context={'request': request}).data)


# Impersonatsiya ("foydalanuvchi sifatida ko'rish") tokenining umri. Oddiy
# sessiya tokenidan (SIMPLE_JWT ACCESS_TOKEN_LIFETIME = 30 daqiqa) ATAYIN
# qisqaroq: shikoyatni tekshirib chiqishga yetadi, lekin admin brauzerida
# uzoq "yashab" qolmaydi.
IMPERSONATION_TOKEN_LIFETIME = timedelta(minutes=15)


@api_view(['POST'])
@permission_classes([IsPlatformAdmin])
def admin_impersonate_user(request, user_id):
    """POST /api/admin/users/{id}/impersonate/ — foydalanuvchi sifatida ko'rish.

    Faqat Platform Admin uchun, faqat qo'llab-quvvatlash (support) maqsadida:
    "menda tugma ishlamayapti", "natijam ko'rinmayapti" kabi shikoyatlarni
    aynan shu foydalanuvchining ekranidan ko'rmasdan tekshirib bo'lmaydi.

    Token dizayni (ataylab tor):
    * FAQAT access token — refresh BERILMAYDI, ya'ni seansni uzaytirib
      bo'lmaydi. 15 daqiqadan keyin token o'zi o'ladi.
    * `user_id` — MAQSADLI foydalanuvchiniki. Shu sababli huquqlar ham
      o'shanikidan kelib chiqadi: `IsPlatformAdmin` `request.user`ni
      tekshiradi, `request.user` esa token ichidagi `user_id` bo'yicha
      yuklanadi. Ya'ni bu token bilan admin endpoint'lariga qaytib kirib
      bo'lmaydi (huquq oshirish yo'q) — pastdagi "boshqa adminni maqsad qilib
      bo'lmaydi" cheklovi bilan birga bu xususiyat konstruksiya bo'yicha
      ta'minlanadi.
    * `token_version` — maqsadli foydalanuvchiniki. Ya'ni mavjud bekor qilish
      mexanizmlari (bloklash, parol tiklash, majburiy logout) impersonatsiya
      tokenini ham darhol o'ldiradi.
    * `impersonated_by` — tokenni bergan admin ID'si. Bu da'vo forenzika
      uchun (log/token dekodida kim boshlaganini ko'rish) va erta bekor
      qilish tekshiruvini faqat shu tokenlarga cheklash uchun ishlatiladi
      (`OlympyJWTAuthentication.get_user`).

    Cookie ATAYLAB O'RNATILMAYDI (`_set_auth_cookies` chaqirilmaydi): adminning
    o'z HttpOnly sessiyasi tegilmasdan qoladi va "Admin panelga qaytish" — bu
    shunchaki impersonatsiya tokenini tashlab yuborish. Token javob body'sida
    qaytadi, frontend uni `Authorization: Bearer` sifatida yuboradi (header
    cookie'dan ustun — `OlympyJWTAuthentication.authenticate`).
    """
    from django.contrib.auth import get_user_model

    User = get_user_model()
    target = User.objects.filter(pk=user_id).first()
    if not target:
        return Response({'detail': 'Foydalanuvchi topilmadi'},
                        status=status.HTTP_404_NOT_FOUND)
    if target.id == request.user.id:
        return Response({'detail': "O'zingiz sifatida ko'rish shart emas"},
                        status=status.HTTP_400_BAD_REQUEST)
    # `admin_reset_user_password` bilan bir xil cheklov: boshqa adminning
    # hisobiga kirish butun admin qatlamini bir-biriga ochib qo'yardi (bir
    # admin ikkinchisining nomidan istalgan amalni bajara olardi va audit
    # jurnalida aktor sifatida O'SHA ikkinchisi ko'rinardi).
    if target.is_platform_admin:
        return Response({'detail': "Boshqa admin sifatida ko'rib bo'lmaydi"},
                        status=status.HTTP_400_BAD_REQUEST)
    # Bloklangan/o'chirilgan hisob uchun token baribir ishlamaydi
    # (`JWTAuthentication.get_user` `is_active=False` ni rad etadi) — noaniq
    # 401 o'rniga darhol tushunarli xabar beramiz.
    if not target.is_active:
        return Response({'detail': "Bloklangan foydalanuvchi sifatida ko'rib bo'lmaydi"},
                        status=status.HTTP_400_BAD_REQUEST)

    token = AccessToken.for_user(target)
    token['token_version'] = target.token_version
    token['impersonated_by'] = request.user.id
    token.set_exp(lifetime=IMPERSONATION_TOKEN_LIFETIME)
    # Audit yozuvi token QAYTARILISHIDAN OLDIN — javob yo'lda uzilib qolsa ham
    # "kim, qachon, kimning hisobiga kirdi" izi qoladi.
    AuditLog.log(request, 'admin_impersonate_start', target=target, extra={
        'phone': mask_phone(target.normalized_phone),
        'expires_in': int(IMPERSONATION_TOKEN_LIFETIME.total_seconds()),
    })
    return Response({
        'token': str(token),
        # Frontend seansni yakunlaganda shu jti'ni qaytaradi — token o'sha
        # zahoti qora ro'yxatga tushadi (`admin_end_impersonation`).
        'jti': token['jti'],
        'expires_in': int(IMPERSONATION_TOKEN_LIFETIME.total_seconds()),
        'user': UserSerializer(target, context={'request': request}).data,
    })


@api_view(['POST'])
@permission_classes([IsPlatformAdmin])
def admin_end_impersonation(request, user_id):
    """POST /api/admin/users/{id}/impersonate/end/ — seansni yakunlash.

    Frontend "Admin panelga qaytish" bosilganda chaqiradi. So'rov ADMINNING
    o'z seansi bilan ketadi (impersonatsiya tokeni undan oldin tashlanadi),
    shuning uchun `IsPlatformAdmin` bu yerda ham o'rinli.

    Ikki ish qiladi:
    1. `admin_impersonate_end` audit yozuvi — seansning oxirini belgilaydi.
       Tokenning tugash vaqtini kutib turmaydi: jurnalda haqiqiy oyna
       ko'rinishi kerak.
    2. Body'dagi `jti` bo'yicha tokenni qora ro'yxatga qo'shadi (cache, TTL =
       token umri). Bu ixtiyoriy qadam: `jti` kelmasa ham (masalan eski
       klient) seans yakunlangan hisoblanadi, token esa 15 daqiqada o'zi
       o'ladi.
    """
    from django.contrib.auth import get_user_model
    from django.core.cache import cache

    from .authentication import impersonation_block_key

    User = get_user_model()
    target = User.objects.filter(pk=user_id).first()
    if not target:
        return Response({'detail': 'Foydalanuvchi topilmadi'},
                        status=status.HTTP_404_NOT_FOUND)

    # Xom `jti` — faqat cache kalitiga qo'shiladi, shuning uchun uzunligini
    # cheklaymiz (klientdan kelgan qiymat cheksiz kalit yasamasin).
    jti = str(request.data.get('jti') or '').strip()[:64]
    if jti:
        cache.set(
            impersonation_block_key(jti),
            True,
            timeout=int(IMPERSONATION_TOKEN_LIFETIME.total_seconds()),
        )
    AuditLog.log(request, 'admin_impersonate_end', target=target, extra={
        'phone': mask_phone(target.normalized_phone),
        'revoked': bool(jti),
    })
    return Response({'ok': True, 'revoked': bool(jti)})


# ---------------------------------------------------------------------------
# Takrorlangan hisoblarni birlashtirish (support)
# ---------------------------------------------------------------------------
# Autentifikatsiya faqat telefon raqamga bog'langan (`USERNAME_FIELD =
# normalized_phone`, OTP Telegram orqali). SIM kartasini yo'qotgan o'quvchi
# yangi raqam bilan QAYTA ro'yxatdan o'tadi va bir odamda ikkita hisob paydo
# bo'ladi: tanga, streak va urinishlar tarixi ikkiga bo'linadi, ularni
# qo'shishning hech qanday yo'li yo'q edi.
#
# Dizayn qoidalari:
#  * Ko'chiriladigan to'plam ATAYLAB TOR — faqat o'quvchining o'z progressi
#    (balans, streak, urinish/mashq tarixi, kirish tarixi). Buxgalteriya
#    (obuna/to'lov), markaz a'zoligi va e'lon qilingan reyting
#    natijalari TEGILMAYDI — pastdagi
#    `_merge_untouched_models` ro'yxatiga qarang.
#  * Manba hisob HECH QACHON o'chirilmaydi: bloklanadi (batch 3 mexanizmi,
#    doimiy) va qatorlari joyida qoladi — audit izi ham, tekshirish imkoni
#    ham saqlanadi.
#  * Avval `preview` (hech narsa o'zgarmaydi), keyin `commit` (bitta
#    tranzaksiya). Ikkalasi ham AYNAN bir xil rejani quradi.


def _merge_movable_models():
    """Birlashtirishda maqsadli hisobga KO'CHIRILADIGAN modellar.

    Har element: `(model, label, collision_field)`. `collision_field` —
    `user` bilan birga UNIQUE bo'lgan maydon nomi; None bo'lsa bu modelda
    to'qnashuv bo'lishi mumkin emas (cheklov yo'q).

    To'qnashuv qoidasi hamma joyda bir xil: MAQSADLI hisobning qatori
    qoladi, manbadagi juftlashgan qator ko'chirilmaydi (o'chirilmaydi ham —
    manba hisobida joyida qolib, tarix sifatida ko'rinaveradi) va nechtasi
    o'tkazib yuborilgani javobda ham, audit jurnalida ham ko'rsatiladi.
    """
    from attempts.models import TestAttempt, TestSession

    from .models import (
        Achievement, DailyGoal, DailyQuestionAnswer,
        LoginEvent, RewardRedemption,
    )
    return [
        (TestAttempt, 'Olimpiada urinishlari', 'olympiad_id'),
        (TestSession, 'Test sessiyalari', 'olympiad_id'),
        (DailyQuestionAnswer, 'Kunlik savol javoblari', 'daily_question_id'),
        (DailyGoal, 'Kunlik maqsadlar', 'date'),
        (Achievement, 'Yutuqlar', 'type'),
        (RewardRedemption, 'Mukofot buyurtmalari', None),
        (LoginEvent, 'Kirish tarixi', None),
    ]


def _merge_untouched_models(source):
    """Manba hisobda QOLADIGAN ma'lumotlar — nega qolgani sababi bilan.

    Bu ro'yxat javobda ko'rsatiladi: admin nima ko'chmaganini bilib, kerak
    bo'lsa qo'lda (mavjud vositalar bilan — premium berish, markazga qayta
    qabul qilish) hal qiladi. Faqat NOL bo'lmagan qatorlar qaytariladi.
    """
    from billing.models import PaymentTransaction, UserSubscription
    from centers.models import CenterMembership

    from .models import WeeklyContestResult

    rows = [
        (
            'billing.UserSubscription', 'Obunalar',
            UserSubscription.objects.filter(user=source).count(),
            "Obuna ko'chirilmaydi — pullik huquqni bir hisobdan ikkinchisiga "
            "o'tkazish buxgalteriya qarori. Kerak bo'lsa maqsadli hisobga "
            "qo'lda premium bering.",
        ),
        (
            'billing.PaymentTransaction', "To'lovlar",
            PaymentTransaction.objects.filter(user=source).count(),
            "To'lov tarixi kim to'laganiga bog'langan holda qoladi (refund va "
            "solishtirish uchun).",
        ),
        (
            'centers.CenterMembership', "Markaz a'zoliklari",
            CenterMembership.objects.filter(user=source).count(),
            "A'zolik — markazning ruxsati. Maqsadli hisob markazga qaytadan "
            "qabul qilinishi kerak.",
        ),
        (
            'accounts.WeeklyContestResult', 'Haftalik musobaqa natijalari',
            WeeklyContestResult.objects.filter(user=source).count(),
            "Yakunlangan musobaqa reytingi o'zgartirilmaydi — bir odam bir "
            "musobaqada ikki marta turib qolmasligi kerak.",
        ),
    ]
    return [
        {'model': model, 'label': label, 'count': count, 'note': note}
        for model, label, count, note in rows if count
    ]


def _merge_blockers(source, target):
    """Birlashtirishga yo'l qo'ymaydigan sabablar ro'yxati (bo'sh = ruxsat)."""
    from centers.models import EducationCenter

    blockers = []
    if source.id == target.id:
        return ["Manba va maqsadli hisob bir xil"]
    for user, role in ((source, 'Manba'), (target, 'Maqsadli')):
        # Bloklash/parol tiklash bilan bir xil cheklov: admin hisobiga
        # tegadigan amal panel orqali umuman bo'lmasin.
        if user.is_platform_admin:
            blockers.append(f'{role} hisob — platforma admini')
        # `EducationCenter.owner` PROTECT: markaz egasining hisobi umuman
        # bloklab bo'lmaydigan tashkiliy hisob, SIM yo'qotgan o'quvchi emas.
        if EducationCenter.objects.filter(owner=user).exists():
            blockers.append(f'{role} hisob — markaz egasi')
    if target.deleted_at:
        blockers.append("Maqsadli hisob o'chirilgan (soft-delete)")
    # Ikki marta birlashtirish amalda bo'sh ish bajaradi (qatorlar allaqachon
    # ko'chgan, tanga nolga tushgan), lekin adminni chalg'itadi.
    if AuditLog.objects.filter(action='admin_user_merge', extra__source_id=source.id).exists():
        blockers.append('Manba hisob avval boshqa hisobga birlashtirilgan')
    return blockers


def _build_merge_plan(source, target):
    """Ko'chiriladigan qatorlarni SANAYDI, hech narsani o'zgartirmaydi.

    Qaytaradi: har model uchun `{model_cls, model, label, move, skip,
    skip_ids}`. `skip_ids` faqat ichki foydalanish uchun (javobga
    chiqmaydi) — `commit` aynan shu qatorlarni chetlab o'tadi.
    """
    plan = []
    for model, label, collision_field in _merge_movable_models():
        pairs = list(model.objects.filter(user=source).values_list('pk', collision_field)) \
            if collision_field \
            else [(pk, None) for pk in model.objects.filter(user=source).values_list('pk', flat=True)]
        skip_ids = []
        if collision_field:
            taken = set(
                model.objects.filter(user=target).values_list(collision_field, flat=True)
            )
            skip_ids = [pk for pk, value in pairs if value in taken]
        plan.append({
            'model_cls': model,
            'model': f'{model._meta.app_label}.{model.__name__}',
            'label': label,
            'move': len(pairs) - len(skip_ids),
            'skip': len(skip_ids),
            'skip_ids': skip_ids,
        })
    return plan


def _merge_user_brief(user):
    """Oynada ko'rsatiladigan qisqacha hisob ma'lumoti.

    Telefon TO'LIQ qaytariladi (maskalanmaydi): admin panelida raqam
    allaqachon ochiq ko'rinadi (`admin_users_export` izohiga qarang) va
    tasdiqlash qadami aynan manba raqamini qo'lda yozishni talab qiladi.
    """
    return {
        'id': user.id,
        'full_name': user.full_name,
        'phone': user.normalized_phone,
        'is_active': user.is_active,
        'is_premium': user.is_premium,
        'coins': user.coins,
        'streak_count': user.streak_count,
        'created_at': user.created_at.isoformat() if user.created_at else None,
    }


def _resolve_merge_pair(request):
    """`{source_id, target_id}` ni tekshirib foydalanuvchilarni topadi.

    Qaytaradi: `(source, target, error_response)`.
    """
    from django.contrib.auth import get_user_model

    User = get_user_model()
    try:
        source_id = int(request.data.get('source_id'))
        target_id = int(request.data.get('target_id'))
    except (TypeError, ValueError):
        return None, None, Response(
            {'detail': 'source_id va target_id son bo\'lishi kerak'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    users = {u.id: u for u in User.objects.filter(pk__in={source_id, target_id})}
    source, target = users.get(source_id), users.get(target_id)
    if not source or not target:
        return None, None, Response({'detail': 'Foydalanuvchi topilmadi'},
                                    status=status.HTTP_404_NOT_FOUND)
    return source, target, None


@api_view(['POST'])
@permission_classes([IsPlatformAdmin])
def admin_merge_users_preview(request):
    """POST /api/admin/users/merge/preview/ — quruq yurish (dry-run).

    Body: `{"source_id": .., "target_id": ..}`. HECH NARSANI
    O'ZGARTIRMAYDI — faqat nima ko'chishini, nima to'qnashuv sababli
    o'tkazib yuborilishini, nima manbada qolishini va birlashtirishga
    to'sqinlik qiladigan sabablarni sanaydi.

    `can_merge=false` bo'lsa `commit` ham aynan shu sabab bilan rad etadi.
    """
    source, target, error = _resolve_merge_pair(request)
    if error:
        return error

    blockers = _merge_blockers(source, target)
    plan = _build_merge_plan(source, target) if not blockers else []
    return Response({
        'source': _merge_user_brief(source),
        'target': _merge_user_brief(target),
        'blockers': blockers,
        'can_merge': not blockers,
        'moves': [
            {k: v for k, v in entry.items() if k not in ('model_cls', 'skip_ids')}
            for entry in plan
        ],
        'totals': {
            'move': sum(e['move'] for e in plan),
            'skip': sum(e['skip'] for e in plan),
        },
        # Skalyar maydonlar qatorlar kabi "ko'chmaydi", ular hisoblanadi:
        # tanga qo'shiladi (balans), streak esa kattasi olinadi (kunlar soni
        # — qo'shib bo'lmaydi).
        'balances': {
            'coins': {
                'source': source.coins, 'target': target.coins,
                'result': (target.coins or 0) + (source.coins or 0),
            },
            'streak_count': {
                'source': source.streak_count, 'target': target.streak_count,
                'result': max(source.streak_count or 0, target.streak_count or 0),
            },
            'longest_streak': {
                'source': source.longest_streak, 'target': target.longest_streak,
                'result': max(source.longest_streak or 0, target.longest_streak or 0),
            },
        },
        'untouched': _merge_untouched_models(source) if not blockers else [],
    })


@api_view(['POST'])
@permission_classes([IsPlatformAdmin])
def admin_merge_users_commit(request):
    """POST /api/admin/users/merge/commit/ — birlashtirishni bajaradi.

    Body: `preview` bilan bir xil `{"source_id": .., "target_id": ..}`.
    Butun amal BITTA tranzaksiyada: qatorlar ko'chishi, balans qo'shilishi
    va manba hisobning bloklanishi yo hammasi bajariladi, yo hech biri.

    Manba hisob O'CHIRILMAYDI — doimiy bloklanadi ("#N hisobiga
    birlashtirildi" sababi bilan) va barcha qatorlari joyida qoladi. Shu
    sababli natijani tekshirish (va zarur bo'lsa qo'lda qaytarish) mumkin.
    """
    source, target, error = _resolve_merge_pair(request)
    if error:
        return error

    blockers = _merge_blockers(source, target)
    if blockers:
        return Response({'detail': blockers[0], 'blockers': blockers},
                        status=status.HTTP_400_BAD_REQUEST)

    plan = _build_merge_plan(source, target)
    moved_coins = source.coins or 0
    moved = {e['model']: e['move'] for e in plan if e['move']}
    skipped = {e['model']: e['skip'] for e in plan if e['skip']}
    with transaction.atomic():
        for entry in plan:
            qs = entry['model_cls'].objects.filter(user=source)
            if entry['skip_ids']:
                qs = qs.exclude(pk__in=entry['skip_ids'])
            qs.update(user=target)

        target.coins = (target.coins or 0) + moved_coins
        target.streak_count = max(target.streak_count or 0, source.streak_count or 0)
        target.longest_streak = max(target.longest_streak or 0, source.longest_streak or 0)
        # Ikkalasidan KEYINGI faollik sanasi — streak mantiqi shu sanadan
        # keyingi kunni "ketma-ket" deb hisoblaydi.
        if source.last_active_date and (
            not target.last_active_date or source.last_active_date > target.last_active_date
        ):
            target.last_active_date = source.last_active_date
        target.save(update_fields=[
            'coins', 'streak_count', 'longest_streak', 'last_active_date',
        ])

        # Balans KO'CHDI, ya'ni manbada qolmasligi kerak — aks holda manba
        # hisob biror sabab bilan qayta ochilsa tanga ikki marta sarflanardi.
        source.coins = 0
        source.save(update_fields=['coins'])
        # Manba hisobni doimiy bloklaymiz (`blocked_until=None` — muddati
        # tugagan blokni ochadigan mexanizm bunga hech qachon tegmaydi).
        # `_apply_suspension` seanslarni ham bekor qiladi va manba hisob
        # uchun alohida `user_block` audit yozuvini qoldiradi.
        _apply_suspension(
            request, source, False, f'#{target.id} hisobiga birlashtirildi', None,
        )
        # Jurnal ham TRANZAKSIYA ICHIDA: birlashtirish izsiz qolmasligi
        # kerak. Audit target — TIRIK hisob (jurnalda ism bo'yicha topiladi),
        # manba esa `extra.source_id` da; manba hisobning o'z tarixida esa
        # yuqoridagi `user_block` yozuvi aynan shu sabab bilan turadi.
        AuditLog.log(request, 'admin_user_merge', target=target, extra={
            'source_id': source.id,
            'source_phone': mask_phone(source.normalized_phone),
            'target_phone': mask_phone(target.normalized_phone),
            'moved': moved,
            'skipped': skipped,
            'coins_moved': moved_coins,
        })
    return Response({
        'ok': True,
        'moved': moved,
        'skipped': skipped,
        'coins_moved': moved_coins,
        'source': _merge_user_brief(source),
        'target': UserSerializer(target, context={'request': request}).data,
    })


def _make_otp():
    return f'{secrets.randbelow(1_000_000):06d}'


def _prepare_otp(verification, ttl_seconds=None, max_attempts=None):
    """Yangi OTP yaratib hash'ini yozadi va ochiq kodni qaytaradi.

    `ttl_seconds`/`max_attempts` berilmasa telefon (Telegram) oqimi sozlamalari
    ishlatiladi — email oqimi o'z qiymatlarini uzatadi. EmailVerification
    maydonlari PhoneVerification bilan bir xil nomlangani uchun bitta yordamchi
    ikkala modelga ham yaraydi.
    """
    otp = _make_otp()
    if ttl_seconds is None:
        ttl_seconds = getattr(settings, 'PHONE_VERIFICATION_OTP_TTL_SECONDS', 300)
    if max_attempts is None:
        max_attempts = getattr(settings, 'PHONE_VERIFICATION_MAX_ATTEMPTS', 5)
    verification.otp_hash = make_password(otp)
    verification.otp_expires_at = timezone.now() + timedelta(seconds=ttl_seconds)
    verification.attempts_count = 0
    verification.max_attempts = max_attempts
    verification.save(update_fields=[
        'otp_hash', 'otp_expires_at', 'attempts_count', 'max_attempts', 'updated_at',
    ])
    return otp


def _telegram_bot_token(bot='auth'):
    if bot == 'manager':
        return (
            getattr(settings, 'TELEGRAM_MANAGER_BOT_TOKEN', '')
            or getattr(settings, 'TELEGRAM_BOT_TOKEN', '')
        )
    return (
        getattr(settings, 'TELEGRAM_AUTH_BOT_TOKEN', '')
        or getattr(settings, 'TELEGRAM_BOT_TOKEN', '')
    )


def _telegram_bot_username(bot='auth'):
    if bot == 'manager':
        return (
            getattr(settings, 'TELEGRAM_MANAGER_BOT_USERNAME', '')
            or getattr(settings, 'TELEGRAM_BOT_USERNAME', '')
        )
    return (
        getattr(settings, 'TELEGRAM_AUTH_BOT_USERNAME', '')
        or getattr(settings, 'TELEGRAM_BOT_USERNAME', '')
    )


def _telegram_api_call(method, payload, timeout=10, bot='auth', _retries=3):
    token = _telegram_bot_token(bot)
    if not token:
        logger.info('[telegram-%s-local] method=%s payload=%s', bot, method, payload)
        return None
    encoded = {}
    for key, value in (payload or {}).items():
        if isinstance(value, (dict, list)):
            encoded[key] = json.dumps(value)
        else:
            encoded[key] = value
    data = urllib.parse.urlencode(encoded).encode()
    url = f'https://api.telegram.org/bot{token}/{method}'
    import time as _time
    # TODO: Bu funksiya ba'zan HTTP request thread'i ichidan to'g'ridan-to'g'ri
    # chaqiriladi (webhook handlerlar, parol tiklash va h.k.). retry/sleep
    # request thread'ini bloklaydi — Gunicorn worker'ini band qiladi. To'liq
    # yechim: barcha chaqiruvlarni Celery task'iga ko'chirish (OTP yuborish
    # allaqachon send_telegram_otp_task'da). Hozircha sleep'ni qisqa (<=3s)
    # ushlab turamiz, 30s blok xavfli edi.
    _MAX_SLEEP = 3
    for attempt in range(_retries):
        try:
            req = urllib.request.Request(url, data=data, method='POST')
            with urllib.request.urlopen(req, timeout=timeout) as response:
                result = json.loads(response.read().decode('utf-8'))
            if not result.get('ok'):
                logger.warning('Telegram %s/%s returned not ok: %s', bot, method, result.get('description'))
                return None
            return result.get('result')
        except urllib.error.HTTPError as e:
            if e.code == 429:
                # Telegram rate limit — retry_after soniyadan keyin qayta urinish
                try:
                    body = json.loads(e.read().decode('utf-8'))
                    retry_after = body.get('parameters', {}).get('retry_after', 5)
                except Exception:
                    retry_after = 5
                logger.warning('Telegram %s/%s rate limited, retry after %ss (attempt %d/%d)',
                               bot, method, retry_after, attempt + 1, _retries)
                if attempt < _retries - 1:
                    _time.sleep(min(retry_after, _MAX_SLEEP))
                    continue
            else:
                logger.exception('Telegram %s/%s HTTP error %s', bot, method, e.code)
            return None
        except Exception:
            logger.exception('Telegram %s/%s failed (attempt %d/%d)', bot, method, attempt + 1, _retries)
            if attempt < _retries - 1:
                _time.sleep(min(2 ** attempt, _MAX_SLEEP))
                continue
            return None
    return None


def _telegram_api_post(method, payload, bot='auth'):
    return _telegram_api_call(method, payload, bot=bot) is not None


def _send_telegram_chat_action(chat_id, action='typing', bot='auth'):
    if not chat_id:
        return False
    return _telegram_api_post('sendChatAction', {
        'chat_id': chat_id,
        'action': action,
    }, bot=bot)


def _send_telegram_message(chat_id, text, reply_markup=None, bot='auth'):
    if not _telegram_bot_token(bot):
        safe_text = (
            'Tasdiqlash kodi: ******'
            if text.startswith(('Tasdiqlash kodi:', 'Parolni tiklash kodi:'))
            else text
        )
        logger.info('[telegram-%s-local] chat=%s text=%s', bot, chat_id, safe_text)
        return False
    payload = {'chat_id': chat_id, 'text': text}
    if reply_markup:
        payload['reply_markup'] = reply_markup
    return _telegram_api_post('sendMessage', payload, bot=bot)


def _answer_callback_query(callback_query_id, text, show_alert=False, bot='manager'):
    if not callback_query_id:
        return False
    return _telegram_api_post('answerCallbackQuery', {
        'callback_query_id': callback_query_id,
        'text': text,
        'show_alert': bool(show_alert),
    }, bot=bot)


def _clear_inline_keyboard(message, bot='manager'):
    chat = message.get('chat') or {}
    chat_id = chat.get('id')
    message_id = message.get('message_id')
    if not chat_id or not message_id:
        return False
    return _telegram_api_post('editMessageReplyMarkup', {
        'chat_id': chat_id,
        'message_id': message_id,
        'reply_markup': {'inline_keyboard': []},
    }, bot=bot)


def _download_telegram_file(file_id, max_bytes, bot='manager', fallback_mime='application/octet-stream'):
    token = _telegram_bot_token(bot)
    if not token or not file_id:
        return None, '', "Telegram bot token sozlanmagan."
    file_info = _telegram_api_call('getFile', {'file_id': file_id}, bot=bot)
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
        'pdf': 'application/pdf',
        'txt': 'text/plain',
        'csv': 'text/csv',
        'json': 'application/json',
    }.get(ext, fallback_mime)
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


def _telegram_document_file(message):
    document = message.get('document') or {}
    if not document:
        return '', 0, '', ''
    return (
        document.get('file_id') or '',
        int(document.get('file_size') or 0),
        document.get('mime_type') or '',
        document.get('file_name') or '',
    )


def _link_user_to_telegram(user, chat_id, telegram_user_id):
    """Link the given user to a telegram_user_id atomically.

    Race condition'lardan himoyalanish uchun transaction.atomic() ichida
    bajariladi. Agar bitta telegram_user_id allaqachon boshqa foydalanuvchiga
    bog'langan bo'lsa — eski egaga xabar yuboriladi va uning ulanishi
    bekor qilinadi (account takeover scenario'siga ogohlantirish).
    """
    with transaction.atomic():
        UserModel = type(user)
        # select_for_update orqali shu telegram_user_id'ga bog'liq boshqa
        # qatorlarni lock qilamiz — bir vaqtda ikkita link so'rovi bo'lsa
        # navbatga turadi.
        previous_owners = []
        if telegram_user_id:
            previous_owners = list(
                UserModel.objects
                .select_for_update()
                .exclude(pk=user.pk)
                .filter(telegram_user_id=str(telegram_user_id))
            )
            if previous_owners:
                # Eski egalardan chat_id'larni saqlab qolib, link'ni uzamiz.
                # Keyin transaction tashqarisida xabar yuboramiz.
                UserModel.objects.filter(
                    pk__in=[u.pk for u in previous_owners]
                ).update(
                    telegram_chat_id='',
                    telegram_user_id='',
                    telegram_linked_at=None,
                )
        user.telegram_chat_id = str(chat_id or '')
        user.telegram_user_id = str(telegram_user_id or '')
        user.telegram_linked_at = timezone.now()
        user.save(update_fields=[
            'telegram_chat_id', 'telegram_user_id', 'telegram_linked_at',
        ])

    # Eski egalarga ogohlantirish — atomic blok tashqarisida, xato bo'lsa
    # link jarayonini buzmaslik uchun. Bu funksiya login/register HTTP
    # handler ichidan chaqiriladi (Gunicorn thread). Telegram yuborishni
    # background task'ga topshiramiz: _telegram_api_call ichidagi retry/sleep
    # so'rovni 9 soniyagacha bloklamasin.
    for prev in previous_owners:
        prev_chat_id = (prev.telegram_chat_id or '').strip()
        if not prev_chat_id:
            continue
        text = (
            "Diqqat: sizning Olympy akkauntingiz boshqa qurilmaga ulandi. "
            "Agar bu siz bo'lmasangiz, darhol parolingizni o'zgartiring."
        )
        try:
            from accounts.tasks import send_telegram_message_task
            send_telegram_message_task.delay(prev_chat_id, text, bot='auth')
        except Exception:
            logger.warning(
                'failed to enqueue notify previous telegram owner user_id=%s', prev.pk,
            )
    return user


def _telegram_deep_link(verify_token, bot='auth'):
    username = _telegram_bot_username(bot)
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
    # Eski tasdiqlanmagan yozuvlarni butunlay o'chiramiz — har bir yangi
    # so'rovda yagona aktiv PhoneVerification qoladi. Avval faqat OTP
    # muddati o'tganlari o'chirilar va bir nechta "open" yozuv yig'ilib
    # qolardi.
    PhoneVerification.objects.filter(
        normalized_phone=normalized_phone,
        verified_at__isnull=True,
    ).delete()
    verification = PhoneVerification.objects.create(
        normalized_phone=normalized_phone,
        purpose=PhoneVerification.PURPOSE_REGISTRATION,
        verify_token=secrets.token_urlsafe(32),
        max_attempts=getattr(settings, 'PHONE_VERIFICATION_MAX_ATTEMPTS', 5),
    )
    return Response({
        'verification_id': verification.id,
        'phone': normalized_phone,
        'verify_token': verification.verify_token,
        'telegram_deep_link': _telegram_deep_link(verification.verify_token, bot='auth'),
        'bot_username': _telegram_bot_username('auth'),
    }, status=status.HTTP_201_CREATED)


start_telegram_phone_verification.cls.throttle_scope = 'auth'


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([ScopedRateThrottle])
def start_password_reset(request):
    """Start Telegram OTP flow for resetting an existing user's password."""
    serializer = StartPasswordResetSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    normalized_phone = serializer.validated_data['phone']
    # Eski tasdiqlanmagan parol-tiklash yozuvlarini butunlay o'chiramiz —
    # bir vaqtning o'zida yagona aktiv kod qolsin.
    PhoneVerification.objects.filter(
        normalized_phone=normalized_phone,
        purpose=PhoneVerification.PURPOSE_PASSWORD_RESET,
        verified_at__isnull=True,
    ).delete()
    verification = PhoneVerification.objects.create(
        normalized_phone=normalized_phone,
        purpose=PhoneVerification.PURPOSE_PASSWORD_RESET,
        verify_token=secrets.token_urlsafe(32),
        max_attempts=getattr(settings, 'PHONE_VERIFICATION_MAX_ATTEMPTS', 5),
    )
    # Enumeration himoyasi: hisob mavjudligidan qat'i nazar bir xil shakldagi
    # javob qaytariladi. Mavjud bo'lmagan raqam uchun ham OTP oqimi davom
    # etadi, lekin confirm_password_reset bosqichi parolni almashtirmaydi.
    return Response({
        'verification_id': verification.id,
        'phone': normalized_phone,
        'verify_token': verification.verify_token,
        'telegram_deep_link': _telegram_deep_link(verification.verify_token, bot='auth'),
        'bot_username': _telegram_bot_username('auth'),
        'detail': "Agar bu raqam ro'yxatdan o'tgan bo'lsa, kod yuboriladi",
    }, status=status.HTTP_201_CREATED)


start_password_reset.cls.throttle_scope = 'auth'


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([ScopedRateThrottle])
def start_telegram_account_link(request):
    """Start Telegram linking for an already authenticated account."""
    normalized_phone = request.user.normalized_phone
    # Eski tasdiqlanmagan ACCOUNT_LINK yozuvlarini butunlay tozalaymiz —
    # boshqa endpoint'lar bilan moslashtirish uchun. Avval faqat
    # `otp_expires_at__lt=now()` shartida tozalanardi va shu sababli
    # bir nechta open verification qator yig'ilib qolardi.
    PhoneVerification.objects.filter(
        normalized_phone=normalized_phone,
        purpose=PhoneVerification.PURPOSE_ACCOUNT_LINK,
        verified_at__isnull=True,
    ).delete()
    verification = PhoneVerification.objects.create(
        normalized_phone=normalized_phone,
        purpose=PhoneVerification.PURPOSE_ACCOUNT_LINK,
        verify_token=secrets.token_urlsafe(32),
        max_attempts=1,
    )
    return Response({
        'verification_id': verification.id,
        'phone': normalized_phone,
        'verify_token': verification.verify_token,
        'telegram_deep_link': _telegram_deep_link(verification.verify_token, bot='manager'),
        'bot_username': _telegram_bot_username('manager'),
        'telegram_linked': bool(request.user.telegram_chat_id),
    }, status=status.HTTP_201_CREATED)


start_telegram_account_link.cls.throttle_scope = 'auth'


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([ScopedRateThrottle])
def start_email_link(request):
    """POST /api/auth/email/link/start/ — hisobga email bog'lashni boshlaydi.

    Manzil `User.email` ga BU YERDA yozilmaydi — faqat confirm bosqichida,
    to'g'ri kod bilan. Shu sababli mavjud (tasdiqlangan) email yangisi
    tasdiqlanmaguncha o'z kuchida qoladi: foydalanuvchi manzilni almashtirish
    o'rtasida tiklash kanalisiz qolib qolmaydi.
    """
    from django.contrib.auth import get_user_model

    User = get_user_model()
    serializer = StartEmailLinkSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    email = serializer.validated_data['email']

    if User.objects.filter(email__iexact=email).exclude(pk=request.user.pk).exists():
        return Response({'detail': "Bu email boshqa hisobga bog'langan"},
                        status=status.HTTP_400_BAD_REQUEST)

    # Ochiq (tasdiqlanmagan) sessiyalarni tozalaymiz — start_telegram_account_
    # link bilan bir xil: har start yangi kod beradi va eski kodlar yig'ilib
    # qolmasligi kerak (aks holda eski manzilga yuborilgan kod ham amal qilardi).
    EmailVerification.objects.filter(
        user=request.user,
        purpose=EmailVerification.PURPOSE_ACCOUNT_LINK,
        verified_at__isnull=True,
    ).delete()
    verification = EmailVerification.objects.create(
        user=request.user,
        email=email,
        purpose=EmailVerification.PURPOSE_ACCOUNT_LINK,
    )
    ttl = getattr(settings, 'EMAIL_VERIFICATION_OTP_TTL_SECONDS', 900)
    otp = _prepare_otp(
        verification,
        ttl_seconds=ttl,
        max_attempts=getattr(settings, 'EMAIL_VERIFICATION_MAX_ATTEMPTS', 5),
    )
    send_email_verification_code(request.user, email, otp, max(1, ttl // 60))
    return Response({
        'verification_id': verification.id,
        'email': email,
        'expires_in': ttl,
        'detail': 'Tasdiqlash kodi emailingizga yuborildi',
    }, status=status.HTTP_201_CREATED)


start_email_link.cls.throttle_scope = 'email_link'


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([ScopedRateThrottle])
def confirm_email_link(request):
    """POST /api/auth/email/link/confirm/ — kodni tekshirib emailni bog'laydi."""
    from django.contrib.auth import get_user_model

    User = get_user_model()
    serializer = ConfirmEmailLinkSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    otp = serializer.validated_data['otp']

    try:
        # Race condition himoyasi (verify_otp bilan bir xil): parallel ikki
        # so'rov attempts_count'ni eski qiymatdan +1 yozib max_attempts limitini
        # aldashi mumkin edi. Kod tekshiruvi, urinish sanog'i va email yozish —
        # bitta atomic blokda, qator lock ostida.
        with transaction.atomic():
            verification = EmailVerification.objects.select_for_update().filter(
                user=request.user,
                purpose=EmailVerification.PURPOSE_ACCOUNT_LINK,
                verified_at__isnull=True,
                otp_hash__gt='',
            ).order_by('-created_at').first()

            if not verification:
                return Response({'detail': 'Verification not found'},
                                status=status.HTTP_400_BAD_REQUEST)
            if verification.attempts_count >= verification.max_attempts:
                security_logger.warning(
                    'email link blocked (too many attempts) user=%s', request.user.pk,
                )
                return Response({'detail': 'Too many attempts'},
                                status=status.HTTP_429_TOO_MANY_REQUESTS)
            if verification.otp_is_expired:
                return Response({'detail': 'OTP expired'},
                                status=status.HTTP_400_BAD_REQUEST)

            verification.attempts_count += 1
            if not check_password(otp, verification.otp_hash):
                verification.save(update_fields=['attempts_count', 'updated_at'])
                security_logger.warning(
                    'email link otp failed (wrong code) user=%s attempt=%s/%s',
                    request.user.pk,
                    verification.attempts_count, verification.max_attempts,
                )
                return Response({'detail': 'OTP noto\'g\'ri'},
                                status=status.HTTP_400_BAD_REQUEST)

            # Sessiya boshlangandan keyin boshqa hisob shu manzilni tasdiqlab
            # olgan bo'lishi mumkin — unique constraint 500 bermasin.
            if User.objects.filter(email__iexact=verification.email).exclude(
                pk=request.user.pk,
            ).exists():
                verification.save(update_fields=['attempts_count', 'updated_at'])
                return Response({'detail': "Bu email boshqa hisobga bog'langan"},
                                status=status.HTTP_400_BAD_REQUEST)

            user = User.objects.select_for_update().get(pk=request.user.pk)
            user.email = verification.email
            user.email_verified_at = timezone.now()
            user.save(update_fields=['email', 'email_verified_at'])
            verification.verified_at = timezone.now()
            verification.save(update_fields=['attempts_count', 'verified_at', 'updated_at'])
    except IntegrityError:
        # Yuqoridagi exists() tekshiruvi bilan bir vaqtda boshqa hisob shu
        # manzilni yozib qo'ygan holat (unique constraint).
        return Response({'detail': "Bu email boshqa hisobga bog'langan"},
                        status=status.HTTP_400_BAD_REQUEST)

    return Response(UserSerializer(user, context={'request': request}).data)


confirm_email_link.cls.throttle_scope = 'auth'


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([ScopedRateThrottle])
def verify_otp(request):
    """Verify Telegram-delivered OTP for a normalized phone number."""
    serializer = VerifyOtpSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    normalized_phone = serializer.validated_data['phone']
    otp = serializer.validated_data['otp']
    purpose = serializer.validated_data.get('purpose')

    # Race condition himoyasi: ikkita parallel verify so'rovi bir vaqtda
    # attempts_count'ni o'qib, ikkalasi ham eski qiymatdan +1 yozib yuborishi
    # mumkin edi (lost update) — natijada max_attempts limiti aldanardi.
    # select_for_update qatorni lock qiladi va attempts_count oshirish hamda
    # verified_at yozish bitta tranzaksiyada atomik bo'ladi.
    with transaction.atomic():
        qs = PhoneVerification.objects.select_for_update().filter(
            normalized_phone=normalized_phone,
            verified_at__isnull=True,
            otp_hash__gt='',
        )
        # Purpose berilsa — aynan shu maqsad uchun yaratilgan kodgina o'tadi
        # (registration kodi account_link'da ishlamasin). Berilmasa (eski
        # klientlar) avvalgidek password_reset'dan boshqa hammasi izlanadi.
        if purpose:
            qs = qs.filter(purpose=purpose)
        else:
            qs = qs.exclude(purpose=PhoneVerification.PURPOSE_PASSWORD_RESET)
        verification = qs.order_by('-created_at').first()

        if not verification:
            return Response({'detail': 'Verification not found'},
                            status=status.HTTP_400_BAD_REQUEST)
        if verification.attempts_count >= verification.max_attempts:
            security_logger.warning(
                'otp verify blocked (too many attempts) phone=%s',
                mask_phone(normalized_phone),
            )
            return Response({'detail': 'Too many attempts'},
                            status=status.HTTP_429_TOO_MANY_REQUESTS)
        if verification.otp_is_expired:
            return Response({'detail': 'OTP expired'},
                            status=status.HTTP_400_BAD_REQUEST)

        verification.attempts_count += 1
        if not check_password(otp, verification.otp_hash):
            verification.save(update_fields=['attempts_count', 'updated_at'])
            security_logger.warning(
                'otp verify failed (wrong code) phone=%s attempt=%s/%s',
                mask_phone(normalized_phone),
                verification.attempts_count, verification.max_attempts,
            )
            return Response({'detail': 'OTP noto\'g\'ri'},
                            status=status.HTTP_400_BAD_REQUEST)

        verification.verified_at = timezone.now()
        verification.save(update_fields=['attempts_count', 'verified_at', 'updated_at'])
    return Response({'verified': True, 'phone': normalized_phone})


verify_otp.cls.throttle_scope = 'auth'


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([ScopedRateThrottle])
def confirm_password_reset(request):
    """Verify Telegram OTP and replace the user's password."""
    serializer = ConfirmPasswordResetSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    normalized_phone = serializer.validated_data['phone']
    otp = serializer.validated_data['otp']
    new_password = serializer.validated_data['password']

    from django.contrib.auth import get_user_model
    from django.core.cache import cache

    User = get_user_model()

    # Race condition himoyasi: OTP tekshiruvi, attempts_count oshirish va
    # parol almashtirish — barchasi bitta atomic blokda select_for_update
    # bilan. Avval OTP tekshiruvi va attempts_count oshirish lock'siz, atomic
    # blok tashqarisida bo'lgani uchun ikkita parallel so'rov max_attempts'ni
    # aldab, har biri bitta noto'g'ri urinishni "yo'qotishi" mumkin edi.
    with transaction.atomic():
        verification = PhoneVerification.objects.select_for_update().filter(
            normalized_phone=normalized_phone,
            purpose=PhoneVerification.PURPOSE_PASSWORD_RESET,
            verified_at__isnull=True,
            otp_hash__gt='',
        ).order_by('-created_at').first()

        if not verification:
            return Response({'detail': 'Verification not found'},
                            status=status.HTTP_400_BAD_REQUEST)
        if verification.attempts_count >= verification.max_attempts:
            security_logger.warning(
                'password reset blocked (too many attempts) phone=%s',
                mask_phone(normalized_phone),
            )
            return Response({'detail': 'Too many attempts'},
                            status=status.HTTP_429_TOO_MANY_REQUESTS)
        if verification.otp_is_expired:
            return Response({'detail': 'OTP expired'},
                            status=status.HTTP_400_BAD_REQUEST)

        verification.attempts_count += 1
        if not check_password(otp, verification.otp_hash):
            verification.save(update_fields=['attempts_count', 'updated_at'])
            security_logger.warning(
                'password reset otp failed (wrong code) phone=%s attempt=%s/%s',
                mask_phone(normalized_phone),
                verification.attempts_count, verification.max_attempts,
            )
            return Response({'detail': 'OTP noto\'g\'ri'},
                            status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.filter(normalized_phone=normalized_phone).first()
        if not user:
            return Response({'detail': 'Foydalanuvchi topilmadi'},
                            status=status.HTTP_400_BAD_REQUEST)
        if not user.is_active:
            return Response({'detail': 'Hisob bloklangan'},
                            status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.select_for_update().get(pk=user.pk)
        user.set_password(new_password)
        user.token_version = (user.token_version or 0) + 1
        user.save(update_fields=['password', 'token_version'])
        verification.verified_at = timezone.now()
        verification.save(update_fields=['attempts_count', 'verified_at', 'updated_at'])
        PhoneVerification.objects.filter(
            normalized_phone=normalized_phone,
            purpose=PhoneVerification.PURPOSE_PASSWORD_RESET,
            verified_at__isnull=True,
        ).exclude(pk=verification.pk).delete()
    cache.delete(LoginSerializer._failed_cache_key(normalized_phone))

    return _auth_response(request, user, extra={'password_reset': True})


confirm_password_reset.cls.throttle_scope = 'auth'


def _message_from_update(update):
    return update.get('message') or update.get('edited_message') or {}


def _callback_query_from_update(update):
    return update.get('callback_query') or {}


def _handle_telegram_callback(callback, bot='manager'):
    callback_id = str(callback.get('id') or '')
    sender = callback.get('from') or {}
    telegram_user_id = str(sender.get('id') or '')
    data = callback.get('data') or ''
    message = callback.get('message') or {}

    parts = data.split(':')
    if len(parts) != 3 or parts[0] != 'membership' or parts[1] not in ('approve', 'reject'):
        _answer_callback_query(callback_id, "Noma'lum buyruq", show_alert=True, bot=bot)
        return {'ok': True}

    decision = 'approved' if parts[1] == 'approve' else 'rejected'
    try:
        membership_id = int(parts[2])
    except (TypeError, ValueError):
        _answer_callback_query(callback_id, "Ariza topilmadi", show_alert=True, bot=bot)
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
            bot=bot,
        )
        return {'ok': True}

    membership = (
        CenterMembership.objects
        .select_related('user', 'center')
        .filter(pk=membership_id)
        .first()
    )
    if not membership:
        _answer_callback_query(callback_id, "Ariza topilmadi", show_alert=True, bot=bot)
        return {'ok': True}

    try:
        membership = decide_membership(membership, actor, decision)
    except PermissionDenied:
        _answer_callback_query(callback_id, "Bu arizani tasdiqlash huquqingiz yo'q", show_alert=True, bot=bot)
        return {'ok': True}
    except ValidationError as exc:
        detail = '; '.join(exc.messages) if hasattr(exc, 'messages') else str(exc)
        _answer_callback_query(callback_id, detail or "Ariza ko'rib chiqilgan", show_alert=True, bot=bot)
        return {'ok': True}

    _clear_inline_keyboard(message, bot=bot)
    if decision == 'approved':
        text = f"✅ {membership.user.full_name} tasdiqlandi."
    else:
        text = f"❌ {membership.user.full_name} rad etildi."
    _answer_callback_query(callback_id, text, bot=bot)
    chat_id = (message.get('chat') or {}).get('id') or actor.telegram_chat_id
    if chat_id:
        location = ' · '.join(part for part in [
            membership.center.country or "O'zbekiston",
            membership.center.region,
            membership.center.district or membership.center.city,
        ] if part)
        info_text = (
            f"{text}\n"
            f"Tashkilot: {membership.center.name}\n"
            f"Turi: {membership.center.organization_type}\n"
            f"Manzil: {location}"
        )
        # Callback javobi (_answer_callback_query) va keyboard tozalash
        # allaqachon yuborilgan — bu qo'shimcha ma'lumot xabari foydalanuvchi
        # kutmaydigan fire-and-forget. Webhook handler Gunicorn thread'da
        # ishlaydi, shuning uchun yuborishni background task'ga topshiramiz
        # (retry/sleep webhook javobini bloklamasin).
        try:
            from accounts.tasks import send_telegram_message_task
            send_telegram_message_task.delay(chat_id, info_text, bot=bot)
        except Exception:
            logger.exception('membership decision info xabarini navbatga qo\'yib bo\'lmadi')
    return {'ok': True}


def _handle_ai_roster_message(message, telegram_user_id, chat_id, bot='manager'):
    text = (message.get('caption') or message.get('text') or '').strip()
    if text.startswith('/'):
        return False
    file_id, file_size, detected_mime = _telegram_image_file_id(message)
    document_id, document_size, document_mime, document_name = _telegram_document_file(message)
    if not text and not file_id and not document_id:
        return False

    from django.contrib.auth import get_user_model
    from centers.manager_bot import extract_document_text, handle_manager_message

    User = get_user_model()
    actor = User.objects.filter(
        telegram_user_id=str(telegram_user_id or ''),
        is_active=True,
    ).first()
    if not actor:
        _send_telegram_message(
            chat_id,
            "Avval sayt panelidan Botni ulash tugmasini bosing va telefon raqamingizni yuboring.",
            bot=bot,
        )
        return True

    _send_telegram_chat_action(chat_id, 'typing', bot=bot)

    image_bytes = None
    mime_type = detected_mime or 'image/jpeg'
    document_text = ''
    if file_id:
        max_bytes = getattr(settings, 'AI_ROSTER_MAX_IMAGE_BYTES', 5 * 1024 * 1024)
        if file_size and file_size > max_bytes:
            _send_telegram_message(chat_id, f"Rasm juda katta. Limit: {max_bytes // (1024 * 1024)} MB.", bot=bot)
            return True
        image_bytes, mime_type, error = _download_telegram_file(
            file_id,
            max_bytes,
            bot=bot,
            fallback_mime=detected_mime or 'image/jpeg',
        )
        if error:
            _send_telegram_message(chat_id, f"⚠ {error}", bot=bot)
            return True
    elif document_id:
        max_bytes = getattr(settings, 'AI_MANAGER_BOT_MAX_DOCUMENT_BYTES', 10 * 1024 * 1024)
        if document_size and document_size > max_bytes:
            _send_telegram_message(chat_id, f"Fayl juda katta. Limit: {max_bytes // (1024 * 1024)} MB.", bot=bot)
            return True
        document_bytes, downloaded_mime, error = _download_telegram_file(
            document_id,
            max_bytes,
            bot=bot,
            fallback_mime=document_mime or 'application/octet-stream',
        )
        if error:
            _send_telegram_message(chat_id, f"⚠ {error}", bot=bot)
            return True
        doc_result = extract_document_text(
            document_bytes,
            mime_type=document_mime or downloaded_mime,
            filename=document_name,
        )
        if not doc_result.get('ok'):
            _send_telegram_message(chat_id, doc_result.get('error') or "Faylni o'qib bo'lmadi.", bot=bot)
            return True
        document_text = doc_result.get('text') or ''
        vision_entries = doc_result.get('entries') if doc_result.get('via_vision') else None
        if vision_entries:
            from centers.ai_roster import approve_roster_names, save_center_roster, _manageable_centers
            from centers.manager_bot import format_approval_summary
            centers = _manageable_centers(actor)
            if len(centers) == 1:
                save_center_roster(centers[0].id, vision_entries)
            summary = approve_roster_names(actor, vision_entries, source='telegram_manager_bot')
            reply = format_approval_summary(summary)
            _send_telegram_message(chat_id, reply, bot=bot)
            return True

    reply = handle_manager_message(
        actor,
        text=text,
        image_bytes=image_bytes,
        mime_type=mime_type,
        document_text=document_text,
        source='telegram_manager_bot',
    )
    _send_telegram_message(chat_id, reply, bot=bot)
    return True


def handle_telegram_update(update, bot='auth'):
    """Process one Telegram update from either webhook or local polling."""
    update = update if isinstance(update, dict) else {}
    callback = _callback_query_from_update(update)
    if callback:
        return _handle_telegram_callback(callback, bot='manager')

    message = _message_from_update(update)
    chat = message.get('chat') or {}
    sender = message.get('from') or {}
    chat_id = str(chat.get('id') or '')
    telegram_user_id = str(sender.get('id') or '')
    text = message.get('text') or ''

    if text.startswith('/start'):
        parts = text.split(maxsplit=1)
        verify_token = parts[1].strip() if len(parts) > 1 else ''
        # O1: avval bo'sh `verify_token` bilan `filter(verify_token='')`
        # qilinardi va eng eski bo'sh-token yozuv tasodifan qaytarilishi
        # mumkin edi (yoki bir nechta yozuv mos kelishi). Bo'sh tokenda
        # erta qaytamiz — start tugmasi ravon ishlaydi.
        if not verify_token:
            if chat_id:
                _send_telegram_message(
                    chat_id,
                    'Salom! Telefon raqamni tasdiqlash uchun web-saytdan keling.',
                    bot=bot,
                )
            return {'ok': True}
        verification = PhoneVerification.objects.filter(
            verify_token=verify_token,
            verified_at__isnull=True,
        ).first()
        if verification and chat_id:
            # Avval `verification.save()` orqali ob'yektga yozardi va bu
            # concurrent telegram update'larida (foydalanuvchi tezda
            # /start ni 2 marta yuborsa) race condition keltirib chiqarardi.
            # `update()` atomic SQL UPDATE — boshqa thread/process'dagi
            # yangilanishlarni bosib o'tmaydi va lock kutmaydi.
            PhoneVerification.objects.filter(pk=verification.pk).update(
                telegram_chat_id=chat_id,
                telegram_user_id=telegram_user_id,
                updated_at=timezone.now(),
            )
            verification.telegram_chat_id = chat_id
            verification.telegram_user_id = telegram_user_id
            _send_telegram_message(chat_id, 'Telefon raqamingizni yuboring.', {
                'keyboard': [[{'text': 'Telefon raqamni yuborish', 'request_contact': True}]],
                'resize_keyboard': True,
                'one_time_keyboard': True,
            }, bot=bot)
        return {'ok': True}

    contact = message.get('contact') or {}
    if contact and chat_id:
        contact_user_id = str(contact.get('user_id') or '')
        contact_phone = normalize_phone(contact.get('phone_number'))
        same_telegram_user = bool(contact_user_id) and contact_user_id == telegram_user_id
        # Race condition himoyasi: Telegram webhook retry'larida parallel
        # so'rovlar bir xil PhoneVerification'ni o'qib, ikkalasi ham verified_at
        # yozib, _link_user_to_telegram'ni ikki marta chaqirishi mumkin edi.
        # select_for_update qatorni lock qiladi — ikkinchi so'rov birinchisini
        # kutadi, keyin verified_at allaqachon to'ldirilgani uchun (isnull=True
        # filtri orqali) verification'ni topa olmaydi. verified_at yozish va
        # _link_user_to_telegram chaqiruvi shu atomic blok ichida bajariladi.
        with transaction.atomic():
            verification = PhoneVerification.objects.select_for_update().filter(
                telegram_chat_id=chat_id,
                verified_at__isnull=True,
            ).order_by('-created_at').first()
            if verification and same_telegram_user and contact_phone == verification.normalized_phone:
                from django.contrib.auth import get_user_model

                User = get_user_model()
                existing_user = User.objects.filter(normalized_phone=verification.normalized_phone).first()
                if existing_user:
                    _link_user_to_telegram(existing_user, chat_id, telegram_user_id)
                    if verification.purpose == PhoneVerification.PURPOSE_PASSWORD_RESET:
                        otp = _prepare_otp(verification)
                        # OTP yuborish background Celery task'ga ko'chirildi —
                        # Telegram 429 webhook javobini bloklamaydi.
                        try:
                            from accounts.tasks import send_telegram_otp_task
                            send_telegram_otp_task.delay(
                                chat_id=chat_id,
                                text=f'Parolni tiklash kodi: {otp}',
                                bot=bot,
                            )
                        except Exception:
                            logger.exception('send_telegram_otp_task.delay failed, falling back to direct send')
                            _send_telegram_message(chat_id, f'Parolni tiklash kodi: {otp}', bot=bot)
                        return {'ok': True}

                    verification.verified_at = timezone.now()
                    verification.save(update_fields=['verified_at', 'updated_at'])
                    _send_telegram_message(
                        chat_id,
                        "Telegram bot hisobingizga ulandi. Endi arizalarni botdan tasdiqlashingiz mumkin.",
                        bot=bot,
                    )
                    return {'ok': True}

                if verification.purpose == PhoneVerification.PURPOSE_PASSWORD_RESET:
                    _send_telegram_message(
                        chat_id,
                        "Bu telefon raqam bilan hisob topilmadi.",
                        bot=bot,
                    )
                    return {'ok': True}

                if bot == 'manager':
                    _send_telegram_message(
                        chat_id,
                        "Avval ro'yxatdan o'tish uchun kod botidan foydalaning.",
                        bot=bot,
                    )
                    return {'ok': True}

                otp = _prepare_otp(verification)
                # OTP yuborish background Celery task'ga ko'chirildi —
                # Telegram 429 webhook javobini bloklamaydi.
                try:
                    from accounts.tasks import send_telegram_otp_task
                    send_telegram_otp_task.delay(
                        chat_id=chat_id,
                        text=f'Tasdiqlash kodi: {otp}',
                        bot=bot,
                    )
                except Exception:
                    logger.exception('send_telegram_otp_task.delay failed, falling back to direct send')
                    _send_telegram_message(chat_id, f'Tasdiqlash kodi: {otp}', bot=bot)
            else:
                _send_telegram_message(chat_id, 'Telefon raqam mos kelmadi.', bot=bot)
        return {'ok': True}

    same_bot = _telegram_bot_token('auth') == _telegram_bot_token('manager')
    if (bot == 'manager' or same_bot) and _handle_ai_roster_message(message, telegram_user_id, chat_id, bot=bot):
        return {'ok': True}

    return {'ok': True}


def _telegram_webhook_secret(bot='auth'):
    if bot == 'manager':
        return (
            os.environ.get('TELEGRAM_MANAGER_WEBHOOK_SECRET', '')
            or os.environ.get('TELEGRAM_WEBHOOK_SECRET', '')
        )
    return (
        os.environ.get('TELEGRAM_AUTH_WEBHOOK_SECRET', '')
        or os.environ.get('TELEGRAM_WEBHOOK_SECRET', '')
    )


def _telegram_webhook_response(request, bot='auth'):
    """Telegram webhook for /start, contact share, and inline callbacks.

    Production (DEBUG=False) requires a webhook secret; without it the endpoint
    refuses every call so that a misconfigured deploy can't be abused. In dev
    (DEBUG=True) the secret is optional to keep the local polling/mock flow
    intact.
    """
    secret = _telegram_webhook_secret(bot)
    if not secret:
        # Production'da secret MAJBURIY: bo'sh/sozlanmagan bo'lsa endpoint
        # ochiq qolmasligi uchun har qanday so'rovni rad etamiz. Faqat dev
        # (DEBUG=True) muhitida lokal polling/mock oqimini saqlash uchun
        # secretsiz davom etamiz.
        if not settings.DEBUG:
            logger.error('TELEGRAM_WEBHOOK_SECRET is required in production')
            return Response({'detail': 'Server misconfigured'},
                            status=status.HTTP_503_SERVICE_UNAVAILABLE)
    else:
        # Secret sozlangan — timing-safe taqqoslash (hmac.compare_digest).
        import hmac as _hmac
        provided = request.headers.get('X-Telegram-Bot-Api-Secret-Token', '') or ''
        if not _hmac.compare_digest(str(provided), str(secret)):
            return Response({'detail': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)

    update = request.data if isinstance(request.data, dict) else {}
    if not update and request.body:
        try:
            update = json.loads(request.body.decode('utf-8'))
        except (TypeError, ValueError):
            update = {}
    return Response(handle_telegram_update(update, bot=bot))


@api_view(['POST'])
@permission_classes([AllowAny])
def telegram_webhook(request):
    """Backward-compatible auth bot webhook."""
    return _telegram_webhook_response(request, bot='auth')


@api_view(['POST'])
@permission_classes([AllowAny])
def telegram_auth_webhook(request):
    return _telegram_webhook_response(request, bot='auth')


@api_view(['POST'])
@permission_classes([AllowAny])
def telegram_manager_webhook(request):
    return _telegram_webhook_response(request, bot='manager')


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def activity_leaderboard(request):
    """GET /api/accounts/activity-leaderboard/ — Ketma-ket faollik kunlari bo'yicha haftalik eng faol o'quvchilar reytingi."""
    from django.contrib.auth import get_user_model
    from django.db.models import Count, Q as DQ
    User = get_user_model()

    # Faqat student rolidagi faol foydalanuvchilar. roles JSONField'da
    # 'student' bo'lganlar yoki tasdiqlangan student a'zoligi borlar.
    # N+1'ni oldini olish: get_badges() ishlatadigan annotatsiyalarni
    # (attempts_100_count, total_attempts_count) queryset darajasida
    # qo'shamiz — admin_users_list'dagi kabi. Aks holda 15 user × 2 = 30
    # qo'shimcha COUNT so'rovi otilardi.
    from centers.models import CenterMembership
    qs = (
        User.objects
        .filter(is_active=True, streak_count__gt=0)
        # Platform adminlarni faollik reytingidan chiqarib tashlaymiz.
        .exclude(is_platform_admin=True)
        .filter(
            DQ(roles__contains=['student'])
            | DQ(
                memberships__role=CenterMembership.ROLE_STUDENT,
                memberships__status=CenterMembership.STATUS_APPROVED,
            )
        )
        .annotate(
            attempts_100_count=Count(
                'attempts',
                filter=DQ(attempts__score=100, attempts__disqualified=False),
                distinct=True,
            ),
            total_attempts_count=Count(
                'attempts',
                filter=DQ(attempts__disqualified=False),
                distinct=True,
            ),
        )
        .distinct()
        .order_by('-streak_count', '-last_active_date')[:15]
    )

    from .utils import avatar_url_for
    entries = []
    for i, u in enumerate(qs):
        entries.append({
            'rank': i + 1,
            'user_id': u.id,
            'name': u.full_name or u.phone or "O'quvchi",
            'avatar_url': avatar_url_for(u, request),
            'streak_count': u.streak_count,
            'badges': u.get_badges()[:2]  # Expose up to 2 badges
        })

    return Response(entries)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_rewards(request):
    """GET /api/me/rewards/
    Mukofot do'konidagi mahsulotlarni va o'quvchining joriy tangalarini qaytaradi.
    """
    from django.db.models import Q
    from .models import RewardProduct
    from .views_shop import _student_center_for

    # O'quvchi global (center=null, admin do'koni) mahsulotlarni va o'z
    # markazining mahsulotlarini ko'radi — boshqa markaz mahsulotlari emas.
    # Faqat faol (is_active) va zaxirada bor mahsulotlar.
    student_center = _student_center_for(request.user)
    center_filter = Q(center__isnull=True)
    if student_center is not None:
        center_filter |= Q(center=student_center)
    products = (
        RewardProduct.objects
        .filter(center_filter, is_active=True, stock__gt=0)
        # `p.center.name` loop ichida — `select_related` bo'lmasa har
        # mahsulot uchun alohida SELECT (N+1).
        .select_related('center')
        .order_by('-created_at')
    )
    data = []
    for p in products:
        img_url = ''
        if p.image:
            try:
                img_url = request.build_absolute_uri(p.image.url)
            except Exception:
                img_url = ''
        data.append({
            'id': p.id,
            'title': p.title,
            'description': p.description,
            'coin_cost': p.coin_cost,
            'icon': p.icon,
            'image_url': img_url,
            'features': p.features or [],
            'stock': p.stock,
            'center_id': p.center_id,
            'center_name': p.center.name if p.center_id else '',
            'is_premium_only': getattr(p, 'is_premium_only', False),
        })
    return Response({
        'coins': request.user.coins,
        'products': data
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def redeem_reward(request):
    """POST /api/me/rewards/redeem/
    Body: {"product_id": <int>}
    O'quvchining tangalarini yechib mukofotni buyurtma qiladi.
    """
    from .models import RewardProduct, RewardRedemption
    product_id = request.data.get('product_id')
    if not product_id:
        return Response({'detail': "Maxsulot ID majburiy"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        product = RewardProduct.objects.get(pk=product_id)
    except RewardProduct.DoesNotExist:
        return Response({'detail': "Mukofot topilmadi"}, status=status.HTTP_404_NOT_FOUND)

    # Markaz do'koni izolyatsiyasi: o'quvchi faqat global (center=null, admin
    # do'koni) yoki O'Z markazining mahsulotini sotib oladi. Boshqa markaz
    # mahsulotiga so'rov yuborilsa 404 (mavjudligini ham oshkor qilmaymiz).
    if product.center_id is not None:
        from .views_shop import _student_center_for
        student_center = _student_center_for(request.user)
        if student_center is None or product.center_id != student_center.id:
            return Response({'detail': "Mukofot topilmadi"}, status=status.HTTP_404_NOT_FOUND)

    if not product.is_active:
        return Response({'detail': "Bu mukofot mavjud emas"}, status=status.HTTP_400_BAD_REQUEST)

    if product.stock <= 0:
        return Response({'detail': "Bu mukofot tugagan"}, status=status.HTTP_400_BAD_REQUEST)

    if getattr(product, 'is_premium_only', False) and not request.user.is_premium:
        return Response({'detail': "Ushbu mukofot faqat Premium o'quvchilar uchun"}, status=status.HTTP_403_FORBIDDEN)

    if request.user.coins < product.coin_cost:
        return Response({'detail': "Tangalar yetarli emas"}, status=status.HTTP_400_BAD_REQUEST)

    # Atomic block to prevent race conditions on stock va coins
    from django.db import transaction
    from django.contrib.auth import get_user_model
    User = get_user_model()
    try:
        with transaction.atomic():
            product = RewardProduct.objects.select_for_update().get(pk=product_id)
            if product.stock <= 0:
                return Response({'detail': "Bu mukofot tugagan"}, status=status.HTTP_400_BAD_REQUEST)

            # Foydalanuvchini qulflab, yangi (stale bo'lmagan) nusxani olamiz
            user = User.objects.select_for_update().get(pk=request.user.pk)
            if user.coins < product.coin_cost:
                return Response({'detail': "Tangalar yetarli emas"}, status=status.HTTP_400_BAD_REQUEST)

            user.coins -= product.coin_cost
            user.save(update_fields=['coins'])

            product.stock -= 1
            product.save(update_fields=['stock'])

            redemption = RewardRedemption.objects.create(
                user=user,
                product=product,
                status=RewardRedemption.STATUS_PENDING
            )
    except IntegrityError:
        # Bir vaqtda ikki marta sotib olish (race) yoki unique cheklov buzilishi
        # — mukofot allaqachon shu foydalanuvchi tomonidan band qilingan.
        return Response(
            {'detail': "Bu mukofot allaqachon sotib olingan"},
            status=status.HTTP_409_CONFLICT,
        )
    except ValidationError as exc:
        # Model validatsiyasi (clean/full_clean) muvaffaqiyatsiz — foydalanuvchiga
        # aniq xabarni qaytaramiz.
        detail = exc.messages[0] if getattr(exc, 'messages', None) else "Ma'lumot noto'g'ri"
        return Response({'detail': detail}, status=status.HTTP_400_BAD_REQUEST)
    except ObjectDoesNotExist:
        # select_for_update().get(...) — mahsulot/foydalanuvchi tranzaksiya
        # ichida o'chirilgan bo'lsa (race) DoesNotExist ko'tariladi.
        return Response({'detail': "Mukofot topilmadi"}, status=status.HTTP_404_NOT_FOUND)
    except Exception:
        # Kutilmagan xatolar — to'liq stack trace bilan log qilamiz (debugging
        # uchun), foydalanuvchiga umumiy 500 qaytaramiz.
        logger.exception("redeem_reward kutilmagan xatosi: user=%s", request.user.pk)
        return Response(
            {'detail': "Xatolik yuz berdi. Iltimos qayta urinib ko'ring."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    return Response({
        'detail': "Mukofot muvaffaqiyatli buyurtma qilindi!",
        'coins': user.coins,
        'redemption_id': redemption.id
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_redemptions(request):
    """GET /api/me/rewards/my-redemptions/
    O'quvchining buyurtmalari tarixini qaytaradi.
    """
    from .models import RewardRedemption
    redemptions = (
        RewardRedemption.objects
        .filter(user=request.user)
        .select_related('product')
        .order_by('-redeemed_at')
    )

    def _serialize(r):
        return {
            'id': r.id,
            'product_title': r.product.title,
            'product_icon': r.product.icon,
            'coin_cost': r.product.coin_cost,
            'status': r.status,
            'status_display': r.get_status_display(),
            'redeemed_at': r.redeemed_at.isoformat(),
        }

    # Pagination: buyurtmalar tarixi vaqt o'tishi bilan o'sib boradi —
    # DEFAULT_PAGINATION_CLASS (PageNumberPagination, PAGE_SIZE=50) qo'llaymiz.
    from rest_framework.pagination import PageNumberPagination
    paginator = PageNumberPagination()
    page = paginator.paginate_queryset(redemptions, request)
    if page is not None:
        return paginator.get_paginated_response([_serialize(r) for r in page])
    return Response([_serialize(r) for r in redemptions])


def calculate_predictions_for_user(user):
    # Bashorat hisoblanishi 2 ta DB aggregate (avg + per-subject) va bitta
    # tashqi AI so'rovini talab qiladi — har sahifa yuklanishida bajarilsa
    # qimmat. Natijani 5 daqiqaga cache'laymiz; foydalanuvchi yangi attempt
    # qo'shganda cache invalidate qilinadi (attempts/views.py'da).
    from django.core.cache import cache
    from .utils import predictions_cache_key

    cache_key = predictions_cache_key(user.id)
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    result = _compute_predictions_for_user(user)
    cache.set(cache_key, result, 300)
    return result


def _compute_predictions_for_user(user):
    from attempts.models import TestAttempt
    from django.db.models import Avg
    attempts = TestAttempt.objects.filter(user=user, disqualified=False).select_related('olympiad')
    attempts_count = attempts.count()
    
    if attempts_count == 0:
        return {
            'avg_score': 0,
            'attempts_count': 0,
            'subject_performance': {},
            'predictions': {
                'presidential_school': 10,
                'al_xorazmiy': 10,
                'dtm': 10,
            },
            'ai_analysis': "Sizda hali topshirilgan imtihonlar mavjud emas. AI bashorat qilishi uchun kamida bitta imtihon topshiring!"
        }

    avg_score = attempts.aggregate(Avg('score'))['score__avg'] or 0
    avg_score = round(avg_score, 1)

    subject_performance = {}
    subjects = attempts.values('olympiad__subject').annotate(Avg('score'))
    for s in subjects:
        sub = s.get('olympiad__subject') or 'Boshqa'
        score = s.get('score__avg') or 0
        subject_performance[sub] = round(score, 1)

    # Bashorat faqat o'rtacha ball (avg_score) asosida hisoblanadi. Avval
    # `attempts_count * 0.5` qo'shilardi — bu ko'p test topshirgan, ammo
    # ballari past o'quvchining bashoratini sun'iy oshirib yuborardi (sifat
    # emas, son rag'batlantirilardi). Endi imtihonlar soni bashoratga ta'sir
    # qilmaydi.
    presidential_school = min(99, max(10, int(avg_score * 0.9)))
    al_xorazmiy = min(99, max(10, int(avg_score * 0.85)))
    dtm = min(99, max(10, int(avg_score * 1.05)))

    from .utils import predict_success_ai
    ai_analysis = predict_success_ai(user.full_name or user.phone, avg_score, attempts_count, subject_performance)

    return {
        'avg_score': avg_score,
        'attempts_count': attempts_count,
        'subject_performance': subject_performance,
        'predictions': {
            'presidential_school': presidential_school,
            'al_xorazmiy': al_xorazmiy,
            'dtm': dtm,
        },
        'ai_analysis': ai_analysis
    }


@api_view(['GET'])
@permission_classes([IsAuthenticated])
@throttle_classes([ScopedRateThrottle])
def get_my_predictions(request):
    """GET /api/me/predictions/
    O'quvchining o'z natijalari bo'yicha AI muvaffaqiyat bashoratlarini qaytaradi.
    """
    res = calculate_predictions_for_user(request.user)
    return Response(res)


# Alohida 'ai_predictions' scope — 'ai' (10/day, explain_question/
# explain_all_mistakes uchun) bilan bo'lishilmaydi. Bu passiv dashboard
# widget bo'lib, har "bosh sahifa" ochilganda avtomatik so'raladi; ilgari
# umumiy 'ai' byudjetini tez tugatib, o'quvchiga BUTUN AI tizimi ishlamayapti
# degan taassurot qoldirardi (ko'rinishda bog'liq bo'lmagan explain
# funksiyalari ham shu bilan birga bloklanardi).
get_my_predictions.cls.throttle_scope = 'ai_predictions'


# ---------------------------------------------------------------------------
# Audit log (Platform Admin)
# ---------------------------------------------------------------------------

@api_view(['GET'])
@permission_classes([IsPlatformAdmin])
def audit_log_list(request):
    """GET /api/admin/audit-log/ — audit yozuvlari (faqat platform admin).

    Paginatsiya majburiy: jurnal cheksiz o'sadi va avval qat'iy `[:100]`
    kesim bor edi — undan eskiroq yozuvlarga admin panelidan umuman yetib
    bo'lmasdi. `?page=` / `?page_size=` (max 200) boshqa admin ro'yxatlari
    bilan bir xil `LargePageNumberPagination` orqali.

    `?search=` — aktor ismi, harakat kodi, IP yoki target ID bo'yicha.
    Target nomi bo'yicha qidiruv yo'q: target generic (target_type +
    target_id), SQL join qilib bo'lmaydi.
    """
    from django.contrib.auth import get_user_model
    from django.db.models import Q

    from olympy_api.pagination import LargePageNumberPagination

    User = get_user_model()
    qs = AuditLog.objects.select_related('actor').order_by('-created_at')
    search = request.query_params.get('search', '').strip()
    if search:
        cond = (
            Q(actor__full_name__icontains=search)
            | Q(action__icontains=search)
            | Q(ip_address__icontains=search)
        )
        # target_id — IntegerField: 32-bit chegaradan katta raqam Postgres'da
        # "integer out of range" xatosini berardi, shuning uchun chegaradan
        # oshsa ID bo'yicha qidiruv shartini umuman qo'shmaymiz.
        if search.isdigit() and int(search) < 2 ** 31:
            cond |= Q(target_id=int(search))
        qs = qs.filter(cond)

    paginator = LargePageNumberPagination()
    page = paginator.paginate_queryset(qs, request)
    logs = page if page is not None else list(qs[:100])
    # Target — generic (target_type + target_id). Foydalanuvchiga tegishli
    # yozuvlar uchun ismni BITTA qo'shimcha so'rov bilan yechamiz (har qator
    # uchun alohida so'rov emas).
    target_user_ids = {
        l.target_id for l in logs if l.target_type == 'User' and l.target_id
    }
    target_names = dict(
        User.objects.filter(pk__in=target_user_ids).values_list('id', 'full_name')
    ) if target_user_ids else {}
    data = [{
        'id': l.id,
        'actor': l.actor.full_name if l.actor else 'Tizim',
        'actor_id': l.actor_id,
        # `action` — xom kod (filtr/qidiruv uchun), `action_label` — o'zbekcha
        # ko'rinish (AuditLog.ACTION_CHOICES).
        'action': l.action,
        'action_label': l.get_action_display(),
        'target_type': l.target_type,
        'target_id': l.target_id,
        'target_name': target_names.get(l.target_id) if l.target_type == 'User' else None,
        'extra': l.extra,
        'ip': l.ip_address,
        'created_at': l.created_at.isoformat(),
    } for l in logs]
    if page is not None:
        return paginator.get_paginated_response(data)
    return Response(data)


# ---------------------------------------------------------------------------
# TOTP 2FA (ixtiyoriy — har bir foydalanuvchi yoqishi mumkin)
# ---------------------------------------------------------------------------

@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([ScopedRateThrottle])
def totp_setup(request):
    """POST /api/auth/2fa/setup/ — 2FA sozlash, QR kod URI qaytaradi."""
    import pyotp
    if not request.user.totp_secret:
        request.user.totp_secret = pyotp.random_base32()
        # `totp_secret` — shifrlovchi property; DB'dagi haqiqiy ustun
        # `encrypted_totp_secret`. update_fields shu ustunni ko'rsatishi shart.
        request.user.save(update_fields=['encrypted_totp_secret'])
    totp = pyotp.TOTP(request.user.totp_secret)
    uri = totp.provisioning_uri(
        request.user.phone or str(request.user.id),
        issuer_name='Olympy',
    )
    return Response({'uri': uri, 'secret': request.user.totp_secret})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([ScopedRateThrottle])
def totp_verify(request):
    """POST /api/auth/2fa/verify/ — kodni tekshiradi va 2FA'ni yoqadi."""
    import pyotp
    code = str(request.data.get('code', '')).strip()
    if not request.user.totp_secret:
        return Response({'detail': 'Avval 2FA sozlang'}, status=status.HTTP_400_BAD_REQUEST)
    totp = pyotp.TOTP(request.user.totp_secret)
    if totp.verify(code, valid_window=1):
        request.user.totp_enabled = True
        request.user.save(update_fields=['totp_enabled'])
        return Response({'detail': '2FA faollashtirildi'})
    return Response({'detail': "Noto'g'ri kod"}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([ScopedRateThrottle])
def totp_disable(request):
    """POST /api/auth/2fa/disable/ — 2FA'ni o'chiradi.

    Xavfsizlik: JWT token o'g'irlansa tajovuzkor 2FA'ni o'chirib, hisobni
    egallab olmasin uchun — o'chirishdan avval JORIY TOTP kodi yoki parol
    tasdig'i talab qilinadi. Ikkalasidan biri to'g'ri kelmasa 403.
    """
    import pyotp
    totp_code = str(request.data.get('totp_code', '')).strip()
    password = request.data.get('password') or ''

    verified = False
    if totp_code:
        if request.user.totp_secret and pyotp.TOTP(request.user.totp_secret).verify(
            totp_code, valid_window=1,
        ):
            verified = True
    elif password:
        if request.user.check_password(password):
            verified = True

    if not verified:
        return Response(
            {'detail': "2FA'ni o'chirish uchun joriy TOTP kodi yoki parolni kiriting"},
            status=status.HTTP_403_FORBIDDEN,
        )

    request.user.totp_enabled = False
    request.user.totp_secret = ''  # property — `encrypted_totp_secret`ni bo'shatadi
    request.user.save(update_fields=['totp_enabled', 'encrypted_totp_secret'])
    return Response({'detail': "2FA o'chirildi"})


# ScopedRateThrottle scope'lari: 2FA endpointlari brute-force'dan himoyalanadi
# (kod/parol taxmin qilishni cheklash). settings.py DEFAULT_THROTTLE_RATES'da
# 'totp': '10/min'.
totp_setup.cls.throttle_scope = 'totp'
totp_verify.cls.throttle_scope = 'totp'
totp_disable.cls.throttle_scope = 'totp'


# ─── A/B testing event tracking ──────────────────────────────────────────────
# Landing page hero CTA uchun oddiy feature-flag asosidagi A/B test. Hisoblash
# Redis (yoki LocMem fallback) cache'da olib boriladi — bu taxminiy analitika,
# qat'iy hisoblashga muhtoj emas. Kalit hech qachon o'chmasin uchun timeout
# berilmaydi (None = cheksiz). Faqat ma'lum test/variant/event qiymatlari qabul
# qilinadi — bu cache kalit maydonini cheksiz "kirlanish"dan himoya qiladi.
AB_ALLOWED_TESTS = {'hero_cta'}
AB_ALLOWED_VARIANTS = {'A', 'B'}
AB_ALLOWED_EVENTS = {'view', 'click', 'register'}


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([ScopedRateThrottle])
def ab_track_event(request):
    """POST /api/ab/track/ — A/B test event'larini qayd etish."""
    test_name = str(request.data.get('test', '')).strip()
    variant = str(request.data.get('variant', '')).strip()
    event = str(request.data.get('event', '')).strip()  # 'view', 'click', 'register'

    if not all([test_name, variant, event]):
        return Response({'ok': False}, status=status.HTTP_400_BAD_REQUEST)

    # Faqat oldindan belgilangan qiymatlarni qabul qilamiz — aks holda
    # ixtiyoriy foydalanuvchi kiritmasi cache'ni to'ldirib yuborishi mumkin.
    if (
        test_name not in AB_ALLOWED_TESTS
        or variant not in AB_ALLOWED_VARIANTS
        or event not in AB_ALLOWED_EVENTS
    ):
        return Response({'ok': False}, status=status.HTTP_400_BAD_REQUEST)

    from django.core.cache import cache
    # A/B counter'lari 90 kundan keyin avtomatik o'chsin — abadiy saqlanib
    # Redis'ni to'ldirmasligi uchun (test tugagach kalitlar o'z-o'zidan ketadi).
    AB_COUNTER_TTL = 60 * 60 * 24 * 90
    key = f"ab:{test_name}:{variant}:{event}"
    # cache.incr mavjud bo'lmagan kalitda ValueError beradi (Redis ham, LocMem
    # ham), shuning uchun avval `add` bilan 0 o'rnatamiz (faqat kalit yo'q bo'lsa
    # ishlaydi), keyin atomik incr qilamiz. TTL'ni `add` o'rnatadi; incr Redis'da
    # mavjud TTL'ni saqlaydi.
    cache.add(key, 0, timeout=AB_COUNTER_TTL)
    try:
        cache.incr(key)
    except ValueError:
        # Nodir race holatda kalit incr'gacha yo'qolsa — qaytadan o'rnatamiz.
        cache.set(key, 1, timeout=AB_COUNTER_TTL)

    return Response({'ok': True})


# ScopedRateThrottle FBV'da scope'ni view'ning .cls atributidan o'qiydi.
ab_track_event.cls.throttle_scope = 'ab_track'


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def ab_results(request):
    """GET /api/ab/results/ — A/B test natijalarini ko'rish (faqat platform admin)."""
    if not request.user.is_platform_admin:
        return Response({'detail': "Ruxsat yo'q"}, status=status.HTTP_403_FORBIDDEN)

    from django.core.cache import cache
    results = {}
    for test in AB_ALLOWED_TESTS:
        results[test] = {}
        for v in AB_ALLOWED_VARIANTS:
            results[test][v] = {}
            for e in AB_ALLOWED_EVENTS:
                key = f"ab:{test}:{v}:{e}"
                results[test][v][e] = cache.get(key, 0)

    return Response(results)


