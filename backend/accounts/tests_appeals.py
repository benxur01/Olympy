"""Rasmiy appellyatsiya oqimi: `/api/me/appeal/`, OTP yo'li va navbat.

Testlar aynan ikkita chegarani qotiradi: e'tiroz FAQAT chora ko'rilgan
hisobdan va FAQAT so'rov yuborayotgan hisobning o'zi nomidan tushadi. Uchinchi
chegara — navbatga dublikat tushmasligi (bitta ochiq e'tiroz).

OTP yo'lida (`/api/appeal/otp/...`) to'rtinchi chegara qo'shiladi: javob
HECH QACHON raqamning bazada bor-yo'qligini oshkor qilmasligi kerak —
`OtpAppealNeutralResponseTestCase` ikkala holatdagi javobni bayt-ma-bayt
solishtiradi.
"""
import secrets
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.core.cache import cache
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import AuditLog, PhoneVerification
from accounts.views_appeals import (
    APPEAL_MAX_MESSAGE_LEN,
    CHANNEL_OTP,
    CHANNEL_SESSION,
    GROUND_ACCOUNT_BLOCK,
    GROUND_DISQUALIFIED,
    GROUND_EXAM_BAN,
    AppealOtpStartIpThrottle,
    AppealOtpSubmitPhoneThrottle,
    AppealSubmitThrottle,
)
from attempts.models import TestAttempt
from centers.models import EducationCenter
from moderation.models import ModerationFlag
from olympiads.models import Olympiad

User = get_user_model()


class AppealTestMixin:
    """Umumiy yordamchilar: chora ko'rilgan hisob yasash."""

    def make_user(self, suffix, full_name='Foydalanuvchi'):
        return User.objects.create_user(
            phone=f'+99890555{suffix}', password='UserPass123', full_name=full_name,
        )

    def block(self, user, *, days=7):
        """Muddatli blok — `_apply_suspension` yozadigan holatning nusxasi."""
        user.is_active = False
        user.block_reason = 'Ko\'p hisob'
        user.blocked_until = timezone.now() + timezone.timedelta(days=days)
        user.save(update_fields=['is_active', 'block_reason', 'blocked_until'])
        return user

    def disqualify(self, user):
        """Diskvalifikatsiya qilingan bitta urinish yasaydi."""
        center = EducationCenter.objects.create(name='Registon markazi', owner=user)
        olympiad = Olympiad.objects.create(
            center=center,
            title='Matematika',
            subject='Matematika',
            duration_minutes=30,
            status=Olympiad.STATUS_ACTIVE,
        )
        return TestAttempt.objects.create(
            user=user, olympiad=olympiad, disqualified=True,
        )


