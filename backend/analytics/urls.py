"""Analitika API URL'lari. Mount: `/api/analytics/` (olympy_api/urls.py)."""
from django.urls import path

from . import views

urlpatterns = [
    path('metrics/', views.metrics_dashboard, name='analytics-metrics'),
    # Cache'siz, yengil: "hozir onlayn" sanog'i (Boshqaruv paneli har 15 s
    # so'raydi). `metrics/` 10 daqiqa cache'lanadi, shuning uchun alohida.
    path('online/', views.online_users, name='analytics-online'),
    # "Hozir onlayn" kartasi bosilganda ochiladigan ro'yxat: barcha
    # foydalanuvchilar, har birida onlayn/oflayn belgisi (faqat admin).
    path('online/users/', views.online_users_detail, name='analytics-online-users'),
    path('group-stats/', views.group_stats, name='analytics-group-stats'),
    # Admin panel "Tahlil" tabidagi kengaytirilgan diagrammalar (faqat admin).
    path('attempts-trend/', views.attempts_trend, name='analytics-attempts-trend'),
    path('olympiad-stats/', views.olympiad_stats, name='analytics-olympiad-stats'),
    path('question-stats/', views.question_stats, name='analytics-question-stats'),
    path('revenue-trend/', views.revenue_trend, name='analytics-revenue-trend'),
    # Suiiste'mol signallari: bayroq/ogohlantirish dinamikasi, eng ko'p
    # ogohlantirilgan hisoblar va kontent portlashi (faqat o'qish uchun).
    path('abuse-stats/', views.abuse_stats, name='analytics-abuse-stats'),
    # Jonli imtihon va test radar
    path('live-radar/', views.admin_live_radar, name='analytics-live-radar'),
    # So'nggi to'lov tranzaksiyalari (Click / Payme)
    path('recent-transactions/', views.admin_recent_transactions, name='analytics-recent-transactions'),
]
