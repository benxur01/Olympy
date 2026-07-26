import logging
import re

from django.contrib.auth.password_validation import validate_password as django_validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework import serializers

from .models import RewardProduct, User
from .utils import mask_phone as _mask_phone_for_log
from .utils import normalize_phone


# Xavfsizlik audit loggeri — muvaffaqiyatsiz login urinishlari shu yerda
# yoziladi (LOGGING konfiguratsiyasidagi 'security' logger). Parol HECH
# QACHON loglanmaydi.
security_logger = logging.getLogger('security')


class UserSerializer(serializers.ModelSerializer):
    roles_detail = serializers.SerializerMethodField()
    telegram_linked = serializers.SerializerMethodField()
    avatar_url = serializers.SerializerMethodField()
    badges = serializers.SerializerMethodField()
    current_plan_name = serializers.SerializerMethodField()
    student_tier = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'full_name', 'first_name', 'last_name', 'username',
                  'phone', 'normalized_phone',
                  'email', 'email_verified', 'email_verified_at', 'roles',
                  'roles_detail', 'telegram_linked', 'is_platform_admin',
                  'is_premium', 'is_premium_active', 'premium_trial_end',
                  'current_plan_name', 'student_tier',
                  'is_active', 'avatar_url', 'created_at',
                  'streak_count', 'longest_streak', 'last_active_date', 'badges',
                  'onboarding_completed', 'onboarding_grade',
                  'onboarding_subjects', 'onboarding_goal',
                  'onboarding_center_completed',
                  'onboarding_manager_completed', 'onboarding_teacher_completed',
                  'subject_levels', 'level_streak', 'totp_enabled']
        # Xavfsizlik (privilege escalation / IDOR himoyasi): `roles`,
        # `is_platform_admin`, `is_premium`, `is_active` — bular foydalanuvchi
        # tomonidan O'ZGARTIRILMASLIGI kerak. Aks holda kimdir bu serializer'ni
        # PATCH uchun ishlatsa (`data=request.data` bilan), o'ziga `owner`,
        # `admin`, `manager` rollarini yoki premium/platform-admin holatini
        # bera olardi. Hozir UserSerializer faqat OUTPUT uchun ishlatiladi,
        # lekin read_only ro'yxatini to'liq qilib qo'yamiz — kelajakda
        # tasodifan write endpoint'ga ulansa ham eskalatsiya bo'lmaydi.
        # Rollar faqat CenterMembership tasdiqlash oqimi (owner/admin) yoki
        # admin CLI orqali o'zgaradi; premium esa admin_toggle_user_premium
        # (is_platform_admin tekshiruvi bilan) orqali.
        # `email` ham read-only: u faqat tasdiqlangan OTP oqimi
        # (email/link/confirm/) orqali yoziladi — profil PATCH'ida tasdiqsiz
        # almashtirish tiklash kanalini o'g'irlash imkonini berardi.
        read_only_fields = ['id', 'roles', 'normalized_phone',
                            'email', 'email_verified', 'email_verified_at',
                            'roles_detail',
                            'telegram_linked', 'is_platform_admin',
                            'is_premium', 'is_premium_active', 'premium_trial_end',
                            'current_plan_name', 'student_tier',
                            'is_active', 'avatar_url', 'created_at',
                            'streak_count', 'longest_streak', 'last_active_date', 'badges',
                            'onboarding_completed', 'onboarding_grade',
                            'onboarding_subjects', 'onboarding_goal',
                            'onboarding_center_completed',
                            'onboarding_manager_completed', 'onboarding_teacher_completed',
                            'subject_levels', 'level_streak', 'totp_enabled']

    def get_badges(self, obj):
        return obj.get_badges()

    def get_telegram_linked(self, obj):
        return bool(obj.telegram_chat_id)

    def _active_subscriptions(self, obj):
        """Aktiv obunalar (end_date bo'yicha kamayish tartibida), bir marta.

        Admin ro'yxatida `prefetched_active_subscriptions` orqali oldindan
        yuklanadi (N+1 yo'q). Aks holda bitta so'rov — natija obyektda
        keshlanadi, shunda `current_plan_name` va `student_tier` maydonlari
        so'rovni takrorlamaydi.
        """
        cached = getattr(obj, '_active_subs_cache', None)
        if cached is not None:
            return cached
        prefetched = getattr(obj, 'prefetched_active_subscriptions', None)
        if prefetched is not None:
            subs = list(prefetched)
        else:
            subs = list(
                obj.subscriptions.filter(is_active=True)
                .select_related('plan').order_by('-end_date')
            )
        obj._active_subs_cache = subs
        return subs

    def get_current_plan_name(self, obj):
        subs = self._active_subscriptions(obj)
        sub = subs[0] if subs else None
        return sub.plan.name if sub and sub.plan else None

    def get_student_tier(self, obj):
        """O'quvchi tarifi: 'free' | 'standart' | 'plus' | 'pro'.

        Frontend gate'lari (canStandart/canPlus/canPro) shu maydonni o'qiydi.
        Avval tier `current_plan_name` satridan chiqarilardi — lekin tashkilot
        planlari o'quvchi planlari bilan AYNAN bir xil nomlanadi ("Pro (1 yil)"),
        shuning uchun markaz obunasi o'quvchi tarifi deb hisoblanib, UI barcha
        Pro imkoniyatlarini ochib yuborardi. Endi qaror bitta joyda —
        `billing.services.resolve_student_tier` (backend gate'lari ham
        `student_tier_at_least` orqali o'sha funksiyaga tayanadi).
        """
        from billing.services import resolve_student_tier  # lokal import — circular import xavfi

        if not obj.is_premium_active:
            return 'free'
        now = timezone.now()
        active = [
            s for s in self._active_subscriptions(obj)
            if s.end_date and s.end_date > now
        ]
        return resolve_student_tier(active, trial_active=obj.trial_active)

    def get_avatar_url(self, obj):
        from .utils import avatar_url_for
        request = self.context.get('request') if hasattr(self, 'context') else None
        return avatar_url_for(obj, request)

    def get_roles_detail(self, obj):
        from centers.models import CenterMembership

        roles_detail = {}
        # Ko'p foydalanuvchi serialize qilinadigan joylarda (admin paneli)
        # 'memberships' select_related('center') bilan prefetch qilingan bo'lishi
        # mumkin — N+1'ni oldini olish uchun prefetch cache'idan o'qiymiz.
        # Aks holda eski (alohida) so'rovga qaytamiz.
        if (
            hasattr(obj, '_prefetched_objects_cache')
            and 'memberships' in obj._prefetched_objects_cache
        ):
            memberships = list(obj.memberships.all())
        else:
            memberships = (
                CenterMembership.objects
                .filter(user=obj)
                .select_related('center')
                .order_by('-created_at')
            )
        # If the same role appears at multiple centers, prefer an approved
        # membership over pending/rejected so the dashboard lands the user
        # on the active one.
        priority = {'approved': 3, 'pending': 2, 'rejected': 1}
        for membership in memberships:
            center = membership.center
            center_payload = {
                'membership_id': membership.id,
                'status': membership.status,
                'centerId': membership.center_id,
                'centerName': center.name if center else '',
                'organizationType': center.organization_type if center else '',
                'country': center.country if center else '',
                'region': center.region if center else '',
                'district': center.district if center else '',
                'city': center.city if center else '',
                'image_url': center.image.url if center and center.image else '',
                'subject': membership.subject or '',
                'created_at': membership.created_at.isoformat() if membership.created_at else '',
            }
            existing = roles_detail.get(membership.role)
            centers = [*(existing.get('centers', []) if existing else []), center_payload]
            if existing:
                existing['centers'] = centers
            if existing and priority.get(existing['status'], 0) >= priority.get(membership.status, 0):
                continue
            roles_detail[membership.role] = {
                'status': membership.status,
                'centerId': membership.center_id,
                'centerName': membership.center.name if membership.center_id else '',
                'subject': membership.subject or '',
                'centers': centers,
            }
        for detail in roles_detail.values():
            centers = detail.get('centers') or []
            centers.sort(
                key=lambda item: (
                    priority.get(item.get('status'), 0),
                    item.get('created_at') or '',
                ),
                reverse=True,
            )
        # Centerless approved roles (e.g. a student who registered without
        # picking a center) are tracked in user.roles but have no
        # CenterMembership row. Surface them explicitly so the frontend
        # treats the user as approved instead of "no role".
        for role in (obj.roles or []):
            if role not in roles_detail:
                roles_detail[role] = {
                    'status': 'approved',
                    'centerId': None,
                    'centerName': '',
                    'subject': '',
                    'centers': [],
                }
        return roles_detail


class RegisterSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=120)
    phone = serializers.CharField(max_length=20)
    password = serializers.CharField(write_only=True, min_length=8)
    role = serializers.ChoiceField(choices=['student'], required=False)
    # Yosh siyosati (minors): 13+ rozilik yoki ota-ona tasdig'i.
    # Majburiy boolean — false/yo'q bo'lsa register rad etiladi.
    age_confirmed = serializers.BooleanField(required=False, default=False)

    def validate_age_confirmed(self, value):
        if value is not True:
            raise serializers.ValidationError(
                "Ro'yxatdan o'tish uchun 13 yoshdan katta ekanligingizni "
                "yoki ota-ona/vasiy roziligini tasdiqlang"
            )
        return value

    def validate_phone(self, value):
        norm = normalize_phone(value)
        if not norm:
            raise serializers.ValidationError("Telefon raqam noto'g'ri")
        if User.objects.filter(normalized_phone=norm).exists():
            raise serializers.ValidationError("Bu telefon raqam avval ro'yxatdan o'tgan")
        return norm

    def validate_password(self, value):
        # Django'ning standart parol validatorlari (uzunlik, oddiy parollar,
        # raqamli-only, foydalanuvchi atributlariga o'xshashlik) — avval
        # chaqirilmas edi va "123456" kabi parollar qabul qilinardi.
        try:
            django_validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages))
        return value

    def create(self, validated_data):
        role = validated_data.pop('role', None)
        validated_data.pop('age_confirmed', None)
        user = User.objects.create_user(
            phone=validated_data['phone'],
            password=validated_data['password'],
            full_name=validated_data['full_name'],
        )
        if role == 'student':
            user.add_role('student')
        return user


