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

    Paginatsiyalangan: avval cheksiz (keyin top-200) ro'yxat qaytarilardi —
    500+ bildirishnoma to'plagan foydalanuvchida eskilari umuman ko'rinmasdi
    va javob payloadi katta bo'lardi. Endi `limit`/`offset` bilan sahifalanadi
    va `total_count`/`has_more` orqali frontend qolgan yozuvlar borligini biladi.

    Query params:
      - limit:  bir sahifadagi yozuvlar soni (default 20, maksimum 100).
      - offset: nechtasini o'tkazib yuborish (default 0).

    Javob: { results: [...], total_count: int, has_more: bool }. Frontend
    `unwrapList` orqali `results` ni ajratadi, shuning uchun avvalgi massiv
    ishlatuvchi kod ham buzilmaydi.
    """
    try:
        limit = int(request.query_params.get('limit', 20))
    except (TypeError, ValueError):
        limit = 20
    limit = max(1, min(limit, 100))
    try:
        offset = int(request.query_params.get('offset', 0))
    except (TypeError, ValueError):
        offset = 0
    offset = max(0, offset)

    base_qs = Notification.objects.filter(user=request.user)
    total_count = base_qs.count()
    # Explicit order_by('-created_at') — Model.Meta.ordering allaqachon shunday,
    # lekin slicing ishlatilganda implicit ordering xavfsiz emas (kelajakda
    # Meta o'zgartirilsa bu kod sukut tarzda buziladi).
    qs = base_qs.order_by('-created_at')[offset:offset + limit]
    return Response({
        'results': NotificationSerializer(qs, many=True).data,
        'total_count': total_count,
        'has_more': offset + limit < total_count,
    })


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
