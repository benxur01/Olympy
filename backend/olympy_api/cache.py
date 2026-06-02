"""Xatoga chidamli (resilient) cache backend.

Production'da CACHES Redis'ga ulanadi (REDIS_URL / CELERY_BROKER_URL).
Render free tier'da Redis instansiyasi vaqtincha to'xtashi, o'chirilishi yoki
URL eskirib qolishi mumkin. Standart RedisCache bunday holatda har bir
`cache.get()` chaqirig'ida `redis.ConnectionError` ko'taradi.

Muammo shundaki, DRF throttling (`rest_framework.throttling`) HAR BIR API
so'rovida `cache.get()` chaqiradi — natijada Redis bir lahza uzilsa login,
register va butun API 500 (Internal Server Error) qaytaradi. Ya'ni cache —
ixtiyoriy optimizatsiya bo'lsa-da, uning uzilishi butun saytni o'chiradi.

Bu backend Redis xatolarini ushlab, jim ravishda "cache yo'q" holatiga
o'tadi: `get` default qiymatni qaytaradi, `set`/`delete` esa hech narsa
qilmaydi. Natijada Redis uzilganda:
  - Sayt ishlashda davom etadi (login/register yiqilmaydi).
  - Rate-limit / login-lockout vaqtincha kuchsizlanadi (Redis qaytguncha),
    bu xavfsizlikning yengil va vaqtinchalik pasayishi — to'liq autage'dan
    afzal.
Har bir uzilish `security`/`olympy.cache` loggeriga WARNING bilan yoziladi.
"""
import logging

from django.core.cache.backends.base import DEFAULT_TIMEOUT
from django.core.cache.backends.redis import RedisCache

logger = logging.getLogger('olympy.cache')

try:  # redis paketi har doim o'rnatilgan, lekin import himoyasini qo'yamiz
    from redis.exceptions import RedisError
except Exception:  # pragma: no cover - redis yo'q bo'lsa
    class RedisError(Exception):
        pass

# Redis bilan bog'liq, lekin RedisError'dan meros olmaydigan ulanish
# xatolari ham bor (masalan socket darajasidagi OSError/ConnectionError).
_SWALLOWED_ERRORS = (RedisError, ConnectionError, OSError, TimeoutError)


class ResilientRedisCache(RedisCache):
    """Redis ulanishi uzilganda yiqilmasdan ishlaydigan cache.

    Faqat ulanish/IO darajasidagi xatolar yutiladi. Dasturlash xatolari
    (noto'g'ri argument va h.k.) odatdagidek ko'tariladi — ular yashirin
    qolmasligi kerak.
    """

    _degraded_logged = False

    def _on_error(self, op, exc):
        # Spam'ni oldini olish uchun birinchi marta WARNING, keyin DEBUG.
        if not ResilientRedisCache._degraded_logged:
            ResilientRedisCache._degraded_logged = True
            logger.warning(
                'Redis cache ishlamayapti (%s): %s — sayt cache\'siz ishlashda '
                'davom etadi (rate-limit vaqtincha kuchsiz).', op, exc,
            )
        else:
            logger.debug('Redis cache %s xatosi: %s', op, exc)

    def get(self, key, default=None, version=None):
        try:
            return super().get(key, default, version)
        except _SWALLOWED_ERRORS as exc:
            self._on_error('get', exc)
            return default

    def set(self, key, value, timeout=DEFAULT_TIMEOUT, version=None):
        try:
            return super().set(key, value, timeout=timeout, version=version)
        except _SWALLOWED_ERRORS as exc:
            self._on_error('set', exc)
            return False

    def add(self, key, value, timeout=DEFAULT_TIMEOUT, version=None):
        try:
            return super().add(key, value, timeout=timeout, version=version)
        except _SWALLOWED_ERRORS as exc:
            self._on_error('add', exc)
            return False

    def delete(self, key, version=None):
        try:
            return super().delete(key, version=version)
        except _SWALLOWED_ERRORS as exc:
            self._on_error('delete', exc)
            return False

    def get_many(self, keys, version=None):
        try:
            return super().get_many(keys, version=version)
        except _SWALLOWED_ERRORS as exc:
            self._on_error('get_many', exc)
            return {}

    def set_many(self, data, timeout=DEFAULT_TIMEOUT, version=None):
        try:
            return super().set_many(data, timeout=timeout, version=version)
        except _SWALLOWED_ERRORS as exc:
            self._on_error('set_many', exc)
            return list(data)

    def incr(self, key, delta=1, version=None):
        try:
            return super().incr(key, delta=delta, version=version)
        except _SWALLOWED_ERRORS as exc:
            self._on_error('incr', exc)
            return None

    def touch(self, key, timeout=DEFAULT_TIMEOUT, version=None):
        try:
            return super().touch(key, timeout=timeout, version=version)
        except _SWALLOWED_ERRORS as exc:
            self._on_error('touch', exc)
            return False

    def clear(self):
        try:
            return super().clear()
        except _SWALLOWED_ERRORS as exc:
            self._on_error('clear', exc)
            return False
