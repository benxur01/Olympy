from django.conf import settings
from django.db import models

from olympiads.models import Olympiad


class TestAttempt(models.Model):
    """One submission of an olympiad by a student.

    Score is stored as the final weighted percentage (0..100). ``answers`` is
    a JSON map of {question_id: chosen_option_index}. ``rank`` is calculated
    at submission time and may be re-computed by background jobs.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='attempts',
    )
    olympiad = models.ForeignKey(
        Olympiad,
        on_delete=models.CASCADE,
        related_name='attempts',
    )
    answers = models.JSONField(default=dict, blank=True)
    score = models.PositiveIntegerField(default=0)
    correct_count = models.PositiveIntegerField(default=0)
    wrong_count = models.PositiveIntegerField(default=0)
    total_questions = models.PositiveIntegerField(default=0)
    time_spent = models.PositiveIntegerField(default=0)  # seconds
    rank = models.PositiveIntegerField(null=True, blank=True)
    submitted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-submitted_at']
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'olympiad'],
                name='unique_user_olympiad',
            ),
        ]

    def __str__(self):
        return f'{self.user_id}@{self.olympiad_id} = {self.score}'
