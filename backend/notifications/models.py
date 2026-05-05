from django.conf import settings
from django.db import models

from centers.models import EducationCenter


class Notification(models.Model):
    """Per-user notification (mirrors the in-app + Telegram-style mock).

    Stored centrally so the same record can be rendered in the bell dropdown
    *and* later pushed via the Telegram bot service.
    """
    TYPE_STUDENT_JOIN_REQUEST = 'student_join_request'
    # Owner ga yuboriladigan o'qituvchi/manager ariza xabarnomalari. Avval
    # bu turlar yo'q edi va owner faqat panel polling orqali pending
    # arizalarni ko'rar edi; endi push xabarlar (in-app + Telegram) ham
    # yuboriladi.
    TYPE_TEACHER_JOIN_REQUEST = 'teacher_join_request'
    TYPE_MANAGER_JOIN_REQUEST = 'manager_join_request'
    TYPE_STUDENT_APPROVED = 'student_approved'
    TYPE_STUDENT_REJECTED = 'student_rejected'
    TYPE_TEACHER_APPROVED = 'teacher_approved'
    TYPE_TEACHER_REJECTED = 'teacher_rejected'
    TYPE_MANAGER_APPROVED = 'manager_approved'
    TYPE_MANAGER_REJECTED = 'manager_rejected'
    TYPE_CENTER_PENDING = 'center_pending'
    TYPE_CENTER_APPROVED = 'center_approved'
    TYPE_CENTER_REJECTED = 'center_rejected'
    TYPE_OLYMPIAD_PUBLISHED = 'olympiad_published'
    TYPE_AI_ROSTER_APPROVAL = 'ai_roster_approval'
    TYPE_CHEATING_DETECTED = 'cheating_detected'

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notifications',
    )
    center = models.ForeignKey(
        EducationCenter,
        on_delete=models.CASCADE,
        null=True, blank=True,
        related_name='notifications',
    )
    type = models.CharField(max_length=40)
    title = models.CharField(max_length=160)
    message = models.TextField()
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.user_id}/{self.type}'
