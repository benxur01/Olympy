"""Admin Financial Analytics, Revenue Cohorts, and B2B Invoicing views.
"""
from datetime import timedelta
from django.db.models import Count, Sum
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.permissions import IsPlatformAdmin
from billing.models import PaymentTransaction


@api_view(['GET'])
@permission_classes([IsPlatformAdmin])
def admin_revenue_analytics(request):
    """Moliya, MRR va to'lovlar tahlili."""
    now = timezone.now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # 1. Jami tushum
    total_revenue = PaymentTransaction.objects.filter(status='success').aggregate(
        total=Sum('amount')
    )['total'] or 0

    # 2. Ushbu oylik tushum (MRR proxy)
    mrr = PaymentTransaction.objects.filter(
        status='success',
        created_at__gte=month_start,
    ).aggregate(total=Sum('amount'))['total'] or 0

    # 3. Muvaffaqiyatli va muvaffaqiyatsiz to'lovlar soni
    success_count = PaymentTransaction.objects.filter(status='success').count()
    failed_count = PaymentTransaction.objects.filter(status='failed').count()

    # 4. Provayderlar bo'yicha taqsimot (Payme vs Click vs Uzum)
    by_provider = list(PaymentTransaction.objects.filter(status='success').values('provider').annotate(
        total_amount=Sum('amount'),
        transaction_count=Count('id'),
    ).order_by('-total_amount'))

    # 5. So'nggi 14 kunlik daromad trendi
    fourteen_days_ago = now.date() - timedelta(days=13)
    daily_trend = []
    for i in range(14):
        cur_date = fourteen_days_ago + timedelta(days=i)
        day_sum = PaymentTransaction.objects.filter(
            status='success',
            created_at__date=cur_date,
        ).aggregate(total=Sum('amount'))['total'] or 0

        daily_trend.append({
            'date': cur_date.strftime('%d.%m'),
            'amount': float(day_sum),
        })

    # O'rtacha chek
    arpu = round(float(total_revenue) / success_count, 2) if success_count > 0 else 0.0

    return Response({
        'ok': True,
        'metrics': {
            'total_revenue': float(total_revenue),
            'mrr': float(mrr),
            'success_count': success_count,
            'failed_count': failed_count,
            'average_check': arpu,
        },
        'by_provider': by_provider,
        'daily_trend': daily_trend,
    })


@api_view(['POST'])
@permission_classes([IsPlatformAdmin])
def admin_generate_b2b_invoice(request):
    """Yuridik shaxslar (B2B o'quv markazlari) uchun rasmiy hisob-faktura

    (invoys) generatsiyasi.
    """
    buyer_name = str(request.data.get('buyer_name') or '').strip()
    buyer_inn = str(request.data.get('buyer_inn') or '').strip()
    amount = request.data.get('amount')
    plan_name = str(request.data.get('plan_name') or 'B2B Enterprise Litsenziyasi').strip()

    if not buyer_name or not amount:
        return Response(
            {'ok': False, 'message': "Tashkilot nomi va hisob-faktura summasi kiritilishi shart."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        amount_val = float(amount)
    except (ValueError, TypeError):
        return Response({'ok': False, 'message': "Summa noto'g'ri kiritildi."}, status=status.HTTP_400_BAD_REQUEST)

    invoice_number = f"INV-{timezone.now().strftime('%Y%m')}-{int(timezone.now().timestamp()) % 10000}"
    due_date = (timezone.now() + timedelta(days=5)).strftime('%Y-%m-%d')

    return Response({
        'ok': True,
        'invoice': {
            'invoice_number': invoice_number,
            'buyer_name': buyer_name,
            'buyer_inn': buyer_inn or "—",
            'amount': amount_val,
            'plan_name': plan_name,
            'issued_at': timezone.now().strftime('%Y-%m-%d %H:%M'),
            'due_date': due_date,
            'seller': {
                'name': "«OLYMPY EDTECH» MCHJ",
                'inn': "309124856",
                'mfo': "00440",
                'account': "20208000900543210001",
                'bank': "O‘zsanoatqurilishbank ATB",
            }
        }
    })
