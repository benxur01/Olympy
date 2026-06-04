import json

from rest_framework import serializers

from .models import Question


class QuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Question
        fields = ['id', 'center', 'subject', 'text', 'options', 'correct_answer',
                  'correct_text', 'score', 'difficulty', 'image', 'source',
                  'created_by', 'created_at', 'question_type',
                  'programming_language', 'code_template', 'expected_output',
                  'test_cases']
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
            # `correct_text` ham to'g'ri javobni saqlaydi (fill_blank/fill_blanks/
            # multiple_select) — staff bo'lmaganlarga yubormaymiz.
            data.pop('correct_text', None)
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

        # ─── Essay ─────────────────────────────────────────────────────────
        # Katta matn javob — variant ham, to'g'ri javob ham talab qilinmaydi.
        # Menejer keyinchalik qo'lda ball beradi. Faqat score tekshiriladi.
        if q_type == Question.QUESTION_TYPE_ESSAY:
            data['options'] = []
            data['correct_answer'] = 0
            data['correct_text'] = ''
            return self._validate_score(data, instance)

        # ─── Ha / Yo'q ─────────────────────────────────────────────────────
        # True/False ga o'xshash, lekin variantlar "Ha"/"Yo'q". Variantlar
        # avtomatik o'rnatiladi; correct_answer 0 (Ha) yoki 1 (Yo'q).
        if q_type == Question.QUESTION_TYPE_YES_NO:
            correct = data.get('correct_answer')
            if correct is None and instance is not None:
                correct = instance.correct_answer
            try:
                correct = int(correct)
            except (TypeError, ValueError):
                correct = 0
            if correct not in (0, 1):
                raise serializers.ValidationError(
                    {'correct_answer': "Ha/Yo'q savolida to'g'ri javob 0 (Ha) yoki 1 (Yo'q) bo'lishi kerak"}
                )
            data['options'] = ['Ha', "Yo'q"]
            data['correct_answer'] = correct
            data['correct_text'] = ''
            return self._validate_score(data, instance)

        # ─── Bitta bo'sh joy to'ldirish ────────────────────────────────────
        # Bitta matnli to'g'ri javob `correct_text` da saqlanadi.
        if q_type == Question.QUESTION_TYPE_FILL_BLANK:
            answer = data.get('correct_text')
            if answer is None and instance is not None:
                answer = instance.correct_text
            if not str(answer or '').strip():
                raise serializers.ValidationError(
                    {'correct_text': "Bo'sh joy to'ldirish savoli uchun to'g'ri javob majburiy"}
                )
            data['options'] = []
            data['correct_answer'] = 0
            data['correct_text'] = str(answer).strip()
            return self._validate_score(data, instance)

        # ─── Ko'p bo'sh joy to'ldirish ─────────────────────────────────────
        # `correct_text` JSON format: {"1": "javob1", "2": "javob2"}. Kamida
        # bitta bo'sh joy javobi bo'lishi shart.
        if q_type == Question.QUESTION_TYPE_FILL_BLANKS:
            answer = data.get('correct_text')
            if answer is None and instance is not None:
                answer = instance.correct_text
            parsed = answer
            if isinstance(parsed, str):
                try:
                    parsed = json.loads(parsed)
                except (TypeError, ValueError):
                    raise serializers.ValidationError(
                        {'correct_text': "Javoblar JSON format bo'lishi kerak: {\"1\": \"javob\"}"}
                    )
            if not isinstance(parsed, dict) or not parsed:
                raise serializers.ValidationError(
                    {'correct_text': "Kamida bitta bo'sh joy uchun javob kiriting"}
                )
            if any(not str(v).strip() for v in parsed.values()):
                raise serializers.ValidationError(
                    {'correct_text': "Bo'sh joy javobi bo'sh bo'lmasligi kerak"}
                )
            data['options'] = []
            data['correct_answer'] = 0
            data['correct_text'] = json.dumps(parsed, ensure_ascii=False)
            return self._validate_score(data, instance)

        # ─── Multiple Select (bir nechta to'g'ri javob) ────────────────────
        # Variantlar string ro'yxat; to'g'ri javob indekslari `correct_text`
        # da JSON ro'yxat sifatida saqlanadi (masalan [0, 2]). Kamida 2 ta
        # variant va kamida 1 ta to'g'ri javob bo'lishi shart.
        if q_type == Question.QUESTION_TYPE_MULTIPLE_SELECT:
            options = data.get('options')
            if options is None and instance is not None:
                options = instance.options
            if not options or len(options) < 2:
                raise serializers.ValidationError({'options': "Kamida 2 ta variant bo'lishi kerak"})
            if any(not str(o).strip() for o in options):
                raise serializers.ValidationError({'options': "Variant bo'sh bo'lmasligi kerak"})

            raw = data.get('correct_text')
            if raw is None and instance is not None:
                raw = instance.correct_text
            correct_indexes = raw
            if isinstance(correct_indexes, str):
                try:
                    correct_indexes = json.loads(correct_indexes)
                except (TypeError, ValueError):
                    correct_indexes = None
            if not isinstance(correct_indexes, list) or not correct_indexes:
                raise serializers.ValidationError(
                    {'correct_text': "Kamida bitta to'g'ri javobni belgilang"}
                )
            try:
                correct_indexes = sorted({int(i) for i in correct_indexes})
            except (TypeError, ValueError):
                raise serializers.ValidationError(
                    {'correct_text': "To'g'ri javob indekslari noto'g'ri"}
                )
            if any(not (0 <= i < len(options)) for i in correct_indexes):
                raise serializers.ValidationError(
                    {'correct_text': "To'g'ri javob indeksi variantlar sonidan tashqarida"}
                )
            data['options'] = options
            data['correct_answer'] = correct_indexes[0]
            data['correct_text'] = json.dumps(correct_indexes)
            return self._validate_score(data, instance)

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

        # MCQ to'g'ri javobi correct_answer indeksida — correct_text ishlatilmaydi.
        data['correct_text'] = ''
        return self._validate_score(data, instance)

    def _validate_score(self, data, instance):
        """Ball (score) 1..100 oralig'ida ekanini tekshiradi. Yangi savol
        turlari va MCQ uchun umumiy — takrorlanmasin deb ajratildi."""
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
