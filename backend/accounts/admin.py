from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import PhoneVerification, User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    list_display = ('full_name', 'normalized_phone', 'is_platform_admin', 'is_active', 'created_at')
    search_fields = ('full_name', 'normalized_phone', 'phone')
    ordering = ('-created_at',)
    fieldsets = (
        (None, {'fields': ('full_name', 'phone', 'normalized_phone', 'password')}),
        ('Roles', {'fields': ('roles', 'is_platform_admin')}),
        ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
    )
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('full_name', 'phone', 'password1', 'password2'),
        }),
    )
    readonly_fields = ('normalized_phone', 'created_at')


@admin.register(PhoneVerification)
class PhoneVerificationAdmin(admin.ModelAdmin):
    list_display = (
        'normalized_phone', 'telegram_chat_id', 'attempts_count',
        'otp_expires_at', 'verified_at', 'created_at',
    )
    search_fields = ('normalized_phone', 'telegram_chat_id', 'telegram_user_id', 'verify_token')
    readonly_fields = ('otp_hash', 'created_at', 'updated_at', 'verified_at')
    ordering = ('-created_at',)
