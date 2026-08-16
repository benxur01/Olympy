from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.core.exceptions import PermissionDenied

from .forms import UserAdminForm
from .models import (
    AuditLog, EmailVerification, PhoneVerification, User, RewardProduct,
    RewardRedemption,
)


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    """Django admin'dagi User sahifasi — ATAYLAB cheklangan.

    Muammo: `/olympy-mgmt-2025/` API'dan mustaqil ikkinchi yo'l edi. U orqali
    `roles`, `is_active`, `is_platform_admin`, `is_premium` va parolni
    o'zgartirish mumkin bo'lgan, ammo:
      * hech qanday `AuditLog` yozilmasdi (jurnalda ko'rinmaydigan yagona
        tahrir yo'li aynan shu edi);
      * API'dagi himoyalar chetlab o'tilardi — majburiy blok sababi,
        "o'zingni bloklay olmaysan", "boshqa adminni bloklay olmaysan",
        parol tiklashdagi `token_version` bump va h.k.

    Yechim: bu maydonlar READONLY. Ular faqat o'z audit va tekshiruvlariga ega
    API amallari orqali o'zgaradi:
      `roles`        -> `admin_set_user_roles`
      `is_active`    -> `admin_set_user_active`
      `is_premium`   -> `admin_toggle_user_premium`
      `password`     -> `admin_reset_user_password`
    Qolgan (xavfsiz) maydonlar tahrirlanadi, lekin `save_model` ularni ham
    jurnalga yozadi.
    """

    form = UserAdminForm
    list_display = (
        'full_name', 'normalized_phone', 'telegram_linked_at',
        'is_platform_admin', 'is_premium', 'is_active', 'created_at',
    )
    list_filter = ('is_premium', 'is_platform_admin', 'is_active', 'is_staff')
    # `list_editable = ('is_premium',)` OLIB TASHLANDI: `is_premium` endi
    # `readonly_fields` da, Django esa bitta maydonni ikkalasida ham ko'rsa
    # ro'yxat sahifasini umuman ocholmaydi.
    search_fields = (
        'full_name', 'normalized_phone', 'phone', 'email',
        'telegram_chat_id', 'telegram_user_id',
    )
    ordering = ('-created_at',)
    fieldsets = (
        # `password` fieldset'dan BUTUNLAY olib tashlandi (readonly qilib
        # qoldirilsa, Django uni oddiy CharField sifatida chizib parol
        # hash'ini ekranga chiqarardi).
        (None, {'fields': ('full_name', 'phone', 'normalized_phone')}),
        # `email_verified_at` readonly: tasdiqlangan holat faqat OTP oqimi
        # (email/link/confirm/) orqali yoziladi, admin qo'lda "tasdiqlangan"
        # deb belgilay olmasin.
        ('Email', {'fields': ('email', 'email_verified_at')}),
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
    readonly_fields = (
        'normalized_phone', 'created_at', 'telegram_linked_at', 'email_verified_at',
        # Guardrail'li API amallariga tegishli maydonlar — yuqoridagi izohga
        # qarang. `password` fieldset'da yo'q, lekin bu yerda ATAYLAB turadi:
        # u formadan ham chiqarib tashlanishini kafolatlaydi (`UserChangeForm`
        # `password` ni declared field sifatida e'lon qiladi, ya'ni faqat
        # fieldset'dan olib tashlash yetarli emas).
        'password', 'roles', 'is_active', 'is_platform_admin', 'is_premium',
    )

    def user_change_password(self, request, id, form_url=''):
        """`<id>/password/` — Django'ning parol o'rnatish sahifasi yopiq.

        `DjangoUserAdmin.get_urls()` bu marshrutni alohida qo'shadi va u
        `readonly_fields` ga umuman qaramaydi: `password` ni readonly qilib
        URL'ni ochiq qoldirsak, cheklov faqat ko'rinishda bo'lardi. Parol
        faqat `admin_reset_user_password` orqali o'zgaradi — u audit yozadi
        va `token_version` ni oshirib mavjud seanslarni o'ldiradi.
        """
        raise PermissionDenied(
            "Parolni Django admin orqali o'zgartirib bo'lmaydi — "
            "admin panelidagi \"Parolni tiklash\" amalidan foydalaning."
        )

    def has_delete_permission(self, request, obj=None):
        """Hisobni Django admin orqali O'CHIRIB bo'lmaydi.

        Hard-delete FK cascade orqali imtihon tarixini (TestAttempt,
        TestSession, CoinTransaction, AuditLog maqsadlari) ham olib ketadi va
        hech qanday iz qoldirmaydi. Hisob o'chirish faqat mavjud soft-delete
        oqimi (`admin_delete_user` -> `deleted_at`) orqali bo'ladi.
        """
        return False

    def save_model(self, request, obj, form, change):
        """Tahrirlanadigan maydonlardagi o'zgarishlarni jurnalga yozadi.

        Readonly maydonlar bu yergacha yetib kelmaydi (ular formadan
        chiqarilgan), shuning uchun `changed_data` faqat xavfsiz maydonlarni
        (`full_name`, `phone`, `email`, `telegram_*`, `is_staff`, guruhlar)
        o'z ichiga oladi.
        """
        super().save_model(request, obj, form, change)
        if form.changed_data:
            AuditLog.log(
                request,
                'admin_django_admin_user_edit',
                target=obj,
                extra={
                    'changed_fields': list(form.changed_data),
                    'created': not change,
                },
            )


@admin.register(PhoneVerification)
class PhoneVerificationAdmin(admin.ModelAdmin):
    list_display = (
        'normalized_phone', 'telegram_chat_id', 'attempts_count',
        'otp_expires_at', 'verified_at', 'created_at',
    )
    search_fields = ('normalized_phone', 'telegram_chat_id', 'telegram_user_id', 'verify_token')
    readonly_fields = ('otp_hash', 'created_at', 'updated_at', 'verified_at')
    ordering = ('-created_at',)


@admin.register(EmailVerification)
class EmailVerificationAdmin(admin.ModelAdmin):
    list_display = (
        'email', 'user', 'attempts_count', 'otp_expires_at', 'verified_at', 'created_at',
    )
    search_fields = ('email', 'user__full_name', 'user__normalized_phone')
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

