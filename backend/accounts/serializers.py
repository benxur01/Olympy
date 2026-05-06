from rest_framework import serializers

from .models import User
from .utils import normalize_phone


class UserSerializer(serializers.ModelSerializer):
    roles_detail = serializers.SerializerMethodField()
    telegram_linked = serializers.SerializerMethodField()
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'full_name', 'phone', 'normalized_phone', 'roles',
                  'roles_detail', 'telegram_linked', 'is_platform_admin',
                  'is_active', 'avatar_url', 'created_at']
        read_only_fields = ['id', 'normalized_phone', 'roles_detail',
                            'telegram_linked', 'is_platform_admin',
                            'is_active', 'avatar_url', 'created_at']

    def get_telegram_linked(self, obj):
        return bool(obj.telegram_chat_id)

    def get_avatar_url(self, obj):
        if not obj.avatar:
            return ''
        url = obj.avatar.url
        request = self.context.get('request') if hasattr(self, 'context') else None
        return request.build_absolute_uri(url) if request else url

    def get_roles_detail(self, obj):
        from centers.models import CenterMembership

        roles_detail = {}
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
    password = serializers.CharField(write_only=True, min_length=6)
    role = serializers.ChoiceField(choices=['student'], required=False)

    def validate_phone(self, value):
        norm = normalize_phone(value)
        if not norm:
            raise serializers.ValidationError("Telefon raqam noto'g'ri")
        if User.objects.filter(normalized_phone=norm).exists():
            raise serializers.ValidationError("Bu telefon raqam avval ro'yxatdan o'tgan")
        return norm

    def create(self, validated_data):
        role = validated_data.pop('role', None)
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
        cache_key = self._failed_cache_key(norm)
        current_failed = cache.get(cache_key, 0)
        if current_failed >= self.LOCKOUT_THRESHOLD:
            raise serializers.ValidationError(
                "Juda ko'p noto'g'ri urinish. Iltimos, 15 daqiqadan keyin qayta urinib ko'ring."
            )
        try:
            user = User.objects.get(normalized_phone=norm)
        except User.DoesNotExist:
            # Mavjud bo'lmagan telefon uchun ham counter oshiramiz, aks holda
            # hujumchi telefon raqam mavjudligini timing orqali aniqlay olardi.
            cache.set(cache_key, current_failed + 1, self.LOCKOUT_TTL_SECONDS)
            raise serializers.ValidationError("Telefon raqam yoki parol noto'g'ri")
        if not user.check_password(attrs.get('password')):
            cache.set(cache_key, current_failed + 1, self.LOCKOUT_TTL_SECONDS)
            raise serializers.ValidationError("Telefon raqam yoki parol noto'g'ri")
        if not user.is_active:
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
        try:
            user = User.objects.get(normalized_phone=norm)
        except User.DoesNotExist:
            raise serializers.ValidationError("Bu telefon raqam bilan hisob topilmadi")
        if not user.is_active:
            raise serializers.ValidationError("Hisob bloklangan")
        return norm


class VerifyOtpSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=20)
    otp = serializers.CharField(min_length=4, max_length=12)

    def validate_phone(self, value):
        norm = normalize_phone(value)
        if not norm:
            raise serializers.ValidationError("Telefon raqam noto'g'ri")
        return norm


class ConfirmPasswordResetSerializer(VerifyOtpSerializer):
    password = serializers.CharField(write_only=True, min_length=6)
