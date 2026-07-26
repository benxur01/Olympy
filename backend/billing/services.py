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
    # Bepul markaz AI generatsiya qila olmaydi (premium feature). 0 emas
    # (cheksiz) — quyida alohida ishlov beriladi: bepulda umuman ruxsat yo'q.
    'ai_generations': 0,
}

# max_* maydonlari hali to'ldirilmagan eski plan yozuvlari uchun fallback.
# Kalit — plan NOMIDAGI tier so'zi (kichik harf). Yangi seed planlar bu
# fallback'ga tayanmaydi (max_* to'ldirilgan), bu faqat migratsiya davridagi
# yoki qo'lda kiritilgan limitsiz yozuvlar uchun zaxira.
TIER_LIMITS = {
    'standart': {'students': 50, 'teachers': 5, 'olympiads': 10, 'ai_generations': 20},
    'standard': {'students': 50, 'teachers': 5, 'olympiads': 10, 'ai_generations': 20},
    'plus': {'students': 200, 'teachers': 20, 'olympiads': 50, 'ai_generations': 100},
    'pro': {'students': SubscriptionPlan.UNLIMITED,
            'teachers': SubscriptionPlan.UNLIMITED,
            'olympiads': SubscriptionPlan.UNLIMITED,
            'ai_generations': SubscriptionPlan.UNLIMITED},
}

UNLIMITED = SubscriptionPlan.UNLIMITED


def _tier_from_name(plan_name):
    """Plan nomidan tier kalitini ajratadi (masalan "Plus (3 oy)" -> "plus")."""
    name = (plan_name or '').lower()
    for key in ('standart', 'standard', 'plus', 'pro'):
        if key in name:
            return key
    return None


# ── O'quvchi (student) premium tier'lari ──────────────────────────────────────
# Ierarxiya: Pro ⊇ Plus ⊇ Standart ⊇ free. `student_tier_at_least` shu tartibga
# tayanadi (kattaroq raqam — kengroq huquq).
STUDENT_TIER_ORDER = {'free': 0, 'standart': 1, 'standard': 1, 'plus': 2, 'pro': 3}

# Premium (is_premium=True) bo'lgan, lekin OBUNA YOZUVI umuman bo'lmagan
# (yoki plan biriktirilmagan) foydalanuvchilar uchun default tier: eski admin
# toggle (duration'siz), Django admin'dagi is_premium checkbox, ensure_manager
# komandasi, `admin_toggle_user_premium` ning plansiz "Umrbod" branch'i —
# bularning hammasida faqat flag qo'yiladi, plan yo'q. Bu ATAYLAB berilgan
# admin sovg'asi, shuning uchun eng yuqori tier.
#
# DIQQAT: bu fallback plan_type='organization' obunaga TATBIQ ETILMAYDI —
# `resolve_student_tier` izohiga qarang.
PREMIUM_NO_PLAN_DEFAULT_TIER = 'pro'

# Ro'yxatdan o'tishdagi 30 kunlik SHAXSIY sinov (`User.premium_trial_end`)
# uchun tier. Ikkala konstanta ham "student plani yo'q" holatida ishlatiladi,
# lekin qiymatlari ATAYLAB har xil: sinov — har bir yangi foydalanuvchiga
# avtomatik beriladigan perk (Pro'ga o'tish uchun sabab qolishi kerak),
# PREMIUM_NO_PLAN_DEFAULT_TIER esa admin qo'lda bergan grant (uni bu
# o'zgarish kuchsizlantirmasligi shart). Ikkovini birlashtirmang.
TRIAL_DEFAULT_TIER = 'plus'


