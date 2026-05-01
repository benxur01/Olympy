from django.urls import path

from . import views

# Mounted under /api/leaderboard/
urlpatterns = [
    path('', views.leaderboard, name='leaderboard'),
]
