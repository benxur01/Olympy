from django.contrib import admin

from .models import Olympiad


@admin.register(Olympiad)
class OlympiadAdmin(admin.ModelAdmin):
    list_display = ('title', 'event_type', 'center', 'subject', 'status', 'start_datetime')
    list_filter = ('event_type', 'status', 'subject')
    search_fields = ('title',)
    filter_horizontal = ('questions',)
