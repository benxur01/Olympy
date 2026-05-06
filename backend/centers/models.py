from django.conf import settings
from django.db import models


class EducationCenter(models.Model):
    """Organization owned by a single user.

    Newly registered organizations start as ``pending`` and are activated only
    after a Platform Admin approves them. Owners cannot manage staff until then.
    """
    STATUS_PENDING = 'pending'
    STATUS_APPROVED = 'approved'
    STATUS_REJECTED = 'rejected'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Kutilmoqda'),
        (STATUS_APPROVED, 'Tasdiqlandi'),
        (STATUS_REJECTED, 'Rad etildi'),
    ]

    name = models.CharField(max_length=160)
    organization_type = models.CharField(
        max_length=80,
        default="O'quv markaz",
        db_index=True,
    )
    country = models.CharField(max_length=80, default="O'zbekiston", db_index=True)
    region = models.CharField(max_length=100, blank=True, default='', db_index=True)
    district = models.CharField(max_length=100, blank=True, default='', db_index=True)
    city = models.CharField(max_length=80)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='owned_centers',
    )
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_PENDING)
    subjects = models.JSONField(default=list, blank=True)
    image = models.ImageField(upload_to='centers/', blank=True, null=True)
    rating = models.DecimalField(max_digits=3, decimal_places=1, default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        location = self.district or self.region or self.city
        return f'{self.name} ({location})'


class CenterMembership(models.Model):
    """Per-(user,center) role assignment with its own approval lifecycle.

    A user can hold multiple memberships (e.g. student at one center, manager
    at another). Membership status drives access to center-specific features:
    olympiads, question creation, manager dashboard, etc.
    """
    ROLE_STUDENT = 'student'
    ROLE_TEACHER = 'teacher'
    ROLE_MANAGER = 'manager'
    ROLE_OWNER = 'owner'
    ROLE_CHOICES = [
        (ROLE_STUDENT, 'Student'),
        (ROLE_TEACHER, 'Teacher'),
        (ROLE_MANAGER, 'Manager'),
        (ROLE_OWNER, 'Owner'),
    ]

    STATUS_PENDING = 'pending'
    STATUS_APPROVED = 'approved'
    STATUS_REJECTED = 'rejected'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Kutilmoqda'),
        (STATUS_APPROVED, 'Tasdiqlandi'),
        (STATUS_REJECTED, 'Rad etildi'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='memberships',
    )
    center = models.ForeignKey(
        EducationCenter,
        on_delete=models.CASCADE,
        related_name='memberships',
    )
    role = models.CharField(max_length=10, choices=ROLE_CHOICES)
    subject = models.CharField(max_length=80, blank=True)
    approval_code = models.CharField(max_length=16, blank=True, db_index=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_PENDING)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='approved_memberships',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'center', 'role'],
                name='unique_user_center_role',
            ),
        ]

    def __str__(self):
        return f'{self.user_id}/{self.center_id}/{self.role} [{self.status}]'
