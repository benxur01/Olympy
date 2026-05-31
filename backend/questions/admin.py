from django.contrib import admin

from .models import Question


@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ('text_short', 'center', 'subject', 'question_type', 'difficulty', 'source')
    list_filter = ('subject', 'question_type', 'difficulty', 'source')
    search_fields = ('text',)

    def text_short(self, obj):
        return obj.text[:60]
    text_short.short_description = 'Savol'
