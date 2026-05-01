from django.urls import path

from . import views

# Mounted under /api/centers/
urlpatterns = [
    path('', views.centers_list_create, name='centers-list-create'),
    path('<int:center_id>/join/', views.join_center, name='center-join'),
    path('<int:center_id>/approve-student/', views.approve_student, name='approve-student'),
    path('<int:center_id>/approve-teacher/', views.approve_teacher, name='approve-teacher'),
    path('<int:center_id>/approve-manager/', views.approve_manager, name='approve-manager'),
]
