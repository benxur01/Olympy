"""Retention va premium conversion metrikalarini hisoblash.

Hammasi oddiy Django ORM aggregate'lari bilan hisoblanadi — tashqi analytics
xizmatlari (Mixpanel va h.k.) ishlatilmaydi. Natija `cache`'da
``METRICS_CACHE_SECONDS`` (default 10 daqiqa) saqlanadi, shu sababli admin
dashboard'i har ochilganda katta jadvallarda og'ir query bajarmaydi.

Retention ta'rifi (D1/D7/D30)
-----------------------------
"Qaytib kelgan" foydalanuvchi — ro'yxatdan o'tib (``created_at``) kamida N kun
o'tgan VA shu N-kunlik chegaradan keyin faollik ko'rsatgan kishi. Faollik
signali sifatida ikkita manba olinadi (ikkalasidan biri yetarli):

  * ``User.last_active_date`` — streak/kunlik faollik mexanizmi yangilab
    turadigan sana (practice, attempts, retention view'lari).
  * ``TestAttempt.submitted_at`` — test topshirgan vaqt.

Faqat "kohorta yetuk bo'lgan" foydalanuvchilar maxrajga kiradi: D7 retention
uchun ro'yxatdan o'tganiga kamida 7 kun bo'lgan foydalanuvchilar. Aks holda
yangi ro'yxatdan o'tganlar foizni sun'iy pasaytirardi (ular hali qaytishga
ulgurmagan).
"""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db.models import Count, Q
from django.utils import timezone

from attempts.models import TestAttempt
from billing.models import UserSubscription


CACHE_KEY = 'analytics:dashboard:v1'
METRICS_CACHE_SECONDS = 10 * 60  # 10 daqiqa

# D-day retention chegaralari.
RETENTION_DAYS = (1, 7, 30)

User = get_user_model()


def _pct(part, whole):
    """Foiz (0..100), bir kasr raqam bilan. Maxraj 0 bo'lsa 0.0 qaytaradi."""
    if not whole:
        return 0.0
    return round(part * 100.0 / whole, 1)


def _retention_for_window(now, days):
    """Bitta D-day oynasi uchun retention.

    Returns ``(eligible, returned, pct)``:
      * ``eligible`` — kohortasi yetuk (created_at <= now - days) foydalanuvchilar
      * ``returned`` — ulardan ro'yxatdan o'tib N kundan keyin faollik bo'lganlar
    """
    cutoff = now - timedelta(days=days)

    # Kohortasi yetuk foydalanuvchilar: ro'yxatdan o'tib kamida `days` kun o'tgan.
    eligible_qs = User.objects.filter(
        is_active=True,
        created_at__lte=cutoff,
    )
    eligible = eligible_qs.count()
    if not eligible:
        return 0, 0, 0.0

    # "Qaytib kelish" chegarasi har foydalanuvchida shaxsiy: o'z ``created_at``
    # sanasiga + N kun. SQLite/Postgres'da bunday qator-bo'yicha sana
    # arifmetikasini bitta SQL filtrga sig'dirish murakkab, shuning uchun
    # kerakli ustunlarni (id, created_at, last_active_date) olib Python'da
    # tekshiramiz. ``eligible`` odatda boshqariladigan son (foydalanuvchilar
    # jadvali, ming darajasi) — har qatorda alohida query bajarilmaydi.

    # 1) last_active_date orqali qaytganlar: faollik sanasi shaxsiy
    #    chegaradan (created + N kun) keyin bo'lsa.
    returned = set()
    for uid, created, last_active in eligible_qs.filter(
        last_active_date__isnull=False,
    ).values_list('id', 'created_at', 'last_active_date'):
        if last_active >= (created.date() + timedelta(days=days)):
            returned.add(uid)

    # 2) Attempt orqali qaytganlar: created_at + N kundan keyin test topshirgan.
    #    Bu last_active_date yangilanmagan hollarni qoplaydi. last_active_date
    #    orqali allaqachon qaytgan deb hisoblangan foydalanuvchilarni qayta
    #    tekshirmaymiz (ortiqcha exists() query'ni oldini olamiz).
    for uid, created in eligible_qs.values_list('id', 'created_at'):
        if uid in returned:
            continue
        if TestAttempt.objects.filter(
            user_id=uid, submitted_at__gte=created + timedelta(days=days),
        ).exists():
            returned.add(uid)

    returned = len(returned)
    return eligible, returned, _pct(returned, eligible)


def _retention_block(now):
    """D1/D7/D30 retention bloki."""
    result = {}
    for d in RETENTION_DAYS:
        eligible, returned, pct = _retention_for_window(now, d)
        result[f'd{d}'] = {
            'days': d,
            'eligible': eligible,
            'returned': returned,
            'pct': pct,
        }
    return result


