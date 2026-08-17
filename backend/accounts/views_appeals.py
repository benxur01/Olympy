"""Chora ko'rilgan foydalanuvchining RASMIY e'tirozi (appellyatsiya).

Ilgari e'tiroz bildirishning yagona yo'li AI support chati edi
(`views_support.support_chat`): u moderatsiya navbatiga umuman tushmasdi,
boshqa yordam so'rovlari bilan aralashib ketardi va admin uni "bu
appellyatsiya" deb ajrata olmasdi. Bu yerdagi endpoint e'tirozni o'sha
navbatga (`ModerationFlag`, `flag_type='appeal'`) qo'yadi — yozuvning o'z
holati bor, tur bo'yicha filtrlanadi va yopilganda audit jurnalida iz
qoldiradi (`moderation.views.admin_moderation_resolve`).

NEGA `accounts` DA, `moderation` DA EMAS. `moderation/views.py` butunlay
admin tomoni: hammasi `/api/admin/moderation/...` ostida va
`IsPlatformAdmin` bilan yopilgan. Loyihada bayroq QO'YADIGAN endpoint har
doim nishonning o'z app'ida turadi (`questions.views.flag_question`,
`olympiads.views.flag_olympiad`), navbatni O'QIYDIGAN endpoint esa
`moderation` da. Appellyatsiyaning nishoni — foydalanuvchining o'zi, ya'ni
`accounts`.

IKKI YO'L, BITTA NATIJA. Chora ko'rilgan hisobning holati ikki xil bo'ladi
va shu sababli ikkita endpoint bor — ikkalasi ham AYNAN bir xil bayroq
yaratadi (`_create_appeal_flag`), farqi `extra.channel` da:

  * `submit_appeal` (`/api/me/appeal/`, `IsAuthenticated`) — hisob hali
    ochiq: olimpiadalardan chetlatilgan yoki urinishi diskvalifikatsiya
    qilingan foydalanuvchi. U ilovada turibdi, qo'shimcha tasdiq shart emas.
  * `start_appeal_otp` + `submit_appeal_with_otp` (`/api/appeal/otp/...`,
    `AllowAny`) — hisob BLOKLANGAN. Bunday foydalanuvchi umuman kira
    olmaydi: `is_active=False` da simplejwt'ning `USER_AUTHENTICATION_RULE`
    tokenni rad etadi va bloklash paytida `token_version` ham oshiriladi
    (`accounts.views._apply_suspension`), ya'ni eski token ham o'lik. Ya'ni
    appellyatsiyaning ENG ASOSIY holati autentifikatsiyasiz yo'lsiz umuman
    ishlamasdi. Bu yerda o'sha yo'l telefonni tasdiqlash (Telegram OTP)
    orqali ochiladi — `password_reset` oqimi bilan bir xil infratuzilma.
"""
import re
import secrets
import logging

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle, UserRateThrottle

from attempts.models import TestAttempt
from moderation.models import ModerationFlag

from .models import PhoneVerification
from .utils import mask_phone, normalize_phone
from .views import _telegram_bot_username, _telegram_deep_link

security_logger = logging.getLogger('security')

# E'tiroz uchun ASOS bo'ladigan holatlar. Bittasi ham bo'lmasa appellyatsiya
# qabul qilinmaydi: navbat aynan chora ko'rilgan hisoblar uchun va asossiz
# so'rovlar uni ko'mib yuborardi.
GROUND_ACCOUNT_BLOCK = 'account_block'
GROUND_EXAM_BAN = 'exam_ban'
GROUND_DISQUALIFIED = 'disqualified_attempt'
GROUND_LABELS = {
    GROUND_ACCOUNT_BLOCK: 'Hisob bloklangan',
    GROUND_EXAM_BAN: 'Olimpiadalardan chetlatilgan',
    GROUND_DISQUALIFIED: 'Diskvalifikatsiya qilingan urinish',
}

# E'tiroz matnining chegarasi. `ModerationFlag.reason` (255) ga sig'maydi,
# shuning uchun to'liq matn `extra.message` da (JSON) — chegara esa baribir
# kerak: bu endpoint bloklangan hisob uchun ochiq va cheklovsiz maydon
# navbatga megabaytlab matn tashlash yo'li bo'lardi.
APPEAL_MAX_MESSAGE_LEN = 2000

