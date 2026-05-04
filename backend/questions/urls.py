from django.urls import path

from . import views

# Mounted under /api/questions/
urlpatterns = [
    path('generate-ai/', views.generate_ai_questions, name='questions-generate-ai'),
    path('', views.questions_list_create, name='questions-list-create'),
]
