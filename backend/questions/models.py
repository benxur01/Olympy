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

    def __str__(self):
        return self.text[:60]
