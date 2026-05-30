"""User model with phone-based authentication.

Roles are stored as a list on the user: ``['student', 'teacher', ...]``.
Per-role status (pending / approved / rejected) and the bound center live on
``CenterMembership`` (in the ``centers`` app), not here. Platform Admin is the
exception — that's a system-wide role represented by ``is_platform_admin``.
"""
import logging

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone

from .utils import normalize_phone


logger = logging.getLogger(__name__)


class UserManager(BaseUserManager):
    """Manager that enforces phone normalization at creation time."""

    def _create_user(self, phone, password, **extra):
        norm = normalize_phone(phone)
        if not norm:
            raise ValueError("Telefon raqam noto'g'ri")
        if self.model.objects.filter(normalized_phone=norm).exists():
            raise ValueError("Bu telefon raqam avval ro'yxatdan o'tgan")
        user = self.model(phone=norm, normalized_phone=norm, **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, phone, password=None, **extra):
        extra.setdefault('is_staff', False)
        extra.setdefault('is_superuser', False)
        return self._create_user(phone, password, **extra)

    def create_superuser(self, phone, password=None, **extra):
        extra.setdefault('is_staff', True)
        extra.setdefault('is_superuser', True)
        extra.setdefault('is_platform_admin', True)
        return self._create_user(phone, password, **extra)


