from django.urls import path

from . import views

# Mounted under /api/questions/
urlpatterns = [
    path('', views.questions_list_create, name='questions-list-create'),
]
