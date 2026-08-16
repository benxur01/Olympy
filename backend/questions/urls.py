from django.urls import path

from . import views, views_admin_ai

# Mounted under /api/questions/
urlpatterns = [
    # Admin AI Orchestration Studio
    path('admin/generate-exam/', views_admin_ai.admin_ai_generate_exam_questions, name='admin-ai-generate-exam'),
    path('admin/moderate-appeal/', views_admin_ai.admin_ai_moderate_appeal, name='admin-ai-moderate-appeal'),
    path('admin/ai-metrics/', views_admin_ai.admin_ai_usage_metrics, name='admin-ai-usage-metrics'),

    path('generate-ai/', views.generate_ai_questions, name='questions-generate-ai'),
    path('generate-ai/<str:task_id>/status/', views.generate_ai_questions_status, name='questions-generate-ai-status'),
    path('code-review/', views.code_review, name='questions-code-review'),
    path('code-review/<str:task_id>/status/', views.code_review_status, name='questions-code-review-status'),
    path('explain/<str:task_id>/status/', views.explain_question_status, name='questions-explain-status'),
    path('run-code/start/', views.run_code_start_view, name='questions-run-code-start'),
    path('run-code/status/<str:task_id>/', views.run_code_status_view, name='questions-run-code-status'),
    path('pdf-preview/', views.preview_pdf_questions, name='questions-pdf-preview'),
    path('pdf-preview/<str:task_id>/status/', views.pdf_preview_status, name='questions-pdf-preview-status'),
    path('word-ai-preview/', views.word_ai_preview, name='questions-word-ai-preview'),
    path('import/', views.import_questions_excel, name='questions-import'),
    path('import-word/', views.import_questions_word, name='questions-import-word'),
    path('word-template/', views.download_word_template, name='questions-word-template'),
    path('delete-all/', views.delete_all_questions, name='questions-delete-all'),
    path('analytics/', views.question_analytics, name='questions-analytics'),
    path('<int:question_id>/explain/', views.explain_question, name='questions-explain'),
    path('<int:question_id>/flag/', views.flag_question, name='questions-flag'),
    path('<int:question_id>/', views.question_detail, name='questions-detail'),
    path('', views.questions_list_create, name='questions-list-create'),
]
