from django.urls import path

from . import export_views
from . import views
from . import views_duel
from . import views_me_premium
from . import views_parent
from . import views_retention
from . import views_student

urlpatterns = [
    path('me/', views.me, name='me'),
    # Retention funksiyalar (Onboarding / Daily hooks / Long-term)
    path('me/complete-onboarding/', views_retention.complete_onboarding, name='me-complete-onboarding'),
    path('me/peer-comparison/', views_retention.peer_comparison, name='me-peer-comparison'),
    path('me/suggested-olympiad/', views_retention.suggested_olympiad, name='me-suggested-olympiad'),
    path('me/rival-activity/', views_retention.rival_activity, name='me-rival-activity'),
    path('me/streak-warning/', views_retention.streak_warning, name='me-streak-warning'),
    path('me/roadmap/', views_retention.roadmap, name='me-roadmap'),
    path('me/progress-comparison/', views_retention.progress_comparison, name='me-progress-comparison'),
    path('me/classmates-leaderboard/', views_retention.classmates_leaderboard, name='me-classmates-leaderboard'),
    path('onboarding/mini-test/', views_retention.onboarding_mini_test, name='onboarding-mini-test'),
    path('onboarding/mini-test/submit/', views_retention.onboarding_mini_test_submit, name='onboarding-mini-test-submit'),
    path('daily-questions/', views_retention.daily_questions, name='daily-questions'),
    path('daily-questions/stats/', views_retention.daily_questions_stats, name='daily-questions-stats'),
    path('daily-questions/<int:daily_id>/answer/', views_retention.daily_question_answer, name='daily-question-answer'),
    path('weekly-contest/', views_retention.weekly_contest, name='weekly-contest'),
    path('weekly-contest/history/', views_retention.weekly_contest_history, name='weekly-contest-history'),
    path('olympiad-calendar/', views_retention.olympiad_calendar, name='olympiad-calendar'),
    # Yangi premium funksiyalar (O1–O7)
    path('me/streak/', views_me_premium.my_streak, name='me-streak'),
    path('me/rivals/', views_me_premium.rivals, name='me-rivals'),
    path('me/rivals/<int:rival_id>/', views_me_premium.remove_rival, name='me-remove-rival'),
    path('me/subject-readiness/', views_me_premium.subject_readiness, name='me-subject-readiness'),
    path('me/achievements/', views_me_premium.my_achievements, name='me-achievements'),
    path('me/weekly-summary/', views_me_premium.weekly_summary, name='me-weekly-summary'),
    path('me/recommended-olympiads/', views_me_premium.recommended_olympiads, name='me-recommended-olympiads'),
    # Yangi 12-funksiya spec (O'quvchilar: O1–O6)
    path('me/error-notebook/', views_me_premium.error_notebook, name='me-error-notebook'),
    path('me/daily-goal/', views_me_premium.daily_goal, name='me-daily-goal'),
    path('me/strength-card/', views_me_premium.strength_card, name='me-strength-card'),
    path('me/olympiad-prep-plan/', views_me_premium.olympiad_prep_plan, name='me-olympiad-prep-plan'),
    path('me/ai-audio-analysis/', views_me_premium.ai_audio_analysis, name='me-ai-audio-analysis'),
    path('me/duels/', views_duel.my_duels, name='me-duels'),
    path('me/history-chart/', views_student.history_chart, name='me-history-chart'),
    path('me/competitor-analysis/', views_student.competitor_analysis, name='me-competitor-analysis'),
    path('me/subject-weakness/', views_student.subject_weakness, name='me-subject-weakness'),
    path('me/readiness/', views_student.readiness, name='me-readiness'),
    path('me/study-plan/', views_student.study_plan, name='me-study-plan'),
    path('me/parent/link/', views_parent.link_child, name='parent-link-child'),
    path('me/parent/link/<int:student_id>/', views_parent.unlink_child, name='parent-unlink-child'),
    path('me/parent/children/', views_parent.list_children, name='parent-list-children'),
    path('me/parent/children/<int:student_id>/report/', views_parent.child_report_pdf, name='parent-child-report-pdf'),
    path('me/parent/children/<int:student_id>/predictions/', views_parent.predict_child_success, name='parent-child-predictions'),
    path('me/parent/children/<int:student_id>/toggle-digest/', views_parent.toggle_weekly_digest, name='parent-child-toggle-digest'),
    path('me/parent/children/<int:student_id>/test-digest/', views_parent.send_test_weekly_digest, name='parent-child-test-digest'),
    path('me/parent-requests/', views_parent.list_parent_requests, name='parent-requests-list'),
    path('me/parent-requests/<int:link_id>/respond/', views_parent.respond_parent_request, name='parent-requests-respond'),
    path('me/confirm-parent/', views_parent.confirm_parent, name='confirm-parent'),
    path('me/predictions/', views.get_my_predictions, name='my-predictions'),
    path('me/activity-leaderboard/', views.activity_leaderboard, name='activity-leaderboard'),
    path('me/rewards/', views.list_rewards, name='rewards-list'),
    path('me/rewards/redeem/', views.redeem_reward, name='rewards-redeem'),
    path('me/rewards/my-redemptions/', views.my_redemptions, name='rewards-my-redemptions'),
    # Excel eksport (markaz a'zolari / olimpiada natijalari).
    path('export/center/<int:center_id>/members/', export_views.export_center_members_excel,
         name='export-center-members'),
    path('export/olympiad/<int:olympiad_id>/results/', export_views.export_olympiad_results_excel,
         name='export-olympiad-results'),
    path('admin/users/', views.admin_users_list, name='admin-users-list'),
    path('admin/users/<int:user_id>/set-active/', views.admin_set_user_active,
         name='admin-set-user-active'),
    path('admin/users/<int:user_id>/toggle-premium/', views.admin_toggle_user_premium,
         name='admin-toggle-user-premium'),
    path('admin/audit-log/', views.audit_log_list, name='admin-audit-log'),
]

