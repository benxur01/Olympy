from django.contrib import admin

from .models import CenterMembership, EducationCenter


@admin.register(EducationCenter)
class EducationCenterAdmin(admin.ModelAdmin):
    list_display = (
        'name', 'organization_type', 'country', 'region', 'district',
        'city', 'status', 'is_premium', 'owner', 'created_at',
    )
    list_filter = ('status', 'is_premium', 'organization_type', 'country', 'region', 'district', 'city')
    list_editable = ('is_premium',)
    search_fields = ('name', 'organization_type', 'country', 'region', 'district', 'city')


@admin.register(CenterMembership)
class CenterMembershipAdmin(admin.ModelAdmin):
    list_display = ('user', 'center', 'role', 'status', 'subject', 'created_at')
    list_filter = ('role', 'status')
    search_fields = ('user__full_name', 'center__name')
