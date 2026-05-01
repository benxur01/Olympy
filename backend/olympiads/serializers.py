from rest_framework import serializers

from .models import Olympiad


class OlympiadSerializer(serializers.ModelSerializer):
    question_ids = serializers.PrimaryKeyRelatedField(
        source='questions', many=True, read_only=True,
    )

    class Meta:
        model = Olympiad
        fields = ['id', 'center', 'title', 'subject', 'start_datetime',
                  'duration_minutes', 'max_score', 'status', 'created_by',
                  'question_ids', 'created_at']
        read_only_fields = ['id', 'created_by', 'created_at', 'question_ids']
