"""Admin Promocode and Marketing operations.
"""
from decimal import Decimal
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import AuditLog
from accounts.permissions import IsPlatformAdmin
from billing.models import PromoCode, PromoCodeUsage, SubscriptionPlan


@api_view(['GET', 'POST'])
@permission_classes([IsPlatformAdmin])
def admin_list_create_promocodes(request):
    """Promokodlar ro'yxatini olish yoki yangi promokod yaratish."""
    if request.method == 'POST':
        code = str(request.data.get('code') or '').strip().upper()
        if not code:
            return Response(
                {'ok': False, 'message': "Promokod kodi kiritilishi shart."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if PromoCode.objects.filter(code=code).exists():
            return Response(
                {'ok': False, 'message': f"'{code}' promokodi allaqachon mavjud."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        discount_type = str(request.data.get('discount_type') or 'percent').strip().lower()
        if discount_type not in ['percent', 'fixed']:
            discount_type = 'percent'

        try:
            discount_value = Decimal(str(request.data.get('discount_value') or '10'))
        except Exception:
            discount_value = Decimal('10')

        if discount_type == 'percent' and (discount_value <= 0 or discount_value > 100):
            return Response(
                {'ok': False, 'message': "Foizli chegirma 1 dan 100 gacha bo'lishi kerak."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        max_uses = request.data.get('max_uses')
        if max_uses is not None and str(max_uses).strip() != '':
            try:
                max_uses = int(max_uses)
            except (ValueError, TypeError):
                max_uses = None
        else:
            max_uses = None

        valid_until_str = request.data.get('valid_until')
        valid_until = None
        if valid_until_str:
            try:
                valid_until = timezone.datetime.fromisoformat(valid_until_str)
            except Exception:
                valid_until = None

        promo = PromoCode.objects.create(
            code=code,
            description=str(request.data.get('description') or '').strip(),
            discount_type=discount_type,
            discount_value=discount_value,
            max_uses=max_uses,
            valid_until=valid_until,
            created_by=request.user,
        )

        AuditLog.log(
            request,
            'admin_create_promocode',
            target=promo,
            extra={'code': promo.code, 'discount_value': float(promo.discount_value)},
        )

        return Response({
            'ok': True,
            'message': f"'{promo.code}' promokodi yaratildi.",
            'promocode': {
                'id': promo.id,
                'code': promo.code,
                'discount_type': promo.discount_type,
                'discount_value': float(promo.discount_value),
                'max_uses': promo.max_uses,
                'used_count': promo.used_count,
                'is_active': promo.is_active,
            },
        })

    # GET — Promokodlar ro'yxati
    promos = PromoCode.objects.all().order_by('-created_at')
    results = []
    for p in promos:
        is_val, val_msg = p.is_valid()
        results.append({
            'id': p.id,
            'code': p.code,
            'description': p.description,
            'discount_type': p.discount_type,
            'discount_value': float(p.discount_value),
            'max_uses': p.max_uses,
            'used_count': p.used_count,
            'valid_from': p.valid_from.isoformat() if p.valid_from else None,
            'valid_until': p.valid_until.isoformat() if p.valid_until else None,
            'is_active': p.is_active,
            'is_valid_currently': is_val,
            'status_label': val_msg,
            'created_at': p.created_at.isoformat(),
        })

    return Response({
        'ok': True,
        'count': len(results),
        'promocodes': results,
    })


@api_view(['POST'])
@permission_classes([IsPlatformAdmin])
def admin_toggle_promocode(request, pk):
    """Promokodni faollashtirish yoki to'xtatish."""
    try:
        promo = PromoCode.objects.get(pk=pk)
    except PromoCode.DoesNotExist:
        return Response({'ok': False, 'message': "Promokod topilmadi."}, status=status.HTTP_404_NOT_FOUND)

    promo.is_active = not promo.is_active
    promo.save(update_fields=['is_active'])

    AuditLog.log(
        request,
        'admin_toggle_promocode',
        target=promo,
        extra={'code': promo.code, 'is_active': promo.is_active},
    )

    return Response({
        'ok': True,
        'is_active': promo.is_active,
        'message': f"Promokod {'faollashtirildi' if promo.is_active else 'to‘xtatildi'}.",
    })


@api_view(['DELETE'])
@permission_classes([IsPlatformAdmin])
def admin_delete_promocode(request, pk):
    """Promokodni o'chirish."""
    try:
        promo = PromoCode.objects.get(pk=pk)
    except PromoCode.DoesNotExist:
        return Response({'ok': False, 'message': "Promokod topilmadi."}, status=status.HTTP_404_NOT_FOUND)

    code = promo.code
    promo.delete()

    AuditLog.log(
        request,
        'admin_delete_promocode',
        extra={'code': code},
    )

    return Response({'ok': True, 'message': f"'{code}' promokodi o'chirildi."})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def validate_promocode_public(request):
    """O'quvchi to'lov qilayotganda promokodni tekshirish va yakuniy narxni

    hisoblash.
    """
    code = str(request.data.get('code') or '').strip().upper()
    plan_id = request.data.get('plan_id')

    if not code:
        return Response({'ok': False, 'message': "Promokod kodini kiriting."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        promo = PromoCode.objects.get(code=code)
    except PromoCode.DoesNotExist:
        return Response({'ok': False, 'message': "Bunday promokod mavjud emas."}, status=status.HTTP_404_NOT_FOUND)

    is_valid, reason = promo.is_valid()
    if not is_valid:
        return Response({'ok': False, 'message': reason}, status=status.HTTP_400_BAD_REQUEST)

    # Agar plan_id berilgan bo'lsa, chegirmali narxni hisoblaymiz
    original_price = Decimal('0')
    final_price = Decimal('0')
    discount_amount = Decimal('0')

    if plan_id:
        plan = SubscriptionPlan.objects.filter(pk=plan_id).first()
        if plan:
            original_price = plan.price
            if promo.discount_type == PromoCode.DISCOUNT_TYPE_PERCENT:
                discount_amount = (original_price * promo.discount_value) / Decimal('100')
            else:
                discount_amount = promo.discount_value
            discount_amount = min(discount_amount, original_price)
            final_price = max(Decimal('0'), original_price - discount_amount)

    return Response({
        'ok': True,
        'code': promo.code,
        'discount_type': promo.discount_type,
        'discount_value': float(promo.discount_value),
        'original_price': float(original_price),
        'discount_amount': float(discount_amount),
        'final_price': float(final_price),
        'message': f"Promokod qo'llanildi: {promo.discount_value}{'%' if promo.discount_type == 'percent' else ' UZS'} chegirma!",
    })