class SubmitAppealTestCase(AppealTestMixin, APITestCase):
    """POST /api/me/appeal/"""

    def setUp(self):
        # `AppealSubmitThrottle` chegarasi sinfning o'zida (settings'dagi test
        # rejimi bo'shashtiruvi unga tegmaydi) — hisoblagich testlar orasida
        # oqmasin.
        cache.clear()
        self.user = self.make_user('0001')
        self.url = reverse('me-appeal')

    def test_blocked_user_creates_pending_appeal_flag(self):
        self.block(self.user)
        self.client.force_authenticate(user=self.user)

        res = self.client.post(self.url, {'message': 'Men hech narsa qilmadim'}, format='json')

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        flag = ModerationFlag.objects.get(pk=res.data['flag_id'])
        self.assertEqual(flag.flag_type, ModerationFlag.FLAG_TYPE_APPEAL)
        self.assertEqual(flag.status, ModerationFlag.STATUS_PENDING)
        self.assertEqual(flag.target_type, 'User')
        self.assertEqual(flag.target_id, self.user.id)
        # Bayroqni nishonning O'ZI ko'taradi — 'Tizim' emas.
        self.assertEqual(flag.raised_by_id, self.user.id)
        self.assertEqual(flag.extra['grounds'], [GROUND_ACCOUNT_BLOCK])
        self.assertEqual(flag.extra['message'], 'Men hech narsa qilmadim')
        # Qaysi yo'l bilan kelgani — admin uchun: bu yerda tirik seans bor.
        self.assertEqual(flag.extra['channel'], CHANNEL_SESSION)
        self.assertNotIn('verified_phone', flag.extra)
        # Blok holati bayroqqa ko'chiriladi: muddat tugab sabab tozalansa ham
        # tekshiruvchi nima bo'lganini ko'radi.
        self.assertEqual(flag.extra['block_reason'], "Ko'p hisob")
        self.assertFalse(flag.extra['is_active'])

    def test_exam_banned_user_can_submit(self):
        self.user.exam_block_reason = 'Nusxa ko\'chirish'
        self.user.save(update_fields=['exam_block_reason'])
        self.client.force_authenticate(user=self.user)

        res = self.client.post(self.url, {'message': 'Kamera xato ishlagan'}, format='json')

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['grounds'], [GROUND_EXAM_BAN])

    def test_disqualified_attempt_is_ground(self):
        self.disqualify(self.user)
        self.client.force_authenticate(user=self.user)

        res = self.client.post(self.url, {'message': 'Internet uzilib qoldi'}, format='json')

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['grounds'], [GROUND_DISQUALIFIED])

    def test_user_without_grounds_is_forbidden(self):
        """Hech qanday chora ko'rilmagan hisob navbatga qator qo'sha olmaydi."""
        self.client.force_authenticate(user=self.user)

        res = self.client.post(self.url, {'message': 'Shunchaki yozdim'}, format='json')

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(ModerationFlag.objects.count(), 0)

    def test_appeal_is_always_bound_to_requesting_user(self):
        """Tanadagi `user_id`/`target_id` UMUMAN o'qilmaydi."""
        other = self.block(self.make_user('0002', full_name='Boshqa'))
        self.block(self.user)
        self.client.force_authenticate(user=self.user)

        res = self.client.post(
            self.url,
            {'message': 'Uning nomidan', 'user_id': other.id, 'target_id': other.id},
            format='json',
        )

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        flag = ModerationFlag.objects.get()
        self.assertEqual(flag.target_id, self.user.id)
        self.assertEqual(flag.extra['user_id'], self.user.id)
        self.assertFalse(
            ModerationFlag.objects.filter(target_id=other.id).exists(),
        )

    def test_second_appeal_while_pending_is_rejected(self):
        self.block(self.user)
        self.client.force_authenticate(user=self.user)
        first = self.client.post(self.url, {'message': 'Birinchi'}, format='json')
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)

        second = self.client.post(self.url, {'message': 'Ikkinchi'}, format='json')

        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(ModerationFlag.objects.count(), 1)
        # Birinchi e'tirozning matni saqlanib qoladi (ustiga yozilmaydi).
        self.assertEqual(ModerationFlag.objects.get().extra['message'], 'Birinchi')

    def test_new_appeal_allowed_after_previous_is_closed(self):
        """Yopilgan e'tiroz keyingisini to'smaydi — bu yangi hodisa."""
        self.block(self.user)
        self.client.force_authenticate(user=self.user)
        self.client.post(self.url, {'message': 'Birinchi'}, format='json')
        ModerationFlag.objects.update(
            status=ModerationFlag.STATUS_DISMISSED, resolved_at=timezone.now(),
        )

        res = self.client.post(self.url, {'message': 'Ikkinchi'}, format='json')

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(ModerationFlag.objects.count(), 2)

    def test_message_is_required_and_bounded(self):
        self.block(self.user)
        self.client.force_authenticate(user=self.user)

        empty = self.client.post(self.url, {'message': '   '}, format='json')
        self.assertEqual(empty.status_code, status.HTTP_400_BAD_REQUEST)

        too_long = self.client.post(
            self.url, {'message': 'x' * (APPEAL_MAX_MESSAGE_LEN + 1)}, format='json',
        )
        self.assertEqual(too_long.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(ModerationFlag.objects.count(), 0)

    def test_anonymous_is_unauthorized(self):
        res = self.client.post(self.url, {'message': 'Salom'}, format='json')

        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(ModerationFlag.objects.count(), 0)


class SubmitAppealThrottleTestCase(AppealTestMixin, APITestCase):
    """Endpoint foydalanuvchi bo'yicha throttle bilan cheklangan."""

    def setUp(self):
        cache.clear()
        self.user = self.block(self.make_user('0200'))
        self.url = reverse('me-appeal')
        self.client.force_authenticate(user=self.user)

    def tearDown(self):
        cache.clear()

    def test_burst_of_requests_is_throttled(self):
        """Chegaradan oshgan so'rov 429 oladi — rad etilgani ham hisoblanadi.

        Chegara `DEFAULT_THROTTLE_RATES` scope'i emas, sinf atributi
        (`AppealSubmitThrottle.rate`), shuning uchun na test rejimidagi umumiy
        bo'shashtiruv (settings.py), na `override_settings` unga ta'sir
        qiladi — shu test doirasida atributning o'zini pasaytiramiz.
        """
        with patch.object(AppealSubmitThrottle, 'rate', '1/hour'):
            first = self.client.post(self.url, {'message': 'Birinchi'}, format='json')
            second = self.client.post(self.url, {'message': 'Ikkinchi'}, format='json')

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(ModerationFlag.objects.count(), 1)

    def test_limit_is_per_user(self):
        """Bir hisobning chegarasi boshqasiga tegmaydi (kalit — user.pk)."""
        other = self.block(self.make_user('0201'))
        with patch.object(AppealSubmitThrottle, 'rate', '1/hour'):
            self.client.post(self.url, {'message': 'Birinchi'}, format='json')
            self.client.force_authenticate(user=other)
            res = self.client.post(self.url, {'message': 'Boshqa hisob'}, format='json')

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)


