from django.contrib import admin

from .models import CenterMembership, EducationCenter


@admin.register(EducationCenter)
class EducationCenterAdmin(admin.ModelAdmin):
    list_display = (
        'name', 'organization_type', 'country', 'region', 'district',
        'city', 'status', 'owner', 'created_at',
    )
    list_filter = ('status', 'organization_type', 'country', 'region', 'district', 'city')
    search_fields = ('name', 'organization_type', 'country', 'region', 'district', 'city')


@admin.register(CenterMembership)
class CenterMembershipAdmin(admin.ModelAdmin):
    list_display = ('user', 'center', 'role', 'status', 'subject', 'created_at')
    list_filter = ('role', 'status')
    search_fields = ('user__full_name', 'center__name')
