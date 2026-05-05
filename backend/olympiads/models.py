from django.conf import settings
from django.db import models

from centers.models import EducationCenter


class Olympiad(models.Model):
    """A scheduled test event created by a single education center.

    ``event_type`` controls participation:
    - olympiad: public platform-wide event, any authenticated user may enter.
    - competition: internal center event, only approved students of the same
      center may enter.

    Status flow: draft → active → inactive → active → finished.
    Draft/inactive events are editable; active events must be deactivated
    before changing schedule, metadata or questions.
    """
    EVENT_TYPE_OLYMPIAD = 'olympiad'
    EVENT_TYPE_COMPETITION = 'competition'
    EVENT_TYPE_CHOICES = [
        (EVENT_TYPE_OLYMPIAD, 'Olimpiada'),
        (EVENT_TYPE_COMPETITION, 'Musobaqa'),
    ]

    STATUS_DRAFT = 'draft'
    STATUS_INACTIVE = 'inactive'
    STATUS_ACTIVE = 'active'
    STATUS_FINISHED = 'finished'
    STATUS_CHOICES = [
        (STATUS_DRAFT, 'Draft'),
        (STATUS_INACTIVE, 'Nofaol'),
        (STATUS_ACTIVE, 'Faol'),
        (STATUS_FINISHED, 'Tugagan'),
    ]

    center = models.ForeignKey(
        EducationCenter,
        on_delete=models.CASCADE,
        related_name='olympiads',
    )
    event_type = models.CharField(
        max_length=20,
        choices=EVENT_TYPE_CHOICES,
        default=EVENT_TYPE_COMPETITION,
        db_index=True,
    )
    title = models.CharField(max_length=200)
    subject = models.CharField(max_length=80)
    test_level = models.CharField(max_length=80, blank=True, default='')
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
