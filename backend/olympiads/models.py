from django.conf import settings
from django.db import models

from centers.models import EducationCenter


class Olympiad(models.Model):
    """A scheduled olympiad belonging to a single education center.

    Status flow: draft → active (published) → finished. Only approved students
    of the same center may participate; this is enforced in the attempts app.
    """
    STATUS_DRAFT = 'draft'
    STATUS_ACTIVE = 'active'
    STATUS_FINISHED = 'finished'
    STATUS_CHOICES = [
        (STATUS_DRAFT, 'Draft'),
        (STATUS_ACTIVE, 'Faol'),
        (STATUS_FINISHED, 'Tugagan'),
    ]

    center = models.ForeignKey(
        EducationCenter,
        on_delete=models.CASCADE,
        related_name='olympiads',
    )
    title = models.CharField(max_length=200)
    subject = models.CharField(max_length=80)
    start_datetime = models.DateTimeField(null=True, blank=True)
    duration_minutes = models.PositiveIntegerField(default=60)
    max_score = models.PositiveIntegerField(default=100)
    questions = models.ManyToManyField(
        'questions.Question',
        related_name='olympiads',
        blank=True,
    )
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='created_olympiads',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.title} ({self.center.name})'
