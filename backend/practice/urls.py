from django.urls import path

from . import views

# Mounted under /api/practice/
urlpatterns = [
    path('subjects/', views.practice_subjects, name='practice-subjects'),
    path('start/', views.practice_start, name='practice-start'),
    path('submit/', views.practice_submit, name='practice-submit'),
    path('wrong-answers/', views.wrong_answer_subjects, name='practice-wrong-subjects'),
    path('wrong-answers/start/', views.wrong_answer_start, name='practice-wrong-start'),
]