# E'tiroz qaysi yo'l bilan kelgani (`extra.channel`). Admin uchun bu shunchaki
# ma'lumot emas: OTP yo'lidan kelgan e'tiroz TELEFON EGALIGI isbotlangan
# degani, seans yo'lidan kelgani esa hisobga kirish huquqi isbotlangan degani.
CHANNEL_SESSION = 'session'
CHANNEL_OTP = 'otp'

# OTP — aynan 6 xonali raqam (`accounts.views._make_otp` shunday generatsiya
# qiladi). Shakli mos kelmasa DB'ga umuman borilmaydi
# (`VerifyOtpSerializer.otp` bilan bir xil qoida).
OTP_PATTERN = re.compile(r'^\d{6}$')

# OTP oqimining HAR BIR javobi (kod so'rash ham, e'tiroz yuborish ham) shu
# matn bilan tugaydi. Yagona konstanta — ikki joyda ikki xil so'z qolib
# ketsa, farqning o'zi "bu raqam bazada bor" degan signalga aylanardi.
NEUTRAL_OTP_START_DETAIL = "Agar bu raqam ro'yxatdan o'tgan bo'lsa, kod yuboriladi"
NEUTRAL_APPEAL_DETAIL = "E'tirozingiz qabul qilindi va admin tekshiruviga qo'yildi."


class AppealSubmitThrottle(UserRateThrottle):
    """Appellyatsiya yuborish — foydalanuvchi bo'yicha (soatiga 5 marta).

    Chegara sinfning O'ZIDA, `DEFAULT_THROTTLE_RATES` scope'i orqali emas:
    asosiy to'siq throttle emas, balki DB qoidasi — ochiq appellyatsiya
    turganda ikkinchisi umuman yaratilmaydi (`submit_appeal`). Bu esa faqat
    400 qaytaradigan takroriy urinishlar seliga qarshi arzon qalqon, ya'ni
    sozlanadigan qilishning ma'nosi yo'q. `rate` berilgani uchun
    `SimpleRateThrottle` settings'dan qiymat qidirmaydi (scope faqat cache
    kalitiga kiradi).
    """

    scope = 'appeal_submit'
    rate = '5/hour'


def _requested_phone(request):
    """So'rov tanasidagi telefon raqamning kanonik shakli (yaroqsiz — '').

    Throttle ham, view ham AYNAN shu funksiyadan foydalanadi: aks holda
    `+998 90 123 45 67` va `901234567` ikki xil throttle kalitiga tushib,
    chegara bitta raqamni ko'p marta yozish bilan chetlab o'tilardi.
    """
    data = request.data if isinstance(request.data, dict) else {}
    return normalize_phone(data.get('phone'))


class _AppealIpThrottle(SimpleRateThrottle):
    """IP bo'yicha chegara (autentifikatsiyasiz oqim uchun asosiy to'siq).

    `AnonRateThrottle` EMAS: u autentifikatsiyalangan so'rovni umuman
    hisoblamaydi (`get_cache_key` None qaytaradi), ya'ni istalgan yaroqli
    token chegarani butunlay o'chirib qo'yardi. Bu yerdagi kalit har doim
    IP — endpoint kimdan kelganidan qat'i nazar bir xil cheklanadi.

    `get_ident` X-Forwarded-For dan OXIRGI elementni oladi
    (`NUM_PROXIES=1`, settings.py) — ya'ni mijoz header qo'shib chegarani
    aylanib o'ta olmaydi (`security_logging.client_ip` bilan bir xil qoida).
    """

    def get_cache_key(self, request, view):
        return self.cache_format % {
            'scope': self.scope, 'ident': self.get_ident(request),
        }


class _AppealPhoneThrottle(SimpleRateThrottle):
    """Telefon raqam bo'yicha chegara — IP chegarasining to'ldiruvchisi.

    Faqat IP yetarli emas: bitta raqamga hujum qilayotgan bot IP'ni
    almashtirib (mobil NAT, proksi) chegarani aylanib o'tadi, va aksincha —
    markaz sinfxonasidagi o'nlab o'quvchi bitta IP ortida turadi. Shu
    sababli ikkala o'lchov ham mustaqil sanaladi.

    Raqam yaroqsiz bo'lsa None: bunday so'rovni view'ning o'zi 400 bilan
    rad etadi va uni sanashning ma'nosi yo'q (IP chegarasi baribir ishlaydi).
    """

    def get_cache_key(self, request, view):
        phone = _requested_phone(request)
        if not phone:
            return None
        return self.cache_format % {'scope': self.scope, 'ident': phone}