class User(AbstractBaseUser, PermissionsMixin):
    full_name = models.CharField(max_length=120)
    first_name = models.CharField(max_length=60, blank=True)
    last_name = models.CharField(max_length=60, blank=True)
    # Optional unique username for display / mention. Validatsiya
    # serializer'da: 3+ belgi, faqat harf/raqam/_/.
    # NULL ruxsat etiladi (mavjud foydalanuvchilarda bo'sh bo'lishi mumkin) —
    # username majburiy emas. Lekin bo'sh emas bo'lganda unique.
    username = models.CharField(
        max_length=32, unique=True, blank=True, null=True, db_index=True,
    )
    phone = models.CharField(max_length=20, unique=True)
    normalized_phone = models.CharField(max_length=20, unique=True, db_index=True)
    # JSON list of role keys: student | teacher | manager | owner | admin
    roles = models.JSONField(default=list, blank=True)
    is_platform_admin = models.BooleanField(default=False)
    is_premium = models.BooleanField(default=False, db_index=True)
    telegram_chat_id = models.CharField(max_length=64, blank=True, db_index=True)
    telegram_user_id = models.CharField(max_length=64, blank=True, db_index=True)
    telegram_linked_at = models.DateTimeField(null=True, blank=True)
    # Yangi hisoblar uchun 1 dan boshlanadi — shu sababli birinchi login
    # paytida token_version'ni 0 dan 1 ga ko'tarib qo'shimcha DB yozuvi
    # qilishga hojat qolmaydi (bkz _jwt_payload).
    token_version = models.PositiveIntegerField(default=1)
    avatar = models.ImageField(upload_to='avatars/', blank=True, null=True)
    streak_count = models.PositiveIntegerField(default=0)
    # O1: eng uzun ketma-ket faollik seriyasi — streak uzilganda ham
    # saqlanib qoladi, joriy streak nolga tushsa ham eski rekord ko'rinadi.
    longest_streak = models.PositiveIntegerField(default=0)
    coins = models.PositiveIntegerField(default=0)
    last_active_date = models.DateField(null=True, blank=True)

    # Retention onboarding (OB1): yangi foydalanuvchi birinchi kirishda 3-4
    # bosqichli sehrgardan o'tadi. `onboarding_completed` True bo'lguncha
    # frontend wizard'ni ko'rsatadi. `onboarding_subjects` — qiziqadigan
    # fanlar ro'yxati (mini-test va olimpiada takliflari shu asosda).
    onboarding_completed = models.BooleanField(default=False)
    onboarding_grade = models.CharField(max_length=10, null=True, blank=True)
    onboarding_subjects = models.JSONField(default=list, blank=True)
    onboarding_goal = models.CharField(max_length=50, null=True, blank=True)

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = UserManager()

    USERNAME_FIELD = 'normalized_phone'
    REQUIRED_FIELDS = ['full_name']

    class Meta:
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        # Always keep normalized_phone in sync with phone.
        norm = normalize_phone(self.phone)
        if not norm:
            raise ValueError("Telefon raqam noto'g'ri")
        self.phone = norm
        self.normalized_phone = norm
        # first_name/last_name dan full_name'ni avtomatik to'ldiramiz, agar
        # ikkalasidan biri kelgan bo'lsa va full_name bo'sh / eski qiymat
        # bilan kelmagan bo'lsa. Bu profil tahririda full_name'ni qo'lda
        # yangilab o'tirishni yo'qotadi.
        if (self.first_name or self.last_name):
            combined = f"{(self.first_name or '').strip()} {(self.last_name or '').strip()}".strip()
            if combined:
                self.full_name = combined
        # Bo'sh string username'larni NULL ga aylantiramiz (unique constraint
        # bo'sh string'larni o'ziga xos deb hisoblaydi va to'qnashuv beradi).
        if self.username is not None and not str(self.username).strip():
            self.username = None
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.full_name} ({self.normalized_phone})'

    def has_role(self, role):
        return role in (self.roles or [])

    def update_streak(self):
        """ Ketma-ket faollik kunlarini (streak) yangilash logikasi.

        Har streak o'zgarishida `longest_streak` ham yangilanadi — joriy
        streak eng uzun rekorddan oshsa, rekord yangilanadi. Streak uzilib
        1 ga qaytsa ham longest_streak saqlanib qoladi.
        """
        from django.utils import timezone
        from datetime import timedelta

        today = timezone.now().date()
        if not self.last_active_date:
            self.streak_count = 1
            self.last_active_date = today
            self.longest_streak = max(self.longest_streak or 0, self.streak_count)
            self.save(update_fields=['streak_count', 'last_active_date', 'longest_streak'])
            return True

        diff = today - self.last_active_date
        if diff.days == 1:
            self.streak_count += 1
            self.last_active_date = today
            self.longest_streak = max(self.longest_streak or 0, self.streak_count)
            self.save(update_fields=['streak_count', 'last_active_date', 'longest_streak'])
            return True
        elif diff.days > 1:
            self.streak_count = 1
            self.last_active_date = today
            self.longest_streak = max(self.longest_streak or 0, self.streak_count)
            self.save(update_fields=['streak_count', 'last_active_date', 'longest_streak'])
            return True
        return False

    def get_badges(self):
        """ Foydalanuvchining nishonlari (Badges) ro'yxatini qaytaradi.

        Ko'p foydalanuvchi serialize qilinadigan joylarda (admin paneli)
        N+1'ni oldini olish uchun queryset darajasida hisoblangan
        `attempts_100_count` va `total_attempts_count` annotatsiyalari
        mavjud bo'lsa shulardan foydalanamiz — bo'lmasa eski count()
        so'rovlariga qaytamiz (xulq o'zgarmaydi).
        """
        try:
            from attempts.models import TestAttempt
            badges = []

            annotated_100 = getattr(self, 'attempts_100_count', None)
            annotated_total = getattr(self, 'total_attempts_count', None)

            # 1. Tirishqoq
            if (self.streak_count or 0) >= 7:
                badges.append({
                    'id': 'persistent',
                    'title': 'Tirishqoq',
                    'description': "7 kundan ortiq faol streak",
                    'icon': '🔥',
                    'color': 'from-orange-500 to-amber-500'
                })
            elif (self.streak_count or 0) >= 3:
                badges.append({
                    'id': 'active_starter',
                    'title': 'Intiluvchan',
                    'description': "3 kundan ortiq faol streak",
                    'icon': '⚡',
                    'color': 'from-amber-400 to-yellow-500'
                })
                
            # 2. Matematika qiroli (10 marta 100% ball yoki 3 marta 100% ball)
            if annotated_100 is not None:
                attempts_100 = annotated_100
            else:
                attempts_100 = TestAttempt.objects.filter(user=self, score=100, disqualified=False).count()
            if attempts_100 >= 10:
                badges.append({
                    'id': 'math_king',
                    'title': 'Matematika Qiroli',
                    'description': "10 marta 100% natija",
                    'icon': '👑',
                    'color': 'from-yellow-500 via-amber-500 to-yellow-600'
                })
            elif attempts_100 >= 3:
                badges.append({
                    'id': 'perfect_score',
                    'title': 'Mukammal Natija',
                    'description': "3 marta 100% natija",
                    'icon': '🏆',
                    'color': 'from-indigo-500 to-purple-500'
                })
                
            # 3. Faol Ishtirokchi (Kamida 10 ta urinish)
            if annotated_total is not None:
                total_attempts = annotated_total
            else:
                total_attempts = TestAttempt.objects.filter(user=self, disqualified=False).count()
            if total_attempts >= 10:
                badges.append({
                    'id': 'veteran',
                    'title': 'Tajribali',
                    'description': "10 tadan ortiq imtihonda qatnashgan",
                    'icon': '🎖️',
                    'color': 'from-cyan-500 to-blue-500'
                })
            elif total_attempts >= 1:
                badges.append({
                    'id': 'rookie',
                    'title': 'Birinchi Qadam',
                    'description': "Birinchi imtihon topshirildi",
                    'icon': '🌱',
                    'color': 'from-emerald-400 to-teal-500'
                })
            return badges
        except Exception:
            logger.exception("get_badges xatosi: user=%s", self.pk)
            return []

    def add_role(self, role):
        if role not in (self.roles or []):
            self.roles = list(self.roles or []) + [role]
            self.save(update_fields=['roles'])

    def remove_role(self, role):
        current = list(self.roles or [])
        if role in current:
            current.remove(role)
            self.roles = current
            self.save(update_fields=['roles'])


