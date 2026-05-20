"""User model with phone-based authentication.

Roles are stored as a list on the user: ``['student', 'teacher', ...]``.
Per-role status (pending / approved / rejected) and the bound center live on
``CenterMembership`` (in the ``centers`` app), not here. Platform Admin is the
exception — that's a system-wide role represented by ``is_platform_admin``.
"""
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone

from .utils import normalize_phone


class UserManager(BaseUserManager):
    """Manager that enforces phone normalization at creation time."""

    def _create_user(self, phone, password, **extra):
        norm = normalize_phone(phone)
        if not norm:
            raise ValueError("Telefon raqam noto'g'ri")
        if self.model.objects.filter(normalized_phone=norm).exists():
            raise ValueError("Bu telefon raqam avval ro'yxatdan o'tgan")
        user = self.model(phone=norm, normalized_phone=norm, **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, phone, password=None, **extra):
        extra.setdefault('is_staff', False)
        extra.setdefault('is_superuser', False)
        return self._create_user(phone, password, **extra)

    def create_superuser(self, phone, password=None, **extra):
        extra.setdefault('is_staff', True)
        extra.setdefault('is_superuser', True)
        extra.setdefault('is_platform_admin', True)
        return self._create_user(phone, password, **extra)


class User(AbstractBaseUser, PermissionsMixin):
    full_name = models.CharField(max_length=120)
    first_name = models.CharField(max_length=60, blank=True)
    last_name = models.CharField(max_length=60, blank=True)
    # Optional unique username for display / mention. Validatsiya
    # serializer'da: 3+ belgi, faqat harf/raqam/_/.
    # NULL ruxsat etiladi (mavjud foydalanuvchilarda bo'sh bo'lishi mumkin) —
    # username majburiy emas. Lekin bo'sh emas bo'lganda unique.
    username = models.CharField(
        max_length=32, unique=True, blank=True, null=True, db_index=True,
    )
    phone = models.CharField(max_length=20, unique=True)
    normalized_phone = models.CharField(max_length=20, unique=True, db_index=True)
    # JSON list of role keys: student | teacher | manager | owner | admin
    roles = models.JSONField(default=list, blank=True)
    is_platform_admin = models.BooleanField(default=False)
    telegram_chat_id = models.CharField(max_length=64, blank=True, db_index=True)
    telegram_user_id = models.CharField(max_length=64, blank=True, db_index=True)
    telegram_linked_at = models.DateTimeField(null=True, blank=True)
    token_version = models.PositiveIntegerField(default=0)
    avatar = models.ImageField(upload_to='avatars/', blank=True, null=True)

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = UserManager()

    USERNAME_FIELD = 'normalized_phone'
    REQUIRED_FIELDS = ['full_name']

    class Meta:
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        # Always keep normalized_phone in sync with phone.
        norm = normalize_phone(self.phone)
        if not norm:
            raise ValueError("Telefon raqam noto'g'ri")
        self.phone = norm
        self.normalized_phone = norm
        # first_name/last_name dan full_name'ni avtomatik to'ldiramiz, agar
        # ikkalasidan biri kelgan bo'lsa va full_name bo'sh / eski qiymat
        # bilan kelmagan bo'lsa. Bu profil tahririda full_name'ni qo'lda
        # yangilab o'tirishni yo'qotadi.
        if (self.first_name or self.last_name):
            combined = f"{(self.first_name or '').strip()} {(self.last_name or '').strip()}".strip()
            if combined:
                self.full_name = combined
        # Bo'sh string username'larni NULL ga aylantiramiz (unique constraint
        # bo'sh string'larni o'ziga xos deb hisoblaydi va to'qnashuv beradi).
        if self.username is not None and not str(self.username).strip():
            self.username = None
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.full_name} ({self.normalized_phone})'

    def has_role(self, role):
        return role in (self.roles or [])

    def add_role(self, role):
        if role not in (self.roles or []):
            self.roles = list(self.roles or []) + [role]
            self.save(update_fields=['roles'])

    def remove_role(self, role):
        current = list(self.roles or [])
        if role in current:
            current.remove(role)
            self.roles = current
            self.save(update_fields=['roles'])


class PhoneVerification(models.Model):
    """Telegram-backed phone verification session.

    OTP values are never stored directly; only Django password hashes are kept.
    ``telegram_chat_id`` is populated only after Telegram sends /start with the
    session verify token.
    """
    PURPOSE_REGISTRATION = 'registration'
    PURPOSE_ACCOUNT_LINK = 'account_link'
    PURPOSE_PASSWORD_RESET = 'password_reset'
    PURPOSE_CHOICES = [
        (PURPOSE_REGISTRATION, 'Registration'),
        (PURPOSE_ACCOUNT_LINK, 'Account link'),
        (PURPOSE_PASSWORD_RESET, 'Password reset'),
    ]

    normalized_phone = models.CharField(max_length=20, db_index=True)
    purpose = models.CharField(
        max_length=32,
        choices=PURPOSE_CHOICES,
        default=PURPOSE_REGISTRATION,
        db_index=True,
    )
    verify_token = models.CharField(max_length=96, unique=True, db_index=True)
    telegram_chat_id = models.CharField(max_length=64, blank=True)
    telegram_user_id = models.CharField(max_length=64, blank=True)
    otp_hash = models.CharField(max_length=256, blank=True)
    otp_expires_at = models.DateTimeField(null=True, blank=True)
    attempts_count = models.PositiveIntegerField(default=0)
    max_attempts = models.PositiveIntegerField(default=5)
    verified_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['normalized_phone', 'created_at']),
        ]

    @property
    def is_verified(self):
        return self.verified_at is not None

    @property
    def otp_is_expired(self):
        return bool(self.otp_expires_at and self.otp_expires_at <= timezone.now())
