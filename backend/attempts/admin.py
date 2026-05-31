from django.contrib import admin

from .models import CodeSubmission, TestAttempt, TestSession


@admin.register(TestAttempt)
class TestAttemptAdmin(admin.ModelAdmin):
    list_display = ('user', 'olympiad', 'score', 'rank', 'submitted_at')
    list_filter = ('olympiad',)
    search_fields = ('user__full_name', 'olympiad__title')


@admin.register(CodeSubmission)
class CodeSubmissionAdmin(admin.ModelAdmin):
    list_display = ('attempt', 'question', 'code_language', 'ai_code_score', 'created_at')
    list_filter = ('code_language',)
    search_fields = ('attempt__user__full_name', 'question__text')


@admin.register(TestSession)
class TestSessionAdmin(admin.ModelAdmin):
    list_display = ('user', 'olympiad', 'status', 'started_at', 'disqualified_at')
    list_filter = ('olympiad', 'status')
    search_fields = ('user__full_name', 'olympiad__title')
