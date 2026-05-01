from django.urls import path

from . import views

# Mounted under /api/attempts/
urlpatterns = [
    path('', views.submit_attempt, name='submit-attempt'),
]
