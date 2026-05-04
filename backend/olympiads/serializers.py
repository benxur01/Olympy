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
    participants = serializers.SerializerMethodField()
    avg_score = serializers.SerializerMethodField()

    class Meta:
        model = Olympiad
        fields = ['id', 'center', 'title', 'subject', 'start_datetime',
                  'duration_minutes', 'max_score', 'status', 'created_by',
                  'question_ids', 'participants', 'avg_score', 'created_at']
        read_only_fields = ['id', 'status', 'created_by', 'participants', 'avg_score',
                            'created_at']

    def get_participants(self, obj):
        # Real attempt count, not a fake value. Slightly N+1 — fine until
        # the olympiad list grows past a few hundred rows.
        return obj.attempts.count()

    def get_avg_score(self, obj):
        agg = obj.attempts.all()
        total = agg.count()
        if not total:
            return 0
        return round(sum(a.score for a in agg) / total, 1)

    def validate(self, attrs):
        center = attrs.get('center') or (self.instance.center if self.instance else None)
        questions = attrs.get('questions')
        if center and questions is not None:
            foreign = [q.id for q in questions if q.center_id != center.id]
            if foreign:
                raise serializers.ValidationError({
                    'question_ids': "Olimpiadaga faqat shu markaz savollarini qo'shish mumkin",
                })
        return attrs
