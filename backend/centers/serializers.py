from rest_framework import serializers

from .models import CenterMembership, EducationCenter


class EducationCenterSerializer(serializers.ModelSerializer):
    class Meta:
        model = EducationCenter
        fields = ['id', 'name', 'city', 'owner', 'status', 'subjects',
                  'rating', 'created_at']
        read_only_fields = ['id', 'owner', 'status', 'rating', 'created_at']


class CenterMembershipSerializer(serializers.ModelSerializer):
    class Meta:
        model = CenterMembership
        fields = ['id', 'user', 'center', 'role', 'subject', 'status',
                  'approved_by', 'created_at']
        read_only_fields = ['id', 'status', 'approved_by', 'created_at']


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
