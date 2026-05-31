import hashlib
import base64
import logging
from decimal import Decimal
from django.conf import settings
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.shortcuts import get_object_or_404
from django.contrib.auth import get_user_model
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework import status as http_status

from .models import SubscriptionPlan, UserSubscription, PaymentTransaction

User = get_user_model()
logger = logging.getLogger('olympy.billing')


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_checkout_session(request):
    """POST /api/billing/checkout/ — Creates a payment URL for Click or Payme.
    Body: { plan_id: int, provider: 'click'|'payme' }
    """
    plan_id = request.data.get('plan_id')
    provider = request.data.get('provider')
    
    if not plan_id or not provider:
        return Response({'detail': "plan_id va provider kiritilishi shart"}, status=http_status.HTTP_400_BAD_REQUEST)
        
    plan = get_object_or_404(SubscriptionPlan, pk=plan_id, is_active=True)
    
    # Create a pending transaction
    tx = PaymentTransaction.objects.create(
        user=request.user,
        amount=plan.price,
        provider=provider,
        status=PaymentTransaction.STATUS_PENDING
    )
    
    # Generate payment URLs
    payment_url = ""
    amount_str = f"{plan.price:.2f}"
    
    if provider == 'click':
        # Placeholder default'larsiz: kalit o'rnatilmagan bo'lsa noto'g'ri URL
        # bilan jim ishlashning o'rniga ogohlantirish chiqarib, xato qaytaramiz.
        service_id = getattr(settings, 'CLICK_SERVICE_ID', None)
        merchant_id = getattr(settings, 'CLICK_MERCHANT_ID', None)
        if not service_id or not merchant_id:
            logger.warning(
                "Click to'lovi so'raldi, lekin CLICK_SERVICE_ID yoki "
                "CLICK_MERCHANT_ID settings.py da o'rnatilmagan — checkout bekor qilindi."
            )
            return Response(
                {'detail': "Click to'lov tizimi sozlanmagan. Iltimos administrator bilan bog'laning."},
                status=http_status.HTTP_503_SERVICE_UNAVAILABLE
            )
        # Click payment link structure
        payment_url = f"https://my.click.uz/services/pay?service_id={service_id}&merchant_id={merchant_id}&amount={amount_str}&transaction_param={tx.id}"
    elif provider == 'payme':
        merchant_id = getattr(settings, 'PAYME_MERCHANT_ID', None)
        if not merchant_id:
            logger.warning(
                "Payme to'lovi so'raldi, lekin PAYME_MERCHANT_ID settings.py da "
                "o'rnatilmagan — checkout bekor qilindi."
            )
            return Response(
                {'detail': "Payme to'lov tizimi sozlanmagan. Iltimos administrator bilan bog'laning."},
                status=http_status.HTTP_503_SERVICE_UNAVAILABLE
            )
        # Base64 encode for Payme billing link
        params = f"m={merchant_id};ac.transaction_id={tx.id};a={int(plan.price * 100)}"
        encoded_params = base64.b64encode(params.encode()).decode()
        payment_url = f"https://checkout.paycom.uz/{encoded_params}"
    else:
        return Response({'detail': "Noma'lum to'lov provayderi"}, status=http_status.HTTP_400_BAD_REQUEST)
        
    return Response({
        'transaction_id': tx.id,
        'payment_url': payment_url
    })


def _activate_subscription(user, amount):
    # Find matching subscription plan by price or default
    plan = SubscriptionPlan.objects.filter(price=amount, is_active=True).first()
    if not plan:
        # Default or fallback plan
        plan = SubscriptionPlan.objects.filter(is_active=True).first()
        
    if plan:
        UserSubscription.objects.create(
            user=user,
            plan=plan,
            start_date=timezone.now(),
            is_active=True
        )