class LoginSerializer(serializers.Serializer):
    phone = serializers.CharField()
    password = serializers.CharField(write_only=True)

    # Per-account brute-force himoyasi: bir telefon raqam uchun 5 ta noto'g'ri
    # parol urinishidan so'ng 15 daqiqa lock. Avvalgi DRF throttle 5/min
    # global edi va hujumchi 100 ta turli IP yoki telefondan navbat qilib
    # parol topishi mumkin edi. Endi telefon raqam darajasida tracking.
    LOCKOUT_THRESHOLD = 5
    LOCKOUT_TTL_SECONDS = 15 * 60

    @classmethod
    def _failed_cache_key(cls, normalized_phone):
        return f'login_failed:{normalized_phone}'

    def validate(self, attrs):
        from django.core.cache import cache
        norm = normalize_phone(attrs.get('phone'))
        if not norm:
            raise serializers.ValidationError("Telefon raqam yoki parol noto'g'ri")
        masked = _mask_phone_for_log(norm)
        cache_key = self._failed_cache_key(norm)
        current_failed = cache.get(cache_key, 0)
        if current_failed >= self.LOCKOUT_THRESHOLD:
            security_logger.warning(
                'login blocked (lockout) phone=%s failed_count=%s',
                masked, current_failed,
            )
            raise serializers.ValidationError(
                "Juda ko'p noto'g'ri urinish. Iltimos, 15 daqiqadan keyin qayta urinib ko'ring."
            )
        try:
            user = User.objects.get(normalized_phone=norm)
        except User.DoesNotExist:
            # Mavjud bo'lmagan telefon uchun ham counter oshiramiz, aks holda
            # hujumchi telefon raqam mavjudligini timing orqali aniqlay olardi.
            cache.set(cache_key, current_failed + 1, self.LOCKOUT_TTL_SECONDS)
            security_logger.warning(
                'login failed (unknown phone) phone=%s attempt=%s',
                masked, current_failed + 1,
            )
            raise serializers.ValidationError("Telefon raqam yoki parol noto'g'ri")
        if not user.check_password(attrs.get('password')):
            cache.set(cache_key, current_failed + 1, self.LOCKOUT_TTL_SECONDS)
            security_logger.warning(
                'login failed (wrong password) phone=%s user_id=%s attempt=%s',
                masked, user.pk, current_failed + 1,
            )
            raise serializers.ValidationError("Telefon raqam yoki parol noto'g'ri")
        # Soft-delete: grace ichida tiklash mumkin; muddat o'tgan bo'lsa hard-delete
        # kutiladi (yoki allaqachon tozalangan). Admin blok (is_active=False,
        # deleted_at=None) alohida xabar.
        if getattr(user, 'deleted_at', None):
            from datetime import timedelta
            from django.conf import settings as dj_settings
            from django.utils import timezone as dj_tz
            grace_days = int(getattr(dj_settings, 'ACCOUNT_DELETE_GRACE_DAYS', 30))
            deadline = user.deleted_at + timedelta(days=grace_days)
            if dj_tz.now() > deadline:
                security_logger.warning(
                    'login blocked (soft-deleted expired) phone=%s user_id=%s',
                    masked, user.pk,
                )
                raise serializers.ValidationError(
                    "Hisob o'chirilgan va tiklash muddati tugagan"
                )
            security_logger.warning(
                'login blocked (soft-deleted restorable) phone=%s user_id=%s',
                masked, user.pk,
            )
            raise serializers.ValidationError({
                'detail': (
                    f"Hisob o'chirilgan. {grace_days} kun ichida "
                    "tiklash mumkin — parol bilan /api/auth/restore/ dan foydalaning."
                ),
                'account_deleted': True,
                'restorable': True,
                'restorable_until': deadline.isoformat(),
            })
        # Muddatli blok (`blocked_until`) tugagan bo'lsa shu yerda ochiladi:
        # bloklangan foydalanuvchi `/me` ga kira olmaydi (tokenlari bekor
        # qilingan), shuning uchun premium lazy-expiry'sidan farqli o'laroq
        # tekshiruv aynan kirish oqimida turadi. Doimiy blokka ta'sir qilmaydi.
        user.release_expired_suspension()
        if not user.is_active:
            security_logger.warning(
                'login blocked (inactive account) phone=%s user_id=%s',
                masked, user.pk,
            )
            raise serializers.ValidationError("Hisob bloklangan")
        # Muvaffaqiyatli login — counter'ni tozalaymiz.
        cache.delete(cache_key)
        attrs['user'] = user
        return attrs


class StartTelegramPhoneVerificationSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=20)

    def validate_phone(self, value):
        norm = normalize_phone(value)
        if not norm:
            raise serializers.ValidationError("Telefon raqam noto'g'ri")
        if User.objects.filter(normalized_phone=norm).exists():
            raise serializers.ValidationError("Bu telefon raqam avval ro'yxatdan o'tgan")
        return norm


class StartPasswordResetSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=20)

    def validate_phone(self, value):
        norm = normalize_phone(value)
        if not norm:
            raise serializers.ValidationError("Telefon raqam noto'g'ri")
        # XAVFSIZLIK (enumeration himoyasi): hisob bor-yo'qligini bu yerda
        # OSHKOR QILMAYMIZ. Avval "hisob topilmadi" / "hisob bloklangan"
        # xatolari qaytarilardi — bu orqali istalgan raqamning ro'yxatdan
        # o'tgan-o'tmaganini aniqlash mumkin edi. Endi oqim har doim davom
        # etadi; mavjud bo'lmagan hisob uchun parol almashtirish baribir
        # confirm bosqichida (to'g'ri OTP'dan keyingina) rad etiladi.
        return norm


class VerifyOtpSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=20)
    # OTP maqsadi — berilsa verify_otp aynan shu purpose'dagi yozuvni izlaydi
    # (registration kodi account_link oqimida ishlamasin va aksincha).
    # Ixtiyoriy: eski klientlar yubormaydi, ular uchun avvalgi xatti-harakat
    # (password_reset'dan tashqari barchasi) saqlanadi.
    purpose = serializers.ChoiceField(
        choices=['registration', 'account_link'],
        required=False,
    )
    # OTP server tomonida aniq 6 xonali raqam bo'lishi shart. Generatsiya
    # qilingan kod doim 6 xonali (_make_otp). Avval 4-12 belgi qabul qilinardi
    # va harf/belgi ham o'tib ketardi — endi faqat 6 ta raqam, aks holda
    # brute-force urinishlarini ham erta rad etamiz (DB'ga tegmasdan).
    otp = serializers.RegexField(
        r'^\d{6}$',
        error_messages={'invalid': 'OTP 6 xonali raqamdan iborat bo\'lishi kerak'},
    )

    def validate_phone(self, value):
        norm = normalize_phone(value)
        if not norm:
            raise serializers.ValidationError("Telefon raqam noto'g'ri")
        return norm


class StartEmailLinkSerializer(serializers.Serializer):
    """POST /api/auth/email/link/start/ — tasdiqlanadigan email manzili."""

    # Xato matni o'zbekcha — frontend serializer xatosini shundayligicha
    # ko'rsatadi (toUserMessage `detail`/birinchi maydon xatosini oladi).
    email = serializers.EmailField(
        max_length=254,
        error_messages={'invalid': "Email manzil noto'g'ri"},
    )

    def validate_email(self, value):
        # Kichik harfga keltiramiz — User.save() ham shunday qiladi, shu sababli
        # unique tekshiruvi saqlanadigan qiymat bilan bir xil ko'rinishda ketadi.
        return value.strip().lower()


