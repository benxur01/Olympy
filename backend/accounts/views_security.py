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

from .models import AuditLog
from .security_queries import (
    get_device_account_ids,
    get_ip_account_ids,
    get_shared_device_accounts,
    get_shared_ip_accounts,
)

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

# Qurilma bo'yicha ro'yxat: chegara IP'dagidan PAST — bitta qurilmadan 3 ta
# hisob imtihon topshirgani bitta IP ortidagi 5 ta hisobdan ancha shubhaliroq
# (IP'ni butun sinfxona/oila baham ko'radi, qurilmani esa yo'q). Qolgan
# chegaralar (pol/shift, vaqt oynasi, qator soni) IP bloki bilan bir xil
# siyosat — ataylab bir xil qiymatlarga bog'langan.
SHARED_DEVICE_DEFAULT_MIN_ACCOUNTS = 3
SHARED_DEVICE_MIN_ACCOUNTS_FLOOR = SHARED_IP_MIN_ACCOUNTS_FLOOR
SHARED_DEVICE_MIN_ACCOUNTS_CEIL = SHARED_IP_MIN_ACCOUNTS_CEIL
SHARED_DEVICE_DEFAULT_WINDOW_DAYS = SHARED_IP_DEFAULT_WINDOW_DAYS
SHARED_DEVICE_MAX_WINDOW_DAYS = SHARED_IP_MAX_WINDOW_DAYS
SHARED_DEVICE_MAX_ROWS = SHARED_IP_MAX_ROWS


def _clamped_int_param(request, name, default, floor, ceil):
    """`?name=` ni butun songa keltirib `[floor, ceil]` oralig'iga siqadi.

    Noto'g'ri qiymat XATO emas: admin paneli filtri uchun 400 qaytarish
    o'rniga standart qiymatga qaytamiz (bo'sh satr ham shunga tushadi).
    """
    try:
        value = int(request.query_params.get(name) or default)
    except (TypeError, ValueError):
        value = default
    return max(floor, min(value, ceil))


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
    min_accounts = _clamped_int_param(
        request, 'min_accounts', SHARED_IP_DEFAULT_MIN_ACCOUNTS,
        SHARED_IP_MIN_ACCOUNTS_FLOOR, SHARED_IP_MIN_ACCOUNTS_CEIL,
    )
    days = _clamped_int_param(
        request, 'days', SHARED_IP_DEFAULT_WINDOW_DAYS, 1, SHARED_IP_MAX_WINDOW_DAYS,
    )

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

    Javobda maskalanmagan telefon raqamlari bor, shu sababli ko'rish fakti
    audit jurnaliga yoziladi (`admin_user_detail` bilan bir xil qoida).
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
    # Nishon model obyekti emas (IP — obyekt emas), shuning uchun `target`
    # yo'q va tekshirilgan manzil `extra` da. Hisoblar ro'yxati o'rniga faqat
    # SONI: audit jurnali uzoq saqlanadi, unga o'nlab id yozish shart emas.
    AuditLog.log(request, 'admin_sensitive_data_view', extra={
        'view': 'shared_ip',
        'ip_address': ip_address,
        'accounts': len(accounts),
    })
    return Response({
        'ip_address': ip_address,
        'accounts': accounts,
    })


@api_view(['GET'])
@permission_classes([IsPlatformAdmin])
def admin_shared_device_accounts(request):
    """GET /api/admin/security/shared-device/?min_accounts=3&days=30

    Bitta QURILMADAN imtihon topshirgan turli hisoblar. IP ro'yxatining
    to'ldiruvchisi: bitta Wi-Fi ortidagi o'nlab haqiqiy hisob bu yerda
    guruhlanmaydi (har o'quvchining o'z qurilmasi), VPN orqali IP'ini
    almashtirgan hisob esa qurilma izi bo'yicha baribir bir joyga tushadi.

    Javob `shared-ip/` bilan bir xil shaklda — `ip_address` o'rniga
    `device_id`: panel ikkala jadvalni bitta komponent bilan chizadi.
    """
    min_accounts = _clamped_int_param(
        request, 'min_accounts', SHARED_DEVICE_DEFAULT_MIN_ACCOUNTS,
        SHARED_DEVICE_MIN_ACCOUNTS_FLOOR, SHARED_DEVICE_MIN_ACCOUNTS_CEIL,
    )
    days = _clamped_int_param(
        request, 'days', SHARED_DEVICE_DEFAULT_WINDOW_DAYS, 1, SHARED_DEVICE_MAX_WINDOW_DAYS,
    )

    rows = get_shared_device_accounts(
        min_accounts=min_accounts, window_days=days,
    )[:SHARED_DEVICE_MAX_ROWS]
    return Response({
        'results': [{
            'device_id': row['last_device_id'],
            'distinct_users': row['distinct_users'],
            'first_seen': row['first_seen'].isoformat() if row['first_seen'] else None,
            'last_seen': row['last_seen'].isoformat() if row['last_seen'] else None,
        } for row in rows],
        'min_accounts': min_accounts,
        'window_days': days,
    })


@api_view(['GET'])
@permission_classes([IsPlatformAdmin])
def admin_shared_device_detail(request, device_id):
    """GET /api/admin/security/shared-device/<device_id>/ — qurilma ortidagi hisoblar.

    `admin_shared_ip_detail` bilan bir xil qoidalar: vaqt oynasi yo'q (admin
    aniq qurilmani tekshirmoqda), noma'lum qurilma uchun 404 emas — bo'sh
    `accounts`, va ko'rish fakti audit jurnaliga yoziladi.
    """
    User = get_user_model()
    last_seen_by_user = get_device_account_ids(device_id)
    users = (
        User.objects
        .filter(pk__in=last_seen_by_user.keys())
        .only('id', 'full_name', 'normalized_phone', 'is_active')
    )
    accounts = [{
        'user_id': u.id,
        'full_name': u.full_name,
        'phone': u.normalized_phone,
        'is_active': u.is_active,
        # IP ro'yxatidagi `last_login_at` emas: bu yerda vaqt KIRISH emas,
        # oxirgi imtihon sessiyasi boshlangan payt.
        'last_session_at': last_seen_by_user[u.id].isoformat(),
    } for u in users]
    accounts.sort(key=lambda a: a['last_session_at'], reverse=True)
    AuditLog.log(request, 'admin_sensitive_data_view', extra={
        'view': 'shared_device',
        'device_id': device_id,
        'accounts': len(accounts),
    })
    return Response({
        'device_id': device_id,
        'accounts': accounts,
    })
