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
    # Cheating aniqlanib, menejer/owner tomonidan tekshiruv KUTILAYOTGAN holat
    # (human-in-the-loop). Yakuniy `cheating_detected` esa qaror disqualify
    # bo'lganda yuboriladi.
    TYPE_PENDING_CHEATING_REVIEW = 'pending_cheating_review'
    # Foydalanuvchi markazdan chiqarib yuborilganda yuboriladi. Avval bu
    # holatda hech qanday xabar yuborilmas edi va foydalanuvchi nima
    # bo'lganini bilmasdan qolib ketardi.
    TYPE_MEMBERSHIP_REMOVED = 'membership_removed'
    # Markaz o'quvchi joy limitiga yetganda owner'ga proaktiv xabar. Avval
    # owner buni faqat manager approve tugmasini bosib xato toast'ini o'qigan
    # holatdagina bilardi. `type` — choices'siz CharField, migratsiya shart emas.
    TYPE_STUDENT_LIMIT_REACHED = 'student_limit_reached'
    # Platforma admini yuboradigan rasmiy ogohlantirish — bloklashdan OLDINGI
    # qadam. Hisob holatiga tegmaydi, faqat foydalanuvchini xabardor qiladi.
    TYPE_ACCOUNT_WARNING = 'account_warning'
    # Platforma admini yuboradigan ommaviy xabarnoma (broadcast).
    TYPE_ADMIN_BROADCAST = 'admin_broadcast'

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
        # `my_notifications` har gal user bo'yicha filter va `-created_at`
        # bo'yicha ordered slicing ishlatadi. Compound indeks qo'shamiz —
        # 100K+ notification bilan sequential scan'dan saqlaydi.
        indexes = [
            models.Index(
                fields=['user', '-created_at'],
                name='notification_user_recent_idx',
            ),
        ]

    def __str__(self):
        return f'{self.user_id}/{self.type}'


class PushSubscription(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='web_push_subscriptions',
    )
    endpoint = models.TextField(unique=True)
    p256dh = models.CharField(max_length=255)
    auth = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Sub for {self.user.phone} ({self.user_id})"


class BroadcastCampaign(models.Model):
    """Admin ommaviy xabarnomalar va marketing kampaniyalari."""
    TARGET_ALL = 'all'
    TARGET_PRO = 'pro_users'
    TARGET_INACTIVE = 'inactive_7d'
    TARGET_STUDENTS = 'students'
    TARGET_TEACHERS = 'teachers'
    TARGET_CENTER_OWNERS = 'center_owners'
    TARGET_CHOICES = [
        (TARGET_ALL, 'Barcha foydalanuvchilar'),
        (TARGET_PRO, 'Faqat PRO (Obunachi) foydalanuvchilar'),
        (TARGET_INACTIVE, 'Oxirgi 7 kunda kirmaganlar'),
        (TARGET_STUDENTS, 'Faqat O‘quvchilar'),
        (TARGET_TEACHERS, 'Faqat O‘qituvchilar'),
        (TARGET_CENTER_OWNERS, 'Faqat Markaz egalari'),
    ]

    STATUS_DRAFT = 'draft'
    STATUS_SENT = 'sent'
    STATUS_FAILED = 'failed'
    STATUS_CHOICES = [
        (STATUS_DRAFT, 'Qoralama'),
        (STATUS_SENT, 'Yuborildi'),
        (STATUS_FAILED, 'Xatolik'),
    ]

    title = models.CharField(max_length=200)
    message = models.TextField()
    target_audience = models.CharField(max_length=30, choices=TARGET_CHOICES, default=TARGET_ALL)
    send_telegram = models.BooleanField(default=True, help_text="Telegram ulaganlarga bot orqali yuborish")
    send_in_app = models.BooleanField(default=True, help_text="Platforma ichida qo'ng'iroqcha xabarnomasi")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    sent_count = models.PositiveIntegerField(default=0)
    telegram_sent_count = models.PositiveIntegerField(default=0)
    sent_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='created_broadcasts',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Broadcast: {self.title} ({self.status})"


