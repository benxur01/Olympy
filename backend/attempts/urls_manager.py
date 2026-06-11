from django.urls import path

from . import views, views_essay

# Mounted under /api/manager/
urlpatterns = [
    path('stats/', views.manager_stats, name='manager-stats'),
    path('question-difficulty-stats/', views.question_difficulty_stats, name='question-difficulty-stats'),
    path('olympiads/<int:olympiad_id>/export/', views.export_olympiad_results_xlsx, name='export-results'),
    path('olympiads/<int:olympiad_id>/live/', views.olympiad_live_proctoring, name='olympiad-live-proctoring'),
    # Olimpiadaning barcha essay javoblari — manager "Essay baholash" ro'yxati.
    path(
        'olympiads/<int:olympiad_id>/essay-answers/',
        views_essay.olympiad_essay_answers,
        name='olympiad-essay-answers',
    ),
]