class ParentStudentLink(models.Model):
    """Ota-ona va o'quvchi orasidagi kuzatuv aloqasi.

    Bir parent bir nechta farzandni kuzata oladi; bir student bir nechta
    parent'ga bog'lanishi mumkin (ona+ota). Unique constraint duplicate
    link'larning oldini oladi.
    """
    parent = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='children_links',
    )
    student = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='parent_links',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    weekly_digest_enabled = models.BooleanField(default=True)
    # Student roziligi: ota-ona link yaratganida False bo'ladi va student
    # tasdiqlaguncha (is_confirmed=True) link "kutilmoqda" holatida turadi.
    # Tasdiqlanmagan link list_children'da ko'rinmaydi.
    is_confirmed = models.BooleanField(default=False)
    confirmed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['parent', 'student'],
                name='unique_parent_student',
            ),
        ]

    def __str__(self):
        return f'parent:{self.parent_id} → student:{self.student_id}'


class RewardProduct(models.Model):
    title = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    coin_cost = models.PositiveIntegerField()
    icon = models.CharField(max_length=10, default='🎁')
    stock = models.PositiveIntegerField(default=10)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.title} ({self.coin_cost} coins)"


class RewardRedemption(models.Model):
    STATUS_PENDING = 'pending'
    STATUS_DELIVERED = 'delivered'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Kutilmoqda'),
        (STATUS_DELIVERED, 'Topshirildi'),
    ]

    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='redemptions',
    )
    product = models.ForeignKey(
        RewardProduct,
        on_delete=models.CASCADE,
        related_name='redemptions',
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_PENDING,
    )
    redeemed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-redeemed_at']

    def __str__(self):
        return f"{self.user.full_name} redeemed {self.product.title}"


class PhoneVerification(models.Model):
    """Telegram-backed phone verification session.

    OTP values are never stored directly; only Django password hashes are kept.
    ``telegram_chat_id`` is populated only after Telegram sends /start with the
    session verify token.
    """
    PURPOSE_REGISTRATION = 'registration'
    PURPOSE_ACCOUNT_LINK = 'account_link'
    PURPOSE_PASSWORD_RESET = 'password_reset'
    PURPOSE_CHOICES = [
        (PURPOSE_REGISTRATION, 'Registration'),
        (PURPOSE_ACCOUNT_LINK, 'Account link'),
        (PURPOSE_PASSWORD_RESET, 'Password reset'),
    ]

    normalized_phone = models.CharField(max_length=20, db_index=True)
    purpose = models.CharField(
        max_length=32,
        choices=PURPOSE_CHOICES,
        default=PURPOSE_REGISTRATION,
        db_index=True,
    )
    verify_token = models.CharField(max_length=96, unique=True, db_index=True)
    telegram_chat_id = models.CharField(max_length=64, blank=True)
    telegram_user_id = models.CharField(max_length=64, blank=True)
    otp_hash = models.CharField(max_length=256, blank=True)
    otp_expires_at = models.DateTimeField(null=True, blank=True)
    attempts_count = models.PositiveIntegerField(default=0)
    max_attempts = models.PositiveIntegerField(default=5)
    verified_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['normalized_phone', 'created_at']),
        ]

    @property
    def is_verified(self):
        return self.verified_at is not None

    @property
    def otp_is_expired(self):
        return bool(self.otp_expires_at and self.otp_expires_at <= timezone.now())