def _conversion_block(now):
    """Trial → Paid conversion.

    Trial boshlagan foydalanuvchi — ``premium_trial_end`` qiymati o'rnatilgan
    har bir foydalanuvchi (register paytida 1 oylik trial beriladi). "Paid"
    bo'lgan — kamida bitta pullik obuna (``UserSubscription``) yaratgan
    foydalanuvchi. Conversion = paid / trial_started.

    Sof "trial tugaganlar" orasidagi conversion alohida ko'rsatiladi — hali
    triali davom etayotganlar konversiya qilishga ulgurmagani uchun ularni
    chiqarib tashlash yanada aniq foiz beradi.
    """
    trial_started = User.objects.filter(
        premium_trial_end__isnull=False,
    ).count()

    # Pullik planga o'tganlar: kamida bitta obuna yozuvi bor foydalanuvchilar.
    paid_user_ids = set(
        UserSubscription.objects.values_list('user_id', flat=True).distinct()
    )
    paid_total = len(paid_user_ids)

    # Trial boshlaganlar orasidan pullik planga o'tganlar.
    trial_user_ids = set(
        User.objects.filter(
            premium_trial_end__isnull=False,
        ).values_list('id', flat=True)
    )
    trial_to_paid = len(trial_user_ids & paid_user_ids)

    # Triali allaqachon tugagan foydalanuvchilar (chegarali conversion uchun).
    trial_ended = User.objects.filter(
        premium_trial_end__isnull=False,
        premium_trial_end__lte=now,
    ).count()
    trial_ended_ids = set(
        User.objects.filter(
            premium_trial_end__isnull=False,
            premium_trial_end__lte=now,
        ).values_list('id', flat=True)
    )
    trial_ended_to_paid = len(trial_ended_ids & paid_user_ids)

    return {
        'trial_started': trial_started,
        'trial_to_paid': trial_to_paid,
        'trial_to_paid_pct': _pct(trial_to_paid, trial_started),
        'trial_ended': trial_ended,
        'trial_ended_to_paid': trial_ended_to_paid,
        'trial_ended_to_paid_pct': _pct(trial_ended_to_paid, trial_ended),
        'paid_total': paid_total,
    }


def _premium_block(now):
    """Faol premium foydalanuvchilar va umumiy nisbat.

    "Faol premium" — ``is_premium=True`` (admin/obuna orqali) YOKI hali amal
    qiluvchi trial muddati bor foydalanuvchilar. Bu ``User.is_premium_active``
    property bilan bir xil mantiq, faqat to'plam darajasida (queryset).
    """
    total_users = User.objects.count()
    active_users = User.objects.filter(is_active=True).count()

    # is_premium=True yoki trial hali tugamagan.
    premium_q = Q(is_premium=True) | Q(premium_trial_end__gt=now)
    premium_active = User.objects.filter(premium_q).count()

    # Toza pullik (trial'siz, is_premium flag'i orqali): admin yoki obuna.
    paid_flag = User.objects.filter(is_premium=True).count()

    # Faqat trial orqali premium (is_premium=False, lekin trial davom etmoqda).
    trial_only = User.objects.filter(
        is_premium=False, premium_trial_end__gt=now,
    ).count()

    return {
        'total_users': total_users,
        'active_users': active_users,
        'premium_active': premium_active,
        'premium_pct': _pct(premium_active, total_users),
        'paid_flag': paid_flag,
        'trial_only': trial_only,
    }


def _signup_block(now):
    """Qisqa o'sish konteksti: oxirgi 1/7/30 kunda ro'yxatdan o'tganlar."""
    out = {}
    for d in RETENTION_DAYS:
        out[f'last_{d}d'] = User.objects.filter(
            created_at__gte=now - timedelta(days=d),
        ).count()
    return out


def compute_metrics():
    """Barcha metrikalarni hisoblaydi (cache'siz, doim yangidan)."""
    now = timezone.now()
    return {
        'generated_at': now.isoformat(),
        'retention': _retention_block(now),
        'conversion': _conversion_block(now),
        'premium': _premium_block(now),
        'signups': _signup_block(now),
    }


def get_metrics(force_refresh=False):
    """Cache'langan metrikalarni qaytaradi.

    ``force_refresh=True`` bo'lsa cache chetlab o'tiladi va qayta hisoblanadi
    (admin'dagi "Yangilash" tugmasi shuni ishlatadi).
    """
    if not force_refresh:
        cached = cache.get(CACHE_KEY)
        if cached is not None:
            return cached
    data = compute_metrics()
    cache.set(CACHE_KEY, data, METRICS_CACHE_SECONDS)
    return data
