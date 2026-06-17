"""Xavfsizlik audit logging — markazlashtirilgan DRF exception handler.

Bu handler barcha DRF endpoint'lar uchun ishlaydi (REST_FRAMEWORK
['EXCEPTION_HANDLER'] orqali ulanadi) va xavfsizlik nuqtai nazaridan muhim
javoblarni 'security' logger'iga yozadi:

  - 403 Forbidden / PermissionDenied — ruxsatsiz urinishlar
  - 429 Too Many Requests — rate limit ishga tushgan holatlar

Har bir yozuvda: HTTP status, so'rov yo'li, metod, mijoz IP'si va (mavjud
bo'lsa) foydalanuvchi identifikatori bo'ladi. Maxfiy ma'lumotlar (parol,
OTP, token) loglanmaydi — faqat meta-ma'lumot.

Handler hech qachon yangi xato chiqarmaydi: logging muvaffaqiyatsiz bo'lsa
ham asosiy javob qaytaveradi.
"""
import logging

from rest_framework.views import exception_handler as drf_exception_handler


security_logger = logging.getLogger('security')


def _client_ip(request):
    """Reverse-proxy (Render) ortidagi haqiqiy mijoz IP'sini aniqlash.

    X-Forwarded-For ni mijoz to'liq nazorat qila olmaydigan tarafdan o'qiymiz.
    Hujumchi `X-Forwarded-For: 1.2.3.4` qo'shsa, Render uni saqlab oxiriga
    real ulanish IP'sini qo'shadi (`1.2.3.4, <real-ip>`). Shuning uchun
    BIRINCHI emas, OXIRGI elementni olamiz — Render proxy zanjirida 1 ta
    hop bor, oxirgi qiymat ishonchli (spoof qilib bo'lmaydi). Header yo'q
    bo'lsa REMOTE_ADDR ga qaytamiz.
    """
    if request is None:
        return '-'
    meta = getattr(request, 'META', {}) or {}
    forwarded = meta.get('HTTP_X_FORWARDED_FOR', '')
    if forwarded:
        parts = [p.strip() for p in forwarded.split(',') if p.strip()]
        if parts:
            return parts[-1]
    return meta.get('REMOTE_ADDR', '-')


def _user_ident(request):
    user = getattr(request, 'user', None)
    if user is not None and getattr(user, 'is_authenticated', False):
        return f'user_id={user.pk}'
    return 'anonymous'


def security_exception_handler(exc, context):
    """DRF default handler + 403/429 holatlarini xavfsizlik logiga yozish."""
    response = drf_exception_handler(exc, context)
    if response is None:
        # DRF ushlamagan xato (5xx) — django.request loggeri o'zi yozadi.
        return response
    try:
        status_code = response.status_code
        if status_code in (403, 429):
            request = context.get('request') if isinstance(context, dict) else None
            view = context.get('view') if isinstance(context, dict) else None
            path = getattr(request, 'path', '-')
            method = getattr(request, 'method', '-')
            view_name = view.__class__.__name__ if view is not None else '-'
            label = 'rate_limit' if status_code == 429 else 'permission_denied'
            security_logger.warning(
                'security event=%s status=%s method=%s path=%s view=%s ip=%s %s',
                label, status_code, method, path, view_name,
                _client_ip(request), _user_ident(request),
            )
    except Exception:
        # Logging asosiy oqimni hech qachon buzmasin.
        pass
    return response
