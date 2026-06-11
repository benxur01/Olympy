from django.urls import path

from . import views, views_essay

# Mounted under /api/attempts/
urlpatterns = [
    path('cheating/', views.report_cheating, name='report-cheating'),
    path('ping/', views.test_session_ping, name='test-session-ping'),
    path('mistakes/', views.get_mistakes_list, name='mistakes-list'),
    path('mistakes/explain/', views.explain_all_mistakes, name='mistakes-explain-all'),
    path('<int:attempt_id>/ai-analysis/', views.attempt_ai_analysis, name='attempt-ai-analysis'),
    # Essay savollarni qo'lda baholash (teacher/manager).
    path(
        '<int:attempt_id>/essay-answers/',
        views_essay.attempt_essay_answers,
        name='attempt-essay-answers',
    ),
    path(
        '<int:attempt_id>/essay-answers/<int:question_id>/grade/',
        views_essay.grade_essay_answer,
        name='grade-essay-answer',
    ),
    path('<int:attempt_id>/', views.attempt_detail, name='attempt-detail'),
    path('', views.submit_attempt, name='submit-attempt'),
]
