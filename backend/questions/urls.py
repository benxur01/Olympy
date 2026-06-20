from django.urls import path

from . import views

# Mounted under /api/questions/
urlpatterns = [
    path('generate-ai/', views.generate_ai_questions, name='questions-generate-ai'),
    path('code-review/', views.code_review, name='questions-code-review'),
    path('run-code/start/', views.run_code_start_view, name='questions-run-code-start'),
    path('run-code/status/<str:task_id>/', views.run_code_status_view, name='questions-run-code-status'),
    path('pdf-preview/', views.preview_pdf_questions, name='questions-pdf-preview'),
    path('pdf-preview/<str:task_id>/status/', views.pdf_preview_status, name='questions-pdf-preview-status'),
    path('import/', views.import_questions_excel, name='questions-import'),
    path('delete-all/', views.delete_all_questions, name='questions-delete-all'),
    path('analytics/', views.question_analytics, name='questions-analytics'),
    path('<int:question_id>/explain/', views.explain_question, name='questions-explain'),
    path('<int:question_id>/', views.question_detail, name='questions-detail'),
    path('', views.questions_list_create, name='questions-list-create'),
]
