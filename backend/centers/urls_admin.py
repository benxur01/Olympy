from django.urls import path

from . import views

# Mounted under /api/admin/centers/
urlpatterns = [
    path('', views.admin_list_centers, name='admin-center-list'),
    path('<int:center_id>/approve/', views.admin_approve_center, name='admin-approve-center'),
    path('<int:center_id>/reject/', views.admin_reject_center, name='admin-reject-center'),
]
