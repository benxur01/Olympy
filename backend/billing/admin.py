from datetime import timedelta

from django.contrib import admin, messages
from django.utils import timezone
from django.utils.html import format_html

from .models import SubscriptionPlan, UserSubscription, PaymentTransaction


@admin.register(SubscriptionPlan)
class SubscriptionPlanAdmin(admin.ModelAdmin):
    list_display = (
        'name', 'plan_type', 'price', 'duration_days',
        'limits_display', 'is_popular', 'is_active', 'created_at',
    )
    list_filter = ('plan_type', 'is_active', 'is_popular')
    list_editable = ('is_active', 'is_popular')
    search_fields = ('name', 'description')
    ordering = ('plan_type', 'price')
    fieldsets = (
        (None, {
            'fields': ('name', 'plan_type', 'price', 'duration_days', 'description',
                       'features', 'is_popular', 'is_active'),
        }),
        ("Limitlar (organization)", {
            'description': "0 = cheksiz. Faqat tashkilot (organization) planlari uchun ishlatiladi.",
            'fields': ('max_students', 'max_teachers', 'max_olympiads_monthly'),
        }),
    )

    @admin.display(description='Limitlar (o\'q/ust/olimp)')
    def limits_display(self, obj):
        def fmt(value):
            return '∞' if value == SubscriptionPlan.UNLIMITED else str(value)
        if obj.plan_type != 'organization':
            return '—'
        return f"{fmt(obj.max_students)} / {fmt(obj.max_teachers)} / {fmt(obj.max_olympiads_monthly)}"


@admin.register(UserSubscription)
class UserSubscriptionAdmin(admin.ModelAdmin):
    list_display = ('user', 'plan', 'start_date', 'end_date', 'is_active', 'created_at')
    list_filter = ('is_active', 'plan')
    search_fields = ('user__full_name', 'user__normalized_phone', 'user__phone')
    autocomplete_fields = ('user',)
    date_hierarchy = 'start_date'
    ordering = ('-created_at',)


# 24 soatdan ko'proq pending holatida turgan to'lovni "qotib qolgan" deb
# hisoblaymiz — webhook kelmagan yoki obuna ulanmagan bo'lishi mumkin.
STALE_PENDING_HOURS = 24


@admin.register(PaymentTransaction)
class PaymentTransactionAdmin(admin.ModelAdmin):
    """To'lovlarni kuzatish: status filter, qotib qolgan pending'lar warning,
    va qo'lda obuna berish action'i."""
    list_display = (
        'id', 'created_at', 'user', 'amount', 'provider',
        'status_badge', 'plan', 'stale_warning', 'short_failure_reason',
    )
    # Pending va failed to'lovlarni tez topish uchun status birinchi filter.
    list_filter = ('status', 'provider', 'created_at')
    search_fields = (
        'user__full_name', 'user__normalized_phone', 'user__phone',
        'provider_transaction_id', 'failure_reason',
    )
    autocomplete_fields = ('user', 'plan')
    date_hierarchy = 'created_at'
    ordering = ('-created_at',)
    readonly_fields = ('created_at', 'updated_at', 'provider_transaction_id', 'manager_commission')
    actions = ['manually_activate_subscription', 'mark_as_failed']

    @admin.display(description='Status', ordering='status')
    def status_badge(self, obj):
        colors = {
            PaymentTransaction.STATUS_SUCCESS: '#16a34a',
            PaymentTransaction.STATUS_PENDING: '#d97706',
            PaymentTransaction.STATUS_FAILED: '#dc2626',
        }
        color = colors.get(obj.status, '#6b7280')
        return format_html(
            '<b style="color:{}">{}</b>', color, obj.get_status_display(),
        )

    @admin.display(description='Ogohlantirish')
    def stale_warning(self, obj):
        """24+ soat pending bo'lib turgan to'lovlarni qizil bilan belgilaydi."""
        if obj.status != PaymentTransaction.STATUS_PENDING:
            return ''
        cutoff = timezone.now() - timedelta(hours=STALE_PENDING_HOURS)
        if obj.created_at and obj.created_at < cutoff:
            age_hours = int((timezone.now() - obj.created_at).total_seconds() // 3600)
            return format_html(
                '<span style="color:#dc2626;font-weight:bold;">'
                '⚠️ {} soatdan beri pending</span>', age_hours,
            )
        return ''

    @admin.display(description='Xato sababi')
    def short_failure_reason(self, obj):
        reason = obj.failure_reason or ''
        if len(reason) > 60:
            return reason[:60] + '…'
        return reason

    @admin.action(description="Qo'lda obuna berish (manually activate subscription)")
    def manually_activate_subscription(self, request, queryset):
        """Pending/failed to'lovlar uchun qo'lda premium ulaydi.

        Tranzaksiyadagi plan (yoki narx) bo'yicha _activate_subscription ishlatadi —
        webhook bilan bir xil logika. Allaqachon success bo'lgan, lekin obuna
        ulanmagan to'lovlarni ham qutqarish uchun ishlaydi.
        """
        # Webhook bilan bir xil obuna logikasi — kod takrorlanmasin.
        from .views import _activate_subscription

        activated = 0
        skipped = 0
        for tx in queryset.select_related('user', 'plan'):
            ok = _activate_subscription(tx.user, tx.amount, plan_id=tx.plan_id)
            if ok:
                # To'lovni success deb belgilaymiz va xato sababini tozalaymiz.
                tx.status = PaymentTransaction.STATUS_SUCCESS
                tx.failure_reason = ''
                tx.save(update_fields=['status', 'failure_reason', 'updated_at'])
                activated += 1
            else:
                skipped += 1
                self.message_user(
                    request,
                    f"Tx #{tx.id} ({tx.user}): mos plan topilmadi, obuna ulanmadi. "
                    f"Avval tranzaksiyaga to'g'ri plan biriktiring.",
                    level=messages.WARNING,
                )
        if activated:
            self.message_user(
                request, f"{activated} ta to'lov uchun obuna qo'lda faollashtirildi.",
                level=messages.SUCCESS,
            )
        if not activated and not skipped:
            self.message_user(request, "Hech narsa o'zgartirilmadi.", level=messages.INFO)

    @admin.action(description="Xato (failed) deb belgilash")
    def mark_as_failed(self, request, queryset):
        # Success bo'lgan to'lovni failed qilib qo'ymaymiz — faqat pending'larni.
        updated = queryset.filter(status=PaymentTransaction.STATUS_PENDING).update(
            status=PaymentTransaction.STATUS_FAILED,
        )
        self.message_user(
            request, f"{updated} ta pending to'lov 'failed' deb belgilandi.",
            level=messages.SUCCESS,
        )
