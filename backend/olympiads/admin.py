from django.contrib import admin

from .models import Olympiad


@admin.register(Olympiad)
class OlympiadAdmin(admin.ModelAdmin):
    list_display = ('title', 'event_type', 'center', 'subject', 'test_level', 'status', 'start_datetime')
    list_filter = ('event_type', 'status', 'subject', 'test_level')
    search_fields = ('title', 'test_level')
    filter_horizontal = ('questions',)
