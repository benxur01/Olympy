from django.urls import path

from . import views, views_admin_plagiarism, views_essay, views_evidence

# Mounted under /api/attempts/
urlpatterns = [
    # Admin Plagiarism & Cheating Analysis
    path('admin/olympiad/<int:olympiad_id>/plagiarism/', views_admin_plagiarism.admin_olympiad_plagiarism_analysis, name='admin-olympiad-plagiarism'),
    # Diskvalifikatsiya dalili (kamera/ekran kadri) — faqat platforma admini.
    # Fayl `/media/` ostida EMAS: nginx u yerni autentifikatsiyasiz beradi,
    # shuning uchun yagona yo'l shu endpoint (`views_evidence` docstringi).
    path(
        'admin/evidence/<int:evidence_id>/',
        views_evidence.admin_evidence_image,
        name='admin-evidence-image',
    ),

    path('cheating/', views.report_cheating, name='report-cheating'),
    path('cheating/review/', views.review_cheating_case, name='review-cheating-case'),
    path('camera-consent/', views.camera_consent, name='camera-consent'),
    path('microphone-consent/', views.microphone_consent, name='microphone-consent'),
    path('ping/', views.test_session_ping, name='test-session-ping'),
    # Jonli Kamera va Mikrofon Proktoringi (Live Video & Audio feed)
    path('sessions/<int:session_id>/live-frame/', views.session_live_frame, name='session-live-frame'),
    path('sessions/<int:session_id>/proctor-signal/', views.session_proctor_signal, name='session-proctor-signal'),
    path('mistakes/', views.get_mistakes_list, name='mistakes-list'),
    path('mistakes/explain/', views.explain_all_mistakes, name='mistakes-explain-all'),
    path(
        'mistakes/explain/<str:task_id>/status/',
        views.explain_all_mistakes_status,
        name='mistakes-explain-all-status',
    ),
    path('<int:attempt_id>/ai-analysis/', views.attempt_ai_analysis, name='attempt-ai-analysis'),
    # Essay savollarni qo'lda baholash (teacher/manager).
    path(
        '<int:attempt_id>/essay-answers/',
        views_essay.attempt_essay_answers,
        name='attempt-essay-answers',
    ),
    path(
        '<int:attempt_id>/essay-answers/<int:question_id>/grade/',
        views_essay.grade_essay_answer,
        name='grade-essay-answer',
    ),
    # Insho chuqur AI tahlili (on-demand, Plus+ o'quvchi).
    path(
        '<int:attempt_id>/essay/<int:question_id>/ai-feedback/',
        views_essay.essay_ai_feedback,
        name='attempt-essay-ai-feedback',
    ),
    path('<int:attempt_id>/', views.attempt_detail, name='attempt-detail'),
    path('', views.submit_attempt, name='submit-attempt'),
]
