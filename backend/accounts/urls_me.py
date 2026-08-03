from django.urls import path

from attempts import views_admin as attempts_admin_views
from billing import views as billing_views

from . import export_views
from . import views
from . import views_b2b
from . import views_me_premium
from . import views_retention
from . import views_security
from . import views_student
from . import views_support

urlpatterns = [
    path('me/', views.me, name='me'),
    # B2B markaz onboarding (owner), o'qituvchi roli va referral (Feature #1/#3/#7)
    path('me/center-onboarding/', views_b2b.center_onboarding, name='me-center-onboarding'),
    path('me/manager-onboarding/', views_b2b.manager_onboarding, name='me-manager-onboarding'),
    path('me/teacher-onboarding/', views_b2b.teacher_onboarding, name='me-teacher-onboarding'),
    path('me/teacher/students/', views_b2b.teacher_students, name='me-teacher-students'),
    # Teacher/Owner: bitta o'quvchi batafsil profili (StudentDetailDrawer).
    path('me/students/<int:user_id>/', views_student.student_detail, name='me-student-detail'),
    path('me/teacher/olympiads/', views_b2b.teacher_olympiads, name='me-teacher-olympiads'),
    path('me/referral/', views_b2b.my_referral, name='me-referral'),
    path('me/referral/use/', views_b2b.use_referral, name='me-referral-use'),
    # Retention funksiyalar (Onboarding / Daily hooks / Long-term)
    path('me/complete-onboarding/', views_retention.complete_onboarding, name='me-complete-onboarding'),
    path('me/peer-comparison/', views_retention.peer_comparison, name='me-peer-comparison'),
    path('me/suggested-olympiad/', views_retention.suggested_olympiad, name='me-suggested-olympiad'),
    path('me/rival-activity/', views_retention.rival_activity, name='me-rival-activity'),
    path('me/streak-warning/', views_retention.streak_warning, name='me-streak-warning'),
    path('me/progress-comparison/', views_retention.progress_comparison, name='me-progress-comparison'),
    path('me/classmates-leaderboard/', views_retention.classmates_leaderboard, name='me-classmates-leaderboard'),
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
    path('me/recommended-olympiads/', views_me_premium.recommended_olympiads, name='me-recommended-olympiads'),
    # Yangi 12-funksiya spec (O'quvchilar: O1–O6)
    path('me/error-notebook/', views_me_premium.error_notebook, name='me-error-notebook'),
    path('me/daily-goal/', views_me_premium.daily_goal, name='me-daily-goal'),
    path('me/strength-card/', views_me_premium.strength_card, name='me-strength-card'),
    path('me/olympiad-prep-plan/', views_me_premium.olympiad_prep_plan, name='me-olympiad-prep-plan'),
    path(
        'me/olympiad-prep-plan/<str:task_id>/status/',
        views_me_premium.olympiad_prep_plan_status,
        name='me-olympiad-prep-plan-status',
    ),
    path('me/ai-audio-analysis/', views_me_premium.ai_audio_analysis, name='me-ai-audio-analysis'),
    path(
        'me/ai-audio-analysis/<str:task_id>/status/',
        views_me_premium.ai_audio_analysis_status,
        name='me-ai-audio-analysis-status',
    ),
    path('me/history-chart/', views_student.history_chart, name='me-history-chart'),
    path('me/score-timeline/', views_student.score_timeline, name='me-score-timeline'),
    path('me/weakest-topics/', views_student.weakest_topics, name='me-weakest-topics'),
    path('me/competitor-analysis/', views_student.competitor_analysis, name='me-competitor-analysis'),
    path('me/subject-weakness/', views_student.subject_weakness, name='me-subject-weakness'),
    path('me/readiness/', views_student.readiness, name='me-readiness'),
    path('me/study-plan/', views_student.study_plan, name='me-study-plan'),
    path(
        'me/study-plan/<str:task_id>/status/',
        views_student.study_plan_status,
        name='me-study-plan-status',
    ),
    path('me/custom-test/', views_student.custom_ai_test, name='me-custom-test'),
    path('me/practice-quota/', views_student.practice_quota, name='me-practice-quota'),
    path('me/weekly-report/', views_student.weekly_report_pdf, name='me-weekly-report'),
    path('me/portfolio/', views_student.portfolio_pdf, name='me-portfolio'),
    # Student Progress Dashboard (premium emas) + oddiy AI tavsiyalar.
    path('me/progress/', views_student.progress_dashboard, name='me-progress'),
    path('me/ai-advice/', views_student.ai_advice, name='me-ai-advice'),
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
    # Ro'yxatning CSV eksporti — `admin/users/` bilan bir xil `?search=` filtri
    # qabul qiladi (admin ekranda ko'rgan to'plamni yuklab oladi).
    path('admin/users/export/', views.admin_users_export, name='admin-users-export'),
    # Ommaviy amallar — id ro'yxati bo'yicha (bitta foydalanuvchilik
    # endpointlardan farqli o'laroq URL'da user_id yo'q). `<int:user_id>`
    # yo'llaridan OLDIN turadi degan talab yo'q (int konvertori harfli
    # segmentga mos kelmaydi), lekin o'qish uchun ro'yxat boshida.
    path('admin/users/bulk-set-active/', views.admin_bulk_set_user_active,
         name='admin-bulk-set-user-active'),
    path('admin/users/bulk-set-roles/', views.admin_bulk_set_user_roles,
         name='admin-bulk-set-user-roles'),
    # Takrorlangan hisoblarni birlashtirish (SIM yo'qotib qayta ro'yxatdan
    # o'tgan o'quvchi). Avval `preview` — hech narsani o'zgartirmaydigan quruq
    # yurish, keyin `commit` — bitta tranzaksiyadagi haqiqiy amal.
    path('admin/users/merge/preview/', views.admin_merge_users_preview,
         name='admin-merge-users-preview'),
    path('admin/users/merge/commit/', views.admin_merge_users_commit,
         name='admin-merge-users-commit'),
    # Bitta foydalanuvchining to'liq profili — admin paneldagi "Batafsil" oynasi.
    path('admin/users/<int:user_id>/', views.admin_user_detail, name='admin-user-detail'),
    # "Batafsil" oynasining to'lovlar/kirish tarixi bloklari. Alohida
    # endpointlar: ikkalasi ham uzun bo'lishi mumkin va profilning o'zi
    # ularsiz ham ochilishi kerak. To'lov mantiqi billing app'da qoladi
    # (o'sha serializerlar), lekin URL boshqa admin amallari bilan bir joyda.
    path('admin/users/<int:user_id>/billing-history/', billing_views.admin_user_billing_history,
         name='admin-user-billing-history'),
    path('admin/users/<int:user_id>/login-history/', views.admin_user_login_history,
         name='admin-user-login-history'),
    # "Batafsil" oynasidagi "Kontent va faollik" bloki: hisob nima yaratgani
    # (savol/olimpiada) va nima topshirgani (urinishlar). Ikkinchi yo'l shu
    # ro'yxatdagi BITTA elementni hisobga tegmasdan o'chiradi — element aynan
    # shu foydalanuvchiniki bo'lishi shart, shu sababli `user_id` URL'da.
    path('admin/users/<int:user_id>/content-history/', views.admin_user_content_history,
         name='admin-user-content-history'),
    path('admin/users/<int:user_id>/content/<str:content_type>/<int:content_id>/',
         views.admin_delete_user_content, name='admin-delete-user-content'),
    # Bloklashdan oldingi qadam: rasmiy ogohlantirish yuborish va shu
    # foydalanuvchiga avval yuborilganlarini ko'rish ("Batafsil" oynasi).
    path('admin/users/<int:user_id>/warn/', views.admin_warn_user,
         name='admin-warn-user'),
    path('admin/users/<int:user_id>/warnings/', views.admin_user_warnings,
         name='admin-user-warnings'),
    # Faol seanslar ro'yxati va BITTA seansni yakunlash. Pastdagi
    # `.../force-logout/` (token_version bump) barcha qurilmalarni chiqaradi,
    # bu esa faqat tanlangan qurilmani — ikkalasi alohida amal.
    path('admin/users/<int:user_id>/sessions/', views.admin_user_sessions,
         name='admin-user-sessions'),
    path('admin/users/<int:user_id>/sessions/<int:login_event_id>/force-logout/',
         views.admin_force_logout_session, name='admin-force-logout-session'),
    path('admin/users/<int:user_id>/set-active/', views.admin_set_user_active,
         name='admin-set-user-active'),
    # Hisobni admin nomidan o'chirish (soft-delete, grace ichida tiklanadi) —
    # o'z-o'ziga xizmat qiladigan `auth/me/` DELETE ning support yo'li.
    # Bloklashning o'rnini bosmaydi, shuning uchun alohida amal.
    path('admin/users/<int:user_id>/delete/', views.admin_delete_user,
         name='admin-delete-user'),
    path('admin/users/<int:user_id>/toggle-premium/', views.admin_toggle_user_premium,
         name='admin-toggle-user-premium'),
    path('admin/users/<int:user_id>/set-roles/', views.admin_set_user_roles,
         name='admin-set-user-roles'),
    # Hisobni tiklash (support): raqamini yo'qotgan foydalanuvchi uchun
    # o'z-o'ziga xizmat yo'li yo'q — admin qo'lda tiklaydi.
    path('admin/users/<int:user_id>/reset-password/', views.admin_reset_user_password,
         name='admin-reset-user-password'),
    path('admin/users/<int:user_id>/change-phone/', views.admin_change_user_phone,
         name='admin-change-user-phone'),
    # Autentifikator ilovasini yo'qotgan foydalanuvchi uchun: o'z-o'ziga xizmat
    # qiladigan 2FA o'chirish joriy kod yoki parolni talab qiladi.
    path('admin/users/<int:user_id>/reset-2fa/', views.admin_reset_user_totp,
         name='admin-reset-user-totp'),
    # Bloklamasdan barcha qurilmalardan chiqarish (token_version bump).
    path('admin/users/<int:user_id>/force-logout/', views.admin_force_logout_user,
         name='admin-force-logout-user'),
    # Support uchun "foydalanuvchi sifatida ko'rish": qisqa muddatli, faqat
    # maqsadli foydalanuvchi huquqidagi access token. `.../impersonate/end/`
    # `<int:user_id>` yo'lidan keyin turishi muhim emas (yo'l aniq matn
    # bo'yicha mos keladi), lekin juftlik sifatida yonma-yon turadi.
    path('admin/users/<int:user_id>/impersonate/', views.admin_impersonate_user,
         name='admin-impersonate-user'),
    path('admin/users/<int:user_id>/impersonate/end/', views.admin_end_impersonation,
         name='admin-end-impersonation'),
    path('admin/audit-log/', views.audit_log_list, name='admin-audit-log'),
    # "Xavfsizlik" tabi — foydalanuvchilar bo'yicha kuzatuv bloklari.
    # `<str:ip_address>` IPv6 uchun ham yetarli: Django'ning `str`
    # konvertori bo'sh bo'lmagan va `/` ichida bo'lmagan har qanday matnni
    # (shu jumladan ikki nuqtali `2001:db8::1` ni) qamrab oladi.
    path('admin/security/shared-ip/', views_security.admin_shared_ip_accounts,
         name='admin-shared-ip-accounts'),
    path('admin/security/shared-ip/<str:ip_address>/', views_security.admin_shared_ip_detail,
         name='admin-shared-ip-detail'),
    # Barcha markazlar bo'yicha diskvalifikatsiya/tekshiruv kutayotgan
    # sessiyalar. View `attempts` app'ida (ma'lumot o'sha yerda), lekin URL
    # boshqa admin amallari bilan bir joyda — to'lovlar tarixidagi kabi.
    path('admin/attempts/cheating-overview/', attempts_admin_views.admin_cheating_overview,
         name='admin-cheating-overview'),
    path('support/chat/', views_support.support_chat, name='support-chat'),
    path('admin/support/chats/', views_support.admin_support_threads, name='admin-support-chats'),
    path('admin/support/chats/<str:chat_key>/', views_support.admin_support_thread_detail, name='admin-support-chat-detail'),
    path('admin/support/chats/<str:chat_key>/reply/', views_support.admin_support_send_reply, name='admin-support-chat-reply'),
]

