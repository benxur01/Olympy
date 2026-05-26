from django.urls import path

from . import views

# Mounted under /api/attempts/
urlpatterns = [
    path('cheating/', views.report_cheating, name='report-cheating'),
    path('ping/', views.test_session_ping, name='test-session-ping'),
    path('mistakes/', views.get_mistakes_list, name='mistakes-list'),
    path('mistakes/explain/', views.explain_all_mistakes, name='mistakes-explain-all'),
    path('<int:attempt_id>/', views.attempt_detail, name='attempt-detail'),
    path('', views.submit_attempt, name='submit-attempt'),
]
