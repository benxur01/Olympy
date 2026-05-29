from django.urls import path

from . import views
from . import views_premium

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
    path('<int:center_id>/members/<int:membership_id>/group-tag/', views.set_member_group_tag, name='set-member-group-tag'),
    path('students/<int:membership_id>/', views.student_detail, name='student-detail'),
    path('<int:center_id>/managers/create/', views.create_manager, name='create-manager'),
    path('<int:center_id>/teachers/create/', views.create_teacher, name='create-teacher'),
    path('<int:center_id>/approve-student/', views.approve_student, name='approve-student'),
    path('<int:center_id>/approve-teacher/', views.approve_teacher, name='approve-teacher'),
    path('<int:center_id>/approve-manager/', views.approve_manager, name='approve-manager'),
    path('<int:center_id>/stats/', views.center_stats, name='center-stats'),
    path('<int:center_id>/student-dynamics/', views.student_dynamics, name='center-student-dynamics'),
    path('<int:center_id>/top-students/', views.top_students, name='center-top-students'),
    path('<int:center_id>/question-bank/', views.center_question_bank, name='center-question-bank'),
    path('<int:center_id>/question-bank/<int:q_id>/', views.center_question_bank_delete, name='center-question-bank-delete'),
    # Premium analitika va hisobotlar (T1–T7)
    path('<int:center_id>/member-comparison/', views_premium.member_comparison, name='center-member-comparison'),
    path('<int:center_id>/report-pdf/', views_premium.report_pdf, name='center-report-pdf'),
    path('<int:center_id>/report-json/', views_premium.report_json, name='center-report-json'),
    path('<int:center_id>/inactive-students/', views_premium.inactive_students, name='center-inactive-students'),
    path('<int:center_id>/question-analytics/', views_premium.question_analytics, name='center-question-analytics'),
    path('<int:center_id>/tag-comparison/', views_premium.tag_comparison, name='center-tag-comparison'),
    path('<int:center_id>/export-all-results/', views_premium.export_all_results, name='center-export-all-results'),
    path('<int:center_id>/rating-history/', views_premium.rating_history, name='center-rating-history'),
]
