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

    TEST_TYPE_UNSET = ''
    TEST_TYPE_MULTIPLE_CHOICE = 'multiple_choice'
    TEST_TYPE_TRUE_FALSE = 'true_false'
    TEST_TYPE_SHORT_ANSWER = 'short_answer'
    TEST_TYPE_MIXED = 'mixed'
    # IT olimpiadalar uchun — faqat dasturlash (kod) savollari biriktiriladi.
    TEST_TYPE_CODE_ONLY = 'code_only'
    TEST_TYPE_CHOICES = [
        (TEST_TYPE_UNSET, 'Belgilanmagan'),
        (TEST_TYPE_MULTIPLE_CHOICE, 'Multiple choice'),
        (TEST_TYPE_TRUE_FALSE, 'True/False'),
        (TEST_TYPE_SHORT_ANSWER, 'Qisqa javob'),
        (TEST_TYPE_MIXED, 'Aralash'),
        (TEST_TYPE_CODE_ONLY, 'Faqat kod (dasturlash)'),
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

    # IT olimpiadasi kategoriyasi — bo'sh bo'lsa oddiy (variantli) olimpiada.
    IT_CATEGORY_UNSET = ''
    IT_CATEGORY_FRONTEND = 'frontend'
    IT_CATEGORY_BACKEND = 'backend'
    IT_CATEGORY_FULLSTACK = 'fullstack'
    IT_CATEGORY_GENERAL = 'general'
    IT_CATEGORY_CHOICES = [
        (IT_CATEGORY_UNSET, 'Belgilanmagan'),
        (IT_CATEGORY_FRONTEND, 'Frontend'),
        (IT_CATEGORY_BACKEND, 'Backend'),
        (IT_CATEGORY_FULLSTACK, 'Full Stack'),
        (IT_CATEGORY_GENERAL, 'Umumiy'),
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
    test_type = models.CharField(
        max_length=20,
        choices=TEST_TYPE_CHOICES,
        blank=True,
        default=TEST_TYPE_UNSET,
    )
    start_datetime = models.DateTimeField(null=True, blank=True)
    duration_minutes = models.PositiveIntegerField(default=60)
    max_score = models.PositiveIntegerField(default=100)
    questions = models.ManyToManyField(
        'questions.Question',
        related_name='olympiads',
        blank=True,
    )
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    # Guruh olimpiadasi filtri — to'ldirilgan bo'lsa, faqat shu markazda
    # mos `CenterMembership.group_tag` ga ega o'quvchilar qatnasha oladi.
    group_filter = models.CharField(max_length=50, blank=True, default='')
    # IT (dasturlash) olimpiadasi sozlamalari. allowed_languages bo'sh bo'lsa
    # barcha til ruxsat etiladi; aks holda faqat ro'yxatdagi tillardan biriga
    # kod yuborish mumkin (backend submit'da tekshiriladi). it_category — UI'da
    # olimpiadani toifalash uchun (Frontend/Backend/Full Stack/Umumiy).
    allowed_languages = models.JSONField(
        default=list, blank=True,
        help_text="['python', 'javascript'] — bo'sh bo'lsa barcha til ruxsat",
    )
    it_category = models.CharField(
        max_length=30, blank=True, default='',
        choices=IT_CATEGORY_CHOICES,
    )
    is_deleted = models.BooleanField(default=False, db_index=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='created_olympiads',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            # Markaz bo'yicha aktiv (o'chirilmagan) olimpiadalarni status
            # bilan filtrlash — center dashboard va ro'yxat so'rovlarida.
            models.Index(fields=['center', 'is_deleted', 'status']),
            # Global status + is_deleted filter (masalan, aktiv published
            # olimpiadalar ro'yxati).
            models.Index(fields=['status', 'is_deleted']),
        ]

    def save(self, *args, **kwargs):
        # `subject` erkin matn — Question modeli bilan bir xil normalizatsiya:
        # registr nomuvofiqligi va dublikat fanlarni oldini olamiz.
        if self.subject:
            self.subject = self.subject.strip().capitalize()
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.title} ({self.center.name})'
