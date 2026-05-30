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
    # Django admin URL'i anonim bruteforce'dan himoyalanish uchun oddiy
    # 'django-admin/' o'rniga noaniq yo'lga ko'chirildi. Eski 'django-admin/'
    # endi 404 qaytaradi (route ro'yxatda yo'q). Bu obfuscation — login
    # himoyasini almashtirmaydi, faqat avtomatik skanerlovchi botlar uchun
    # admin login sahifasini topishni qiyinlashtiradi.
    path('olympy-mgmt-2025/', admin.site.urls),
    path('api/auth/', include('accounts.urls')),
    path('api/telegram/webhook/', account_views.telegram_webhook, name='telegram-webhook'),
    path('api/telegram/webhook/auth/', account_views.telegram_auth_webhook, name='telegram-auth-webhook'),
    path('api/telegram/webhook/manager/', account_views.telegram_manager_webhook, name='telegram-manager-webhook'),
    path('api/', include('accounts.urls_me')),
    path('api/duels/', include('accounts.urls_duel')),
    path('api/center/shop/', include('accounts.urls_shop')),
    path('api/shop/', include('accounts.urls_shop_student')),
    path('api/centers/', include('centers.urls')),
    path('api/mock-olympiads/', include('centers.urls_mock')),
    path('api/admin/centers/', include('centers.urls_admin')),
    path('api/olympiads/', include('olympiads.urls')),
    path('api/questions/', include('questions.urls')),
    path('api/attempts/', include('attempts.urls')),
    path('api/results/', include('attempts.urls_results')),
    path('api/leaderboard/', include('attempts.urls_leaderboard')),
    path('api/manager/', include('attempts.urls_manager')),
    path('api/certificates/', include('attempts.urls_certificates')),
    path('api/practice/', include('practice.urls')),
    path('api/notifications/', include('notifications.urls')),
    path('api/subjects/', subjects_list_create, name='subjects-list-create'),
]

import os as _os

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
elif not _os.environ.get('CLOUDINARY_CLOUD_NAME'):
    # Production'da media odatda Cloudinary (yoki S3) orqali xizmat qilinadi —
    # bunda yuklangan fayl URL'lari to'g'ridan-to'g'ri storage domeniga ishora
    # qiladi va bu route umuman ishlatilmaydi. Cloudinary sozlanmagan eski
    # deploylar buzilmasligi uchun (media fayllar hech qaerdan kelmasligini
    # oldini olish) faqat shu holatda legacy `serve()` fallback qoldiriladi.
    # Eslatma: django.views.static.serve production uchun mo'ljallanmagan —
    # Render diski persistent emasligi sababli Cloudinary'ga o'tish tavsiya
    # etiladi (settings.py ham bu haqda ogohlantiradi).
    from django.views.static import serve
    from django.urls import re_path
    urlpatterns += [
        re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
    ]
