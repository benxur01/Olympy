"""Subscription limit enforcement service.

Bitta markaziy joy: tashkilot (EducationCenter) uchun joriy aktiv obunani
aniqlaydi, plan limitlarini (o'quvchi/o'qituvchi/olimpiada) o'qiydi va joriy
foydalanishga qarab `can_add_*` qarorlarini qaytaradi.

LIMIT MANBAI (ustuvorlik bo'yicha):
  1. Aktiv organization obunasi bor bo'lsa — SubscriptionPlan.max_* maydonlari.
     0 (UNLIMITED) bo'lsa cheksiz deb talqin qilinadi.
  2. max_* maydonlari hali to'ldirilmagan eski plan yozuvlari uchun — plan
     NOMIDAN (Standart/Plus/Pro) chiqariladigan fallback (TIER_LIMITS).
  3. Obuna yo'q, lekin markaz `is_premium` (lifetime/admin) — cheksiz.
  4. Hech narsa yo'q — bepul rejim limitlari (FREE_LIMITS).

Avval bu logika centers/services.check_student_limit ichida plan nomini
string-match qilib hardcode qilingan edi (faqat o'quvchi uchun). Endi bir
joyga yig'ildi va o'qituvchi/olimpiada limitlari ham qo'shildi.
"""
from django.conf import settings
from django.utils import timezone

from centers.models import CenterMembership
from olympiads.models import Olympiad

from .models import SubscriptionPlan, UserSubscription


# Bepul (obunasiz, premium bo'lmagan) markaz limitlari. Olimpiada limiti
# settings.FREE_OLYMPIAD_MONTHLY_LIMIT bilan birlashtiriladi (resolve paytida).
FREE_LIMITS = {
    'students': 10,
    'teachers': 3,
}

# max_* maydonlari hali to'ldirilmagan eski plan yozuvlari uchun fallback.
# Kalit — plan NOMIDAGI tier so'zi (kichik harf). Yangi seed planlar bu
# fallback'ga tayanmaydi (max_* to'ldirilgan), bu faqat migratsiya davridagi
# yoki qo'lda kiritilgan limitsiz yozuvlar uchun zaxira.
TIER_LIMITS = {
    'standart': {'students': 50, 'teachers': 5, 'olympiads': 10},
    'standard': {'students': 50, 'teachers': 5, 'olympiads': 10},
    'plus': {'students': 200, 'teachers': 20, 'olympiads': 50},
    'pro': {'students': SubscriptionPlan.UNLIMITED,
            'teachers': SubscriptionPlan.UNLIMITED,
            'olympiads': SubscriptionPlan.UNLIMITED},
}

UNLIMITED = SubscriptionPlan.UNLIMITED


def _tier_from_name(plan_name):
    """Plan nomidan tier kalitini ajratadi (masalan "Plus (3 oy)" -> "plus")."""
    name = (plan_name or '').lower()
    for key in ('standart', 'standard', 'plus', 'pro'):
        if key in name:
            return key
    return None


