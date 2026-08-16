from django.urls import path

from questions.views import olympiad_questions as olympiad_questions_view

from . import views, views_admin_competition

# Mounted under /api/olympiads/
urlpatterns = [
    path('', views.olympiads_list_create, name='olympiads-list-create'),
    path('<int:olympiad_id>/', views.olympiad_detail, name='olympiad-detail'),
    path('<int:olympiad_id>/questions/', olympiad_questions_view, name='olympiad-questions'),
    path('<int:olympiad_id>/publish/', views.publish_olympiad, name='olympiad-publish'),
    path('<int:olympiad_id>/deactivate/', views.deactivate_olympiad, name='olympiad-deactivate'),
    path('<int:olympiad_id>/finish/', views.finish_olympiad, name='olympiad-finish'),
    path('<int:olympiad_id>/flag/', views.flag_olympiad, name='olympiad-flag'),
    path('<int:olympiad_id>/export/', views.export_olympiad_results, name='olympiad-export'),
    path('<int:olympiad_id>/stats/', views.olympiad_stats, name='olympiad-stats'),
    path('<int:olympiad_id>/code-submissions/', views.code_submissions, name='olympiad-code-submissions'),

    # Admin Competition Ops
    path('admin/<int:pk>/freeze/', views_admin_competition.admin_olympiad_toggle_freeze, name='admin-olympiad-freeze'),
    path('admin/<int:pk>/regrade/', views_admin_competition.admin_olympiad_batch_regrade, name='admin-olympiad-regrade'),
    path('admin/<int:pk>/analytics/', views_admin_competition.admin_olympiad_question_analytics, name='admin-olympiad-analytics'),
    path('admin/<int:pk>/certificates/', views_admin_competition.admin_olympiad_certificates_ops, name='admin-olympiad-certificates'),
]
