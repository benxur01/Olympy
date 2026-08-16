"""Admin Rewards Shop and Fulfillment views.
"""
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.models import AuditLog, RewardProduct, RewardRedemption
from accounts.permissions import IsPlatformAdmin


@api_view(['GET', 'POST'])
@permission_classes([IsPlatformAdmin])
def admin_list_create_rewards(request):
    """Mukofotlar ro'yxati yoki yangi sovg'a yaratish."""
    if request.method == 'POST':
        title = str(request.data.get('title') or '').strip()
        if not title:
            return Response({'ok': False, 'message': "Sovg'a nomi kiritilishi shart."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            coin_cost = int(request.data.get('coin_cost') or 100)
            stock = int(request.data.get('stock') or 10)
        except (ValueError, TypeError):
            coin_cost = 100
            stock = 10

        product = RewardProduct.objects.create(
            title=title,
            description=str(request.data.get('description') or '').strip(),
            coin_cost=coin_cost,
            stock=stock,
            icon=str(request.data.get('icon') or '🎁').strip(),
            is_premium_only=bool(request.data.get('is_premium_only', False)),
            is_active=bool(request.data.get('is_active', True)),
        )

        AuditLog.log(
            request,
            'admin_create_reward_product',
            target=product,
            extra={'title': product.title, 'coin_cost': product.coin_cost},
        )

        return Response({
            'ok': True,
            'message': f"'{product.title}' do'konga qo'shildi.",
            'product': {
                'id': product.id,
                'title': product.title,
                'coin_cost': product.coin_cost,
                'stock': product.stock,
                'icon': product.icon,
                'is_active': product.is_active,
            }
        })

    # GET
    products = RewardProduct.objects.all().order_by('-created_at')
    results = []
    for p in products:
        results.append({
            'id': p.id,
            'title': p.title,
            'description': p.description,
            'coin_cost': p.coin_cost,
            'stock': p.stock,
            'icon': p.icon,
            'is_premium_only': p.is_premium_only,
            'is_active': p.is_active,
            'redemptions_count': p.redemptions.count(),
            'created_at': p.created_at.isoformat(),
        })

    return Response({'ok': True, 'count': len(results), 'products': results})


@api_view(['POST'])
@permission_classes([IsPlatformAdmin])
def admin_toggle_reward(request, pk):
    """Sovg'ani faollashtirish yoki to'xtatish."""
    try:
        product = RewardProduct.objects.get(pk=pk)
    except RewardProduct.DoesNotExist:
        return Response({'ok': False, 'message': "Mahsulot topilmadi."}, status=status.HTTP_404_NOT_FOUND)

    product.is_active = not product.is_active
    product.save(update_fields=['is_active'])

    return Response({
        'ok': True,
        'is_active': product.is_active,
        'message': f"Mahsulot holati {'faollashtirildi' if product.is_active else 'to‘xtatildi'}.",
    })


@api_view(['DELETE'])
@permission_classes([IsPlatformAdmin])
def admin_delete_reward(request, pk):
    """Sovg'ani o'chirish."""
    try:
        product = RewardProduct.objects.get(pk=pk)
    except RewardProduct.DoesNotExist:
        return Response({'ok': False, 'message': "Mahsulot topilmadi."}, status=status.HTTP_404_NOT_FOUND)

    title = product.title
    product.delete()
    return Response({'ok': True, 'message': f"'{title}' o'chirildi."})


@api_view(['GET'])
@permission_classes([IsPlatformAdmin])
def admin_list_redemptions(request):
    """O'quvchilar buyurtmalari (redemptions) va yetkazib berish ro'yxati."""
    redemptions = RewardRedemption.objects.select_related('user', 'product').all().order_by('-redeemed_at')
    results = []
    for r in redemptions:
        results.append({
            'id': r.id,
            'user': {
                'id': r.user_id,
                'name': r.user.full_name or r.user.phone,
                'phone': r.user.phone,
            },
            'product': {
                'id': r.product_id,
                'title': r.product.title,
                'coin_cost': r.product.coin_cost,
                'icon': r.product.icon,
            },
            'status': r.status,
            'status_label': r.get_status_display(),
            'redeemed_at': r.redeemed_at.isoformat(),
        })

    return Response({'ok': True, 'count': len(results), 'redemptions': results})


@api_view(['POST'])
@permission_classes([IsPlatformAdmin])
def admin_update_redemption_status(request, pk):
    """Buyurtma holatini o'zgartirish (delivered)."""
    try:
        redemption = RewardRedemption.objects.get(pk=pk)
    except RewardRedemption.DoesNotExist:
        return Response({'ok': False, 'message': "Buyurtma topilmadi."}, status=status.HTTP_404_NOT_FOUND)

    new_status = request.data.get('status') or RewardRedemption.STATUS_DELIVERED
    redemption.status = new_status
    redemption.save(update_fields=['status'])

    AuditLog.log(
        request,
        'admin_update_redemption_status',
        target=redemption,
        extra={'status': new_status, 'user_id': redemption.user_id},
    )

    return Response({
        'ok': True,
        'status': redemption.status,
        'message': "Buyurtma holati yangilandi (Topshirildi).",
    })
