"""Maxsus rate-limit (throttle) klasslari.

- ``PasswordChangePerUserThrottle`` — autentifikatsiyalangan FOYDALANUVCHI
  bo'yicha. Parolni soatiga ko'pi bilan 5 marta o'zgartirish — abuse va
  parol-urinish skriptlarini to'sadi, oddiy foydalanuvchiga xalal bermaydi.
"""
from rest_framework.throttling import SimpleRateThrottle


class PasswordChangePerUserThrottle(SimpleRateThrottle):
    """Autentifikatsiyalangan foydalanuvchi bo'yicha parol o'zgartirish (5/soat)."""

    scope = 'password_change'

    def get_cache_key(self, request, view):
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return None
        return self.cache_format % {'scope': self.scope, 'ident': user.pk}