# Chegaralar ATAYLAB qattiq: bu autentifikatsiyasiz sirt, ya'ni loyihadagi
# eng ochiq hujum nuqtasi. Haqiqiy foydalanuvchi uchun bitta e'tiroz —
# bitta kod, shuning uchun soatiga bir nechta urinish yetarlidan ortiq.
#
# Kod SO'RASH qat'iyroq cheklanadi (har so'rov Telegram deep-link va yangi
# `PhoneVerification` qatori demakdir), kodni TEKSHIRISH esa biroz
# kengroq — foydalanuvchi kodni terishda xato qilishi normal, va u yerda
# `PhoneVerification.max_attempts` (5) allaqachon ikkinchi to'siq bo'lib
# turadi.
class AppealOtpStartIpThrottle(_AppealIpThrottle):
    scope = 'appeal_otp_start_ip'
    rate = '5/hour'


class AppealOtpStartPhoneThrottle(_AppealPhoneThrottle):
    scope = 'appeal_otp_start_phone'
    rate = '3/hour'


class AppealOtpSubmitIpThrottle(_AppealIpThrottle):
    scope = 'appeal_otp_submit_ip'
    rate = '10/hour'


class AppealOtpSubmitPhoneThrottle(_AppealPhoneThrottle):
    scope = 'appeal_otp_submit_phone'
    rate = '5/hour'


def _appeal_grounds(user):
    """E'tiroz qilishga asos bo'lgan holatlar ro'yxati (asos yo'q — bo'sh).

    Uchala manba ham "hisobga chora ko'rilgan" degan savolga javob beradi,
    lekin turli qatlamlarda: hisobning o'zi bloklangan, olimpiadalardan
    chetlatilgan yoki urinishi diskvalifikatsiya qilingan. Ro'yxat
    bayroqning `extra` siga tushadi — admin e'tirozni ochmasdan turib nima
    haqida ekanini ko'radi.

    `blocked_until` alohida tekshiriladi (`is_active` bilan bir qatorda):
    muddatli blok tugagach hisob avtomatik ochiladi
    (`User.release_expired_suspension`), lekin bu ochilish LAZY — keyingi
    kirishgacha yoki kunlik taskgacha ustun to'ldirilgan qoladi.
    """
    grounds = []
    if not user.is_active or user.blocked_until:
        grounds.append(GROUND_ACCOUNT_BLOCK)
    if user.is_exam_blocked:
        grounds.append(GROUND_EXAM_BAN)
    if TestAttempt.objects.filter(user=user, disqualified=True).exists():
        grounds.append(GROUND_DISQUALIFIED)
    return grounds


def _appeal_snapshot(user, grounds, message, channel, verified_phone=None):
    """Bayroq ichida saqlanadigan hisob holati — o'zgarmas dalil.

    `questions.views._question_snapshot` bilan bir xil sabab: navbat nishonni
    `target_id` bo'yicha JONLI o'qimaydi. Bu yerda u ayniqsa muhim — admin
    e'tirozni ko'rib chiqqunicha blok muddati tugab, sabab tozalanib ketishi
    mumkin (`release_expired_suspension`), va tekshiruvchi "nega e'tiroz
    berilgan edi" degan savolga javobsiz qolardi.

    Telefon raqami maskalanadi (`user_block` audit yozuvidagi bilan bir xil
    qoida) — bayroq navbati adminga hisobni tanish uchun ochiladi, to'liq
    PII nusxasini saqlash uchun emas. `verified_phone` ham xuddi shunday:
    u OTP bilan TASDIQLANGAN raqam (hisobdagi raqam bilan bir xil bo'lishi
    shart, chunki foydalanuvchi aynan shu raqam bo'yicha topilgan), lekin
    admin uchun muhim farq — bu yozuv telefon egaligi isbotlangan holda
    kelgan.
    """
    snapshot = {
        'user_id': user.id,
        'full_name': user.full_name,
        'phone': mask_phone(user.normalized_phone),
        'grounds': grounds,
        'message': message,
        'channel': channel,
        'is_active': user.is_active,
        'block_reason': user.block_reason,
        'blocked_until': user.blocked_until.isoformat() if user.blocked_until else None,
        'exam_block_reason': user.exam_block_reason,
        'exam_blocked_until': (
            user.exam_blocked_until.isoformat() if user.exam_blocked_until else None
        ),
    }
    if verified_phone:
        snapshot['verified_phone'] = mask_phone(verified_phone)
    return snapshot


