from django.urls import path

from questions.views import olympiad_questions as olympiad_questions_view

from . import views

# Mounted under /api/olympiads/
urlpatterns = [
    path('', views.olympiads_list_create, name='olympiads-list-create'),
    path('<int:olympiad_id>/', views.olympiad_detail, name='olympiad-detail'),
    path('<int:olympiad_id>/questions/', olympiad_questions_view, name='olympiad-questions'),
    path('<int:olympiad_id>/publish/', views.publish_olympiad, name='olympiad-publish'),
    path('<int:olympiad_id>/deactivate/', views.deactivate_olympiad, name='olympiad-deactivate'),
    path('<int:olympiad_id>/finish/', views.finish_olympiad, name='olympiad-finish'),
]