def resolve_student_tier(active_subs, trial_active=False):
    """Amal qiluvchi obunalar ro'yxatidan o'quvchi (student) tier'ini aniqlaydi.

    `active_subs` — muddati o'tmagan aktiv `UserSubscription`'lar (plan bilan),
    end_date bo'yicha kamayish tartibida. `trial_active` — foydalanuvchining
    SHAXSIY sinov muddati (`User.trial_active`) hali amal qilyaptimi.

    Uch xil natija:
      1. Aktiv STUDENT plan bor — tier o'sha plan nomidan olinadi.
      2. Student plan yo'q, lekin shaxsiy sinov muddati amal qiladi —
         `TRIAL_DEFAULT_TIER` ('plus'). Obunalar ro'yxati bo'sh bo'lishi ham,
         faqat tashkilot obunasidan iborat bo'lishi ham mumkin: ikkala holatda
         ham huquqni beruvchi manba — sinovning o'zi.
      3. Student plan ham, sinov ham yo'q, lekin chaqiruvchi (`get_student_tier`
         → `is_user_premium`) premiumni allaqachon tasdiqlagan va obuna yozuvi
         yo'q (yoki plansiz) — bu admin/legacy granti,
         `PREMIUM_NO_PLAN_DEFAULT_TIER` ('pro').

    MUHIM chegara (tashkilot premiumi ≠ o'quvchi premiumi): tashkilot obunasi
    (`plan_type='organization'`) markaz EGASI tomonidan MARKAZ imkoniyatlari
    uchun sotib olinadi. `UserSubscription.sync_premium_status` esa har qanday
    aktiv obunada `User.is_premium=True` qiladi — natijada egada student-plan
    yozuvi bo'lmagani uchun quyidagi fallback ishlab, unga BEPULGA eng yuqori
    o'quvchi tarifi (Pro: AI mashq, AI test, AI o'quv rejasi, cheksiz mashq...)
    berilardi. Markaz tasdiqlanganda avtomatik 14 kunlik tashkilot trial
    obunasi yaratilgani uchun (centers.views.admin_approve_center) bu HAR bir
    markaz egasiga tegishli edi. Shuning uchun: student obunasi bo'lmasa va
    premium faqat tashkilot obunasidan kelayotgan bo'lsa — 'free'.

    Shaxsiy sinov muddati bundan mustasno: u markazdan emas, foydalanuvchining
    o'zidan (ro'yxatdan o'tish perki) — markaz egasi sinov davrida o'quvchi
    imkoniyatlarini yo'qotmasligi kerak (yuqoridagi 2-holat).
    """
    for sub in active_subs:
        if sub.plan and sub.plan.plan_type == 'student':
            tier = _tier_from_name(sub.plan.name)
            return tier if tier in STUDENT_TIER_ORDER else PREMIUM_NO_PLAN_DEFAULT_TIER
    if trial_active:
        # Student obunasi yo'q — huquqni sinov berayapti (obunalar ro'yxati
        # bo'sh bo'lsa ham, faqat tashkilot obunasi bo'lsa ham).
        return TRIAL_DEFAULT_TIER
    has_non_student_plan = any(
        sub.plan and sub.plan.plan_type != 'student' for sub in active_subs
    )
    if has_non_student_plan:
        return 'free'
    # Obuna yozuvi yo'q yoki plan biriktirilmagan — admin/legacy granti.
    return PREMIUM_NO_PLAN_DEFAULT_TIER


def get_student_tier(user):
    """Returns 'free' | 'standart' | 'plus' | 'pro' for a student user."""
    from accounts.utils import is_user_premium  # lokal import — circular-import xavfini oldini oladi
    if not is_user_premium(user):
        return 'free'
    # Bitta so'rovda barcha amal qiluvchi obunalar: student rejasini ham,
    # tashkilot rejasini ham ko'rish kerak (faqat student'ni filtrlab olsak,
    # premium tashkilot obunasidan kelayotganini ajrata olmaymiz).
    active_subs = list(
        user.subscriptions
        .filter(is_active=True, end_date__gt=timezone.now())
        .select_related('plan')
        .order_by('-end_date')
    )
    return resolve_student_tier(
        active_subs, trial_active=bool(getattr(user, 'trial_active', False)),
    )


def student_tier_at_least(user, min_tier):
    """`user`ning tier'i `min_tier` dan past emasligini tekshiradi (ierarxik)."""
    return STUDENT_TIER_ORDER.get(get_student_tier(user), 0) >= STUDENT_TIER_ORDER[min_tier]


# ── O'quvchi mashq (practice / mock) oylik limiti ─────────────────────────────
# Standart = 10/oy, Plus = 25/oy, Pro = cheksiz. Bepul (premium bo'lmagan)
# o'quvchi ham Standart kabi 10/oy bilan cheklanadi.
STUDENT_PRACTICE_MONTHLY_LIMIT = {'free': 10, 'standart': 10, 'plus': 25, 'pro': None}  # None = unlimited


def practice_attempts_this_month(user):
    """Joriy oyda `user` boshlagan mock (mashq) urinishlari soni."""
    from centers.models import MockAttempt
    now = timezone.now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return MockAttempt.objects.filter(user=user, started_at__gte=month_start).count()


