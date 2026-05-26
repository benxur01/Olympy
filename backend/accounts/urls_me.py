from django.urls import path

from . import views
from . import views_parent

urlpatterns = [
    path('me/', views.me, name='me'),
    path('me/parent/link/', views_parent.link_child, name='parent-link-child'),
    path('me/parent/link/<int:student_id>/', views_parent.unlink_child, name='parent-unlink-child'),
    path('me/parent/children/', views_parent.list_children, name='parent-list-children'),
    path('me/parent/children/<int:student_id>/report/', views_parent.child_report_pdf, name='parent-child-report-pdf'),
    path('me/parent/children/<int:student_id>/predictions/', views_parent.predict_child_success, name='parent-child-predictions'),
    path('me/parent/children/<int:student_id>/toggle-digest/', views_parent.toggle_weekly_digest, name='parent-child-toggle-digest'),
    path('me/parent/children/<int:student_id>/test-digest/', views_parent.send_test_weekly_digest, name='parent-child-test-digest'),
    path('me/predictions/', views.get_my_predictions, name='my-predictions'),
    path('me/activity-leaderboard/', views.activity_leaderboard, name='activity-leaderboard'),
    path('me/rewards/', views.list_rewards, name='rewards-list'),
    path('me/rewards/redeem/', views.redeem_reward, name='rewards-redeem'),
    path('me/rewards/my-redemptions/', views.my_redemptions, name='rewards-my-redemptions'),
    path('admin/users/', views.admin_users_list, name='admin-users-list'),
    path('admin/users/<int:user_id>/set-active/', views.admin_set_user_active,
         name='admin-set-user-active'),
]

