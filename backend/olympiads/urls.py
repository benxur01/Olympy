from django.urls import path

from . import views

# Mounted under /api/olympiads/
urlpatterns = [
    path('', views.olympiads_list_create, name='olympiads-list-create'),
    path('<int:olympiad_id>/publish/', views.publish_olympiad, name='olympiad-publish'),
    path('<int:olympiad_id>/finish/', views.finish_olympiad, name='olympiad-finish'),
]