# ─── CLICK CALLBACK API ───────────────────────────────────────────────────────
@csrf_exempt
def click_webhook(request):
    """Click payment system callback handler."""
    if request.method != 'POST':
        return JsonResponse({'error': -3, 'error_note': 'Method not allowed'})
        
    data = request.POST
    
    click_trans_id = data.get('click_trans_id')
    service_id = data.get('service_id')
    click_paydoc_id = data.get('click_paydoc_id')
    merchant_trans_id = data.get('merchant_trans_id') # This is our tx.id
    amount = data.get('amount')
    action = data.get('action')
    error = data.get('error')
    sign_time = data.get('sign_time')
    sign_string = data.get('sign_string')
    
    secret_key = getattr(settings, 'CLICK_SECRET_KEY', None)
    if not secret_key:
        logger.warning(
            "Click webhook chaqirildi, lekin CLICK_SECRET_KEY o'rnatilmagan — "
            "imzo tekshirib bo'lmaydi, so'rov rad etildi."
        )
        return JsonResponse({'error': -1, 'error_note': 'SIGN CHECK FAILED'})

    # Verify signature
    # sign_string = md5(click_trans_id + service_id + secret_key + merchant_trans_id + amount + action + sign_time)
    raw_sign = f"{click_trans_id}{service_id}{secret_key}{merchant_trans_id}{amount}{action}{sign_time}"
    my_sign = hashlib.md5(raw_sign.encode()).hexdigest()
    
    if my_sign != sign_string:
        return JsonResponse({'error': -1, 'error_note': 'SIGN CHECK FAILED'})
        
    if error and int(error) < 0:
        if merchant_trans_id:
            try:
                tx = PaymentTransaction.objects.get(pk=merchant_trans_id)
                tx.status = PaymentTransaction.STATUS_FAILED
                tx.save()
            except PaymentTransaction.DoesNotExist:
                pass
        return JsonResponse({'error': -9, 'error_note': 'Transaction failed from Click'})

    try:
        tx = PaymentTransaction.objects.get(pk=merchant_trans_id)
    except PaymentTransaction.DoesNotExist:
        return JsonResponse({'error': -5, 'error_note': 'Transaction not found'})
        
    if Decimal(amount) != tx.amount:
        return JsonResponse({'error': -2, 'error_note': 'Incorrect amount'})
        
    # Action = 0: Prepare
    if int(action) == 0:
        if tx.status != PaymentTransaction.STATUS_PENDING:
            return JsonResponse({'error': -4, 'error_note': 'Already paid or cancelled'})
            
        return JsonResponse({
            'click_trans_id': click_trans_id,
            'merchant_trans_id': merchant_trans_id,
            'merchant_prepare_id': tx.id,
            'error': 0,
            'error_note': 'Success'
        })
        
    # Action = 1: Complete
    elif int(action) == 1:
        if tx.status == PaymentTransaction.STATUS_SUCCESS:
            return JsonResponse({
                'click_trans_id': click_trans_id,
                'merchant_trans_id': merchant_trans_id,
                'merchant_confirm_id': tx.id,
                'error': 0,
                'error_note': 'Already confirmed'
            })
            
        tx.status = PaymentTransaction.STATUS_SUCCESS
        tx.provider_transaction_id = click_trans_id
        tx.save()
        
        # Activate premium subscription for the user
        _activate_subscription(tx.user, tx.amount)
        
        return JsonResponse({
            'click_trans_id': click_trans_id,
            'merchant_trans_id': merchant_trans_id,
            'merchant_confirm_id': tx.id,
            'error': 0,
            'error_note': 'Success'
        })
        
    return JsonResponse({'error': -3, 'error_note': 'Unknown action'})


