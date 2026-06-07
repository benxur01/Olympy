"""Top-level URL routing for the Olympy API."""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from accounts import views as account_views
from olympiads.subjects_views import subjects_list_create


urlpatterns = [
    # Eslatma: avval `/admin/` frontend `/admin` sahifasiga redirect qilardi —
    # bu chalkashlik edi (Django admin emas, frontend admin paneliga ketardi).
    # Olib tashlandi: endi `/admin/` route ro'yxatda yo'q va 404 qaytaradi.
    # Haqiqiy Django admin quyidagi noaniq URL'da.
    #
    # Django admin URL'i anonim bruteforce'dan himoyalanish uchun oddiy
    # 'admin/' o'rniga noaniq yo'lga ko'chirilgan. Bu obfuscation — login
    # himoyasini almashtirmaydi, faqat avtomatik skanerlovchi botlar uchun
    # admin login sahifasini topishni qiyinlashtiradi.
    path('olympy-mgmt-2025/', admin.site.urls),
    # Uptime monitoring health check (DB + Redis tekshiruvi). UptimeRobot va
    # Render healthCheckPath shu endpointni so'raydi.
    path('api/health/', account_views.health_check, name='health-check'),
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
    path('api/billing/', include('billing.urls')),
    # A/B testing event tracking (Landing hero CTA). Frontend `/api/ab/...`
    # manziliga yuboradi, shuning uchun to'g'ridan-to'g'ri shu yerda mount.
    path('api/ab/track/', account_views.ab_track_event, name='ab-track-event'),
    path('api/ab/results/', account_views.ab_results, name='ab-results'),

]

import os as _os
import logging as _logging

_logger = _logging.getLogger('olympy')

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
elif not settings.USE_CLOUDINARY:
    # Cloudinary sozlangan production'da (settings.USE_CLOUDINARY=True) bu blok
    # umuman ishlamaydi: media URL'lari to'g'ridan-to'g'ri Cloudinary domeniga
    # ishora qiladi va Django serve() kerak emas (django.views.static.serve
    # production uchun mo'ljallanmagan).
    #
    # USE_CLOUDINARY=False bo'lsagina (Cloudinary yo'q) legacy fallback'ni
    # ko'rib chiqamiz. Render diski persistent emasligi sababli bu vaqtinchalik
    # yechim — restart'da media yo'qoladi. MEDIA_ROOT umuman mavjud bo'lmasa
    # (bo'sh/yangi disk) xizmat qiladigan fayl yo'q, shuning uchun serve()
    # route'ni umuman qo'shmaymiz va bir marta ogohlantiramiz; mavjud bo'lsa
    # (eski deploydan qolgan fayllar bo'lishi mumkin) route'ni qo'shamiz, lekin
    # baribir Cloudinary'ga o'tish kerakligi haqida warning qoldiramiz.
    if _os.path.isdir(settings.MEDIA_ROOT):
        from django.views.static import serve
        from django.urls import re_path
        urlpatterns += [
            re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
        ]
        _logger.warning(
            "Production'da Cloudinary sozlanmagan — media fayllar Django "
            "serve() orqali %s dan beriladi. Bu production uchun "
            "mo'ljallanmagan va Render diski persistent emas (restart'da "
            "fayllar yo'qoladi). CLOUDINARY_CLOUD_NAME env o'rnatib Cloudinary'ga o'ting.",
            settings.MEDIA_ROOT,
        )
    else:
        _logger.warning(
            "Production'da Cloudinary sozlanmagan va MEDIA_ROOT (%s) mavjud emas "
            "— media serve() route qo'shilmadi. Yuklangan fayllar hech qaerdan "
            "ko'rinmaydi. CLOUDINARY_CLOUD_NAME env o'rnatib Cloudinary'ga o'ting.",
            settings.MEDIA_ROOT,
        )
