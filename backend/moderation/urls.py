from django.urls import path

from . import views

# Mounted under /api/admin/moderation/
urlpatterns = [
    path('queue/', views.admin_moderation_queue, name='admin-moderation-queue'),
    path('queue/<int:flag_id>/resolve/', views.admin_moderation_resolve,
         name='admin-moderation-resolve'),
]
