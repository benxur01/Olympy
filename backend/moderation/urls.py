from django.urls import path

from . import views

# Mounted under /api/admin/moderation/
urlpatterns = [
    path('queue/', views.admin_moderation_queue, name='admin-moderation-queue'),
    path('queue/<int:flag_id>/resolve/', views.admin_moderation_resolve,
         name='admin-moderation-resolve'),
    # Bloklangan IP'lar: ro'yxat + yangi blok (GET/POST bitta yo'lda) va
    # blokni olib tashlash. Navbat bilan bir app'da, chunki blok aynan
    # bayroqning natijasi ("bayroq → blok" bir bosishda: `.../resolve/`
    # tanasidagi `block_ip`).
    path('blocked-ips/', views.admin_blocked_ips, name='admin-moderation-blocked-ips'),
    path('blocked-ips/<int:blocked_ip_id>/', views.admin_blocked_ip_delete,
         name='admin-moderation-blocked-ip-delete'),
]
