from django.urls import path

from . import views

urlpatterns = [
    path('me/', views.me, name='me'),
    path('admin/users/', views.admin_users_list, name='admin-users-list'),
    path('admin/users/<int:user_id>/set-active/', views.admin_set_user_active,
         name='admin-set-user-active'),
]