class SubscriptionService:
    """Tashkilot uchun obuna limitlari xizmati.

    Bitta markaz uchun yaratiladi. Aktiv obunani va limitlarni bir marta
    hisoblaydi (lazy), keyin `can_add_*` / `usage` chaqiruvlarida qayta
    ishlatiladi. Bitta so'rov ichida bir martalik foydalanish uchun mo'ljallangan
    (uzoq yashovchi obyekt sifatida emas — usage real vaqt holatini aks ettiradi).
    """

    def __init__(self, center):
        self.center = center
        self._sub = None
        self._sub_loaded = False

    # ── Aktiv obuna ──────────────────────────────────────────────────────────
    @property
    def subscription(self):
        """Markaz egasining joriy aktiv organization obunasi (yoki None)."""
        if not self._sub_loaded:
            self._sub_loaded = True
            owner_id = getattr(self.center, 'owner_id', None)
            if owner_id:
                self._sub = (
                    UserSubscription.objects
                    .filter(
                        user_id=owner_id,
                        is_active=True,
                        plan__plan_type='organization',
                        end_date__gt=timezone.now(),
                    )
                    .select_related('plan')
                    .order_by('-end_date')
                    .first()
                )
        return self._sub

    @property
    def plan(self):
        sub = self.subscription
        return sub.plan if sub else None

    @property
    def is_premium(self):
        """Markaz qandaydir premium imkoniyatga ega (obuna yoki lifetime)."""
        return bool(self.subscription) or bool(getattr(self.center, 'is_premium', False))

    # ── Limitlar (resolve) ───────────────────────────────────────────────────
    def _resolve_limit(self, kind):
        """kind in {'students','teachers','olympiads'} uchun raqamli limit.

        0 (UNLIMITED) — cheksiz. Logika docstring'da tushuntirilgan ustuvorlik
        bo'yicha ishlaydi.
        """
        plan = self.plan
        if plan is not None:
            field_map = {
                'students': plan.max_students,
                'teachers': plan.max_teachers,
                'olympiads': plan.max_olympiads_monthly,
            }
            value = field_map[kind]
            # max_* to'ldirilgan (cheksiz UNLIMITED ham haqiqiy qiymat) — uni
            # ishlatamiz. Faqat maydon umuman sozlanmagan (eski yozuv: barchasi
            # 0/UNLIMITED) holatda tier fallback'ga tushamiz, shunda eski Standart
            # plan cheksiz bo'lib qolmasin.
            plan_has_explicit_limits = (
                plan.max_students or plan.max_teachers or plan.max_olympiads_monthly
            )
            if plan_has_explicit_limits:
                return value
            # Fallback: plan nomidan tier.
            tier = _tier_from_name(plan.name)
            if tier and tier in TIER_LIMITS:
                return TIER_LIMITS[tier][kind]
            return value  # noma'lum tier — UNLIMITED (xavfsiz: bloklamaymiz)

        # Obuna yo'q.
        if getattr(self.center, 'is_premium', False):
            return UNLIMITED  # lifetime/admin premium — limitsiz
        # Bepul rejim.
        if kind == 'olympiads':
            return getattr(settings, 'FREE_OLYMPIAD_MONTHLY_LIMIT', 2)
        return FREE_LIMITS[kind]

    @property
    def student_limit(self):
        return self._resolve_limit('students')

    @property
    def teacher_limit(self):
        return self._resolve_limit('teachers')

    @property
    def olympiad_monthly_limit(self):
        return self._resolve_limit('olympiads')

    # ── Joriy foydalanish (usage) ────────────────────────────────────────────
    def current_students(self):
        return CenterMembership.objects.filter(
            center=self.center,
            role=CenterMembership.ROLE_STUDENT,
            status=CenterMembership.STATUS_APPROVED,
        ).count()

    def current_teachers(self):
        return CenterMembership.objects.filter(
            center=self.center,
            role=CenterMembership.ROLE_TEACHER,
            status=CenterMembership.STATUS_APPROVED,
        ).count()

    def olympiads_this_month(self):
        now = timezone.now()
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        return Olympiad.objects.filter(
            center=self.center,
            is_deleted=False,
            created_at__gte=month_start,
        ).count()

    # ── Qaror metodlari ──────────────────────────────────────────────────────
    @staticmethod
    def _within(current, limit):
        """current < limit (yoki limit cheksiz) bo'lsa True (yana qo'shsa bo'ladi)."""
        if limit == UNLIMITED:
            return True
        return current < limit

    def can_add_student(self):
        return self._within(self.current_students(), self.student_limit)

    def can_add_teacher(self):
        return self._within(self.current_teachers(), self.teacher_limit)

    def can_create_olympiad(self):
        return self._within(self.olympiads_this_month(), self.olympiad_monthly_limit)

    # ── UI indikatorlari uchun (45/50, progress bar) ─────────────────────────
    def usage_summary(self):
        """Frontend limit indikatorlari uchun joriy holat.

        Har bir kind: {used, limit, unlimited, near_limit}. `limit` cheksiz
        bo'lsa None qaytariladi (UI "∞" ko'rsatadi). `near_limit` — 80% dan
        oshganda True ("Limit tugayapti" ogohlantirishi uchun).
        """
        def _block(used, limit):
            unlimited = (limit == UNLIMITED)
            near = False
            if not unlimited and limit > 0:
                near = used >= limit * 0.8
            return {
                'used': used,
                'limit': None if unlimited else limit,
                'unlimited': unlimited,
                'near_limit': near,
            }

        return {
            'plan_name': self.plan.name if self.plan else None,
            'is_premium': self.is_premium,
            'students': _block(self.current_students(), self.student_limit),
            'teachers': _block(self.current_teachers(), self.teacher_limit),
            'olympiads': _block(self.olympiads_this_month(), self.olympiad_monthly_limit),
        }