class Rival(models.Model):
    """O2: O'quvchining tanlagan raqibi.

    Foydalanuvchi maksimum 3 ta raqib qo'sha oladi (cheklov view'da). Raqib
    bilan ball/reyting taqqoslash uchun. `user` — raqibni qo'shgan kishi,
    `rival_user` — kuzatilayotgan raqib.
    """
    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='rivals',
    )
    rival_user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='rival_of',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'rival_user'],
                name='unique_user_rival',
            ),
        ]

    def __str__(self):
        return f'rival: {self.user_id} → {self.rival_user_id}'


class Achievement(models.Model):
    """O5: Foydalanuvchi yutug'i / bosqichi (milestone).

    `type` — yutuq turi (attempts_10, streak_7, new_record, perfect_score, ...).
    `value` — yutuqqa bog'liq son (masalan, yangi rekord ball yoki streak kuni).
    Har (user, type) juftligi yagona: bir xil milestone ikki marta berilmaydi —
    bundan `new_record` mustasno (u har yangi rekordda value bilan yangilanadi).
    """
    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='achievements',
    )
    type = models.CharField(max_length=32, db_index=True)
    value = models.PositiveIntegerField(default=0)
    achieved_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-achieved_at']
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'type'],
                name='unique_user_achievement_type',
            ),
        ]

    def __str__(self):
        return f'{self.user_id}:{self.type}={self.value}'


class DailyGoal(models.Model):
    """O2: O'quvchining kunlik maqsadi.

    Har kuni yangi yozuv: o'quvchi nechta savol yechishni rejalashtirgan
    (`target_questions`) va bugun nechta savolga javob berdi
    (`completed_questions`). Har (user, date) juftligi yagona. Maqsad
    bajarilganda `is_achieved=True` bo'ladi va bir martalik `xp_bonus`
    (coinlarga) qo'shiladi.
    """
    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='daily_goals',
    )
    target_questions = models.PositiveIntegerField(default=20)
    completed_questions = models.PositiveIntegerField(default=0)
    date = models.DateField(db_index=True)
    is_achieved = models.BooleanField(default=False)
    xp_bonus = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date']
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'date'],
                name='unique_user_daily_goal_date',
            ),
        ]

    def __str__(self):
        return f'goal:{self.user_id}@{self.date} {self.completed_questions}/{self.target_questions}'


class Duel(models.Model):
    """O3: Ikki o'quvchi o'rtasidagi do'stona duel (10 savol).

    `challenger` duelni boshlaydi, `opponent` qarshi o'ynaydi. Vaqt cheklovi
    yo'q — har ikkalasi 10 savolga javob beradi. Ikkalasi tugatgach g'olib
    aniqlanadi (kim ko'p to'g'ri javob bersa). Teng bo'lsa `winner` None
    (durang).
    """
    STATUS_PENDING = 'pending'      # boshlandi, hech kim tugatmagan
    STATUS_COMPLETED = 'completed'  # ikkalasi ham javob berib bo'ldi
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Davom etmoqda'),
        (STATUS_COMPLETED, 'Tugadi'),
    ]

    challenger = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='duels_started',
    )
    opponent = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='duels_received',
    )
    subject = models.CharField(max_length=80, blank=True, default='')
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default=STATUS_PENDING, db_index=True)
    winner = models.ForeignKey(
        'accounts.User',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='duels_won',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'duel:{self.challenger_id} vs {self.opponent_id} [{self.status}]'


class DuelQuestion(models.Model):
    """O3: Duelga biriktirilgan savol (10 ta, tartiblangan)."""
    duel = models.ForeignKey(
        Duel,
        on_delete=models.CASCADE,
        related_name='duel_questions',
    )
    question = models.ForeignKey(
        'questions.Question',
        on_delete=models.CASCADE,
        related_name='duel_questions',
    )
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order']
        constraints = [
            models.UniqueConstraint(
                fields=['duel', 'question'],
                name='unique_duel_question',
            ),
        ]

    def __str__(self):
        return f'duel:{self.duel_id} q:{self.question_id} #{self.order}'


class DuelAnswer(models.Model):
    """O3: O'quvchining duel savoliga bergan javobi.

    Har (duel, user, question) juftligi yagona — bir savolga bir marta javob.
    """
    duel = models.ForeignKey(
        Duel,
        on_delete=models.CASCADE,
        related_name='duel_answers',
    )
    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='duel_answers',
    )
    question = models.ForeignKey(
        'questions.Question',
        on_delete=models.CASCADE,
        related_name='duel_answers',
    )
    selected_option = models.IntegerField(default=-1)
    is_correct = models.BooleanField(default=False)
    answered_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['answered_at']
        constraints = [
            models.UniqueConstraint(
                fields=['duel', 'user', 'question'],
                name='unique_duel_user_question_answer',
            ),
        ]

    def __str__(self):
        return f'duel:{self.duel_id} user:{self.user_id} q:{self.question_id}={self.selected_option}'


