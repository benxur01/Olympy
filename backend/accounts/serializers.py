from rest_framework import serializers

from .models import User
from .utils import normalize_phone


class UserSerializer(serializers.ModelSerializer):
    roles_detail = serializers.SerializerMethodField()
    telegram_linked = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'full_name', 'phone', 'normalized_phone', 'roles',
                  'roles_detail', 'telegram_linked', 'is_platform_admin',
                  'is_active', 'created_at']
        read_only_fields = ['id', 'normalized_phone', 'roles_detail',
                            'telegram_linked', 'is_platform_admin',
                            'is_active', 'created_at']

    def get_telegram_linked(self, obj):
        return bool(obj.telegram_chat_id)

    def get_roles_detail(self, obj):
        from centers.models import CenterMembership

        roles_detail = {}
        memberships = (
            CenterMembership.objects
            .filter(user=obj)
            .select_related('center')
        )
        # If the same role appears at multiple centers, prefer an approved
        # membership over pending/rejected so the dashboard lands the user
        # on the active one.
        priority = {'approved': 3, 'pending': 2, 'rejected': 1}
        for membership in memberships:
            existing = roles_detail.get(membership.role)
            if existing and priority.get(existing['status'], 0) >= priority.get(membership.status, 0):
                continue
            roles_detail[membership.role] = {
                'status': membership.status,
                'centerId': membership.center_id,
                'centerName': membership.center.name if membership.center_id else '',
                'subject': membership.subject or '',
            }
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

    def validate(self, attrs):
        norm = normalize_phone(attrs.get('phone'))
        if not norm:
            raise serializers.ValidationError("Telefon raqam yoki parol noto'g'ri")
        try:
            user = User.objects.get(normalized_phone=norm)
        except User.DoesNotExist:
            raise serializers.ValidationError("Telefon raqam yoki parol noto'g'ri")
        if not user.check_password(attrs.get('password')):
            raise serializers.ValidationError("Telefon raqam yoki parol noto'g'ri")
        if not user.is_active:
            raise serializers.ValidationError("Hisob bloklangan")
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


class VerifyOtpSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=20)
    otp = serializers.CharField(min_length=4, max_length=12)

    def validate_phone(self, value):
        norm = normalize_phone(value)
        if not norm:
            raise serializers.ValidationError("Telefon raqam noto'g'ri")
        return norm