class ConfirmEmailLinkSerializer(serializers.Serializer):
    """POST /api/auth/email/link/confirm/ — emailga yuborilgan 6 xonali kod.

    Manzil so'rovda emas — u sessiyada (EmailVerification) yozilgan, klient
    boshqa manzilni "tasdiqlab" yubora olmasligi uchun.
    """

    otp = serializers.RegexField(
        r'^\d{6}$',
        error_messages={'invalid': 'OTP 6 xonali raqamdan iborat bo\'lishi kerak'},
    )


class UpdateProfileSerializer(serializers.Serializer):
    """PATCH /api/me/ — current user'ning ism/familiya/username'ini yangilash.

    Barcha maydonlar ixtiyoriy; faqat kelganlari tegishli o'zgartiriladi.
    `username` butun loyiha bo'ylab unique va format cheklovi bilan
    validatsiya qilinadi.

    Telefon raqam bu endpoint orqali O'ZGARTIRILMAYDI. Telefon — hisobni
    tasdiqlash (Telegram OTP) bilan bog'liq xavfsizlik maydoni; uni oddiy
    profil PATCH'ida tasdiqsiz almashtirish hisobni o'g'irlash xavfini
    tug'diradi. Telefonni almashtirish kelajakda alohida tasdiqlangan flow
    (OTP) orqali amalga oshiriladi.
    """

    USERNAME_RE = re.compile(r'^[A-Za-z0-9._]{3,32}$')

    first_name = serializers.CharField(max_length=60, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=60, required=False, allow_blank=True)
    username = serializers.CharField(max_length=32, required=False, allow_blank=True)

    def validate_username(self, value):
        if value is None:
            return value
        value = value.strip()
        if value == '':
            # Bo'sh string => username'ni o'chirish (NULL'ga aylantirish).
            return ''
        if not self.USERNAME_RE.match(value):
            raise serializers.ValidationError(
                "Username faqat harf, raqam, '_' va '.' belgilaridan iborat bo'lib, "
                "kamida 3 belgidan iborat bo'lishi kerak"
            )
        # Unique check — boshqa user allaqachon olgan bo'lmasin.
        qs = User.objects.filter(username__iexact=value)
        current_user = self.context.get('user') if hasattr(self, 'context') else None
        if current_user is not None:
            qs = qs.exclude(pk=current_user.pk)
        if qs.exists():
            raise serializers.ValidationError("Bu username band")
        return value


class ChangePasswordSerializer(serializers.Serializer):
    """POST /api/auth/me/change-password/ — eski parol bilan yangisini almashtirish."""

    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate_new_password(self, value):
        try:
            django_validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages))
        return value


class ConfirmPasswordResetSerializer(VerifyOtpSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    def validate_password(self, value):
        # Parol reset paytida ham bir xil kuchli parol talablari amal
        # qilishi kerak — aks holda foydalanuvchi reset orqali zaif
        # parolga o'tib oladi.
        try:
            django_validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages))
        return value


class RewardProductSerializer(serializers.ModelSerializer):
    """Markaz do'koni mahsuloti.

    `center` write uchun ham ochiq, lekin view'larda menejer faqat o'z
    markazini biriktiradi (perform_create'da center majburan o'rnatiladi),
    shuning uchun bu yerda alohida validatsiya shart emas. `center_name`
    va `image_url` read-only.
    """
    center_name = serializers.SerializerMethodField()
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = RewardProduct
        fields = ['id', 'center', 'center_name', 'title', 'description',
                  'coin_cost', 'icon', 'image', 'image_url', 'features',
                  'stock', 'is_premium_only', 'is_active', 'created_at']
        read_only_fields = ['id', 'center', 'center_name', 'image_url', 'created_at']

    def get_center_name(self, obj):
        return obj.center.name if obj.center_id else ''

    def get_image_url(self, obj):
        if not obj.image:
            return ''
        url = obj.image.url
        request = self.context.get('request') if hasattr(self, 'context') else None
        return request.build_absolute_uri(url) if request else url

    def validate_features(self, value):
        # Xususiyatlar — string'lar ro'yxati. Frontend obyekt yuborsa ham
        # (masalan {key, value}) qabul qilamiz, lekin oddiy string ro'yxati
        # asosiy format. Ro'yxat emas bo'lsa bo'sh ro'yxatga aylantiramiz.
        if value in (None, ''):
            return []
        if not isinstance(value, list):
            raise serializers.ValidationError("Xususiyatlar ro'yxat bo'lishi kerak")
        cleaned = []
        for item in value[:30]:  # ortiqcha shishirib yuborishni cheklash
            if isinstance(item, str):
                s = item.strip()
                if s:
                    cleaned.append(s[:120])
            elif isinstance(item, dict):
                cleaned.append(item)
        return cleaned