def can_start_practice(user):
    """(allowed, used, limit) — o'quvchi yangi mashq boshlashi mumkinmi.

    `limit` None bo'lsa cheksiz (Pro). `allowed` — hali limit tugamaganini
    bildiradi (mavjud urinishni davom ettirish alohida, cheklanmaydi).
    """
    tier = get_student_tier(user)
    limit = STUDENT_PRACTICE_MONTHLY_LIMIT.get(tier, 0)
    if limit is None:
        return True, practice_attempts_this_month(user), None
    used = practice_attempts_this_month(user)
    return used < limit, used, limit


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
                'ai_generations': plan.max_ai_generations_monthly,
            }
            value = field_map[kind]
            # max_* to'ldirilgan (cheksiz UNLIMITED ham haqiqiy qiymat) — uni
            # ishlatamiz. Faqat maydon umuman sozlanmagan (eski yozuv: barchasi
            # 0/UNLIMITED) holatda tier fallback'ga tushamiz, shunda eski Standart
            # plan cheksiz bo'lib qolmasin.
            plan_has_explicit_limits = (
                plan.max_students or plan.max_teachers
                or plan.max_olympiads_monthly or plan.max_ai_generations_monthly
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

    @property
    def ai_generation_monthly_limit(self):
        """Joriy oyda ruxsat etilgan AI generatsiyalar soni.

        Bepul rejimda 0 qaytadi — bu "umuman ruxsat yo'q" degani (premium
        feature). Obunali planlarda 0 = cheksiz (UNLIMITED). Ikki holatni
        `can_use_ai_generation` farqlaydi (premium-mi tekshiriladi).
        """
        return self._resolve_limit('ai_generations')

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

    def ai_generations_this_month(self):
        """Joriy oyda shu markaz uchun yozilgan AI generatsiya hisobi."""
        from .models import AiGenerationLog
        now = timezone.now()
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        return AiGenerationLog.objects.filter(
            center=self.center,
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

    def can_use_ai_generation(self):
        """Markaz hozir AI yordamida savol generatsiya qila oladimi.

        AI generatsiya — premium feature: aktiv obuna YOKI lifetime/admin
        `is_premium` shart. Premium bo'lsa, plandagi oylik limit (0=cheksiz)
        bilan joriy oydagi foydalanish solishtiriladi.
        """
        if not self.is_premium:
            return False
        limit = self.ai_generation_monthly_limit
        # Premium kontekstda 0 — cheksiz (UNLIMITED). Bepul rejim yuqorida
        # allaqachon False bilan qaytarilgan, shuning uchun bu yerda 0 = limitsiz.
        return self._within(self.ai_generations_this_month(), limit)

    def log_ai_generation(self, user=None, count=0):
        """Muvaffaqiyatli AI generatsiyani hisobga yozadi (oylik limit uchun)."""
        from .models import AiGenerationLog
        return AiGenerationLog.objects.create(
            center=self.center, user=user, count=count or 0,
        )

    def can_export_results(self):
        """Olimpiada natijalarini Excel/PDF eksport qilish ruxsati.

        Faqat Plus yoki Pro obunasi (yoki lifetime/admin `is_premium`) bo'lgan
        markazlar uchun. Standart/bepul markaz uchun False. Eski plan
        yozuvlarida `max_*` to'ldirilmagan bo'lishi mumkin, shu sababli tier
        plan NOMIDAN aniqlanadi (Standart eksport qila olmaydi, Plus/Pro qila
        oladi). Aktiv obuna umuman bo'lmasa, faqat `center.is_premium`
        (lifetime/admin) True bo'lganda ruxsat beriladi.
        """
        plan = self.plan
        if plan is not None:
            tier = _tier_from_name(plan.name)
            if tier in ('plus', 'pro'):
                return True
            # Nomidan tier aniqlanmagan, lekin organization plan — xavfsizlik
            # uchun premium deb hisoblaymiz (admin qo'lda yaratgan plan bo'lishi
            # mumkin); Standart aniq bloklanadi.
            if tier in ('standart', 'standard'):
                return False
            return True
        # Obuna yo'q — faqat lifetime/admin premium eksport qila oladi.
        return bool(getattr(self.center, 'is_premium', False))

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

        # AI generatsiya: bepul rejimda umuman ruxsat yo'q (premium feature),
        # premiumda 0=cheksiz. _block 0'ni "limit 0" deb noto'g'ri talqin
        # qilmasligi uchun alohida quramiz.
        ai_used = self.ai_generations_this_month()
        ai_limit = self.ai_generation_monthly_limit
        if not self.is_premium:
            ai_block = {'used': ai_used, 'limit': 0, 'unlimited': False,
                        'near_limit': False, 'allowed': False}
        elif ai_limit == UNLIMITED:
            ai_block = {'used': ai_used, 'limit': None, 'unlimited': True,
                        'near_limit': False, 'allowed': True}
        else:
            ai_block = _block(ai_used, ai_limit)
            ai_block['allowed'] = ai_used < ai_limit

        return {
            'plan_name': self.plan.name if self.plan else None,
            'is_premium': self.is_premium,
            'students': _block(self.current_students(), self.student_limit),
            'teachers': _block(self.current_teachers(), self.teacher_limit),
            'olympiads': _block(self.olympiads_this_month(), self.olympiad_monthly_limit),
            'ai_generations': ai_block,
        }
