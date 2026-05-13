from django.conf import settings
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed


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
