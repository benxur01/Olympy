from django.urls import path

from . import views

# Mounted under /api/attempts/
urlpatterns = [
    path('cheating/', views.report_cheating, name='report-cheating'),
    path('<int:attempt_id>/', views.attempt_detail, name='attempt-detail'),
    path('', views.submit_attempt, name='submit-attempt'),
]
