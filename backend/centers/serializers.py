from rest_framework import serializers

from accounts.utils import normalize_phone
from .models import CenterMembership, EducationCenter


class EducationCenterSerializer(serializers.ModelSerializer):
    owner_full_name = serializers.CharField(source='owner.full_name', read_only=True)
    owner_phone = serializers.CharField(source='owner.normalized_phone', read_only=True)
    students = serializers.SerializerMethodField()
    olympiads = serializers.SerializerMethodField()

    class Meta:
        model = EducationCenter
        fields = ['id', 'name', 'city', 'owner', 'status', 'subjects',
                  'rating', 'created_at', 'owner_full_name', 'owner_phone',
                  'students', 'olympiads']
        read_only_fields = ['id', 'owner', 'status', 'rating', 'created_at']

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


class CenterMembershipSerializer(serializers.ModelSerializer):
    class Meta:
        model = CenterMembership
        fields = ['id', 'user', 'center', 'role', 'subject', 'approval_code', 'status',
                  'approved_by', 'created_at']
        read_only_fields = ['id', 'approval_code', 'status', 'approved_by', 'created_at']


class CenterRegisterSerializer(serializers.Serializer):
    """Used when a user registers a new center; they become its owner."""
    name = serializers.CharField(max_length=160)
    city = serializers.CharField(max_length=80)
    subjects = serializers.ListField(
        child=serializers.CharField(), required=False, default=list,
    )


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


class ApproveSerializer(serializers.Serializer):
    """Approve/reject an existing membership by id."""
    membership_id = serializers.IntegerField()
    decision = serializers.ChoiceField(choices=['approve', 'reject', 'approved', 'rejected'])


class CreateManagerSerializer(serializers.Serializer):
    """Owner-created manager account for an approved education center."""
    full_name = serializers.CharField(max_length=120)
    phone = serializers.CharField(max_length=20)
    password = serializers.CharField(write_only=True, min_length=6)

    def validate_phone(self, value):
        from django.contrib.auth import get_user_model

        norm = normalize_phone(value)
        if not norm:
            raise serializers.ValidationError("Telefon raqam noto'g'ri")
        if get_user_model().objects.filter(normalized_phone=norm).exists():
            raise serializers.ValidationError("Bu telefon raqam avval ro'yxatdan o'tgan")
        return norm


class CreateTeacherSerializer(CreateManagerSerializer):
    """Owner-created teacher account for an approved education center."""
    subject = serializers.CharField(max_length=80, required=False, allow_blank=True)