class AdminAppealQueueTestCase(AppealTestMixin, APITestCase):
    """Appellyatsiya admin navbatida: filtr + ko'rib chiqish."""

    def setUp(self):
        cache.clear()
        self.admin = self.make_user('0100', full_name='Admin')
        self.admin.is_platform_admin = True
        self.admin.save()
        self.user = self.block(self.make_user('0101'))
        self.appeal = ModerationFlag.objects.create(
            flag_type=ModerationFlag.FLAG_TYPE_APPEAL,
            target_type='User',
            target_id=self.user.id,
            reason="E'tiroz: Hisob bloklangan",
            raised_by=self.user,
            extra={'user_id': self.user.id, 'message': 'Men aybdor emasman'},
        )

    def test_queue_filters_by_appeal_flag_type(self):
        """Navbat generic — `appeal` uchun qo'shimcha kod talab qilinmaydi."""
        ModerationFlag.objects.create(
            flag_type=ModerationFlag.FLAG_TYPE_SUSPICIOUS_IP, reason='Sabab',
        )
        self.client.force_authenticate(user=self.admin)

        res = self.client.get(
            reverse('admin-moderation-queue'),
            {'flag_type': ModerationFlag.FLAG_TYPE_APPEAL},
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual([r['id'] for r in res.data['results']], [self.appeal.id])
        row = res.data['results'][0]
        self.assertEqual(row['flag_type_label'], 'Appellyatsiya')
        self.assertEqual(row['target_id'], self.user.id)
        self.assertEqual(row['extra']['message'], 'Men aybdor emasman')

    def test_review_writes_audit_log(self):
        self.client.force_authenticate(user=self.admin)

        res = self.client.post(
            reverse('admin-moderation-resolve', args=[self.appeal.id]),
            {'status': ModerationFlag.STATUS_DISMISSED, 'note': 'Dalil yetarli'},
            format='json',
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        log = AuditLog.objects.get(action='admin_appeal_review')
        self.assertEqual(log.actor_id, self.admin.id)
        # Yozuv e'tiroz bergan hisobga bog'lanadi — uning amallar tarixida
        # ko'rinishi kerak.
        self.assertEqual(log.target_type, 'User')
        self.assertEqual(log.target_id, self.user.id)
        self.assertEqual(log.extra['status'], ModerationFlag.STATUS_DISMISSED)
        self.assertEqual(log.extra['note'], 'Dalil yetarli')
        self.assertEqual(log.extra['moderation_flag_id'], self.appeal.id)
        # Qarorning o'zbekcha nomi `AuditLog.ACTION_CHOICES` da bor (xom kod
        # emas) — "Amallar tarixi" jadvali shuni ko'rsatadi.
        self.assertEqual(log.get_action_display(), "Appellyatsiya ko'rib chiqildi")

    def test_review_does_not_unblock_the_account(self):
        """Blokni ochish alohida amal — bayroqni yopish hisobga tegmaydi."""
        self.client.force_authenticate(user=self.admin)

        self.client.post(
            reverse('admin-moderation-resolve', args=[self.appeal.id]),
            {'status': ModerationFlag.STATUS_RESOLVED},
            format='json',
        )

        self.user.refresh_from_db()
        self.assertFalse(self.user.is_active)
        self.assertIsNotNone(self.user.blocked_until)

    def test_other_flag_types_write_no_appeal_audit_log(self):
        ip_flag = ModerationFlag.objects.create(
            flag_type=ModerationFlag.FLAG_TYPE_SUSPICIOUS_IP, reason='Sabab',
        )
        self.client.force_authenticate(user=self.admin)

        self.client.post(
            reverse('admin-moderation-resolve', args=[ip_flag.id]),
            {'status': ModerationFlag.STATUS_DISMISSED},
            format='json',
        )

        self.assertFalse(AuditLog.objects.filter(action='admin_appeal_review').exists())


class OtpAppealMixin(AppealTestMixin):
    """OTP oqimi uchun umumiy yordamchilar."""

    OTP = '123456'
    UNKNOWN_PHONE = '+998905559999'

    def start_url(self):
        return reverse('appeal-otp-start')

    def confirm_url(self):
        return reverse('appeal-otp-confirm')

    def make_verification(self, phone, *, otp=None, max_attempts=5, minutes=5):
        """Kod YUBORILGAN holatni yasaydi (Telegram bosqichi o'tkazib yuboriladi).

        `PasswordResetTestCase` bilan bir xil naqsh: OTP hech qachon ochiq
        saqlanmaydi, testda faqat hash yoziladi.
        """
        return PhoneVerification.objects.create(
            normalized_phone=phone,
            purpose=PhoneVerification.PURPOSE_APPEAL,
            # `verify_token` unique — bitta testda ketma-ket bir nechta sessiya
            # ochilishi mumkin (eskisi kuydirilgach yangisi so'raladi).
            verify_token=secrets.token_urlsafe(16),
            otp_hash=make_password(otp or self.OTP),
            otp_expires_at=timezone.now() + timedelta(minutes=minutes),
            max_attempts=max_attempts,
        )

    def confirm(self, phone, *, otp=None, message="E'tiroz matni"):
        return self.client.post(
            self.confirm_url(),
            {'phone': phone, 'otp': otp or self.OTP, 'message': message},
            format='json',
        )


class OtpAppealStartTestCase(OtpAppealMixin, APITestCase):
    """POST /api/appeal/otp/start/ — kod so'rash."""

    def setUp(self):
        cache.clear()
        self.user = self.block(self.make_user('0300'))

    def test_creates_appeal_scoped_verification(self):
        res = self.client.post(
            self.start_url(), {'phone': self.user.normalized_phone}, format='json',
        )

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        verification = PhoneVerification.objects.get()
        # Maqsad AYNAN `appeal`: parol tiklash kodi bilan e'tiroz yuborib
        # bo'lmasligi (va aksincha) shu maydonga tayanadi.
        self.assertEqual(verification.purpose, PhoneVerification.PURPOSE_APPEAL)
        self.assertEqual(verification.normalized_phone, self.user.normalized_phone)
        # Kod bu bosqichda YARATILMAYDI — u faqat Telegram'da kontakt
        # yuborilgandan keyin, ya'ni raqamning haqiqiy egasiga beriladi.
        self.assertEqual(verification.otp_hash, '')

    def test_repeated_start_keeps_single_open_session(self):
        self.client.post(
            self.start_url(), {'phone': self.user.normalized_phone}, format='json',
        )
        self.client.post(
            self.start_url(), {'phone': self.user.normalized_phone}, format='json',
        )

        self.assertEqual(PhoneVerification.objects.count(), 1)

    def test_phone_is_normalized_before_lookup(self):
        """`901234567` va `+998901234567` — bitta raqam (throttle kaliti ham)."""
        res = self.client.post(self.start_url(), {'phone': '90 555 03 00'}, format='json')

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['phone'], '+998905550300')

    def test_invalid_phone_is_rejected(self):
        res = self.client.post(self.start_url(), {'phone': 'salom'}, format='json')

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(PhoneVerification.objects.exists())


class OtpAppealSubmitTestCase(OtpAppealMixin, APITestCase):
    """POST /api/appeal/otp/confirm/ — kodni tekshirish va e'tirozni qabul qilish."""

    def setUp(self):
        cache.clear()
        self.user = self.block(self.make_user('0400'))
        self.phone = self.user.normalized_phone

    def test_blocked_user_submits_appeal_through_otp(self):
        self.make_verification(self.phone)

        res = self.confirm(self.phone, message='Blok adolatsiz')

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        flag = ModerationFlag.objects.get()
        self.assertEqual(flag.flag_type, ModerationFlag.FLAG_TYPE_APPEAL)
        self.assertEqual(flag.target_type, 'User')
        self.assertEqual(flag.target_id, self.user.id)
        self.assertEqual(flag.raised_by_id, self.user.id)
        self.assertEqual(flag.extra['message'], 'Blok adolatsiz')
        self.assertEqual(flag.extra['grounds'], [GROUND_ACCOUNT_BLOCK])
        # Kanal va tasdiqlangan raqam — admin uchun: bu yozuv telefon
        # egaligi isbotlangan holda kelgan.
        self.assertEqual(flag.extra['channel'], CHANNEL_OTP)
        self.assertEqual(flag.extra['verified_phone'], flag.extra['phone'])
        self.assertNotIn(self.phone, flag.extra['verified_phone'])

    def test_wrong_otp_is_rejected_and_counted(self):
        verification = self.make_verification(self.phone)

        res = self.confirm(self.phone, otp='000000')

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(ModerationFlag.objects.exists())
        verification.refresh_from_db()
        self.assertEqual(verification.attempts_count, 1)
        self.assertIsNone(verification.verified_at)

    def test_attempts_limit_stops_brute_force(self):
        """`max_attempts` tugagach kod umuman tekshirilmaydi."""
        self.make_verification(self.phone, max_attempts=2)

        self.assertEqual(self.confirm(self.phone, otp='000000').status_code,
                         status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.confirm(self.phone, otp='000001').status_code,
                         status.HTTP_400_BAD_REQUEST)
        res = self.confirm(self.phone)

        self.assertEqual(res.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        # 429 aynan urinishlar chegarasidan (DRF throttle'dan emas).
        self.assertEqual(res.data['detail'], "Juda ko'p urinish")
        self.assertFalse(ModerationFlag.objects.exists())

    def test_expired_otp_is_rejected(self):
        self.make_verification(self.phone, minutes=-1)

        res = self.confirm(self.phone)

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(ModerationFlag.objects.exists())

    def test_missing_session_is_rejected(self):
        res = self.confirm(self.phone)

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(ModerationFlag.objects.exists())

    def test_code_is_single_use(self):
        self.make_verification(self.phone)
        self.assertEqual(self.confirm(self.phone).status_code, status.HTTP_201_CREATED)

        # Ayni kod bilan ikkinchi marta: sessiya allaqachon kuydirilgan.
        res = self.confirm(self.phone, message='Ikkinchi')

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data['detail'], 'Tasdiqlash sessiyasi topilmadi')
        self.assertEqual(ModerationFlag.objects.count(), 1)

    def test_second_appeal_while_pending_is_rejected(self):
        self.make_verification(self.phone)
        self.confirm(self.phone, message='Birinchi')
        # Yangi kod — lekin ochiq e'tiroz baribir to'sadi.
        self.make_verification(self.phone)

        res = self.confirm(self.phone, message='Ikkinchi')

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(ModerationFlag.objects.count(), 1)
        self.assertEqual(ModerationFlag.objects.get().extra['message'], 'Birinchi')

    def test_account_without_grounds_creates_nothing(self):
        """Asos yo'q — bayroq yaratilmaydi, lekin javob neytral (201)."""
        clean = self.make_user('0401')
        self.make_verification(clean.normalized_phone)

        res = self.confirm(clean.normalized_phone)

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertFalse(ModerationFlag.objects.exists())

    def test_message_is_required(self):
        self.make_verification(self.phone)

        res = self.confirm(self.phone, message='   ')

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(ModerationFlag.objects.exists())

    def test_malformed_otp_never_touches_the_session(self):
        verification = self.make_verification(self.phone)

        res = self.confirm(self.phone, otp='abc')

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        verification.refresh_from_db()
        self.assertEqual(verification.attempts_count, 0)


class OtpAppealNeutralResponseTestCase(OtpAppealMixin, APITestCase):
    """Javob raqamning bazada bor-yo'qligini OSHKOR QILMAYDI (enumeration)."""

    def setUp(self):
        cache.clear()
        self.user = self.block(self.make_user('0500'))

    def test_start_response_shape_is_identical_for_unknown_phone(self):
        known = self.client.post(
            self.start_url(), {'phone': self.user.normalized_phone}, format='json',
        )
        cache.clear()  # throttle kalitlari emas, javob solishtiriladi
        unknown = self.client.post(
            self.start_url(), {'phone': self.UNKNOWN_PHONE}, format='json',
        )

        self.assertEqual(known.status_code, unknown.status_code)
        self.assertEqual(set(known.data), set(unknown.data))
        self.assertEqual(known.data['detail'], unknown.data['detail'])
        # Mavjud bo'lmagan raqam uchun ham sessiya ochiladi — aks holda
        # yozuvning bor-yo'qligi javobdan sezilib qolardi.
        self.assertEqual(PhoneVerification.objects.count(), 2)

    def test_confirm_response_is_identical_for_unknown_phone(self):
        self.make_verification(self.user.normalized_phone)
        self.make_verification(self.UNKNOWN_PHONE)

        known = self.confirm(self.user.normalized_phone)
        cache.clear()
        unknown = self.confirm(self.UNKNOWN_PHONE)

        self.assertEqual(known.status_code, unknown.status_code)
        # Tanasi bayt-ma-bayt bir xil: `flag_id`/`grounds` kabi maydonlar
        # muvaffaqiyatli holatda ham qaytarilmaydi.
        self.assertEqual(known.data, unknown.data)
        # Ammo navbatga faqat haqiqiy hisobniki tushadi.
        self.assertEqual(ModerationFlag.objects.count(), 1)
        self.assertEqual(ModerationFlag.objects.get().target_id, self.user.id)


class OtpAppealThrottleTestCase(OtpAppealMixin, APITestCase):
    """Autentifikatsiyasiz sirt — IP va telefon bo'yicha alohida chegara."""

    def setUp(self):
        cache.clear()
        self.user = self.block(self.make_user('0600'))
        self.phone = self.user.normalized_phone

    def tearDown(self):
        cache.clear()

    def test_start_is_throttled_by_ip(self):
        """IP chegarasi TURLI raqamlarga yuborilgan so'rovlarni ham sanaydi."""
        with patch.object(AppealOtpStartIpThrottle, 'rate', '1/hour'):
            first = self.client.post(
                self.start_url(), {'phone': self.phone}, format='json',
            )
            second = self.client.post(
                self.start_url(), {'phone': self.UNKNOWN_PHONE}, format='json',
            )

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_confirm_is_throttled_by_phone(self):
        self.make_verification(self.phone)
        with patch.object(AppealOtpSubmitPhoneThrottle, 'rate', '1/hour'):
            first = self.confirm(self.phone, otp='000000')
            second = self.confirm(self.phone)

        self.assertEqual(first.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(second.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        # Throttle bloklagan so'rov navbatga hech narsa qo'shmagan.
        self.assertFalse(ModerationFlag.objects.exists())


class AppealOtpDeliveryTestCase(OtpAppealMixin, APITestCase):
    """Telegram webhook e'tiroz kodini YUBORADI (yo'lning oxirgi bo'g'ini)."""

    CHAT_ID = '555000'
    TELEGRAM_USER_ID = '777000'

    def setUp(self):
        cache.clear()
        self.user = self.block(self.make_user('0700'))
        self.phone = self.user.normalized_phone

    def _update(self, **message):
        return {'message': {
            'chat': {'id': self.CHAT_ID},
            'from': {'id': self.TELEGRAM_USER_ID},
            **message,
        }}

    def test_webhook_sends_appeal_code_to_the_phone_owner(self):
        from accounts.views import handle_telegram_update

        res = self.client.post(
            self.start_url(), {'phone': self.phone}, format='json',
        )
        token = res.data['verify_token']

        # 1) Botga /start <token> — chat raqamga bog'lanadi.
        handle_telegram_update(self._update(text=f'/start {token}'), bot='auth')
        # 2) Kontakt yuborildi — aynan shu bosqichda kod beriladi.
        with patch('accounts.tasks.send_telegram_otp_task') as task:
            handle_telegram_update(
                self._update(contact={
                    'user_id': self.TELEGRAM_USER_ID, 'phone_number': self.phone,
                }),
                bot='auth',
            )

        text = task.delay.call_args.kwargs['text']
        self.assertTrue(
            text.startswith("E'tiroz (appellyatsiya) kodi:"),
            msg=f'Kutilmagan xabar: {text}',
        )
        # Kod haqiqatan shu sessiyaga yozilgan — endi u bilan e'tiroz yuborsa
        # bo'ladi.
        verification = PhoneVerification.objects.get()
        self.assertTrue(verification.otp_hash)
        self.assertIsNone(verification.verified_at)

        otp = text.split(': ')[1]
        self.assertEqual(
            self.confirm(self.phone, otp=otp).status_code, status.HTTP_201_CREATED,
        )
        self.assertEqual(ModerationFlag.objects.count(), 1)
