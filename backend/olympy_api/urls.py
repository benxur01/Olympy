"""Top-level URL routing for the Olympy API."""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from django.views.generic import RedirectView

from accounts import views as account_views
from olympiads.subjects_views import subjects_list_create

urlpatterns = [
    path('admin/', RedirectView.as_view(
        url=f'{settings.OLYMPY_FRONTEND_URL}/admin' if settings.OLYMPY_FRONTEND_URL else '/admin',
        permanent=False,
    ), name='frontend-admin'),
    path('django-admin/', admin.site.urls),
    path('api/auth/', include('accounts.urls')),
    path('api/telegram/webhook/', account_views.telegram_webhook, name='telegram-webhook'),
    path('api/telegram/webhook/auth/', account_views.telegram_auth_webhook, name='telegram-auth-webhook'),
    path('api/telegram/webhook/manager/', account_views.telegram_manager_webhook, name='telegram-manager-webhook'),
    path('api/', include('accounts.urls_me')),
    path('api/centers/', include('centers.urls')),
    path('api/admin/centers/', include('centers.urls_admin')),
    path('api/olympiads/', include('olympiads.urls')),
    path('api/questions/', include('questions.urls')),
    path('api/attempts/', include('attempts.urls')),
    path('api/results/', include('attempts.urls_results')),
    path('api/leaderboard/', include('attempts.urls_leaderboard')),
    path('api/manager/', include('attempts.urls_manager')),
    path('api/certificates/', include('attempts.urls_certificates')),
    path('api/notifications/', include('notifications.urls')),
    path('api/subjects/', subjects_list_create, name='subjects-list-create'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
