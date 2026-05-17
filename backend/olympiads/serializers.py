from rest_framework import serializers

from questions.models import Question

from .models import Olympiad


def _normalise_option(value):
    return (
        str(value or '')
        .strip()
        .lower()
        .replace('‘', "'")
        .replace('’', "'")
        .replace('`', "'")
        .replace('ʼ', "'")
        .replace('ʻ', "'")
    )


def _question_test_type(question):
    options = [_normalise_option(option) for option in (question.options or [])]
    if not options:
        return Olympiad.TEST_TYPE_SHORT_ANSWER
    positive = {"to'g'ri", "tog'ri", 'togri', 'true', 'rost', 'ha'}
    negative = {"noto'g'ri", "notog'ri", 'notogri', 'false', "yolg'on", "yo'q", 'yoq'}
    if len(options) == 2 and any(o in positive for o in options) and any(o in negative for o in options):
        return Olympiad.TEST_TYPE_TRUE_FALSE
    return Olympiad.TEST_TYPE_MULTIPLE_CHOICE


class OlympiadSerializer(serializers.ModelSerializer):
    question_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Question.objects.all(),
        source='questions',
        required=False,
    )
    participants = serializers.SerializerMethodField()
    avg_score = serializers.SerializerMethodField()
    # max_score model field default 100 edi va frontend uni o'rnatishga harakat
    # qilardi, lekin server submit_attempt'da uni e'tiborga olmasdi va score
    # = round(earned/sum(question.score)*100) ko'rinishida hisoblardi. Endi
    # max_score serializer-derived qiymat: savollarning yig'indi balli.
    # Olimpiadaga savollar biriktirilmagan paytda fallback 100.
    max_score = serializers.SerializerMethodField()
    # duration_minutes — kamida 1 minut, ko'pi bilan 24 soat (1440 min).
    # Avval cheklash yo'q edi va frontend juda katta qiymat yuborsa
    # (masalan 999999), test vaqti hech qachon tugamasdi va leaderboard'da
    # time_spent qatori juda katta bo'lib ko'rinardi.
    duration_minutes = serializers.IntegerField(min_value=1, max_value=1440)

    class Meta:
        model = Olympiad
        fields = ['id', 'center', 'event_type', 'title', 'subject', 'test_level',
                  'test_type', 'start_datetime',
                  'duration_minutes', 'max_score', 'status', 'created_by',
                  'question_ids', 'participants', 'avg_score', 'created_at']
        read_only_fields = ['id', 'status', 'created_by', 'participants', 'avg_score',
                            'max_score', 'created_at']

    def get_participants(self, obj):
        # Annotate qiymati bo'lsa undan foydalanamiz (N+1 yo'q),
        # bo'lmasa fallback sifatida count() qilamiz.
        if hasattr(obj, 'participants_count') and obj.participants_count is not None:
            return obj.participants_count
        return obj.attempts.count()

    def get_avg_score(self, obj):
        if hasattr(obj, 'avg_score_value'):
            value = obj.avg_score_value
            return round(value, 1) if value is not None else 0
        agg = obj.attempts.all()
        total = agg.count()
        if not total:
            return 0
        return round(sum(a.score for a in agg) / total, 1)

    def get_max_score(self, obj):
        total = sum(q.score or 0 for q in obj.questions.all())
        return total if total > 0 else 100

    def validate(self, attrs):
        center = attrs.get('center') or (self.instance.center if self.instance else None)
        questions = attrs.get('questions')
        if center and questions is not None:
            foreign = [q.id for q in questions if q.center_id != center.id]
            if foreign:
                raise serializers.ValidationError({
                    'question_ids': "Olimpiadaga faqat shu markaz savollarini qo'shish mumkin",
                })
        test_type = attrs.get(
            'test_type',
            self.instance.test_type if self.instance else Olympiad.TEST_TYPE_UNSET,
        )
        if test_type and test_type != Olympiad.TEST_TYPE_MIXED:
            if questions is None and self.instance:
                questions = list(self.instance.questions.all())
            mismatched = [
                q.id for q in (questions or [])
                if _question_test_type(q) != test_type
            ]
            if mismatched:
                raise serializers.ValidationError({
                    'test_type': (
                        f"Tanlangan test turiga {len(mismatched)} ta savol mos emas. "
                        "Mos savollarni tanlang yoki test turini Aralash qiling."
                    ),
                })
        return attrs
