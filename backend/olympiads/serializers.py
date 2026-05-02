from rest_framework import serializers

from questions.models import Question

from .models import Olympiad


class OlympiadSerializer(serializers.ModelSerializer):
    question_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Question.objects.all(),
        source='questions',
        required=False,
    )

    class Meta:
        model = Olympiad
        fields = ['id', 'center', 'title', 'subject', 'start_datetime',
                  'duration_minutes', 'max_score', 'status', 'created_by',
                  'question_ids', 'created_at']
        read_only_fields = ['id', 'created_by', 'created_at']
