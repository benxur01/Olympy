from django.urls import path

from . import views

# Mounted under /api/manager/
urlpatterns = [
    path('stats/', views.manager_stats, name='manager-stats'),
]
