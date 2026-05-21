from django.urls import path

from . import views

# Mounted under /api/questions/
urlpatterns = [
    path('generate-ai/', views.generate_ai_questions, name='questions-generate-ai'),
    path('pdf-preview/', views.preview_pdf_questions, name='questions-pdf-preview'),
    path('delete-all/', views.delete_all_questions, name='questions-delete-all'),
    path('<int:question_id>/', views.question_detail, name='questions-detail'),
    path('', views.questions_list_create, name='questions-list-create'),
]
