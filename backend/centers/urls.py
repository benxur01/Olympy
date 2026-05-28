from django.urls import path

from . import views

# Mounted under /api/centers/
urlpatterns = [
    path('', views.centers_list_create, name='centers-list-create'),
    path('ratings/', views.center_ratings, name='center-ratings'),
    path('ranking/', views.center_ranking, name='center-ranking'),
    path('mine/', views.my_centers, name='my-centers'),
    path('<int:center_id>/', views.update_center, name='center-update'),
    path('<int:center_id>/image/', views.update_center_image, name='center-image'),
    path('<int:center_id>/join/', views.join_center, name='center-join'),
    path('<int:center_id>/memberships/pending/', views.pending_memberships, name='pending-memberships'),
    path('<int:center_id>/memberships/staff/', views.staff_memberships, name='staff-memberships'),
    path('<int:center_id>/memberships/students/', views.students_memberships, name='students-memberships'),
    path('<int:center_id>/memberships/<int:membership_id>/', views.remove_membership, name='remove-membership'),
    path('<int:center_id>/members/<int:membership_id>/change-role/', views.change_member_role, name='change-member-role'),
    path('students/<int:membership_id>/', views.student_detail, name='student-detail'),
    path('<int:center_id>/managers/create/', views.create_manager, name='create-manager'),
    path('<int:center_id>/teachers/create/', views.create_teacher, name='create-teacher'),
    path('<int:center_id>/approve-student/', views.approve_student, name='approve-student'),
    path('<int:center_id>/approve-teacher/', views.approve_teacher, name='approve-teacher'),
    path('<int:center_id>/approve-manager/', views.approve_manager, name='approve-manager'),
    path('<int:center_id>/stats/', views.center_stats, name='center-stats'),
]
