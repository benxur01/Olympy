from django.urls import path

from . import views

# Mounted under /api/notifications/
urlpatterns = [
    path('', views.my_notifications, name='my-notifications'),
    path('<int:pk>/read/', views.mark_read, name='mark-read'),
    path('read-all/', views.mark_all_read, name='mark-all-read'),
]
