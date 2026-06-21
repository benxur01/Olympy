"""Analitika API URL'lari. Mount: `/api/analytics/` (olympy_api/urls.py)."""
from django.urls import path

from . import views

urlpatterns = [
    path('metrics/', views.metrics_dashboard, name='analytics-metrics'),
    path('group-stats/', views.group_stats, name='analytics-group-stats'),
    # Admin panel "Tahlil" tabidagi kengaytirilgan diagrammalar (faqat admin).
    path('attempts-trend/', views.attempts_trend, name='analytics-attempts-trend'),
    path('olympiad-stats/', views.olympiad_stats, name='analytics-olympiad-stats'),
    path('question-stats/', views.question_stats, name='analytics-question-stats'),
    path('revenue-trend/', views.revenue_trend, name='analytics-revenue-trend'),
    path('center-stats/', views.center_stats, name='analytics-center-stats'),
]
