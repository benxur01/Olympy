from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import PhoneVerification, User, RewardProduct, RewardRedemption


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    list_display = (
        'full_name', 'normalized_phone', 'telegram_linked_at',
        'is_platform_admin', 'is_premium', 'is_active', 'created_at',
    )
    list_filter = ('is_premium', 'is_platform_admin', 'is_active', 'is_staff')
    list_editable = ('is_premium',)
    search_fields = (
        'full_name', 'normalized_phone', 'phone',
        'telegram_chat_id', 'telegram_user_id',
    )
    ordering = ('-created_at',)
    fieldsets = (
        (None, {'fields': ('full_name', 'phone', 'normalized_phone', 'password')}),
        ('Roles', {'fields': ('roles', 'is_platform_admin', 'is_premium')}),
        ('Telegram', {'fields': ('telegram_chat_id', 'telegram_user_id', 'telegram_linked_at')}),
        ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
    )
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('full_name', 'phone', 'password1', 'password2'),
        }),
    )
    readonly_fields = ('normalized_phone', 'created_at', 'telegram_linked_at')


@admin.register(PhoneVerification)
class PhoneVerificationAdmin(admin.ModelAdmin):
    list_display = (
        'normalized_phone', 'telegram_chat_id', 'attempts_count',
        'otp_expires_at', 'verified_at', 'created_at',
    )
    search_fields = ('normalized_phone', 'telegram_chat_id', 'telegram_user_id', 'verify_token')
    readonly_fields = ('otp_hash', 'created_at', 'updated_at', 'verified_at')
    ordering = ('-created_at',)


@admin.register(RewardProduct)
class RewardProductAdmin(admin.ModelAdmin):
    list_display = ('title', 'center', 'coin_cost', 'stock', 'is_active', 'created_at')
    list_filter = ('is_active', 'center')
    search_fields = ('title', 'description', 'center__name')
    ordering = ('-created_at',)


@admin.register(RewardRedemption)
class RewardRedemptionAdmin(admin.ModelAdmin):
    list_display = ('user', 'product', 'status', 'redeemed_at')
    list_filter = ('status',)
    search_fields = ('user__full_name', 'user__normalized_phone', 'product__title')
    ordering = ('-redeemed_at',)

