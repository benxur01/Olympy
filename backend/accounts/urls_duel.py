from django.urls import path

from . import views_duel

# Mounted under /api/duels/
urlpatterns = [
    path('', views_duel.create_duel, name='duel-create'),
    path('<int:duel_id>/', views_duel.duel_detail, name='duel-detail'),
    path('<int:duel_id>/answer/', views_duel.answer_duel, name='duel-answer'),
    path('<int:duel_id>/result/', views_duel.duel_result, name='duel-result'),
]
