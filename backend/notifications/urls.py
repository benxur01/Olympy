from django.urls import path

from . import views, views_admin_broadcast

# Mounted under /api/notifications/
urlpatterns = [
    # Admin Broadcasts
    path('admin/broadcasts/', views_admin_broadcast.admin_list_create_broadcasts, name='admin-broadcasts'),
    path('admin/broadcasts/<int:pk>/send/', views_admin_broadcast.admin_send_broadcast_now, name='admin-broadcasts-send'),
    path('admin/broadcasts/<int:pk>/', views_admin_broadcast.admin_delete_broadcast, name='admin-broadcasts-delete'),

    path('', views.my_notifications, name='my-notifications'),
    path('subscribe/', views.subscribe_push, name='subscribe-push'),
    path('<int:pk>/read/', views.mark_read, name='mark-read'),
    path('read-all/', views.mark_all_read, name='mark-all-read'),
]
