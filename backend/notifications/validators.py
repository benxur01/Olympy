"""Web Push endpoint validatsiyasi (SSRF himoyasi).

`subscribe_push` foydalanuvchidan kelgan endpoint URL'ini bevosita
`PushSubscription` ga saqlaydi, `send_web_push` esa keyinchalik server
nomidan o'sha URL'ga POST yuboradi. Tekshiruvsiz bu SSRF bo'ladi: oddiy
autentifikatsiyalangan foydalanuvchi serverni ixtiyoriy manzilga so'rov
yuborishga majburlaydi (ichki port skanerlash, bulut metadata endpoint'i,
DoS-relay).

Shu sababli endpoint ikki joyda tekshiriladi — yozishda (400 qaytadi) va
yuborishda (bazada qolib ketgan eski/yomon yozuvlar uchun). Tekshiruv
mantig'i faqat shu modulda.
"""
from urllib.parse import urlsplit

from django.conf import settings

# Ma'lum brauzer push xizmatlari. `*.` prefiksi — subdomen wildcard'i:
# host aynan baza domen yoki uning subdomeni bo'lishi kerak (oddiy
# `endswith` emas — `evilnotify.windows.com` o'tib ketmasligi uchun).
DEFAULT_PUSH_ENDPOINT_ALLOWED_HOSTS = (
    'fcm.googleapis.com',
    'updates.push.services.mozilla.com',
    '*.notify.windows.com',
    'web.push.apple.com',
    '*.push.apple.com',
)


def get_allowed_push_hosts():
    """Ruxsat etilgan push host'lari.

    `settings.PUSH_ENDPOINT_ALLOWED_HOSTS` berilgan bo'lsa (deploy paytida
    ro'yxatni kengaytirish uchun) o'sha ishlatiladi, aks holda yuqoridagi
    xavfsiz default.
    """
    return (
        getattr(settings, 'PUSH_ENDPOINT_ALLOWED_HOSTS', None)
        or DEFAULT_PUSH_ENDPOINT_ALLOWED_HOSTS
    )


def _host_matches(host, pattern):
    pattern = (pattern or '').strip().lower().rstrip('.')
    if not pattern:
        return False
    if pattern.startswith('*.'):
        base = pattern[2:]
        return bool(base) and (host == base or host.endswith('.' + base))
    return host == pattern


def _split(endpoint):
    if not endpoint or not isinstance(endpoint, str):
        return None
    try:
        return urlsplit(endpoint.strip())
    except ValueError:
        return None


def push_endpoint_host(endpoint):
    """Endpoint URL'ining normallashtirilgan host'i (o'qib bo'lmasa '').

    Faqat diagnostika (log) uchun — ruxsat qarorini `is_allowed_push_endpoint`
    qabul qiladi.
    """
    parts = _split(endpoint)
    if parts is None:
        return ''
    # `.hostname` userinfo'ni ("https://fcm.googleapis.com@evil.tld/") va
    # portni tashlab, faqat haqiqiy host'ni qaytaradi.
    return (parts.hostname or '').lower().rstrip('.')


def is_allowed_push_endpoint(endpoint):
    """Endpoint https bo'lib, ishonchli push xizmatiga tegishlimi."""
    parts = _split(endpoint)
    if parts is None or parts.scheme != 'https':
        return False
    host = push_endpoint_host(endpoint)
    if not host:
        return False
    return any(_host_matches(host, pattern) for pattern in get_allowed_push_hosts())
