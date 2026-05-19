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
    # Cheating sababli diskvalifikatsiya qilingan attempt'lar. Avval cheating
    # bo'lganda attempt umuman yaratilmasdi va student na leaderboard'da,
    # na manager statistikasida ko'rinmasdi. Endi disqualified=True bilan
    # attempt yaratiladi va manager paneli "diskvalifitsiya bo'lgan" deb
    # ko'rsata oladi.
    disqualified = models.BooleanField(default=False)
    submitted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-submitted_at']
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'olympiad'],
                name='unique_user_olympiad',
            ),
        ]
        # Performance indekslari:
        # - leaderboard `order_by('-score', 'time_spent')` per-olympiad —
        #   olympiad+score+time_spent compound indeksi tezroq ishlaydi
        # - `my_results` user bo'yicha so'nggi attempts ro'yxati
        indexes = [
            models.Index(
                fields=['olympiad', '-score', 'time_spent'],
                name='attempt_leaderboard_idx',
            ),
            models.Index(
                fields=['user', '-submitted_at'],
                name='attempt_user_recent_idx',
            ),
        ]

    def __str__(self):
        return f'{self.user_id}@{self.olympiad_id} = {self.score}'


class TestSession(models.Model):
    """Server-side test start record and randomized question/option order."""
    STATUS_ACTIVE = 'active'
    STATUS_DISQUALIFIED = 'disqualified'
    STATUS_COMPLETED = 'completed'
    STATUS_CHOICES = [
        (STATUS_ACTIVE, 'Active'),
        (STATUS_DISQUALIFIED, 'Disqualified'),
        (STATUS_COMPLETED, 'Completed'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='test_sessions',
    )
    olympiad = models.ForeignKey(
        Olympiad,
        on_delete=models.CASCADE,
        related_name='test_sessions',
    )
    started_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_ACTIVE)
    disqualified_at = models.DateTimeField(null=True, blank=True)
    cheating_reason = models.CharField(max_length=120, blank=True)
    question_order = models.JSONField(default=list, blank=True)
    option_orders = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['-started_at']
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'olympiad'],
                name='unique_user_olympiad_session',
            ),
        ]

    def __str__(self):
        return f'session:{self.user_id}@{self.olympiad_id}'