class DailyQuestion(models.Model):
    """DH1: Kunlik savol — har kuni platformaga 3 ta savol tanlanadi.

    `generate_daily_questions` management command har kuni `questions.Question`
    dan random savollarni tanlab shu yerga yozadi. Har (question, date)
    juftligi yagona — bir savol bir kunda ikki marta qo'shilmaydi.
    Foydalanuvchi bugungi savollarga `DailyQuestionAnswer` orqali javob beradi.
    """
    question = models.ForeignKey(
        'questions.Question',
        on_delete=models.CASCADE,
        related_name='daily_questions',
    )
    date = models.DateField(db_index=True)
    subject = models.CharField(max_length=80, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['date', 'id']
        constraints = [
            models.UniqueConstraint(
                fields=['question', 'date'],
                name='unique_daily_question_date',
            ),
        ]

    def __str__(self):
        return f'daily:{self.date} q:{self.question_id}'


class DailyQuestionAnswer(models.Model):
    """DH1: Foydalanuvchining kunlik savolga bergan javobi.

    Har (user, daily_question) juftligi yagona — bir savolga bir marta javob.
    """
    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='daily_question_answers',
    )
    daily_question = models.ForeignKey(
        DailyQuestion,
        on_delete=models.CASCADE,
        related_name='answers',
    )
    selected_option = models.IntegerField(default=-1)
    is_correct = models.BooleanField(default=False)
    answered_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-answered_at']
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'daily_question'],
                name='unique_user_daily_question_answer',
            ),
        ]

    def __str__(self):
        return f'daily-ans:{self.user_id}@{self.daily_question_id}={self.selected_option}'


class WeeklyContest(models.Model):
    """DH4: Haftalik musobaqa — dushanba–yakshanba oralig'idagi reyting.

    `finalize_weekly_contest` management command har juma (yoki yakshanba)
    joriy haftani yakunlaydi: shu hafta yig'ilgan ballarga ko'ra
    `WeeklyContestResult` yozuvlari yaratiladi va status `finished` bo'ladi.
    Bir vaqtning o'zida faqat bitta `active` musobaqa bo'ladi.
    """
    STATUS_ACTIVE = 'active'
    STATUS_FINISHED = 'finished'
    STATUS_CHOICES = [
        (STATUS_ACTIVE, 'Faol'),
        (STATUS_FINISHED, 'Yakunlandi'),
    ]

    week_start = models.DateField(db_index=True)
    week_end = models.DateField()
    status = models.CharField(
        max_length=10, choices=STATUS_CHOICES, default=STATUS_ACTIVE, db_index=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-week_start']
        constraints = [
            models.UniqueConstraint(
                fields=['week_start'],
                name='unique_weekly_contest_week_start',
            ),
        ]

    def __str__(self):
        return f'weekly:{self.week_start}–{self.week_end} [{self.status}]'


class WeeklyContestResult(models.Model):
    """DH4: Foydalanuvchining haftalik musobaqadagi natijasi.

    `score` — shu hafta to'plagan umumiy ball (TestAttempt yig'indisi).
    `rank` musobaqa yakunlanganda yoki joriy reyting hisoblanganda beriladi.
    Har (contest, user) juftligi yagona.
    """
    contest = models.ForeignKey(
        WeeklyContest,
        on_delete=models.CASCADE,
        related_name='results',
    )
    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='weekly_contest_results',
    )
    score = models.PositiveIntegerField(default=0)
    rank = models.PositiveIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['rank', '-score']
        constraints = [
            models.UniqueConstraint(
                fields=['contest', 'user'],
                name='unique_weekly_contest_user',
            ),
        ]

    def __str__(self):
        return f'weekly-result:{self.user_id}@{self.contest_id} score={self.score} rank={self.rank}'
