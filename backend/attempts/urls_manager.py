from django.urls import path

from . import views, views_essay

# Mounted under /api/manager/
urlpatterns = [
    path('stats/', views.manager_stats, name='manager-stats'),
    path('question-difficulty-stats/', views.question_difficulty_stats, name='question-difficulty-stats'),
    path('olympiads/<int:olympiad_id>/export/', views.export_olympiad_results_xlsx, name='export-results'),
    path('olympiads/<int:olympiad_id>/live/', views.olympiad_live_proctoring, name='olympiad-live-proctoring'),
    # Jonli nazoratdan imtihonni to'xtatish (chiqarish yoki diskvalifikatsiya).
    # Yo'lda olympiad_id yo'q — sessiya olimpiadani FK orqali o'zi biladi.
    path(
        'live-proctoring/<int:session_id>/terminate/',
        views.manager_live_proctoring_terminate,
        name='manager-live-proctoring-terminate',
    ),
    # O'quvchining tadbirdagi har bir savol bo'yicha javobi (manager natijalar
    # modalida o'quvchi qatoriga bosilganda "O'quvchi tahlili" modali uchun).
    path(
        'event-results/<int:olympiad_id>/user/<int:user_id>/',
        views.event_user_answers,
        name='event-user-answers',
    ),
    # Olimpiadaning barcha essay javoblari — manager "Essay baholash" ro'yxati.
    path(
        'olympiads/<int:olympiad_id>/essay-answers/',
        views_essay.olympiad_essay_answers,
        name='olympiad-essay-answers',
    ),
]
