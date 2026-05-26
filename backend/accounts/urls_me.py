from django.urls import path

from . import views
from . import views_parent

urlpatterns = [
    path('me/', views.me, name='me'),
    path('me/parent/link/', views_parent.link_child, name='parent-link-child'),
    path('me/parent/link/<int:student_id>/', views_parent.unlink_child, name='parent-unlink-child'),
    path('me/parent/children/', views_parent.list_children, name='parent-list-children'),
    path('me/parent/children/<int:student_id>/report/', views_parent.child_report_pdf, name='parent-child-report-pdf'),
    path('me/activity-leaderboard/', views.activity_leaderboard, name='activity-leaderboard'),
    path('admin/users/', views.admin_users_list, name='admin-users-list'),
    path('admin/users/<int:user_id>/set-active/', views.admin_set_user_active,
         name='admin-set-user-active'),
]
