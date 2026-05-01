from rest_framework import serializers

from .models import Question


class QuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Question
        fields = ['id', 'center', 'subject', 'text', 'options', 'correct_answer',
                  'score', 'difficulty', 'image', 'source', 'created_by',
                  'created_at']
        read_only_fields = ['id', 'created_by', 'created_at']
