from django.contrib.auth.password_validation import validate_password as django_validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from accounts.utils import normalize_phone
from .models import CenterMembership, EducationCenter


class EducationCenterSerializer(serializers.ModelSerializer):
    # Public listing — owner kontaktlari (owner_full_name, owner_phone) shu
    # serializer'dan olib tashlangan. Bu ma'lumotlar faqat platforma admini
    # uchun AdminEducationCenterSerializer'da ochiq.
    # Y12: `owner` (user ID) public response'da faqat owner/admin uchun
    # ko'rinadi. Boshqa foydalanuvchilarga `null` qaytariladi — user ID
    # enumeration va social engineering xavfini kamaytirish uchun.
    image_url = serializers.SerializerMethodField()
    students = serializers.SerializerMethodField()
    olympiads = serializers.SerializerMethodField()
    owner = serializers.SerializerMethodField()

    class Meta:
        model = EducationCenter
        fields = ['id', 'name', 'organization_type', 'country', 'region', 'district',
                  'city', 'owner', 'status', 'is_premium', 'subjects', 'rating',
                  'created_at', 'image_url', 'students', 'olympiads']
        # is_premium read-only serializer darajasida — yozish faqat
        # update_center view'ida is_platform_admin tekshiruvidan keyin amalga
        # oshiriladi (oddiy owner uni o'zgartira olmaydi).
        read_only_fields = ['id', 'owner', 'status', 'is_premium', 'rating', 'created_at']

    def get_owner(self, obj):
        request = self.context.get('request') if hasattr(self, 'context') else None
        viewer = getattr(request, 'user', None) if request else None
        if not viewer or not getattr(viewer, 'is_authenticated', False):
            return None
        # Faqat egasi yoki platforma admini owner ID ni ko'radi.
        if getattr(viewer, 'is_platform_admin', False) or obj.owner_id == viewer.id:
            return obj.owner_id
        return None

    def get_image_url(self, obj):
        if not obj.image:
            return ''
        url = obj.image.url
        request = self.context.get('request') if hasattr(self, 'context') else None
        return request.build_absolute_uri(url) if request else url

    def get_students(self, obj):
        # Prefer the annotated count (centers/views._annotate_center_counts)
        # to avoid an N+1 query per row; fall back to a query if absent.
        annotated = getattr(obj, 'students_count', None)
        if annotated is not None:
            return annotated
        return obj.memberships.filter(
            role=CenterMembership.ROLE_STUDENT,
            status=CenterMembership.STATUS_APPROVED,
        ).count()

    def get_olympiads(self, obj):
        annotated = getattr(obj, 'olympiads_count', None)
        if annotated is not None:
            return annotated
        return obj.olympiads.count()


class AdminEducationCenterSerializer(EducationCenterSerializer):
    """Platform admin endpointlari uchun: owner kontaktlari ham qaytadi."""
    owner_full_name = serializers.CharField(source='owner.full_name', read_only=True)
    owner_phone = serializers.CharField(source='owner.normalized_phone', read_only=True)

    class Meta(EducationCenterSerializer.Meta):
        fields = EducationCenterSerializer.Meta.fields + [
            'owner_full_name', 'owner_phone',
        ]


class CenterMembershipSerializer(serializers.ModelSerializer):
    class Meta:
        model = CenterMembership
        fields = ['id', 'user', 'center', 'role', 'subject', 'approval_code', 'status',
                  'approved_by', 'created_at']
        read_only_fields = ['id', 'approval_code', 'status', 'approved_by', 'created_at']


