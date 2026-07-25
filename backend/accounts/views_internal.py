"""Internal, server-to-server endpoints (NOT public API surface).

Currently: JWT introspection for the Java "Brain Battles" real-time duel
service. The Spring service does NOT verify JWTs on its own — it forwards the
raw token here and trusts our answer. Django stays the single source of truth
for token validity (including per-user ``token_version`` revocation).

Every endpoint here is gated behind a shared secret header
(``X-Internal-Service-Secret``) compared against ``settings.INTERNAL_SERVICE_SECRET``.
This is a coarse network-perimeter control for service-to-service calls, not a
replacement for the JWT check itself.
"""
import hmac

from django.conf import settings
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .authentication import OlympyJWTAuthentication


def internal_secret_ok(request):
    """Constant-time compare of the shared-secret header.

    Fails closed: if no secret is configured server-side, every call is
    rejected (returns False) rather than silently allowing access.
    """
    expected = getattr(settings, 'INTERNAL_SERVICE_SECRET', '') or ''
    if not expected:
        return False
    provided = request.headers.get('X-Internal-Service-Secret', '') or ''
    return hmac.compare_digest(provided, expected)


@api_view(['POST'])
@authentication_classes([])  # No auth on the endpoint itself — the body carries the token.
@permission_classes([AllowAny])
def introspect(request):
    """POST /api/accounts/introspect/ — validate a JWT on behalf of a service.

    Body: ``{"token": "<access jwt>"}``.
    Returns ``{"valid": true, "user_id": <id>, "phone": "<phone>"}`` for a
    valid, non-revoked access token, or ``{"valid": false}`` otherwise.

    An invalid/expired/tampered token is NOT an error — it returns
    ``{"valid": false}`` with HTTP 200, never a 500. Only a missing/wrong
    shared secret produces 403.
    """
    if not internal_secret_ok(request):
        return Response({'detail': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)

    token = (request.data or {}).get('token') or ''
    if not token:
        return Response({'valid': False})

    auth = OlympyJWTAuthentication()
    try:
        # Reuse the EXACT existing validation + token_version revocation logic:
        # get_validated_token() checks signature/expiry, get_user() enforces the
        # per-user token_version (rejecting stale tokens after logout/block).
        validated_token = auth.get_validated_token(token)
        user = auth.get_user(validated_token)
    except Exception:
        return Response({'valid': False})

    if not getattr(user, 'is_active', False):
        return Response({'valid': False})

    return Response({
        'valid': True,
        'user_id': user.id,
        'phone': user.phone,
    })