# ─── PAYME CALLBACK API (JSON-RPC) ────────────────────────────────────────────
@csrf_exempt
def payme_webhook(request):
    """Payme JSON-RPC 2.0 webhook handler."""
    import json
    if request.method != 'POST':
        return JsonResponse({'error': {'code': -32601, 'message': 'Method not allowed'}}, status=405)
        
    # HTTP Basic Authorization check
    auth_header = request.headers.get('Authorization', '')
    payme_key = getattr(settings, 'PAYME_SECRET_KEY', None)
    if not payme_key and not settings.DEBUG:
        logger.warning(
            "Payme webhook chaqirildi, lekin PAYME_SECRET_KEY o'rnatilmagan — "
            "avtorizatsiyani tekshirib bo'lmaydi, so'rov rad etildi."
        )
        return JsonResponse({'error': {'code': -32504, 'message': 'Insufficient privilege'}}, status=200)
    expected_auth = f"Paycom:{payme_key}"
    encoded_auth = base64.b64encode(expected_auth.encode()).decode()
    
    if not auth_header.startswith('Basic ') or auth_header.split(' ')[1] != encoded_auth:
        # For testing, we can allow without auth in debug mode, but let's be strict
        if not settings.DEBUG:
            return JsonResponse({'error': {'code': -32504, 'message': 'Insufficient privilege'}}, status=200)

    try:
        body = json.loads(request.body.decode('utf-8'))
    except Exception:
        return JsonResponse({'error': {'code': -32700, 'message': 'Parse error'}}, status=200)

    method = body.get('method')
    params = body.get('params', {})
    rpc_id = body.get('id')
    
    def rpc_error(code, msg_uz, msg_ru):
        return JsonResponse({
            'error': {
                'code': code,
                'message': {
                    'uz': msg_uz,
                    'ru': msg_ru
                }
            },
            'id': rpc_id
        })

    # 1. CheckPerformTransaction
    if method == 'CheckPerformTransaction':
        account = params.get('account', {})
        tx_id = account.get('transaction_id')
        amount = params.get('amount') # in tiyins (1/100 of UZS)
        
        try:
            tx = PaymentTransaction.objects.get(pk=tx_id)
        except PaymentTransaction.DoesNotExist:
            return rpc_error(-31050, "Tranzaksiya topilmadi", "Транзакция не найдена")
            
        if tx.status != PaymentTransaction.STATUS_PENDING:
            return rpc_error(-31051, "Tranzaksiya faol emas", "Транзакция не активна")
            
        if Decimal(amount) / 100 != tx.amount:
            return rpc_error(-31001, "Noto'g'ri summa", "Неверная сумма")
            
        return JsonResponse({
            'result': {'allow': True},
            'id': rpc_id
        })

    # 2. CreateTransaction
    elif method == 'CreateTransaction':
        account = params.get('account', {})
        tx_id = account.get('transaction_id')
        payme_trans_id = params.get('id')
        time = params.get('time')
        amount = params.get('amount')
        
        try:
            tx = PaymentTransaction.objects.get(pk=tx_id)
        except PaymentTransaction.DoesNotExist:
            return rpc_error(-31050, "Tranzaksiya topilmadi", "Транзакция не найдена")
            
        if Decimal(amount) / 100 != tx.amount:
            return rpc_error(-31001, "Noto'g'ri summa", "Неверная сумма")
            
        if tx.status == PaymentTransaction.STATUS_SUCCESS:
            return rpc_error(-31051, "Tranzaksiya allaqachon to'langan", "Транзакция уже оплачена")
            
        if tx.provider_transaction_id and tx.provider_transaction_id != payme_trans_id:
            return rpc_error(-31051, "Boshqa tranzaksiya mavjud", "Существует другая транзакция")
            
        if not tx.provider_transaction_id:
            tx.provider_transaction_id = payme_trans_id
            tx.save()
            
        # Return state
        return JsonResponse({
            'result': {
                'create_time': int(tx.created_at.timestamp() * 1000),
                'transaction': str(tx.id),
                'state': 1 # Pending state
            },
            'id': rpc_id
        })

    # 3. PerformTransaction
    elif method == 'PerformTransaction':
        payme_trans_id = params.get('id')
        try:
            tx = PaymentTransaction.objects.get(provider_transaction_id=payme_trans_id)
        except PaymentTransaction.DoesNotExist:
            return rpc_error(-31050, "Tranzaksiya topilmadi", "Транзакция не найдена")
            
        if tx.status == PaymentTransaction.STATUS_SUCCESS:
            return JsonResponse({
                'result': {
                    'transaction': str(tx.id),
                    'perform_time': int(tx.updated_at.timestamp() * 1000),
                    'state': 2 # Completed state
                },
                'id': rpc_id
            })
            
        if tx.status == PaymentTransaction.STATUS_FAILED:
            return rpc_error(-31008, "Tranzaksiya bekor qilingan", "Транзакция отменена")
            
        # Success!
        tx.status = PaymentTransaction.STATUS_SUCCESS
        tx.save()
        
        # Activate premium
        _activate_subscription(tx.user, tx.amount)
        
        return JsonResponse({
            'result': {
                'transaction': str(tx.id),
                'perform_time': int(tx.updated_at.timestamp() * 1000),
                'state': 2
            },
            'id': rpc_id
        })

    # 4. CancelTransaction
    elif method == 'CancelTransaction':
        payme_trans_id = params.get('id')
        reason = params.get('reason')
        try:
            tx = PaymentTransaction.objects.get(provider_transaction_id=payme_trans_id)
        except PaymentTransaction.DoesNotExist:
            return rpc_error(-31050, "Tranzaksiya topilmadi", "Транзакция не найдена")
            
        if tx.status == PaymentTransaction.STATUS_SUCCESS:
            # Cannot cancel completed transaction
            return rpc_error(-31007, "To'lov bajarilgan, bekor qilib bo'lmaydi", "Оплата проведена, невозможно отменить")
            
        tx.status = PaymentTransaction.STATUS_FAILED
        tx.save()
        
        return JsonResponse({
            'result': {
                'transaction': str(tx.id),
                'cancel_time': int(tx.updated_at.timestamp() * 1000),
                'state': -1 # Cancelled state
            },
            'id': rpc_id
        })

    # 5. CheckTransaction
    elif method == 'CheckTransaction':
        payme_trans_id = params.get('id')
        try:
            tx = PaymentTransaction.objects.get(provider_transaction_id=payme_trans_id)
        except PaymentTransaction.DoesNotExist:
            return rpc_error(-31050, "Tranzaksiya topilmadi", "Транзакция не найдена")
            
        state = 1
        if tx.status == PaymentTransaction.STATUS_SUCCESS:
            state = 2
        elif tx.status == PaymentTransaction.STATUS_FAILED:
            state = -1
            
        res_data = {
            'create_time': int(tx.created_at.timestamp() * 1000),
            'perform_time': int(tx.updated_at.timestamp() * 1000) if tx.status == PaymentTransaction.STATUS_SUCCESS else 0,
            'cancel_time': int(tx.updated_at.timestamp() * 1000) if tx.status == PaymentTransaction.STATUS_FAILED else 0,
            'transaction': str(tx.id),
            'state': state,
            'reason': 1 if tx.status == PaymentTransaction.STATUS_FAILED else None
        }
        
        return JsonResponse({
            'result': res_data,
            'id': rpc_id
        })

    return JsonResponse({'error': {'code': -32601, 'message': 'Method not found'}}, status=200)


@api_view(['GET'])
@permission_classes([AllowAny])  # Public endpoint so anyone can view plans on Landing
def list_subscription_plans(request):
    """GET /api/billing/plans/ — Returns active subscription plans."""
    plans = SubscriptionPlan.objects.filter(is_active=True).order_by('price')
    data = [
        {
            'id': p.id,
            'name': p.name,
            'price': float(p.price),
            'duration_days': p.duration_days,
            'description': p.description or '',
            'features': p.features if isinstance(p.features, list) else [],
            'is_popular': bool(p.is_popular),
        }
        for p in plans
    ]
    return Response(data)

