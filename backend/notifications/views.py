from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Notification
from .serializers import NotificationSerializer


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_notifications(request):
    """GET /api/notifications/ — current user's notifications, newest first.

    Eng so'nggi 200 tasini qaytaramiz: avval cheksiz ro'yxat qaytarilardi va
    ko'p oydan beri faol foydalanuvchilarda javob payloadi 1+ MB ga yetishi
    mumkin edi. Bell dropdown va admin faolligi uchun 200 yetarli; eskilarini
    arxiv qilish kerak bo'lsa alohida endpoint qo'shiladi.
    """
    try:
        limit = int(request.query_params.get('limit', 200))
    except (TypeError, ValueError):
        limit = 200
    limit = max(1, min(limit, 500))
    qs = Notification.objects.filter(user=request.user)[:limit]
    return Response(NotificationSerializer(qs, many=True).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mark_read(request, pk):
    n = get_object_or_404(Notification, pk=pk, user=request.user)
    n.is_read = True
    n.save(update_fields=['is_read'])
    return Response(NotificationSerializer(n).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mark_all_read(request):
    Notification.objects.filter(user=request.user, is_read=False).update(is_read=True)
    return Response({'ok': True})
