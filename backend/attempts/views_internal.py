"""Internal, server-to-server endpoint for ingesting finished duel results.

The Java "Brain Battles" Spring service runs the live match and, on completion,
POSTs the final scores here so Django persists the record (single source of
truth). Spring never writes to Django's DB directly. Gated by the same shared
secret as the JWT introspection endpoint.
"""
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from accounts.views_internal import internal_secret_ok

from .models import DuelResult, QuizResult


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def duel_result(request):
    """POST /api/attempts/duel-result/ — persist a finished duel's outcome.

    Body::

        {
          "match_id": "<spring match id>",   # optional but recommended
          "player1_id": <int>,
          "player2_id": <int>,
          "player1_score": <int>,
          "player2_score": <int>,
          "winner_id": <int|null>,           # null / omitted => draw
          "subject": "<str>"                 # optional
        }

    Gated by the ``X-Internal-Service-Secret`` header. Returns the created
    record id on success.
    """
    if not internal_secret_ok(request):
        return Response({'detail': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)

    body = request.data or {}
    try:
        player1_id = int(body['player1_id'])
        player2_id = int(body['player2_id'])
        player1_score = int(body.get('player1_score', 0))
        player2_score = int(body.get('player2_score', 0))
    except (KeyError, TypeError, ValueError):
        return Response(
            {'detail': 'player1_id, player2_id, player1_score, player2_score majburiy (butun son)'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    winner_id = body.get('winner_id')
    if winner_id is not None:
        try:
            winner_id = int(winner_id)
        except (TypeError, ValueError):
            return Response({'detail': "winner_id son yoki null bo'lishi kerak"},
                            status=status.HTTP_400_BAD_REQUEST)
        if winner_id not in (player1_id, player2_id):
            return Response({'detail': "winner_id ishtirokchilardan biri bo'lishi kerak"},
                            status=status.HTTP_400_BAD_REQUEST)

    User = get_user_model()
    existing_ids = set(
        User.objects.filter(pk__in=[player1_id, player2_id]).values_list('id', flat=True)
    )
    if player1_id not in existing_ids or player2_id not in existing_ids:
        return Response({'detail': 'Ishtirokchi topilmadi'}, status=status.HTTP_404_NOT_FOUND)

    result = DuelResult.objects.create(
        match_id=str(body.get('match_id') or '')[:64],
        player1_id=player1_id,
        player2_id=player2_id,
        player1_score=player1_score,
        player2_score=player2_score,
        winner_id=winner_id,
        subject=str(body.get('subject') or '')[:80],
    )
    return Response({'id': result.id, 'stored': True}, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def quiz_result(request):
    """POST /api/attempts/quiz-result/ — persist a finished live-quiz leaderboard.

    Body::

        {
          "room_code": "<spring room code>",
          "title": "<quiz title>",
          "host_id": <int|null>,             # optional; unknown => stored as null
          "participants": [
            {"user_id": <int>, "name": "<str>", "score": <int>, "rank": <int>},
            ...
          ]
        }

    Gated by the ``X-Internal-Service-Secret`` header (same as duel-result).
    Participants are stored as a single JSON list (lightweight, per the
    ``DailyPracticeSet`` convention). Unknown user ids are still recorded in the
    JSON payload — Django only persists the finished outcome, it does not
    re-run the game — but the ``host`` foreign key is left null if the host id
    is unknown. Returns the created record id on success.
    """
    if not internal_secret_ok(request):
        return Response({'detail': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)

    body = request.data or {}

    raw_participants = body.get('participants')
    if not isinstance(raw_participants, list) or not raw_participants:
        return Response({'detail': "participants bo'sh bo'lmagan ro'yxat bo'lishi kerak"},
                        status=status.HTTP_400_BAD_REQUEST)

    participants = []
    for entry in raw_participants:
        if not isinstance(entry, dict):
            return Response({'detail': "Har bir ishtirokchi obyekt bo'lishi kerak"},
                            status=status.HTTP_400_BAD_REQUEST)
        try:
            participants.append({
                'user_id': int(entry['user_id']),
                'name': str(entry.get('name') or '')[:120],
                'score': int(entry.get('score', 0)),
                'rank': int(entry.get('rank', 0)),
            })
        except (KeyError, TypeError, ValueError):
            return Response({'detail': "user_id/score/rank butun son bo'lishi kerak"},
                            status=status.HTTP_400_BAD_REQUEST)

    host_id = body.get('host_id')
    if host_id is not None:
        try:
            host_id = int(host_id)
        except (TypeError, ValueError):
            return Response({'detail': "host_id son yoki null bo'lishi kerak"},
                            status=status.HTTP_400_BAD_REQUEST)
        # Unknown host => store null rather than 404 (the game already happened).
        User = get_user_model()
        if not User.objects.filter(pk=host_id).exists():
            host_id = None

    result = QuizResult.objects.create(
        room_code=str(body.get('room_code') or '')[:64],
        title=str(body.get('title') or '')[:200],
        host_id=host_id,
        participants=participants,
    )
    return Response({'id': result.id, 'stored': True}, status=status.HTTP_201_CREATED)
