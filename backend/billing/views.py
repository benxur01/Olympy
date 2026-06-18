import hashlib
import hmac
import base64
import logging
from decimal import Decimal, InvalidOperation
from django.conf import settings
from django.db import transaction
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
    # Endpoint boshida: hech bir to'lov provayderi sozlanmagan bo'lsa (CLICK_*
    # va PAYME_* kalitlari None) billing umuman ishlamaydi — darhol 503 qaytaramiz,
    # plan/tx yaratib keyin yarim yo'lda to'xtab qolishning oldini olamiz.
    if not getattr(settings, 'BILLING_ENABLED', False):
        logger.warning("Checkout so'raldi, lekin hech bir to'lov provayderi sozlanmagan.")
        return Response(
            {'detail': "To'lov tizimi sozlanmagan. Iltimos administrator bilan bog'laning."},
            status=http_status.HTTP_503_SERVICE_UNAVAILABLE
        )

    plan_id = request.data.get('plan_id')
    provider = request.data.get('provider')

    if not plan_id or not provider:
        return Response({'detail': "plan_id va provider kiritilishi shart"}, status=http_status.HTTP_400_BAD_REQUEST)

    # Tanlangan provayder sozlanmagan bo'lsa — tx yaratmasdan oldin to'xtaymiz.
    if provider == 'click' and not getattr(settings, 'CLICK_ENABLED', False):
        logger.warning("Click checkout so'raldi, lekin CLICK_* kalitlari to'liq sozlanmagan.")
        return Response(
            {'detail': "Click to'lov tizimi sozlanmagan. Iltimos administrator bilan bog'laning."},
            status=http_status.HTTP_503_SERVICE_UNAVAILABLE
        )
    if provider == 'payme' and not getattr(settings, 'PAYME_ENABLED', False):
        logger.warning("Payme checkout so'raldi, lekin PAYME_* kalitlari to'liq sozlanmagan.")
        return Response(
            {'detail': "Payme to'lov tizimi sozlanmagan. Iltimos administrator bilan bog'laning."},
            status=http_status.HTTP_503_SERVICE_UNAVAILABLE
        )

    plan = get_object_or_404(SubscriptionPlan, pk=plan_id, is_active=True)
    
    # Create a pending transaction. plan'ni saqlaymiz — webhook obunani
    # aktivlashtirayotganda aynan shu plan ishlatiladi (narx bo'yicha taxminsiz).
    tx = PaymentTransaction.objects.create(
        user=request.user,
        plan=plan,
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


def _client_ip(request):
    """Reverse-proxy (Render) ortidagi real client IP'ni aniqlaydi.

    Hujumchi soxta `X-Forwarded-For` header qo'shib rate limiter'ni chetlab
    o'tmasligi uchun BIRINCHI emas, OXIRGI elementni olamiz: Render proxy
    mijoz yuborgan qiymat oxiriga real ulanish IP'sini qo'shadi (1 hop), shu
    sababli oxirgi qiymat ishonchli. Header yo'q bo'lsa REMOTE_ADDR.
    """
    xff = request.META.get('HTTP_X_FORWARDED_FOR', '')
    if xff:
        parts = [p.strip() for p in xff.split(',') if p.strip()]
        if parts:
            return parts[-1]
    return request.META.get('REMOTE_ADDR', '') or 'unknown'


def _webhook_rate_limited(request, scope, limit=60, window=60):
    """Oddiy cache-asosli IP rate limiter (yangi dependency talab qilmaydi).

    Bir IP'dan `window` soniyada `limit` so'rovdan ko'p kelsa True qaytaradi.
    To'lov webhook'lari brute-force/spam'dan himoyalanadi. Cache ishlamasa
    (xatolik) — fail-open: webhook bloklanmaydi (to'lovlar yo'qolmasligi uchun).
    """
    try:
        from django.core.cache import cache
        ip = _client_ip(request)
        key = f"webhook_rl:{scope}:{ip}"
        current = cache.get(key, 0)
        if current >= limit:
            return True
        # add() faqat kalit yo'q bo'lsa o'rnatadi (TTL bilan oynani boshlaydi),
        # keyin incr() atomik oshiradi.
        if not cache.add(key, 1, window):
            try:
                cache.incr(key)
            except ValueError:
                cache.set(key, 1, window)
    except Exception:
        return False
    return False


def _capture_billing_issue(message):
    """Obuna aktivlashtirishdagi jiddiy nomuvofiqlikni Sentry'ga yuboradi.

    Sentry sozlanmagan (DSN yo'q) yoki paket o'rnatilmagan bo'lsa jimgina
    o'tib ketadi — log'ga error allaqachon yozilgan bo'ladi.
    """
    try:
        import sentry_sdk
        sentry_sdk.capture_message(message, level='error')
    except Exception:
        pass


def _activate_subscription(user, amount, plan_id=None):
    # Plan'ni aniqlash. USTUVORLIK: webhook payload/transaction'dagi plan_id
    # (eng aniq — foydalanuvchi checkout'da tanlagan aynan shu plan). plan_id
    # yo'q bo'lsagina narx bo'yicha qidiramiz. DIQQAT: bir xil narxli bir
    # nechta aktiv plan bo'lsa, narx bo'yicha tanlash noaniq (noto'g'ri muddatli
    # obuna berilishi mumkin) — bunday holat ma'lumotlar konfiguratsiyasi xatosi,
    # shuning uchun error log + Sentry bilan adminni xabardor qilamiz.
    plan = None
    if plan_id:
        plan = SubscriptionPlan.objects.filter(pk=plan_id, is_active=True).first()
        if plan and plan.price != amount:
            logger.warning(
                "Obuna aktivlashtirish: plan_id=%s narxi (%s) to'langan summa (%s) "
                "bilan mos kelmadi — payload tekshirilsin.",
                plan_id, plan.price, amount,
            )

    if not plan:
        matching = list(
            SubscriptionPlan.objects.filter(price=amount, is_active=True)[:2]
        )
        if len(matching) > 1:
            # Bir xil narxli bir nechta aktiv plan — qaysi biri berilishi
            # noaniq. Noto'g'ri muddatli obuna berishdan ko'ra AVTOMATIK
            # bermaslik xavfsizroq: error log + Sentry bilan adminni
            # xabardor qilamiz, obuna qo'lda ulanadi.
            msg = (
                f"Obuna aktivlashtirish: {amount} summa uchun bir nechta aktiv "
                f"plan topildi (id'lar: {[p.id for p in matching]}). Qaysi biri "
                f"to'g'riligi noaniq — obuna AVTOMATIK berilmadi. Webhook "
                f"payload'iga plan ID qo'shilsin yoki bir xil narxli planlar "
                f"ajratilsin (user_id={getattr(user, 'id', None)})."
            )
            logger.error(msg)
            _capture_billing_issue(msg)
            return False
        plan = matching[0] if matching else None

    if not plan:
        # Mos plan topilmadi. Avval xavfli "ixtiyoriy birinchi aktiv plan"
        # fallback'i bor edi — u tasodifiy (noto'g'ri narx/muddatdagi) obuna
        # berishi mumkin edi, shuning uchun olib tashlandi. Endi: obuna
        # yaratmaymiz, ammo to'lov allaqachon o'tgani uchun webhook'ni xato
        # bilan to'xtatmaymiz (chaqiruvchi exception kutmaydi); o'rniga error
        # log + Sentry bilan adminni xabardor qilamiz — qo'lda obuna beriladi.
        msg = (
            f"Obuna aktivlashtirish: to'langan {amount} summaga mos aktiv plan "
            f"topilmadi (plan_id={plan_id}, user_id={getattr(user, 'id', None)}). "
            f"Obuna AVTOMATIK berilmadi — qo'lda tekshirib obuna ulang."
        )
        logger.error(msg)
        _capture_billing_issue(msg)
        # Explicit False: chaqiruvchi (webhook) obuna berilmaganini bilib,
        # qo'shimcha aniq log qoldiradi. Jimgina None qaytib, webhook
        # "muvaffaqiyat" deb hisoblab o'tib ketishining oldini olamiz.
        return False

    if plan:
        # end_date'ni model save() ham hisoblaydi, lekin bu yerda aniq
        # o'rnatib qo'yamiz — plan.duration_days bo'yicha. Shunda obuna doim
        # to'g'ri muddatga ega bo'ladi (model logikasiga bog'liqlik kamayadi).
        from datetime import timedelta
        start = timezone.now()
        end = start + timedelta(days=plan.duration_days or 30)
        # UserSubscription.save() o'z navbatida User.is_premium ni yangilaydi
        # (billing/models.py). Bu ikki yozuv — obuna yozuvi va is_premium
        # flag'i — bitta atomik birlik bo'lishi kerak: agar oraliqda xato
        # bo'lsa yoki tashqi blok rollback qilsa, ikkalasi ham birga qaytadi
        # va yarim holat (obuna bor, premium yo'q yoki aksincha) qolmaydi.
        with transaction.atomic():
            UserSubscription.objects.create(
                user=user,
                plan=plan,
                start_date=start,
                end_date=end,
                is_active=True
            )
        # Cache invalidate va email yuborishni transaction.on_commit'ga ko'chirdik:
        # _activate_subscription chaqiruvchilari (Click/Payme webhook) bu kodni
        # tashqi transaction.atomic() ichida ishga tushiradi. Agar email/cache'ni
        # bevosita chaqirsak, tashqi blok keyin rollback bo'lsa DB yozuv bekor
        # qilinadi, lekin email allaqachon yuborilgan bo'lar edi (yon ta'sir).
        # on_commit faqat eng tashqi tranzaksiya muvaffaqiyatli commit bo'lganda
        # ishlaydi; rollback bo'lsa umuman chaqirilmaydi. Atomic blokdan tashqari
        # chaqirilsa (test va h.k.) on_commit darhol bajariladi.
        def _on_subscription_committed():
            # /me endpoint subscription cache'ini bekor qilamiz — obuna endi aktiv,
            # foydalanuvchi premium statusini darhol ko'rishi kerak.
            try:
                from accounts.utils import invalidate_user_subscription_cache
                invalidate_user_subscription_cache(user.id)
            except Exception:
                pass
            # Obuna faollashtirildi — foydalanuvchiga email xabar (email maydoni
            # bo'lmasa yoki yuborishda xato bo'lsa jimgina o'tib ketadi).
            try:
                from accounts.email_utils import send_subscription_activated
                send_subscription_activated(user)
            except Exception:
                pass
            # Telegram orqali batafsil "Obuna faollashdi" xabari: plan nomi,
            # muddati va summasi bilan (chat_id ulangan bo'lsa). Email maydoni
            # hozircha yo'q, shuning uchun Telegram asosiy kanal — ulanmagan
            # bo'lsa jimgina o'tib ketadi.
            try:
                from notifications.services import send_payment_success_notification
                send_payment_success_notification(
                    user,
                    plan_name=plan.name,
                    amount=plan.price,
                    end_date=end,
                )
            except Exception:
                pass

        transaction.on_commit(_on_subscription_committed)
        # Obuna muvaffaqiyatli yaratildi — chaqiruvchiga aniq signal.
        return True


def _notify_payment_pending(tx):
    """To'lov boshlandi (pending) — foydalanuvchiga "qabul qilindi, tekshirilmoqda".

    Telegram + email orqali. IDEMPOTENT: bir tx uchun faqat bir marta yuboradi
    (cache-guard) — Click Prepare yoki Payme CreateTransaction takror chaqirilsa
    foydalanuvchi bir nechta bir xil xabar olmaydi. Cache ishlamasa fail-open
    (xabar baribir yuboriladi). Har bir kanal alohida try/except.
    """
    try:
        from django.core.cache import cache
        guard_key = f"billing_pending_notified:{tx.id}"
        # add() faqat kalit yo'q bo'lsa True qaytaradi — birinchi chaqiruvni
        # belgilaydi. Allaqachon belgilangan bo'lsa takror yubormaymiz.
        if not cache.add(guard_key, 1, 24 * 3600):
            return
    except Exception:
        pass  # cache yo'q/xato — fail-open, xabar yuboriladi

    user = tx.user

    def _notify_user():
        try:
            from notifications.services import send_payment_received_to_user
            send_payment_received_to_user(user)
        except Exception:
            logger.exception("Telegram 'to'lov qabul qilindi' xabari yuborilmadi (tx=%s)", tx.id)
        try:
            from accounts.email_utils import send_payment_received
            send_payment_received(user)
        except Exception:
            logger.exception("Email 'to'lov qabul qilindi' xabari yuborilmadi (tx=%s)", tx.id)

    # Atomik blok ichidan chaqirilsa commit'dan keyin yuboramiz (rollback'da
    # noto'g'ri xabar qolmasin); tashqarida bo'lsa darhol.
    try:
        transaction.on_commit(_notify_user)
    except Exception:
        _notify_user()


def _handle_activation_failed(tx, provider_label):
    """To'lov o'tdi, lekin obuna AVTOMATIK berilmaganda chaqiriladi.

    1) tx.failure_reason'ga sababni yozadi (admin panelida ko'rinishi uchun).
    2) Foydalanuvchiga "muammo yuz berdi, support bilan bog'laning" xabarini
       Telegram + email orqali yuboradi.

    Webhook tashqi transaction.atomic() ichidan chaqiradi — DB yozuv va xabar
    yuborishni on_commit'ga qo'yamiz, shunda tashqi blok rollback bo'lsa ham yon
    ta'sir (noto'g'ri xabar) qolmaydi. Har bir qadam alohida try/except — to'lov
    oqimi hech qachon buzilmaydi.
    """
    reason = (
        "To'lov qabul qilindi, lekin mos aktiv plan topilmadi — obuna qo'lda "
        "ulanishi kerak."
    )
    try:
        tx.failure_reason = reason
        tx.save(update_fields=['failure_reason', 'updated_at'])
    except Exception:
        logger.exception("failure_reason saqlanmadi (tx=%s)", getattr(tx, 'id', None))

    user = tx.user
    support_contact = getattr(settings, 'OLYMPY_SUPPORT_CONTACT', '') or None

    def _notify_user():
        try:
            from notifications.services import send_payment_failed_to_user
            send_payment_failed_to_user(user, support_contact=support_contact)
        except Exception:
            logger.exception("Telegram 'to'lov muammosi' xabari yuborilmadi (tx=%s)", tx.id)
        try:
            from accounts.email_utils import send_payment_failed
            send_payment_failed(user, support_contact=support_contact)
        except Exception:
            logger.exception("Email 'to'lov muammosi' xabari yuborilmadi (tx=%s)", tx.id)

    try:
        transaction.on_commit(_notify_user)
    except Exception:
        # Atomik blokdan tashqarida bo'lsa (kutilmagan), to'g'ridan-to'g'ri.
        _notify_user()

    logger.error(
        "%s to'lovi qabul qilindi (tx=%s, user_id=%s, amount=%s), "
        "lekin obuna AVTOMATIK berilmadi — qo'lda premium ulang.",
        provider_label, tx.id, tx.user_id, tx.amount,
    )


# ─── CLICK CALLBACK API ───────────────────────────────────────────────────────
@csrf_exempt
def click_webhook(request):
    """Click payment system callback handler."""
    if request.method != 'POST':
        return JsonResponse({'error': -3, 'error_note': 'Method not allowed'})

    # Endpoint boshida: Click sozlanmagan bo'lsa (kalitlar None) webhook'ni
    # qayta ishlamaymiz — imzo tekshirib bo'lmaydi.
    if not getattr(settings, 'CLICK_ENABLED', False):
        logger.warning("Click webhook chaqirildi, lekin Click sozlanmagan (CLICK_* kalitlari None).")
        return JsonResponse({'error': -1, 'error_note': 'SIGN CHECK FAILED'})

    if _webhook_rate_limited(request, 'click'):
        logger.warning("Click webhook rate limit oshib ketdi: ip=%s", _client_ip(request))
        return JsonResponse({'error': -4, 'error_note': 'Too many requests'})

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
    
    # Timing-safe taqqoslash — oddiy != belgi-belgi solishtirib, imzoni
    # timing-hujum bilan tiklashga yo'l qo'yishi mumkin.
    if not hmac.compare_digest(str(my_sign), str(sign_string or '')):
        return JsonResponse({'error': -1, 'error_note': 'SIGN CHECK FAILED'})

    # error qiymati noto'g'ri (raqam bo'lmagan) bo'lsa int() ValueError beradi —
    # webhook 500 bilan qulamasligi uchun himoyalaymiz.
    try:
        error_code = int(error) if error not in (None, '') else 0
    except (TypeError, ValueError):
        error_code = 0

    # action ham xuddi shunday: None yoki raqam bo'lmagan qiymatda int()
    # 500 bilan qulardi — himoyalab, noto'g'ri bo'lsa -3 qaytaramiz.
    try:
        action_code = int(action)
    except (TypeError, ValueError):
        return JsonResponse({'error': -3, 'error_note': 'Invalid action'})
    if error_code < 0:
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

    # amount None yoki vergulli ("123,456") kelsa Decimal() InvalidOperation
    # otadi va to'lov 500 bilan qulardi — try/except bilan himoyalaymiz va
    # vergulni nuqtaga almashtiramiz.
    try:
        amount_decimal = Decimal(str(amount).replace(',', '.'))
    except (InvalidOperation, TypeError, ValueError):
        return JsonResponse({'error': -2, 'error_note': 'Incorrect amount'})

    if amount_decimal != tx.amount:
        return JsonResponse({'error': -2, 'error_note': 'Incorrect amount'})

    # Action = 0: Prepare
    if action_code == 0:
        if tx.status != PaymentTransaction.STATUS_PENDING:
            return JsonResponse({'error': -4, 'error_note': 'Already paid or cancelled'})

        # To'lov boshlandi (Prepare) — foydalanuvchiga "qabul qilindi,
        # tekshirilmoqda" xabari. _notify_payment_pending idempotent (cache-guard).
        _notify_payment_pending(tx)

        return JsonResponse({
            'click_trans_id': click_trans_id,
            'merchant_trans_id': merchant_trans_id,
            'merchant_prepare_id': tx.id,
            'error': 0,
            'error_note': 'Success'
        })
        
    # Action = 1: Complete
    elif action_code == 1:
        if tx.status == PaymentTransaction.STATUS_SUCCESS:
            return JsonResponse({
                'click_trans_id': click_trans_id,
                'merchant_trans_id': merchant_trans_id,
                'merchant_confirm_id': tx.id,
                'error': 0,
                'error_note': 'Already confirmed'
            })

        # Race condition himoyasi: parallel Complete webhook'lari bir vaqtda
        # tx'ni o'qib, ikkalasi ham _activate_subscription chaqirib dublikat
        # obuna yaratishi mumkin edi. select_for_update qatorni lock qiladi,
        # ichida statusni qayta tekshiramiz (allaqachon SUCCESS bo'lsa ikkinchi
        # so'rov obuna yaratmaydi) va save + activate bitta atomik blokda.
        with transaction.atomic():
            tx = PaymentTransaction.objects.select_for_update().get(pk=tx.pk)
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
            tx.manager_commission = tx.amount * settings.MANAGER_COMMISSION_RATE
            tx.save()
            # Activate premium subscription for the user. To'lov o'tdi (tx
            # SUCCESS), shuning uchun Click'ka baribir 'Success' qaytaramiz —
            # aks holda Click qayta urinib, dublikat callback yuboradi. Ammo
            # obuna berilmasa (plan topilmadi) failure_reason yozamiz va
            # foydalanuvchini xabardor qilamiz: to'lov qabul qilingan, premium
            # qo'lda ulanishi kerak.
            if not _activate_subscription(tx.user, tx.amount, plan_id=tx.plan_id):
                _handle_activation_failed(tx, 'Click')

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

    # Endpoint boshida: Payme sozlanmagan bo'lsa (kalitlar None) webhook'ni
    # qayta ishlamaymiz — avtorizatsiyani tekshirib bo'lmaydi.
    if not getattr(settings, 'PAYME_ENABLED', False):
        logger.warning("Payme webhook chaqirildi, lekin Payme sozlanmagan (PAYME_* kalitlari None).")
        return JsonResponse({'error': {'code': -32504, 'message': 'Insufficient privilege'}}, status=200)

    if _webhook_rate_limited(request, 'payme'):
        logger.warning("Payme webhook rate limit oshib ketdi: ip=%s", _client_ip(request))
        return JsonResponse({'error': {'code': -32504, 'message': 'Too many requests'}}, status=200)

    # HTTP Basic Authorization check. Authorization is enforced regardless of
    # DEBUG — a payment webhook must never run unauthenticated, even locally,
    # otherwise anyone could mark transactions paid and grant free premium.
    auth_header = request.headers.get('Authorization', '')
    payme_key = getattr(settings, 'PAYME_SECRET_KEY', None)
    if not payme_key:
        logger.warning(
            "Payme webhook chaqirildi, lekin PAYME_SECRET_KEY o'rnatilmagan — "
            "avtorizatsiyani tekshirib bo'lmaydi, so'rov rad etildi."
        )
        return JsonResponse({'error': {'code': -32504, 'message': 'Insufficient privilege'}}, status=200)
    expected_auth = f"Paycom:{payme_key}"
    encoded_auth = base64.b64encode(expected_auth.encode()).decode()

    auth_parts = auth_header.split(' ', 1)
    # Timing-safe taqqoslash (hmac.compare_digest) — oddiy != timing-hujumga ochiq.
    # ESLATMA (audit #5): Payme JSON-RPC protokoli rasman faqat HTTP Basic
    # (base64(Paycom:secret)) avtorizatsiyani qo'llaydi — Payme so'rovlarida
    # HMAC imzo headeri yo'q, shuning uchun Click'dagi kabi HMAC tekshiruv
    # qo'shib bo'lmaydi (real webhooklar sinardi). Himoya: (1) compare_digest
    # bilan constant-time solishtirish, (2) endpoint faqat HTTPS orqali
    # ochilishi shart (SECURE_SSL_REDIRECT production'da yoqilgan).
    if (
        len(auth_parts) != 2
        or auth_parts[0] != 'Basic'
        or not hmac.compare_digest(auth_parts[1], encoded_auth)
    ):
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
            
        # amount tiyinda keladi (1 UZS = 100 tiyin). Decimal(str(...)) va
        # Decimal('100') bilan bo'lib aniq natija olamiz — float aralashuvi
        # tufayli yuzaga keladigan aniqsizlik (masalan 0.1+0.2) bo'lmasin.
        # amount None yoki noto'g'ri formatda kelsa InvalidOperation otiladi —
        # 500 o'rniga JSON-RPC -31001 xatosini qaytaramiz.
        try:
            amount_uzs = Decimal(str(amount)) / Decimal('100')
        except (InvalidOperation, TypeError, ValueError):
            return rpc_error(-31001, "Noto'g'ri summa", "Неверная сумма")
        if amount_uzs != tx.amount:
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

        # Payme tranzaksiya ID'si bo'sh kelsa provider_transaction_id=None
        # yozilib, keyingi so'rovlarda noaniq qidiruv kelib chiqardi.
        if not payme_trans_id:
            return rpc_error(-31050, "Tranzaksiya ID ko'rsatilmagan", "Не указан ID транзакции")
        
        # Race condition himoyasi: parallel CreateTransaction so'rovlari bir
        # vaqtda tx'ni o'qib, ikkalasi ham provider_transaction_id ni yozishi
        # mumkin edi. select_for_update qatorni lock qiladi va tekshiruv +
        # save bitta atomik blokda bajariladi.
        with transaction.atomic():
            try:
                tx = PaymentTransaction.objects.select_for_update().get(pk=tx_id)
            except PaymentTransaction.DoesNotExist:
                return rpc_error(-31050, "Tranzaksiya topilmadi", "Транзакция не найдена")

            # amount tiyinda — CheckPerformTransaction'dagi kabi aniq Decimal
            # solishtirish (float aralashuvisiz). None/buzuq qiymatda
            # InvalidOperation o'rniga -31001 qaytariladi.
            try:
                amount_uzs = Decimal(str(amount)) / Decimal('100')
            except (InvalidOperation, TypeError, ValueError):
                return rpc_error(-31001, "Noto'g'ri summa", "Неверная сумма")
            if amount_uzs != tx.amount:
                return rpc_error(-31001, "Noto'g'ri summa", "Неверная сумма")

            if tx.status == PaymentTransaction.STATUS_SUCCESS:
                return rpc_error(-31051, "Tranzaksiya allaqachon to'langan", "Транзакция уже оплачена")

            if tx.provider_transaction_id and tx.provider_transaction_id != payme_trans_id:
                return rpc_error(-31051, "Boshqa tranzaksiya mavjud", "Существует другая транзакция")

            if not tx.provider_transaction_id:
                tx.provider_transaction_id = payme_trans_id
                tx.save()
                # To'lov boshlandi (pending) — foydalanuvchiga "qabul qilindi,
                # tekshirilmoqda" xabari. Faqat birinchi marta (yangi
                # provider_transaction_id yozilganda) — takror yubormaslik uchun.
                _notify_payment_pending(tx)

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
        # ID bo'sh bo'lsa provider_transaction_id=None bo'yicha qidiruv
        # MultipleObjectsReturned (500) berishi mumkin — oldindan rad etamiz.
        if not payme_trans_id:
            return rpc_error(-31050, "Tranzaksiya ID ko'rsatilmagan", "Не указан ID транзакции")
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
            
        if tx.status in (PaymentTransaction.STATUS_FAILED, PaymentTransaction.STATUS_CANCELLED):
            return rpc_error(-31008, "Tranzaksiya bekor qilingan", "Транзакция отменена")

        # Race condition himoyasi: parallel PerformTransaction so'rovlari
        # dublikat obuna yaratmasligi uchun tx'ni lock qilib, ichida statusni
        # qayta tekshiramiz va save + activate bitta atomik blokda bajariladi.
        with transaction.atomic():
            tx = PaymentTransaction.objects.select_for_update().get(pk=tx.pk)
            if tx.status == PaymentTransaction.STATUS_SUCCESS:
                return JsonResponse({
                    'result': {
                        'transaction': str(tx.id),
                        'perform_time': int(tx.updated_at.timestamp() * 1000),
                        'state': 2
                    },
                    'id': rpc_id
                })
            # Success!
            tx.status = PaymentTransaction.STATUS_SUCCESS
            tx.manager_commission = tx.amount * settings.MANAGER_COMMISSION_RATE
            tx.save()
            # Activate premium. To'lov o'tdi (tx SUCCESS), shuning uchun
            # Payme'ga baribir state=2 qaytaramiz — aks holda Payme qayta
            # urinadi. Ammo obuna berilmasa (plan topilmadi) failure_reason
            # yozamiz va foydalanuvchini xabardor qilamiz: to'lov qabul
            # qilingan, premium qo'lda ulanishi kerak.
            if not _activate_subscription(tx.user, tx.amount, plan_id=tx.plan_id):
                _handle_activation_failed(tx, 'Payme')

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
        # Payme `reason` kodi (int) — saqlanadi va CheckTransaction'da qaytariladi.
        try:
            cancel_reason = int(params.get('reason'))
        except (TypeError, ValueError):
            cancel_reason = None
        if not payme_trans_id:
            return rpc_error(-31050, "Tranzaksiya ID ko'rsatilmagan", "Не указан ID транзакции")
        try:
            tx = PaymentTransaction.objects.get(provider_transaction_id=payme_trans_id)
        except PaymentTransaction.DoesNotExist:
            return rpc_error(-31050, "Tranzaksiya topilmadi", "Транзакция не найдена")

        def _cancel_response(tx, state):
            return JsonResponse({
                'result': {
                    'transaction': str(tx.id),
                    'cancel_time': int(tx.updated_at.timestamp() * 1000),
                    'state': state,
                },
                'id': rpc_id
            })

        # Idempotentlik: allaqachon bekor qilingan tranzaksiya uchun xuddi
        # shu javob qaytariladi (Payme qayta so'rashi mumkin).
        if tx.status == PaymentTransaction.STATUS_CANCELLED:
            return _cancel_response(tx, -2)
        if tx.status == PaymentTransaction.STATUS_FAILED:
            return _cancel_response(tx, -1)

        # Race condition himoyasi: CreateTransaction/PerformTransaction kabi
        # bu yerda ham tx'ni lock qilib, statusni lock ostida qayta tekshiramiz
        # va save bitta atomik blokda bajariladi.
        with transaction.atomic():
            tx = PaymentTransaction.objects.select_for_update().get(pk=tx.pk)
            if tx.status == PaymentTransaction.STATUS_CANCELLED:
                return _cancel_response(tx, -2)
            if tx.status == PaymentTransaction.STATUS_FAILED:
                return _cancel_response(tx, -1)

            if tx.status == PaymentTransaction.STATUS_SUCCESS:
                # Refund stsenariysi (Payme sertifikatsiyasi): bajarilgan
                # to'lovni bekor qilish — state=-2 va obuna deaktivatsiyasi.
                # Shu to'lov bergan obunani topamiz (user + plan bo'yicha
                # eng so'nggi aktiv obuna).
                sub = (
                    UserSubscription.objects
                    .select_for_update()
                    .filter(user_id=tx.user_id, plan_id=tx.plan_id, is_active=True)
                    .order_by('-created_at')
                    .first()
                )
                # Obuna topilmasa yoki muddati allaqachon tugagan bo'lsa —
                # foydalanuvchi premiumdan to'liq foydalanib bo'lgan, bekor
                # qilib (pul qaytarib) bo'lmaydi: -31007.
                if sub is None or sub.end_date <= timezone.now():
                    return rpc_error(
                        -31007,
                        "Tranzaksiyani bekor qilib bo'lmaydi",
                        "Невозможно отменить транзакцию",
                    )
                # Obunani o'chiramiz — UserSubscription.save() o'zi
                # User.is_premium flag'ini sinxronlaydi.
                sub.is_active = False
                sub.save(update_fields=['is_active'])
                tx.status = PaymentTransaction.STATUS_CANCELLED
                tx.cancel_reason = cancel_reason
                tx.failure_reason = (
                    f"Payme refund: tranzaksiya bekor qilindi (reason={cancel_reason})"
                )
                tx.save()
                logger.warning(
                    "Payme refund: tx=%s user_id=%s obuna deaktivatsiya qilindi "
                    "(reason=%s)", tx.id, tx.user_id, cancel_reason,
                )

                # /me subscription cache'ini commit'dan keyin bekor qilamiz —
                # foydalanuvchi premium statusi darhol yangilanishi kerak.
                def _invalidate_cache(user_id=tx.user_id):
                    try:
                        from accounts.utils import invalidate_user_subscription_cache
                        invalidate_user_subscription_cache(user_id)
                    except Exception:
                        pass
                transaction.on_commit(_invalidate_cache)
                cancelled_state = -2
            else:
                # Hali bajarilmagan (pending) tranzaksiya — oddiy bekor: state=-1.
                tx.status = PaymentTransaction.STATUS_FAILED
                tx.cancel_reason = cancel_reason
                tx.save()
                cancelled_state = -1

        return _cancel_response(tx, cancelled_state)

    # 5. CheckTransaction
    elif method == 'CheckTransaction':
        payme_trans_id = params.get('id')
        if not payme_trans_id:
            return rpc_error(-31050, "Tranzaksiya ID ko'rsatilmagan", "Не указан ID транзакции")
        try:
            tx = PaymentTransaction.objects.get(provider_transaction_id=payme_trans_id)
        except PaymentTransaction.DoesNotExist:
            return rpc_error(-31050, "Tranzaksiya topilmadi", "Транзакция не найдена")
            
        state = 1
        if tx.status == PaymentTransaction.STATUS_SUCCESS:
            state = 2
        elif tx.status == PaymentTransaction.STATUS_CANCELLED:
            # Bajarilgandan keyin bekor qilingan (refund) — Payme state=-2.
            state = -2
        elif tx.status == PaymentTransaction.STATUS_FAILED:
            state = -1

        is_cancelled = tx.status in (
            PaymentTransaction.STATUS_FAILED,
            PaymentTransaction.STATUS_CANCELLED,
        )
        res_data = {
            'create_time': int(tx.created_at.timestamp() * 1000),
            # CANCELLED (refund) tranzaksiya avval bajarilgan — perform_time
            # nolga teng bo'lmasligi kerak (Payme sandbox tekshiradi).
            'perform_time': int(tx.updated_at.timestamp() * 1000) if tx.status in (
                PaymentTransaction.STATUS_SUCCESS,
                PaymentTransaction.STATUS_CANCELLED,
            ) else 0,
            'cancel_time': int(tx.updated_at.timestamp() * 1000) if is_cancelled else 0,
            'transaction': str(tx.id),
            'state': state,
            # Saqlangan Payme reason kodi; eski yozuvlarda (kod yo'q) failed
            # uchun avvalgidek 1 qaytariladi.
            'reason': (tx.cancel_reason if tx.cancel_reason is not None else 1) if is_cancelled else None
        }
        
        return JsonResponse({
            'result': res_data,
            'id': rpc_id
        })

    return JsonResponse({'error': {'code': -32601, 'message': 'Method not found'}}, status=200)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def subscription_status(request):
    """GET /api/billing/subscription/status/ — foydalanuvchining joriy premium holati.

    Frontend to'lovdan keyin shu endpoint'ni polling qiladi: to'lov provayderi
    (Click/Payme) webhook'i obunani aktivlashtirgach, `is_premium` true bo'ladi va
    foydalanuvchi reload qilmasdan premium statusni ko'radi.

    `is_premium` — User modelidagi flag (webhook _activate_subscription orqali
    yangilanadi). end_date/plan — eng so'nggi aktiv, muddati tugamagan obunadan.
    """
    sub = (
        UserSubscription.objects
        .filter(user=request.user, is_active=True, end_date__gt=timezone.now())
        .select_related('plan')
        .order_by('-end_date')
        .first()
    )
    return Response({
        'is_premium': bool(request.user.is_premium),
        'end_date': sub.end_date if sub else None,
        'plan': sub.plan.name if sub and sub.plan else None,
    })


@api_view(['GET'])
@permission_classes([AllowAny])  # Public endpoint so anyone can view plans on Landing
def list_subscription_plans(request):
    """GET /api/billing/plans/ — Returns active subscription plans."""
    plans = SubscriptionPlan.objects.filter(is_active=True).order_by('price')
    data = [
        {
            'id': p.id,
            'name': p.name,
            'plan_type': p.plan_type,
            'price': float(p.price),
            'duration_days': p.duration_days,
            'description': p.description or '',
            'features': p.features if isinstance(p.features, list) else [],
            'is_popular': bool(p.is_popular),
            # Tashkilot planlari uchun limitlar (0 = cheksiz). Tarif sahifasi
            # "50 o'quvchi", "cheksiz" kabi ma'lumotni ko'rsatishi mumkin.
            'max_students': p.max_students,
            'max_teachers': p.max_teachers,
            'max_olympiads_monthly': p.max_olympiads_monthly,
        }
        for p in plans
    ]
    return Response(data)


# Plan SET_NULL bo'lib o'chirilgan bo'lsa tx.plan = None bo'ladi — UI'da bo'sh
# satr o'rniga tushunarli matn ko'rsatamiz (tranzaksiya tarixi yo'qolmaydi).
_DELETED_PLAN_LABEL = "Noma'lum tarif"


def _serialize_transaction(tx):
    """PaymentTransaction'ni billing tarixi/chek uchun JSON'ga aylantiradi.

    plan SET_NULL bilan o'chirilgan bo'lishi mumkin (eski tranzaksiyalar) —
    shu sababli plan nomini xavfsiz olamiz.
    """
    return {
        'id': tx.id,
        'plan_name': tx.plan.name if tx.plan else _DELETED_PLAN_LABEL,
        'amount': float(tx.amount),
        'status': tx.status,
        'provider': tx.provider,
        'created_at': tx.created_at,
    }


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def billing_history(request):
    """GET /api/billing/history/ — foydalanuvchining so'nggi 20 ta tranzaksiyasi.

    Faqat o'z tranzaksiyalari (user bo'yicha filtr). plan o'chirilgan bo'lsa
    ham tranzaksiya ko'rinadi — select_related bilan N+1 query'siz.
    """
    txs = (
        PaymentTransaction.objects
        .filter(user=request.user)
        .select_related('plan')
        .order_by('-created_at')[:20]
    )
    return Response([_serialize_transaction(tx) for tx in txs])


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def current_subscription(request):
    """GET /api/billing/subscription/current/ — faol abonement (yoki null).

    subscription_status'dan farqi: bu yerda UI "Mening abonementim" bloki uchun
    to'liqroq ma'lumot (start_date, days_remaining, price) qaytaramiz. Eng so'nggi
    aktiv, muddati tugamagan obunani olamiz.
    """
    sub = (
        UserSubscription.objects
        .filter(user=request.user, is_active=True, end_date__gt=timezone.now())
        .select_related('plan')
        .order_by('-end_date')
        .first()
    )
    if not sub:
        return Response(None)

    # Qolgan kunlar — yuqoriga yaxlitlaymiz (qisman kun qolsa ham "1 kun
    # qoldi" ko'rinishi mantiqiyroq). end_date filtr bo'yicha kelajakda,
    # shuning uchun delta musbat; max(0, ...) chegaraviy holat himoyasi.
    delta = sub.end_date - timezone.now()
    days_remaining = max(0, delta.days + (1 if delta.seconds > 0 else 0))

    return Response({
        'plan_name': sub.plan.name if sub.plan else _DELETED_PLAN_LABEL,
        'start_date': sub.start_date,
        'end_date': sub.end_date,
        'days_remaining': days_remaining,
        'price': float(sub.plan.price) if sub.plan else None,
        'is_active': bool(request.user.is_premium),
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def transaction_receipt(request, transaction_id):
    """GET /api/billing/receipt/<transaction_id>/ — tranzaksiya cheki.

    XAVFSIZLIK: faqat o'z tranzaksiyasi (user bo'yicha filtr) — boshqa
    foydalanuvchi chekini ko'rib bo'lmaydi. Topilmasa 404.
    """
    tx = (
        PaymentTransaction.objects
        .filter(pk=transaction_id, user=request.user)
        .select_related('plan')
        .first()
    )
    if not tx:
        return Response(
            {'detail': "Tranzaksiya topilmadi"},
            status=http_status.HTTP_404_NOT_FOUND,
        )

    data = _serialize_transaction(tx)
    # Chekda foydalanuvchi ismi ham ko'rsatiladi.
    data['user_name'] = request.user.get_full_name() or request.user.get_username()
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def subscription_limits(request):
    """GET /api/billing/limits/ — markazning obuna limitlari va joriy foydalanishi.

    Owner dashboard'idagi limit indikatorlari (Talabalar: 45/50, progress bar,
    "Limit tugayapti" ogohlantirishi) shu endpoint'dan oziqlanadi.

    Markaz aniqlash: `?center_id=<id>` berilsa shu markaz (foydalanuvchi uni
    boshqara olishi shart), aks holda foydalanuvchining asosiy (owner) markazi.
    XAVFSIZLIK: faqat o'zi boshqaradigan markaz limitlarini ko'ra oladi.
    """
    from centers.models import EducationCenter
    from centers.services import primary_center_for_user, user_can_manage_center
    from billing.services import SubscriptionService

    center = None
    center_id = request.query_params.get('center_id')
    if center_id:
        center = (
            EducationCenter.objects
            .filter(pk=center_id)
            .first()
        )
        if center is None:
            return Response(
                {'detail': "Markaz topilmadi"},
                status=http_status.HTTP_404_NOT_FOUND,
            )
        if not user_can_manage_center(request.user, center):
            return Response(
                {'detail': "Sizda bu markaz limitlarini ko'rish huquqi yo'q"},
                status=http_status.HTTP_403_FORBIDDEN,
            )
    else:
        # Avval egasi bo'lgan (approved) markaz — owner CenterMembership'siz
        # ham markazga ega bo'lishi mumkin (markaz EducationCenter.owner orqali
        # bog'lanadi), shuning uchun owned_centers'ni birinchi tekshiramiz.
        center = (
            EducationCenter.objects
            .filter(owner_id=request.user.id, status=EducationCenter.STATUS_APPROVED)
            .order_by('-created_at')
            .first()
        )
        if center is None:
            # Owner emas — manager bo'lib boshqaradigan markaz (a'zolik orqali).
            center = primary_center_for_user(request.user)

    if center is None:
        # Foydalanuvchi hech qaysi markazni boshqarmaydi — limit ma'lumoti yo'q.
        return Response(None)

    summary = SubscriptionService(center).usage_summary()
    summary['center_id'] = center.id
    summary['center_name'] = center.name
    return Response(summary)

