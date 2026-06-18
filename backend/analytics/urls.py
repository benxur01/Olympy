"""Analitika API URL'lari. Mount: `/api/analytics/` (olympy_api/urls.py)."""
from django.urls import path

from . import views

urlpatterns = [
    path('metrics/', views.metrics_dashboard, name='analytics-metrics'),
]
