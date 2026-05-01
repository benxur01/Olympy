from rest_framework import serializers

from .models import TestAttempt


class TestAttemptSerializer(serializers.ModelSerializer):
    class Meta:
        model = TestAttempt
        fields = ['id', 'user', 'olympiad', 'answers', 'score', 'correct_count',
                  'wrong_count', 'total_questions', 'time_spent', 'rank',
                  'submitted_at']
        read_only_fields = ['id', 'user', 'rank', 'submitted_at']


class SubmitAttemptSerializer(serializers.Serializer):
    """Payload sent by the test page when a student finishes."""
    olympiad = serializers.IntegerField()
    answers = serializers.DictField(child=serializers.IntegerField(), required=False)
    time_spent = serializers.IntegerField(min_value=0, default=0)