def _validate_appeal_message(request):
    """E'tiroz matnini oladi. Qaytadi: `(message, error)`.

    Ikkala endpoint ham bir xil qoidaga bo'ysunadi (`_parse_suspension_payload`
    bilan bir xil naqsh: tekshiruv bitta joyda, `error` None bo'lmasa qolgan
    qiymat ma'nosiz).
    """
    data = request.data if isinstance(request.data, dict) else {}
    message = str(data.get('message') or '').strip()
    if not message:
        return '', "E'tiroz matnini kiriting"
    if len(message) > APPEAL_MAX_MESSAGE_LEN:
        return '', f"E'tiroz matni {APPEAL_MAX_MESSAGE_LEN} belgidan oshmasligi kerak"
    return message, ''


def _create_appeal_flag(user, message, grounds, *, channel, verified_phone=None):
    """Navbatga e'tiroz qatorini qo'yadi. Qaytadi: `(flag, created)`.

    Ikkala endpoint uchun YAGONA yozuvchi: bayroqning shakli (turi, nishoni,
    sarlavhasi, `extra` si) kanal bilan o'zgarmasligi kerak — admin navbatda
    ikki xil ko'rinishdagi appellyatsiyani ko'rmasin.

    Bitta hisobga bitta OCHIQ e'tiroz: barcha qidiruv maydonlari oddiy
    ustunlar, shuning uchun `get_or_create` (`flag_question` bilan bir xil).
    `target_type` — model klassining nomi ('User'):
    `flag_question`/`flag_olympiad` ('Question'/'Olympiad') va
    `AuditLog.target_type` bilan bir xil qoida (kichik harfli 'ip_address'
    istisno emas — u umuman model emas).
    """
    return ModerationFlag.objects.get_or_create(
        flag_type=ModerationFlag.FLAG_TYPE_APPEAL,
        target_type='User',
        target_id=user.id,
        status=ModerationFlag.STATUS_PENDING,
        defaults={
            # Navbat ro'yxatida qisqa sarlavha ko'rinadi; e'tirozning to'liq
            # matni `extra.message` da (255 ga sig'maydi).
            'reason': (
                "E'tiroz: " + ', '.join(GROUND_LABELS[g] for g in grounds)
            )[:255],
            # Bayroqni nishonning O'ZI ko'taradi — avtomatik detektorlardan
            # farqli o'laroq bu yerda `raised_by` hech qachon NULL emas.
            'raised_by': user,
            'extra': _appeal_snapshot(
                user, grounds, message, channel, verified_phone=verified_phone,
            ),
        },
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([AppealSubmitThrottle])
def submit_appeal(request):
    """POST /api/me/appeal/  body: {"message": str}

    Chora ko'rilgan foydalanuvchi qarorni qayta ko'rishni so'raydi. Bayroq
    HAR DOIM so'rov yuborayotgan hisobning o'ziga yoziladi — tanadan kelgan
    `user_id`/`target_id` kabi maydonlar UMUMAN o'qilmaydi, ya'ni birov
    boshqa odam nomidan e'tiroz yubora olmaydi.

    Asos majburiy (`_appeal_grounds`): hech qanday chora ko'rilmagan hisob
    403 oladi. Bu ruxsat tekshiruvi emas, navbatni himoya qilish — asossiz
    appellyatsiya tekshiriladigan hech narsasi yo'q qator bo'lardi.

    Bitta hisobga bitta OCHIQ e'tiroz (`flag_question` dagi "bitta savolga
    bitta ochiq bayroq" qoidasining shu yerdagi ko'rinishi). Farqi javobda:
    savol bayrog'i takrorlanganda 200 + `created: false` qaytaradi, chunki
    u yerda ikkinchi xodim AYNAN bir xil narsani belgilaydi. Bu yerda esa
    ikkinchi so'rovning matni boshqa bo'ladi va uni jimgina yo'qotish
    mumkin emas — foydalanuvchi e'tirozi qabul qilindi deb o'ylab qolardi.
    Admin bayroqni yopgandan keyin yangi e'tiroz yuborish mumkin.

    DIQQAT: to'liq bloklangan hisob (`is_active=False`) JWT bilan
    autentifikatsiyadan o'ta olmaydi (simplejwt'ning standart
    `USER_AUTHENTICATION_RULE` va `_apply_suspension` dagi `token_version`
    oshirilishi), ya'ni amalda bu endpointga chetlatilgan yoki
    diskvalifikatsiya qilingan, lekin hisobi ochiq foydalanuvchi yetib
    keladi. Bloklangan hisob uchun yo'l — `submit_appeal_with_otp` (telefonni
    tasdiqlash orqali). Blok asosi bu yerda ham tekshiriladi: muddatli blok
    tugab hisob ochilgan, ammo `blocked_until` hali tozalanmagan holat aynan
    shu yo'ldan o'tadi.
    """
    message, error = _validate_appeal_message(request)
    if error:
        return Response({'detail': error}, status=status.HTTP_400_BAD_REQUEST)

    grounds = _appeal_grounds(request.user)
    if not grounds:
        return Response(
            {'detail': "Hisobingizga hech qanday chora ko'rilmagan — e'tiroz uchun asos yo'q."},
            status=status.HTTP_403_FORBIDDEN,
        )

    flag, created = _create_appeal_flag(
        request.user, message, grounds, channel=CHANNEL_SESSION,
    )
    if not created:
        return Response(
            {'detail': "Sizning e'tirozingiz allaqachon ko'rib chiqilmoqda."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return Response(
        {
            'flag_id': flag.id,
            'created': True,
            'grounds': grounds,
            'detail': NEUTRAL_APPEAL_DETAIL,
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([AppealOtpStartIpThrottle, AppealOtpStartPhoneThrottle])
def start_appeal_otp(request):
    """POST /api/appeal/otp/start/  body: {"phone": str}

    Bloklangan hisob uchun e'tiroz oqimining birinchi qadami: telefon
    raqamini tasdiqlash sessiyasini ochadi va Telegram deep-link qaytaradi.
    Kodning O'ZI bu yerda yaratilmaydi — foydalanuvchi botga kirib kontaktini
    yuborgach webhook yuboradi (`accounts.views.EXISTING_USER_OTP_LABELS`),
    ya'ni kod faqat raqamning HAQIQIY egasiga boradi.

    ENUMERATION HIMOYASI: javob hisob bor-yo'qligidan QAT'I NAZAR bir xil —
    `start_password_reset` bilan aynan bir xil shakl va bir xil neytral matn.
    Tekshiruv (hisob bormi, unga chora ko'rilganmi) faqat ikkinchi qadamda,
    to'g'ri kod kiritilgandan keyin bajariladi va u yerda ham javob
    o'zgarmaydi. Aks holda bu endpoint "bu raqam ro'yxatdan o'tganmi va
    bloklanganmi" degan savolga javob beradigan vositaga aylanardi.

    Yagona 400 — raqamning SHAKLI yaroqsiz bo'lsa (bu hisob haqida hech
    narsa aytmaydi).
    """
    phone = _requested_phone(request)
    if not phone:
        return Response({'detail': "Telefon raqam noto'g'ri"},
                        status=status.HTTP_400_BAD_REQUEST)

    # Eski tasdiqlanmagan e'tiroz sessiyalarini butunlay o'chiramiz — bir
    # vaqtning o'zida yagona aktiv kod qolsin (`start_password_reset` bilan
    # bir xil qoida).
    PhoneVerification.objects.filter(
        normalized_phone=phone,
        purpose=PhoneVerification.PURPOSE_APPEAL,
        verified_at__isnull=True,
    ).delete()
    verification = PhoneVerification.objects.create(
        normalized_phone=phone,
        purpose=PhoneVerification.PURPOSE_APPEAL,
        verify_token=secrets.token_urlsafe(32),
        max_attempts=getattr(settings, 'PHONE_VERIFICATION_MAX_ATTEMPTS', 5),
    )
    return Response({
        'verification_id': verification.id,
        'phone': phone,
        'verify_token': verification.verify_token,
        'telegram_deep_link': _telegram_deep_link(verification.verify_token, bot='auth'),
        'bot_username': _telegram_bot_username('auth'),
        'detail': NEUTRAL_OTP_START_DETAIL,
    }, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([AppealOtpSubmitIpThrottle, AppealOtpSubmitPhoneThrottle])
def submit_appeal_with_otp(request):
    """POST /api/appeal/otp/confirm/  body: {"phone", "otp", "message"}

    Oqimning ikkinchi qadami: kod tekshiriladi va e'tiroz navbatga tushadi.
    Autentifikatsiya yo'q — telefon egaligi kodning O'ZI bilan isbotlanadi.

    KOD TEKSHIRUVI `confirm_password_reset` bilan AYNAN bir xil naqshda:
    `select_for_update` ichida, urinishlar sanog'i oshiriladi va kod bir
    martalik (`verified_at` darhol to'ldiriladi). Ikkita parallel so'rov
    `max_attempts` ni aldab o'tolmaydi.

    NEYTRAL JAVOB. To'g'ri koddan KEYINGI barcha natijalar bir xil javob
    beradi (201 + `NEUTRAL_APPEAL_DETAIL`, hech qanday `flag_id` yoki
    `grounds` siz): hisob umuman yo'q, hisob bor lekin unga hech qanday
    chora ko'rilmagan, yoki bayroq haqiqatan yaratildi. Javob shakli
    farq qilsa, kodni qo'lga kiritgan har kim (masalan raqamning yangi
    egasi) "bu raqamda hisob bormi va u bloklanganmi" degan savolga javob
    olardi. Yagona istisno — pastdagi "allaqachon ko'rib chiqilmoqda"
    holati: u faqat telefon EGALIGINI isbotlagan odamga, faqat o'z hisobi
    haqida ma'lumot beradi, va uni yashirish foydalanuvchining ikkinchi
    xabari jimgina yo'qolishini anglatardi.

    Bayroq yaratilmagan taqdirda ham kod KUYDIRILADI: aks holda bitta kod
    bilan cheksiz urinish mumkin bo'lardi.
    """
    phone = _requested_phone(request)
    if not phone:
        return Response({'detail': "Telefon raqam noto'g'ri"},
                        status=status.HTTP_400_BAD_REQUEST)
    data = request.data if isinstance(request.data, dict) else {}
    otp = str(data.get('otp') or '').strip()
    if not OTP_PATTERN.match(otp):
        return Response({'detail': "OTP 6 xonali raqamdan iborat bo'lishi kerak"},
                        status=status.HTTP_400_BAD_REQUEST)
    message, error = _validate_appeal_message(request)
    if error:
        return Response({'detail': error}, status=status.HTTP_400_BAD_REQUEST)

    User = get_user_model()
    with transaction.atomic():
        verification = PhoneVerification.objects.select_for_update().filter(
            normalized_phone=phone,
            purpose=PhoneVerification.PURPOSE_APPEAL,
            verified_at__isnull=True,
            otp_hash__gt='',
        ).order_by('-created_at').first()

        if not verification:
            return Response({'detail': 'Tasdiqlash sessiyasi topilmadi'},
                            status=status.HTTP_400_BAD_REQUEST)
        if verification.attempts_count >= verification.max_attempts:
            security_logger.warning(
                'appeal otp blocked (too many attempts) phone=%s',
                mask_phone(phone),
            )
            return Response({'detail': 'Juda ko\'p urinish'},
                            status=status.HTTP_429_TOO_MANY_REQUESTS)
        if verification.otp_is_expired:
            return Response({'detail': 'OTP muddati tugagan'},
                            status=status.HTTP_400_BAD_REQUEST)

        verification.attempts_count += 1
        if not check_password(otp, verification.otp_hash):
            verification.save(update_fields=['attempts_count', 'updated_at'])
            security_logger.warning(
                'appeal otp failed (wrong code) phone=%s attempt=%s/%s',
                mask_phone(phone),
                verification.attempts_count, verification.max_attempts,
            )
            return Response({'detail': 'OTP noto\'g\'ri'},
                            status=status.HTTP_400_BAD_REQUEST)

        # Kod to'g'ri — darhol kuydiriladi (natijadan qat'i nazar).
        verification.verified_at = timezone.now()
        verification.save(update_fields=['attempts_count', 'verified_at', 'updated_at'])
        PhoneVerification.objects.filter(
            normalized_phone=phone,
            purpose=PhoneVerification.PURPOSE_APPEAL,
            verified_at__isnull=True,
        ).exclude(pk=verification.pk).delete()

        user = User.objects.filter(normalized_phone=phone).first()
        # Hisob yo'q yoki unga chora ko'rilmagan — javob AYNAN muvaffaqiyatli
        # holatdagidek (yuqoridagi izoh), lekin navbatga hech narsa
        # tushmaydi.
        if user is None:
            return Response({'detail': NEUTRAL_APPEAL_DETAIL},
                            status=status.HTTP_201_CREATED)
        grounds = _appeal_grounds(user)
        if not grounds:
            return Response({'detail': NEUTRAL_APPEAL_DETAIL},
                            status=status.HTTP_201_CREATED)

        _, created = _create_appeal_flag(
            user, message, grounds,
            channel=CHANNEL_OTP, verified_phone=phone,
        )

    if not created:
        return Response(
            {'detail': "Sizning e'tirozingiz allaqachon ko'rib chiqilmoqda."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return Response({'detail': NEUTRAL_APPEAL_DETAIL},
                    status=status.HTTP_201_CREATED)
