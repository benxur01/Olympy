import json

from rest_framework import serializers

from .models import Question


class QuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Question
        fields = ['id', 'center', 'subject', 'text', 'options', 'correct_answer',
                  'score', 'difficulty', 'image', 'source', 'created_by',
                  'created_at', 'question_type', 'programming_language',
                  'code_template', 'expected_output', 'test_cases']
        read_only_fields = ['id', 'created_by', 'created_at']

    def to_representation(self, instance):
        """`correct_answer` faqat savolni boshqarishga haqli (teacher/manager/
        owner/admin) foydalanuvchilarga chiqadi.

        Bu serializer hozircha faqat staff CRUD endpoint'larida ishlatiladi
        (student test savollarini `session_utils.questions_payload` orqali
        oladi va u correct_answer'ni umuman qaytarmaydi). Ammo serializer
        kelajakda student-facing joyda qayta ishlatilsa to'g'ri javob sizib
        ketmasligi uchun bu yerda ham himoya qo'yamiz: context'da `request`
        bo'lib, foydalanuvchi savolni boshqara olmasa — `correct_answer`
        javobdan olib tashlanadi.
        """
        data = super().to_representation(instance)
        request = (self.context or {}).get('request')
        user = getattr(request, 'user', None) if request else None
        if user is None or not getattr(user, 'is_authenticated', False):
            return data
        if getattr(user, 'is_platform_admin', False):
            return data
        # Savolni boshqarish huquqi — markaz owner/manager/teacher.
        try:
            from centers.models import CenterMembership
            can_manage = (
                instance.center_id
                and CenterMembership.objects.filter(
                    user=user,
                    center_id=instance.center_id,
                    role__in=[
                        CenterMembership.ROLE_OWNER,
                        CenterMembership.ROLE_MANAGER,
                        CenterMembership.ROLE_TEACHER,
                    ],
                    status=CenterMembership.STATUS_APPROVED,
                ).exists()
            )
        except Exception:
            can_manage = False
        if not can_manage:
            data.pop('correct_answer', None)
            # `test_cases` ichida yashirin testlar va kutilgan natijalar bor —
            # staff bo'lmagan foydalanuvchiga ularni butunlay yubormaymiz.
            # (Run-code endpoint test natijalarini DB'dan o'zi hisoblaydi,
            # frontend test case'larni bevosita yuklamaydi.)
            data.pop('test_cases', None)
        return data

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
        # `test_cases` ham multipart'da string sifatida keladi — xuddi
        # `options` kabi shaffof decode qilamiz.
        raw_test_cases = data.get('test_cases') if hasattr(data, 'get') else None
        if isinstance(raw_test_cases, str):
            try:
                parsed_tc = json.loads(raw_test_cases)
            except (TypeError, ValueError):
                parsed_tc = None
            if isinstance(parsed_tc, list):
                data = data.copy() if hasattr(data, 'copy') else dict(data)
                data['test_cases'] = parsed_tc
        return super().to_internal_value(data)

    def validate(self, data):
        # PATCH uchun mavjud instance maydonlari fallback bo'ladi.
        instance = getattr(self, 'instance', None)
        q_type = data.get('question_type')
        if q_type is None:
            q_type = instance.question_type if instance is not None else Question.QUESTION_TYPE_MCQ

        # Kod (IT) savol — variant/correct_answer talab qilinmaydi; o'rniga
        # dasturlash tili majburiy. options bo'sh qoladi va baholash AI orqali
        # (yoki ustoz tomonidan) bajariladi.
        if q_type == Question.QUESTION_TYPE_CODE:
            language = data.get('programming_language')
            if language is None and instance is not None:
                language = instance.programming_language
            if not str(language or '').strip():
                raise serializers.ValidationError(
                    {'programming_language': "Kod savoli uchun dasturlash tili majburiy"}
                )
            # Kod savolda variant bo'lmaydi — har ehtimolga qarshi tozalaymiz,
            # correct_answer 0 qoladi.
            data['options'] = []
            data['correct_answer'] = 0
            return data

        options = data.get('options')
        if options is None and instance is not None:
            options = instance.options
        if not options or len(options) < 2:
            raise serializers.ValidationError({'options': "Kamida 2 ta variant bo'lishi kerak"})
        # Bo'sh string variant'lar test paytida studentga bo'sh tugma
        # ko'rsatadi va correct_answer indeksini noto'g'ri qiladi.
        if any(not str(o).strip() for o in options):
            raise serializers.ValidationError({'options': "Variant bo'sh bo'lmasligi kerak"})

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
