"""Analitika API endpoint'lari.

Metrikalar (`analytics.metrics.get_metrics`) ilgari faqat Django admin
dashboard'i orqali ko'rinardi. Bu modul shu metrikalarni JSON API sifatida ham
ochadi — faqat admin (staff/superuser) foydalanuvchilar uchun. Frontend admin
paneli (React) shu endpointdan retention/conversion/premium ko'rsatkichlarini
o'qishi mumkin.

Hisoblash mantig'i bitta joyda (metrics.py) qoladi — bu view faqat shu
funksiyani HTTP orqali taqdim etadi.
"""
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response

from .metrics import METRICS_CACHE_SECONDS, get_metrics


@api_view(['GET'])
@permission_classes([IsAdminUser])
def metrics_dashboard(request):
    """GET /api/analytics/metrics/ — retention/conversion/premium metrikalari.

    Faqat admin (is_staff) foydalanuvchilar uchun. `?refresh=1` cache'ni
    chetlab o'tib qayta hisoblaydi (admin dashboard bilan bir xil xulq).
    """
    force = request.GET.get('refresh') in ('1', 'true', 'True')
    metrics = get_metrics(force_refresh=force)
    return Response({
        **metrics,
        'cache_minutes': METRICS_CACHE_SECONDS // 60,
    })
