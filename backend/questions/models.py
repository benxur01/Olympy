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
    SOURCE_CHOICES = [
        (SOURCE_MANUAL, "Qo'lda"),
        (SOURCE_AI, 'AI'),
        (SOURCE_PDF, 'PDF'),
    ]

    # Savol turi: oddiy test (MCQ/True-False) yoki IT dasturlash savoli (code).
    # Eski savollarda maydon yo'q edi — default `mcq`, shu sababli mavjud test
    # tizimi o'zgarmasdan ishlashda davom etadi. `code` turidagi savol uchun
    # quyidagi programming_language/code_template/expected_output ishlatiladi
    # va A/B/C/D variantlar o'rniga o'quvchi kod yozadi.
    QUESTION_TYPE_MCQ = 'mcq'
    QUESTION_TYPE_CODE = 'code'
    QUESTION_TYPE_CHOICES = [
        (QUESTION_TYPE_MCQ, 'Test (variantli)'),
        (QUESTION_TYPE_CODE, 'Kod (dasturlash)'),
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
    score = models.PositiveIntegerField(default=3)
    question_type = models.CharField(
        max_length=10,
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

    def __str__(self):
        return self.text[:60]
