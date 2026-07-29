"""Admin paneldagi "Xavfsizlik" tabi uchun endpointlar.

Barchasi `/api/admin/security/...` ostida mount qilinadi (accounts/urls_me.py)
va faqat platforma admini uchun ochiq. `accounts/views.py` allaqachon juda
uzun bo'lgani uchun bu yo'nalish loyihadagi odatga ko'ra (views_b2b,
views_retention, views_student, views_support) alohida modulda turadi.

So'rovlarning o'zi `accounts/security_queries.py` da: ularni boshqa app'lar
ham import qiladi, view moduli esa faqat HTTP qatlami.
"""
from django.contrib.auth import get_user_model
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.permissions import IsPlatformAdmin

from .security_queries import get_ip_account_ids, get_shared_ip_accounts

# `?min_accounts=` chegaralari. 2 dan past ma'nosiz (bitta hisob har doim
# "bir xil IP" bo'ladi), 100 dan yuqorisi esa hech qachon natija bermaydi —
# noto'g'ri qiymat xato emas, shunchaki shu oraliqqa siqiladi.
SHARED_IP_DEFAULT_MIN_ACCOUNTS = 5
SHARED_IP_MIN_ACCOUNTS_FLOOR = 2
SHARED_IP_MIN_ACCOUNTS_CEIL = 100

# `?days=` chegaralari — LoginEvent cheksiz o'sadi, butun tarixni guruhlash
# admin panelidagi bitta jadval uchun juda qimmat.
SHARED_IP_DEFAULT_WINDOW_DAYS = 30
SHARED_IP_MAX_WINDOW_DAYS = 365

# Javobdagi qatorlar chegarasi. Ro'yxat "tekshirish uchun ro'yxat", to'liq
# hisobot emas: 100 tadan ko'p IP chiqsa chegara juda past qo'yilgan degani —
# admin `min_accounts` ni oshiradi.
SHARED_IP_MAX_ROWS = 100


@api_view(['GET'])
@permission_classes([IsPlatformAdmin])
def admin_shared_ip_accounts(request):
    """GET /api/admin/security/shared-ip/?min_accounts=5&days=30

    Bitta IP manzilidan kirgan TURLI hisoblar sonini ko'rsatadi. Bu o'z-o'zicha
    ayblov emas: markaz kompyuter sinfi, oila Wi-Fi'si yoki mobil operator NAT'i
    ortida o'nlab haqiqiy hisob bo'lishi normal. Ro'yxat faqat qo'lda
    tekshiriladigan nomzodlarni beradi.

    Javob: `{'results': [{ip_address, distinct_users, first_seen, last_seen}],
    'min_accounts': N, 'window_days': D}`. Filtr qiymatlari javobga
    qaytariladi: ular clamp qilinishi mumkin, panel esa AYNAN qo'llanilgan
    qiymatni ko'rsatishi kerak.
    """
    try:
        min_accounts = int(request.query_params.get('min_accounts') or SHARED_IP_DEFAULT_MIN_ACCOUNTS)
    except (TypeError, ValueError):
        min_accounts = SHARED_IP_DEFAULT_MIN_ACCOUNTS
    min_accounts = max(SHARED_IP_MIN_ACCOUNTS_FLOOR, min(min_accounts, SHARED_IP_MIN_ACCOUNTS_CEIL))

    try:
        days = int(request.query_params.get('days') or SHARED_IP_DEFAULT_WINDOW_DAYS)
    except (TypeError, ValueError):
        days = SHARED_IP_DEFAULT_WINDOW_DAYS
    days = max(1, min(days, SHARED_IP_MAX_WINDOW_DAYS))

    rows = get_shared_ip_accounts(min_accounts=min_accounts, window_days=days)[:SHARED_IP_MAX_ROWS]
    return Response({
        'results': [{
            'ip_address': row['ip_address'],
            'distinct_users': row['distinct_users'],
            'first_seen': row['first_seen'].isoformat() if row['first_seen'] else None,
            'last_seen': row['last_seen'].isoformat() if row['last_seen'] else None,
        } for row in rows],
        'min_accounts': min_accounts,
        'window_days': days,
    })


@api_view(['GET'])
@permission_classes([IsPlatformAdmin])
def admin_shared_ip_detail(request, ip_address):
    """GET /api/admin/security/shared-ip/<ip_address>/ — shu IP ortidagi hisoblar.

    Ro'yxatdagi qatorning "Ko'rish" tugmasi uchun: kim aynan shu manzildan
    kirgan, hisob faolmi va oxirgi marta qachon kirgan.

    Ro'yxatdan farqli o'laroq bu yerda VAQT OYNASI yo'q: admin allaqachon
    aniq IP'ni tekshirmoqda va "bu manzil bilan umuman kim bog'langan" degan
    to'liq javob kerak.

    Noma'lum IP uchun 404 emas, bo'sh `accounts` qaytadi: manzil o'chirilgan
    obyekt emas — shunchaki hech kim undan kirmagan.
    """
    User = get_user_model()
    last_seen_by_user = get_ip_account_ids(ip_address)
    users = (
        User.objects
        .filter(pk__in=last_seen_by_user.keys())
        .only('id', 'full_name', 'normalized_phone', 'is_active')
    )
    accounts = [{
        'user_id': u.id,
        'full_name': u.full_name,
        # Raqam maskalanmaydi: endpoint faqat platforma admini uchun va aynan
        # hisobni tanib olish uchun kerak (admin_users_export bilan bir xil
        # qoida).
        'phone': u.normalized_phone,
        'is_active': u.is_active,
        'last_login_at': last_seen_by_user[u.id].isoformat(),
    } for u in users]
    # Eng oxirgi kirgan hisob birinchi — admin qaysi hisob hali ham faol
    # ishlatilayotganini darhol ko'radi.
    accounts.sort(key=lambda a: a['last_login_at'], reverse=True)
    return Response({
        'ip_address': ip_address,
        'accounts': accounts,
    })
