import json

from rest_framework import serializers

from .models import Question


class QuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Question
        fields = ['id', 'center', 'subject', 'text', 'options', 'correct_answer',
                  'score', 'difficulty', 'image', 'source', 'created_by',
                  'created_at']
        read_only_fields = ['id', 'created_by', 'created_at']

    def to_internal_value(self, data):
        # Multipart form-data sends JSON arrays as strings (e.g. when an
        # image file is attached). Decode 'options' transparently so the
        # JSONField validates correctly.
        raw_options = data.get('options') if hasattr(data, 'get') else None
        if isinstance(raw_options, str):
            try:
                parsed = json.loads(raw_options)
            except (TypeError, ValueError):
                parsed = None
            if isinstance(parsed, list):
                data = data.copy() if hasattr(data, 'copy') else dict(data)
                data['options'] = parsed
        return super().to_internal_value(data)

    def validate(self, data):
        # PATCH uchun mavjud instance maydonlari fallback bo'ladi.
        instance = getattr(self, 'instance', None)
        options = data.get('options')
        if options is None and instance is not None:
            options = instance.options
        if not options or len(options) < 2:
            raise serializers.ValidationError({'options': "Kamida 2 ta variant bo'lishi kerak"})

        correct = data.get('correct_answer')
        if correct is None and instance is not None:
            correct = instance.correct_answer
        try:
            correct = int(correct)
        except (TypeError, ValueError):
            raise serializers.ValidationError({'correct_answer': "To'g'ri javob indeksi noto'g'ri"})
        if not (0 <= correct < len(options)):
            raise serializers.ValidationError({'correct_answer': "To'g'ri javob indeksi noto'g'ri"})

        score = data.get('score')
        if score is None and instance is not None:
            score = instance.score
        try:
            score = int(score) if score is not None else 0
        except (TypeError, ValueError):
            raise serializers.ValidationError({'score': "Ball 1 dan 100 gacha bo'lishi kerak"})
        if score < 1 or score > 100:
            raise serializers.ValidationError({'score': "Ball 1 dan 100 gacha bo'lishi kerak"})
        return data
