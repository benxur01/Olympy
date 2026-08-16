"""System Health, Dynamic Feature Flags, and Cache Management views for Platform Admins.
"""
import sys
import time
from django.core.cache import cache
from django.db import connection
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.models import AuditLog, SystemConfig, User
from accounts.permissions import IsPlatformAdmin
from attempts.models import TestAttempt


# ─────────────────────────────────────────────────────────────────────────────
# 1. SYSTEM HEALTH METRICS DASHBOARD
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['GET'])
@permission_classes([IsPlatformAdmin])
def admin_system_health(request):
    """Server, ma'lumotlar bazasi, kesh va tizim salomatligi metrikalari."""
    # 1. DB latency tekshiruvi
    db_start = time.time()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        db_latency_ms = round((time.time() - db_start) * 1000, 2)
        db_status = "healthy"
    except Exception as e:
        db_latency_ms = None
        db_status = f"unhealthy: {str(e)}"

    # 2. Redis / Cache latency tekshiruvi
    cache_start = time.time()
    try:
        cache.set('health_check_probe', 'ok', timeout=10)
        probe_val = cache.get('health_check_probe')
        cache_latency_ms = round((time.time() - cache_start) * 1000, 2)
        cache_status = "healthy" if probe_val == 'ok' else "degraded"
    except Exception as e:
        cache_latency_ms = None
        cache_status = f"unhealthy: {str(e)}"

    # 3. Statistika
    total_users = User.objects.count()
    today_attempts = TestAttempt.objects.filter(submitted_at__date=timezone.now().date()).count()
    total_attempts = TestAttempt.objects.count()

    config = SystemConfig.get_settings()

    return Response({
        'ok': True,
        'timestamp': timezone.now().isoformat(),
        'services': {
            'database': {
                'status': db_status,
                'latency_ms': db_latency_ms,
                'engine': connection.settings_dict.get('ENGINE', '').split('.')[-1],
            },
            'cache': {
                'status': cache_status,
                'latency_ms': cache_latency_ms,
            },
        },
        'environment': {
            'python_version': sys.version.split(' ')[0],
            'server_time': timezone.now().strftime('%Y-%m-%d %H:%M:%S %Z'),
            'timezone': str(timezone.get_current_timezone()),
        },
        'workload': {
            'total_users': total_users,
            'today_attempts': today_attempts,
            'total_attempts': total_attempts,
        },
        'feature_flags': {
            'is_maintenance_mode': config.is_maintenance_mode,
            'allow_registrations': config.allow_registrations,
            'default_ai_model': config.default_ai_model,
            'camera_proctoring_global': config.camera_proctoring_global,
        }
    })


# ─────────────────────────────────────────────────────────────────────────────
# 2. PURGE CACHE ENGINE
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['POST'])
@permission_classes([IsPlatformAdmin])
def admin_purge_cache(request):
    """Platforma keshini (Redis / Django Cache) tozalash."""
    try:
        cache.clear()
        AuditLog.log(
            request,
            'admin_purge_cache',
            extra={'cleared_at': timezone.now().isoformat()},
        )
        return Response({
            'ok': True,
            'message': "Tizim keshi muvaffaqiyatli tozalandi (Purge Cache completed).",
            'timestamp': timezone.now().isoformat(),
        })
    except Exception as e:
        return Response(
            {'ok': False, 'message': f"Keshni tozalashda xatolik: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


# ─────────────────────────────────────────────────────────────────────────────
# 3. DYNAMIC SYSTEM CONFIG & FEATURE FLAGS
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['GET', 'POST'])
@permission_classes([IsPlatformAdmin])
def admin_system_config_ops(request):
    """Global tizim sozlamalarini olish yoki yangilash."""
    config = SystemConfig.get_settings()

    if request.method == 'POST':
        if 'is_maintenance_mode' in request.data:
            config.is_maintenance_mode = bool(request.data['is_maintenance_mode'])
        if 'maintenance_message' in request.data:
            config.maintenance_message = str(request.data['maintenance_message']).strip()
        if 'allow_registrations' in request.data:
            config.allow_registrations = bool(request.data['allow_registrations'])
        if 'default_ai_model' in request.data:
            config.default_ai_model = str(request.data['default_ai_model']).strip()
        if 'camera_proctoring_global' in request.data:
            config.camera_proctoring_global = bool(request.data['camera_proctoring_global'])

        config.save()

        AuditLog.log(
            request,
            'admin_update_system_config',
            extra={
                'is_maintenance_mode': config.is_maintenance_mode,
                'allow_registrations': config.allow_registrations,
                'default_ai_model': config.default_ai_model,
            },
        )

        return Response({
            'ok': True,
            'message': "Tizim konfiguratsiyasi muvaffaqiyatli saqlandi.",
            'config': {
                'is_maintenance_mode': config.is_maintenance_mode,
                'maintenance_message': config.maintenance_message,
                'allow_registrations': config.allow_registrations,
                'default_ai_model': config.default_ai_model,
                'camera_proctoring_global': config.camera_proctoring_global,
                'updated_at': config.updated_at.isoformat(),
            }
        })

    # GET
    return Response({
        'ok': True,
        'config': {
            'is_maintenance_mode': config.is_maintenance_mode,
            'maintenance_message': config.maintenance_message,
            'allow_registrations': config.allow_registrations,
            'default_ai_model': config.default_ai_model,
            'camera_proctoring_global': config.camera_proctoring_global,
            'updated_at': config.updated_at.isoformat(),
        }
    })
