"""Moderatsiya bayroqlari — admin paneldagi "tekshirish navbati".

Model ATAYLAB generic: bayroqning turi (`flag_type`) va nishoni
(`target_type` + `target_id`) oddiy matn/son maydonlarida saqlanadi, turga
xos qolgan hamma narsa esa `extra` (JSON) ichida. Shu sababli yangi bayroq
turi qo'shish uchun JADVAL sxemasi o'zgarmaydi — faqat `FLAG_TYPE_CHOICES`
ga bitta qator qo'shiladi (Django buning uchun no-op `AlterField`
migratsiyasi yozadi, ustun/indeks tegilmaydi).

Birinchi manba — soatlik `moderation.tasks.detect_suspicious_activity`
(bir xil IP ortidagi ko'p hisob); keyingisi savol moderatsiyasi bo'ladi va
u xuddi shu jadvalga yozadi.

`AuditLog` bilan aralashtirmaslik kerak: audit jurnali "kim nima QILDI" ni
yozadi (o'tgan zamon, faqat o'qish uchun), bu jadval esa "nimani tekshirish
KERAK" ni — yozuvning o'z holati bor va admin uni yopadi.
"""
from django.conf import settings
from django.db import models


class ModerationFlag(models.Model):
    """Tekshirilishi kerak bo'lgan bitta hodisa (avtomatik yoki qo'lda)."""

    FLAG_TYPE_QUESTION = 'question'
    FLAG_TYPE_SUSPICIOUS_IP = 'suspicious_ip'
    FLAG_TYPE_CHOICES = [
        (FLAG_TYPE_QUESTION, 'Savol'),
        (FLAG_TYPE_SUSPICIOUS_IP, 'Shubhali IP'),
    ]

    STATUS_PENDING = 'pending'
    STATUS_RESOLVED = 'resolved'
    STATUS_DISMISSED = 'dismissed'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Kutilmoqda'),
        (STATUS_RESOLVED, 'Hal qilindi'),
        (STATUS_DISMISSED, 'Rad etildi'),
    ]

    flag_type = models.CharField(max_length=20, choices=FLAG_TYPE_CHOICES, db_index=True)
    # Nishon generic (`AuditLog.target_type`/`target_id` bilan bir xil naqsh):
    # `ForeignKey` qo'yib bo'lmaydi, chunki bir bayroq savolga, boshqasi esa
    # umuman model bo'lmagan narsaga (IP manzil) ishora qiladi. Shu sababli
    # IP kabi nishonlarda `target_id` NULL bo'ladi va aniq qiymat `extra` da.
    target_type = models.CharField(max_length=50, blank=True, default='')
    target_id = models.IntegerField(null=True, blank=True)
    reason = models.CharField(max_length=255)
    # Avtomatik detektor yaratgan bayroqda NULL — "Tizim" degani (audit
    # jurnalidagi `AuditLog.actor` bilan bir xil qoida).
    raised_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='raised_moderation_flags',
    )
    status = models.CharField(
        max_length=10, choices=STATUS_CHOICES, default=STATUS_PENDING, db_index=True,
    )
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='resolved_moderation_flags',
    )
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolution_note = models.CharField(max_length=255, blank=True, default='')
    extra = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        # Navbat HAR DOIM "tur + holat" bo'yicha filtrlanib, yangisidan
        # boshlab ko'rsatiladi (`admin_moderation_queue`) — compound indeks
        # aynan shu so'rov uchun.
        indexes = [
            models.Index(fields=['flag_type', 'status', '-created_at']),
        ]

    def __str__(self):
        return f'flag:{self.flag_type}/{self.status} #{self.pk}'
