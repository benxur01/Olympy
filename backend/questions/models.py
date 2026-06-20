from django.conf import settings
from django.db import models

from centers.models import EducationCenter


class Question(models.Model):
    """A single question belonging to a center.

    ``options`` is a JSON list of strings; ``correct_answer`` is the index of
    the correct option. ``source`` distinguishes manual entry, AI-generated,
    and PDF-extracted questions.
    """
    SOURCE_MANUAL = 'manual'
    SOURCE_AI = 'ai'
    SOURCE_PDF = 'pdf'
    SOURCE_IMPORT = 'import'
    SOURCE_CHOICES = [
        (SOURCE_MANUAL, "Qo'lda"),
        (SOURCE_AI, 'AI'),
        (SOURCE_PDF, 'PDF'),
        (SOURCE_IMPORT, 'Import (Excel/CSV)'),
    ]

    # Savol turi: oddiy test (MCQ/True-False) yoki IT dasturlash savoli (code).
    # Eski savollarda maydon yo'q edi — default `mcq`, shu sababli mavjud test
    # tizimi o'zgarmasdan ishlashda davom etadi. `code` turidagi savol uchun
    # quyidagi programming_language/code_template/expected_output ishlatiladi
    # va A/B/C/D variantlar o'rniga o'quvchi kod yozadi.
    QUESTION_TYPE_MCQ = 'mcq'
    QUESTION_TYPE_CODE = 'code'
    # Yangi savol turlari. `mcq` (Multiple Choice / True-False / Short Answer
    # vizual rejimlari) va `code` o'zgarmadi. Quyidagilar correct_answer
    # integer indeksiga sig'maydigan turlar — ular `correct_text` (matn/JSON)
    # maydonidan foydalanadi yoki umuman avtomatik baholanmaydi (essay).
    QUESTION_TYPE_MULTIPLE_SELECT = 'multiple_select'
    QUESTION_TYPE_YES_NO = 'yes_no'
    QUESTION_TYPE_ESSAY = 'essay'
    QUESTION_TYPE_FILL_BLANK = 'fill_blank'
    QUESTION_TYPE_FILL_BLANKS = 'fill_blanks'
    QUESTION_TYPE_CHOICES = [
        (QUESTION_TYPE_MCQ, 'Test (variantli)'),
        (QUESTION_TYPE_CODE, 'Kod (dasturlash)'),
        (QUESTION_TYPE_MULTIPLE_SELECT, 'Multiple Select'),
        (QUESTION_TYPE_YES_NO, "Ha / Yo'q"),
        (QUESTION_TYPE_ESSAY, 'Essay (Katta matn)'),
        (QUESTION_TYPE_FILL_BLANK, "Bo'sh joy to'ldirish"),
        (QUESTION_TYPE_FILL_BLANKS, "Ko'p bo'sh joy to'ldirish"),
    ]

    DIFFICULTY_EASY = 'easy'
    DIFFICULTY_MEDIUM = 'medium'
    DIFFICULTY_HARD = 'hard'

    # CEFR Levels for English
    DIFFICULTY_BEGINNER = 'beginner'
    DIFFICULTY_ELEMENTARY = 'elementary'
    DIFFICULTY_PRE_INTERMEDIATE = 'pre-int'
    DIFFICULTY_INTERMEDIATE = 'int'
    DIFFICULTY_UPPER_INTERMEDIATE = 'upper-int'
    DIFFICULTY_ADVANCED = 'advanced'

    DIFFICULTY_CHOICES = [
        (DIFFICULTY_EASY, 'Oson'),
        (DIFFICULTY_MEDIUM, "O'rta"),
        (DIFFICULTY_HARD, 'Qiyin'),
        (DIFFICULTY_BEGINNER, 'Beginner'),
        (DIFFICULTY_ELEMENTARY, 'Elementary'),
        (DIFFICULTY_PRE_INTERMEDIATE, 'Pre-Intermediate'),
        (DIFFICULTY_INTERMEDIATE, 'Intermediate'),
        (DIFFICULTY_UPPER_INTERMEDIATE, 'Upper-Intermediate'),
        (DIFFICULTY_ADVANCED, 'Advanced'),
    ]

    center = models.ForeignKey(
        EducationCenter,
        on_delete=models.CASCADE,
        related_name='questions',
    )
    subject = models.CharField(max_length=80)
    text = models.TextField()
    options = models.JSONField(default=list)
    correct_answer = models.PositiveIntegerField(default=0)
    # Integer indeksiga sig'maydigan to'g'ri javoblar uchun matn/JSON maydoni.
    #   fill_blank   → bitta matnli javob (string)
    #   fill_blanks  → JSON, masalan {"1": "javob1", "2": "javob2"}
    #   multiple_select → JSON ro'yxat, to'g'ri option indekslari (masalan [0, 2])
    # mcq/code/yes_no/essay bu maydonni ishlatmaydi (bo'sh qoladi).
    correct_text = models.TextField(
        blank=True, default='',
        help_text="fill_blank/fill_blanks/multiple_select to'g'ri javobi (matn yoki JSON)",
    )
    score = models.PositiveIntegerField(default=3)
    question_type = models.CharField(
        max_length=20,
        choices=QUESTION_TYPE_CHOICES,
        default=QUESTION_TYPE_MCQ,
        db_index=True,
    )
    # Faqat question_type == 'code' bo'lganda ishlatiladigan maydonlar.
    programming_language = models.CharField(
        max_length=30, blank=True, default='',
        help_text="python, javascript, java, cpp, c va h.k.",
    )
    code_template = models.TextField(
        blank=True, default='',
        help_text="O'quvchiga beriluvchi boshlang'ich kod skelet",
    )
    expected_output = models.TextField(
        blank=True, default='',
        help_text="Kutilgan natija (ustoz/menejer tekshirishi uchun)",
    )
    # Judge0 kod runner (2-bosqich) uchun test case'lar. Har element:
    # {"input": "5", "expected_output": "25", "is_hidden": false}. `input`
    # stdin sifatida, `expected_output` esa stdout bilan solishtiriladi.
    # `is_hidden=True` bo'lsa o'quvchiga input/expected ko'rsatilmaydi (faqat
    # o'tdi/o'tmadi). Faqat question_type == 'code' uchun ishlatiladi.
    test_cases = models.JSONField(
        default=list, blank=True,
        help_text='[{"input": "5", "expected_output": "25", "is_hidden": false}]',
    )
    difficulty = models.CharField(
        max_length=10, choices=DIFFICULTY_CHOICES, default=DIFFICULTY_MEDIUM,
    )
    image = models.ImageField(upload_to='questions/', null=True, blank=True)
    source = models.CharField(
        max_length=10, choices=SOURCE_CHOICES, default=SOURCE_MANUAL,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='created_questions',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    explanation = models.TextField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            # Markazning ma'lum fan bo'yicha savollarini filtrlash — savol
            # banki va olimpiada uchun savol tanlash so'rovlarida.
            models.Index(fields=['center', 'subject']),
        ]

    def save(self, *args, **kwargs):
        # `subject` erkin matn — registr (katta/kichik harf) bo'yicha tartibsiz
        # qiymatlar dublikat fanlar va filtr nomuvofiqligiga olib keladi.
        # Saqlashdan oldin normalize qilamiz: bo'sh joylarni olib, birinchi
        # harfni bosh harfga keltiramiz. pdf_generation.py subject'ni .lower()
        # bilan tekshirgani uchun bu normalizatsiya u bilan to'la mos keladi.
        if self.subject:
            self.subject = self.subject.strip().capitalize()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.text[:60]
