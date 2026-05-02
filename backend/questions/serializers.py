from rest_framework import serializers

from .models import Question


class QuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Question
        fields = ['id', 'center', 'subject', 'text', 'options', 'correct_answer',
                  'score', 'difficulty', 'image', 'source', 'created_by',
                  'created_at']
        read_only_fields = ['id', 'created_by', 'created_at']

    def validate(self, data):
        options = data.get('options', [])
        if not options or len(options) < 2:
            raise serializers.ValidationError({'options': "Kamida 2 ta variant bo'lishi kerak"})
        correct = data.get('correct_answer')
        try:
            correct = int(correct)
        except (TypeError, ValueError):
            raise serializers.ValidationError({'correct_answer': "To'g'ri javob indeksi noto'g'ri"})
        if correct is None or not (0 <= correct < len(options)):
            raise serializers.ValidationError({'correct_answer': "To'g'ri javob indeksi noto'g'ri"})
        try:
            score = int(data.get('score', 0))
        except (TypeError, ValueError):
            raise serializers.ValidationError({'score': "Ball 1 dan 100 gacha bo'lishi kerak"})
        if score < 1 or score > 100:
            raise serializers.ValidationError({'score': "Ball 1 dan 100 gacha bo'lishi kerak"})
        return data
