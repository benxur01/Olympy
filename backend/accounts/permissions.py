"""DRF permission class'lari.

Loyihada platforma admini roli ``User.is_platform_admin`` boolean maydoni
orqali ifodalanadi (Django'ning standart ``is_staff``/``is_superuser`` emas).
DRF'ning tayyor ``IsAdminUser`` permission'i esa ``is_staff`` ni tekshiradi —
shu sababli ``is_staff=True, is_platform_admin=False`` foydalanuvchi platforma
metrikasi yoki eksportiga noo'rin kira olardi. ``IsPlatformAdmin`` aynan shu
loyiha rolini tekshiradi.
"""
from rest_framework.permissions import BasePermission


class IsPlatformAdmin(BasePermission):
    """Faqat ``is_platform_admin=True`` foydalanuvchilarga ruxsat beradi."""

    message = 'Faqat platforma administratori uchun.'

    def has_permission(self, request, view):
        user = getattr(request, 'user', None)
        return bool(
            user
            and user.is_authenticated
            and getattr(user, 'is_platform_admin', False)
        )
