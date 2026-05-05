from django.contrib import admin

from .models import Olympiad


@admin.register(Olympiad)
class OlympiadAdmin(admin.ModelAdmin):
    list_display = ('title', 'event_type', 'center', 'subject', 'test_level', 'test_type', 'status', 'start_datetime')
    list_filter = ('event_type', 'status', 'subject', 'test_level', 'test_type')
    search_fields = ('title', 'test_level', 'test_type')
    filter_horizontal = ('questions',)
