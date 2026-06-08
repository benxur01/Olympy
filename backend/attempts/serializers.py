from rest_framework import serializers

from .models import TestAttempt


class TestAttemptSerializer(serializers.ModelSerializer):
    # Attempt egasining ismi va profil rasmi — natijalar/attempt sahifalarida
    # avatarni ko'rsatish uchun. `request` konteksti bo'lmasa ham ishlaydi
    # (avatar_url_for absolyut yoki nisbiy URL qaytaradi).
    user_name = serializers.SerializerMethodField()
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = TestAttempt
        fields = ['id', 'user', 'user_name', 'avatar_url', 'olympiad', 'answers',
                  'score', 'correct_count', 'wrong_count', 'total_questions',
                  'time_spent', 'rank', 'disqualified', 'submitted_at']
        read_only_fields = ['id', 'user', 'user_name', 'avatar_url', 'rank',
                            'disqualified', 'submitted_at']

    def get_user_name(self, obj):
        user = getattr(obj, 'user', None)
        if not user:
            return ''
        return getattr(user, 'full_name', '') or getattr(user, 'phone', '') or ''

    def get_avatar_url(self, obj):
        from accounts.utils import avatar_url_for
        request = self.context.get('request') if hasattr(self, 'context') else None
        return avatar_url_for(getattr(obj, 'user', None), request)


class CodeAnswerSerializer(serializers.Serializer):
    """Bitta kod (IT) savoliga yuborilgan javob: kod matni + dasturlash tili."""
    code = serializers.CharField(allow_blank=True, trim_whitespace=False)
    language = serializers.CharField(required=False, allow_blank=True, default='')


class SubmitAttemptSerializer(serializers.Serializer):
    """Payload sent by the test page when a student finishes."""
    olympiad = serializers.IntegerField()
    # answers — { "<question_id>": <javob> }. Javob qiymati savol turiga qarab
    # farq qiladi: mcq/yes_no → int yoki {"chosen_idx": int}; multiple_select →
    # {"selected": [int,...]}; fill_blank/essay → {"text": str};
    # fill_blanks → {"blanks": {"1": str,...}}. Shu sababli child tipini int'ga
    # cheklamaymiz (avval IntegerField edi va yangi turlarni rad etardi);
    # baholash va validatsiya score_session_answers/grade_answer'da turga qarab
    # bajariladi.
    answers = serializers.DictField(required=False)
    # Kod (IT) javoblari: { "<question_id>": { "code": "...", "language": "python" } }.
    # Oddiy MCQ olimpiadalarda umuman yuborilmaydi (required=False).
    code_answers = serializers.DictField(
        child=CodeAnswerSerializer(), required=False,
    )
    time_spent = serializers.IntegerField(min_value=0, default=0)


class CodeSubmissionSerializer(serializers.ModelSerializer):
    """Ustoz/menejer uchun kod javobini ko'rsatish (natijalar sahifasi)."""
    student_name = serializers.SerializerMethodField()
    student_id = serializers.SerializerMethodField()
    student_avatar_url = serializers.SerializerMethodField()
    question_text = serializers.SerializerMethodField()

    class Meta:
        from .models import CodeSubmission
        model = CodeSubmission
        fields = [
            'id', 'attempt', 'question', 'question_text', 'student_id',
            'student_name', 'student_avatar_url', 'submitted_code', 'code_language',
            'ai_code_review', 'ai_code_score', 'created_at',
        ]
        read_only_fields = fields

    def get_student_name(self, obj):
        user = getattr(obj.attempt, 'user', None)
        if not user:
            return ''
        return getattr(user, 'full_name', '') or getattr(user, 'phone', '') or ''

    def get_student_avatar_url(self, obj):
        from accounts.utils import avatar_url_for
        request = self.context.get('request') if hasattr(self, 'context') else None
        return avatar_url_for(getattr(obj.attempt, 'user', None), request)

    def get_student_id(self, obj):
        return getattr(obj.attempt, 'user_id', None)

    def get_question_text(self, obj):
        return (getattr(obj.question, 'text', '') or '')[:300]
