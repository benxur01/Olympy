from django.conf import settings
from django.core.cache import cache
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed


def impersonation_block_key(jti):
    """Bekor qilingan impersonatsiya tokenining cache kaliti.

    Impersonatsiya tokeni (``accounts.views.admin_impersonate_user``) qisqa
    muddatli va refresh'siz, lekin admin "Admin panelga qaytish"ni bosgach uni
    KUTMASDAN o'lik qilish kerak — aks holda token admin brauzerida muddati
    tugagunicha yaroqli qolardi. Foydalanuvchining ``token_version``ini oshirib
    bekor qilib bo'lmaydi: u aybsiz foydalanuvchini barcha qurilmalaridan
    chiqarib yuborardi. Shu sababli faqat SHU tokenning ``jti`` si cache'da
    qora ro'yxatga tushadi (TTL — tokenning qolgan umri, undan keyin token
    baribir o'zi yaroqsiz).
    """
    return f'impersonation_revoked:{jti}'


class OlympyJWTAuthentication(JWTAuthentication):
    """JWT auth with per-user token version checks.

    Every successful login increments ``User.token_version`` and new JWTs carry
    that version. Older tokens are rejected, which keeps one active login set
    per account and reduces account sharing.
    """

    def authenticate(self, request):
        header = self.get_header(request)
        if header is not None:
            return super().authenticate(request)
        raw_token = request.COOKIES.get(getattr(settings, 'JWT_ACCESS_COOKIE_NAME', 'olympy_access'))
        if raw_token is None:
            return None
        try:
            validated_token = self.get_validated_token(raw_token)
            return self.get_user(validated_token), validated_token
        except Exception:
            # Cookie eskirgan yoki yaroqsiz — AllowAny endpoint'larni (login,
            # register) bloklamaslik uchun None qaytaramiz. IsAuthenticated
            # endpoint'lar anonim so'rovni standart DRF 401 bilan rad etadi.
            return None

    def get_user(self, validated_token):
        # Impersonatsiya tokeni erta bekor qilingan bo'lishi mumkin. Tekshiruv
        # FAQAT `impersonated_by` da'vosi bo'lgan tokenlarda bajariladi —
        # oddiy sessiyalar hech qanday qo'shimcha cache so'rovi olmaydi.
        # Cache ishlamasa (Redis o'chgan) tekshiruv o'tib ketadi va token o'z
        # muddati (15 daqiqa) tugaganda yaroqsiz bo'ladi — qora ro'yxat
        # qo'shimcha qatlam, yagona to'siq emas.
        if validated_token.get('impersonated_by'):
            jti = validated_token.get('jti')
            if jti and cache.get(impersonation_block_key(jti)):
                raise AuthenticationFailed(
                    "Impersonatsiya seansi yakunlangan", code='impersonation_ended',
                )
        user = super().get_user(validated_token)
        token_version = validated_token.get('token_version')
        if token_version is None:
            if getattr(user, 'token_version', 0) == 0:
                return user
            raise AuthenticationFailed('Token eskirgan', code='token_stale')
        try:
            token_version = int(token_version)
        except (TypeError, ValueError):
            raise AuthenticationFailed('Token eskirgan', code='token_stale')
        if token_version != getattr(user, 'token_version', 0):
            raise AuthenticationFailed('Token eskirgan', code='token_stale')
        return user
