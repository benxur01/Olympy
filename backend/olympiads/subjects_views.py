"""Subjects endpoint.

Subjects are denormalized: every Olympiad/Question/CenterMembership stores a
``subject`` string. There is no canonical Subject model. This endpoint
collects the distinct values from the existing rows so the admin panel can
render a real list instead of a hard-coded array.

Adding a subject from the admin UI is a no-op on the backend today —
new subjects appear automatically once they're used on a question or
olympiad. A POST endpoint is exposed for forward compatibility but it just
records the name in cache so it surfaces in the next list call.
"""
from django.core.cache import cache
from rest_framework import status as http_status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from questions.models import Question

from .models import Olympiad

CACHE_KEY = 'olympy:extra_subjects'

DEFAULT_SUBJECTS = [
    'Matematika', 'Ingliz tili', 'Ona tili', 'Informatika',
    'Fizika', 'Kimyo', 'Biologiya', 'Tarix', 'Geografiya',
]


def _collect_subjects():
    seen = set()
    out = []
    for s in DEFAULT_SUBJECTS:
        if s not in seen:
            seen.add(s)
            out.append(s)
    for source in (
        Olympiad.objects.values_list('subject', flat=True).distinct(),
        Question.objects.values_list('subject', flat=True).distinct(),
    ):
        for s in source:
            if s and s not in seen:
                seen.add(s)
                out.append(s)
    for s in cache.get(CACHE_KEY, []) or []:
        if s and s not in seen:
            seen.add(s)
            out.append(s)
    return out


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def subjects_list_create(request):
    if request.method == 'GET':
        return Response(_collect_subjects())
    if not request.user.is_platform_admin:
        return Response({'detail': 'Forbidden'},
                        status=http_status.HTTP_403_FORBIDDEN)
    name = (request.data or {}).get('name', '').strip()
    if not name:
        return Response({'detail': 'name majburiy'},
                        status=http_status.HTTP_400_BAD_REQUEST)
    extras = list(cache.get(CACHE_KEY, []) or [])
    if name not in extras and name not in DEFAULT_SUBJECTS:
        extras.append(name)
        cache.set(CACHE_KEY, extras, timeout=None)
    return Response(_collect_subjects(), status=http_status.HTTP_201_CREATED)
