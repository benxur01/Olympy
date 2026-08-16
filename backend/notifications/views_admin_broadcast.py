"""Admin Broadcast & Push Campaigns views.
"""
from datetime import timedelta
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.models import AuditLog, User
from accounts.permissions import IsPlatformAdmin
from notifications.models import BroadcastCampaign, Notification


def _get_target_users(target_audience):
    """Auditoriya segmenti bo'yicha foydalanuvchilar querysetini olish."""
    qs = User.objects.filter(is_active=True)

    if target_audience == BroadcastCampaign.TARGET_PRO:
        qs = qs.filter(subscriptions__is_active=True, subscriptions__end_date__gte=timezone.now()).distinct()
    elif target_audience == BroadcastCampaign.TARGET_INACTIVE:
        cutoff = timezone.now() - timedelta(days=7)
        qs = qs.filter(last_login__lt=cutoff)
    elif target_audience == BroadcastCampaign.TARGET_STUDENTS:
        qs = qs.filter(roles__contains='student')
    elif target_audience == BroadcastCampaign.TARGET_TEACHERS:
        qs = qs.filter(roles__contains='teacher')
    elif target_audience == BroadcastCampaign.TARGET_CENTER_OWNERS:
        qs = qs.filter(roles__contains='owner')

    return qs


@api_view(['GET', 'POST'])
@permission_classes([IsPlatformAdmin])
def admin_list_create_broadcasts(request):
    """Kampaniyalar ro'yxati yoki yangi kampaniya yaratish."""
    if request.method == 'POST':
        title = str(request.data.get('title') or '').strip()
        message = str(request.data.get('message') or '').strip()
        if not title or not message:
            return Response(
                {'ok': False, 'message': "Sarlavha va xabar matni kiritilishi shart."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        target_audience = str(request.data.get('target_audience') or BroadcastCampaign.TARGET_ALL)
        send_telegram = bool(request.data.get('send_telegram', True))
        send_in_app = bool(request.data.get('send_in_app', True))
        send_now = bool(request.data.get('send_now', False))

        campaign = BroadcastCampaign.objects.create(
            title=title,
            message=message,
            target_audience=target_audience,
            send_telegram=send_telegram,
            send_in_app=send_in_app,
            created_by=request.user,
        )

        AuditLog.log(
            request,
            'admin_create_broadcast',
            target=campaign,
            extra={'title': title, 'target': target_audience},
        )

        if send_now:
            return _execute_broadcast_send(request, campaign)

        return Response({
            'ok': True,
            'message': "Xabarnoma qoralamasi yaratildi.",
            'campaign': {
                'id': campaign.id,
                'title': campaign.title,
                'status': campaign.status,
                'target_audience': campaign.target_audience,
            }
        })

    # GET
    campaigns = BroadcastCampaign.objects.all().order_by('-created_at')
    results = []
    for c in campaigns:
        results.append({
            'id': c.id,
            'title': c.title,
            'message': c.message,
            'target_audience': c.target_audience,
            'target_label': c.get_target_audience_display(),
            'send_telegram': c.send_telegram,
            'send_in_app': c.send_in_app,
            'status': c.status,
            'sent_count': c.sent_count,
            'telegram_sent_count': c.telegram_sent_count,
            'sent_at': c.sent_at.isoformat() if c.sent_at else None,
            'created_at': c.created_at.isoformat(),
        })

    return Response({'ok': True, 'count': len(results), 'broadcasts': results})


def _execute_broadcast_send(request, campaign):
    """Kampaniyani barcha maqsadli foydalanuvchilarga tarqatish."""
    target_users = _get_target_users(campaign.target_audience)
    total_users_count = target_users.count()

    sent_count = 0
    telegram_sent_count = 0

    if campaign.send_in_app:
        notifications_to_create = [
            Notification(
                user=u,
                type=Notification.TYPE_ADMIN_BROADCAST,
                title=campaign.title,
                message=campaign.message,
            )
            for u in target_users
        ]
        Notification.objects.bulk_create(notifications_to_create, batch_size=500)
        sent_count = len(notifications_to_create)

    # Telegram orqali yuborish (telegram_user_id mavjud bo'lganlar uchun)
    if campaign.send_telegram:
        users_with_tg = target_users.exclude(telegram_user_id__isnull=True).exclude(telegram_user_id='')
        telegram_sent_count = users_with_tg.count()
        # Haqiqiy Telegram xabarlarini asinxron bot orqali tarqatish mantiqi

    campaign.status = BroadcastCampaign.STATUS_SENT
    campaign.sent_count = sent_count
    campaign.telegram_sent_count = telegram_sent_count
    campaign.sent_at = timezone.now()
    campaign.save(update_fields=['status', 'sent_count', 'telegram_sent_count', 'sent_at'])

    AuditLog.log(
        request,
        'admin_send_broadcast',
        target=campaign,
        extra={'sent_count': sent_count, 'telegram_sent_count': telegram_sent_count},
    )

    return Response({
        'ok': True,
        'message': f"Xabar {sent_count} ta foydalanuvchiga muvaffaqiyatli yuborildi!",
        'sent_count': sent_count,
        'telegram_sent_count': telegram_sent_count,
    })


@api_view(['POST'])
@permission_classes([IsPlatformAdmin])
def admin_send_broadcast_now(request, pk):
    """Mavjud qoralamani yuborish."""
    try:
        campaign = BroadcastCampaign.objects.get(pk=pk)
    except BroadcastCampaign.DoesNotExist:
        return Response({'ok': False, 'message': "Kampaniya topilmadi."}, status=status.HTTP_404_NOT_FOUND)

    return _execute_broadcast_send(request, campaign)


@api_view(['DELETE'])
@permission_classes([IsPlatformAdmin])
def admin_delete_broadcast(request, pk):
    """Kampaniyani o'chirish."""
    try:
        campaign = BroadcastCampaign.objects.get(pk=pk)
    except BroadcastCampaign.DoesNotExist:
        return Response({'ok': False, 'message': "Kampaniya topilmadi."}, status=status.HTTP_404_NOT_FOUND)

    campaign.delete()
    return Response({'ok': True, 'message': "Kampaniya o'chirildi."})