class CenterRegisterSerializer(serializers.Serializer):
    """Used when a user registers a new organization; they become its owner."""
    name = serializers.CharField(max_length=160)
    organization_type = serializers.CharField(
        max_length=80,
        required=False,
        allow_blank=True,
        default="O'quv markaz",
    )
    country = serializers.CharField(
        max_length=80,
        required=False,
        allow_blank=True,
        default="O'zbekiston",
    )
    region = serializers.CharField(max_length=100, required=False, allow_blank=True, default='')
    district = serializers.CharField(max_length=100, required=False, allow_blank=True, default='')
    city = serializers.CharField(max_length=80, required=False, allow_blank=True)
    subjects = serializers.ListField(
        child=serializers.CharField(), required=False, default=list,
    )

    def validate_organization_type(self, value):
        value = str(value or '').strip()
        return value or "O'quv markaz"

    def validate_country(self, value):
        value = str(value or '').strip()
        return value or "O'zbekiston"

    def validate(self, attrs):
        city = str(attrs.get('city') or '').strip()
        region = str(attrs.get('region') or '').strip()
        district = str(attrs.get('district') or '').strip()
        if not city:
            city = district or region
        if not city:
            raise serializers.ValidationError({'district': "Tuman yoki shaharni tanlang"})
        attrs['city'] = city
        attrs['region'] = region
        attrs['district'] = district
        return attrs


class JoinRequestSerializer(serializers.Serializer):
    """POST /api/centers/{id}/join/ — user requests center membership."""
    role = serializers.ChoiceField(
        choices=[
            CenterMembership.ROLE_STUDENT,
            CenterMembership.ROLE_TEACHER,
            CenterMembership.ROLE_MANAGER,
        ],
        default=CenterMembership.ROLE_STUDENT,
    )
    subject = serializers.CharField(max_length=80, required=False, allow_blank=True)

    def validate(self, attrs):
        role = attrs.get('role', CenterMembership.ROLE_STUDENT)
        subject = str(attrs.get('subject') or '').strip()
        # Teacher arizalari uchun fan majburiy: aks holda owner panelda fan
        # ko'rinmaydi va tasdiqlash paytida qaysi fanga biriktirish noma'lum
        # bo'lardi. Frontend allaqachon bo'sh subject bilan tugmani disable
        # qiladi; bu yerda ham himoya qatlam qo'shamiz (API to'g'ridan-to'g'ri
        # chaqirilsa).
        if role == CenterMembership.ROLE_TEACHER and not subject:
            raise serializers.ValidationError({
                'subject': "O'qituvchi arizasi uchun fanni tanlash majburiy",
            })
        attrs['subject'] = subject
        return attrs


class ApproveSerializer(serializers.Serializer):
    """Approve/reject an existing membership by id."""
    membership_id = serializers.IntegerField()
    decision = serializers.ChoiceField(choices=['approve', 'reject', 'approved', 'rejected'])


class ChangeRoleSerializer(serializers.Serializer):
    """POST /api/centers/{id}/members/{membership_id}/change-role/."""
    role = serializers.ChoiceField(
        choices=[
            CenterMembership.ROLE_STUDENT,
            CenterMembership.ROLE_TEACHER,
            CenterMembership.ROLE_MANAGER,
        ],
    )


class CreateManagerSerializer(serializers.Serializer):
    """Owner-created manager account for an approved education center."""
    full_name = serializers.CharField(max_length=120)
    phone = serializers.CharField(max_length=20)
    password = serializers.CharField(write_only=True, min_length=8)

    def validate_phone(self, value):
        from django.contrib.auth import get_user_model

        norm = normalize_phone(value)
        if not norm:
            raise serializers.ValidationError("Telefon raqam noto'g'ri")
        if get_user_model().objects.filter(normalized_phone=norm).exists():
            raise serializers.ValidationError("Bu telefon raqam avval ro'yxatdan o'tgan")
        return norm

    def validate_password(self, value):
        # Django'ning standart parol validatorlari avval chaqirilmas edi —
        # "123456" kabi oddiy parollar qabul qilinardi. RegisterSerializer
        # bilan bir xil tartibda tekshiramiz.
        try:
            django_validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages))
        return value


class CreateTeacherSerializer(CreateManagerSerializer):
    """Owner-created teacher account for an approved education center."""
    subject = serializers.CharField(max_length=80, required=False, allow_blank=True)
