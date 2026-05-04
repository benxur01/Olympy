from django.urls import path

from . import views

# Mounted under /api/results/
urlpatterns = [
    path('me/', views.my_results, name='my-results'),
    path('me/stats/', views.my_stats, name='my-stats'),
]
