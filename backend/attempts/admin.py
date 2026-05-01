from django.contrib import admin

from .models import TestAttempt


@admin.register(TestAttempt)
class TestAttemptAdmin(admin.ModelAdmin):
    list_display = ('user', 'olympiad', 'score', 'rank', 'submitted_at')
    list_filter = ('olympiad',)
    search_fields = ('user__full_name', 'olympiad__title')
