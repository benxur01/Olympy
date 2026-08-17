from django.contrib import admin

from .models import CodeSubmission, TestAttempt, TestSession

# `EvidenceSnapshot` ATAYIN ro'yxatdan o'tkazilmagan: dalil rasmlari shaxsiy/
# biometrik ma'lumot va ularga yagona yo'l — `views_evidence` dagi platforma
# admini endpointi. Django admin qo'shilsa, `FileField` vidjeti fayl havolasini
# ko'rsatishga urinardi (storage URL bermaydi — ValueError) va kirish huquqi
# `is_staff` ga kengayib ketardi.


@admin.register(TestAttempt)
class TestAttemptAdmin(admin.ModelAdmin):
    list_display = ('user', 'olympiad', 'score', 'rank', 'submitted_at')
    list_filter = ('olympiad',)
    search_fields = ('user__full_name', 'olympiad__title')


@admin.register(CodeSubmission)
class CodeSubmissionAdmin(admin.ModelAdmin):
    list_display = ('attempt', 'question', 'code_language', 'ai_code_score',
                    'evaluation_status', 'created_at')
    list_filter = ('code_language', 'evaluation_status')
    search_fields = ('attempt__user__full_name', 'question__text')


@admin.register(TestSession)
class TestSessionAdmin(admin.ModelAdmin):
    list_display = ('user', 'olympiad', 'status', 'started_at', 'disqualified_at')
    list_filter = ('olympiad', 'status')
    search_fields = ('user__full_name', 'olympiad__title')
