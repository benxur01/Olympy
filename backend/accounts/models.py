"""User model with phone-based authentication.

Roles are stored as a list on the user: ``['student', 'teacher', ...]``.
Per-role status (pending / approved / rejected) and the bound center live on
``CenterMembership`` (in the ``centers`` app), not here. Platform Admin is the
exception — that's a system-wide role represented by ``is_platform_admin``.
"""
import logging
import uuid

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone

from .utils import normalize_phone


logger = logging.getLogger(__name__)

# `User.touch_last_seen()` DB'ga shundan tez-tez yozmaydi. Faollik belgisi HAR
# bir autentifikatsiyalangan so'rovda qo'yiladi, lekin "oxirgi ko'rilgan"
# ko'rsatkichi uchun daqiqalik aniqlik yetarli — 1 daqiqalik oraliq yozuv
# yukini so'rovlar soniga emas, faol foydalanuvchilar soniga bog'laydi.
LAST_SEEN_WRITE_INTERVAL_SECONDS = 60


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
    # Hisobni tiklash uchun IXTIYORIY zaxira kanali — autentifikatsiya baribir
    # telefon (Telegram OTP) orqali. `email` faqat EmailVerification oqimida
    # tasdiqlangandan keyin yoziladi; `email_verified_at` esa "tasdiqlangan"
    # holatni "shunchaki mavjud" holatdan ajratadi (admin panelidan qo'lda
    # kiritilgan yoki kelajakdagi import qilingan manzil tasdiqsiz bo'lishi
    # mumkin — tiklash uchun faqat tasdiqlangani yaroqli).
    # NULL ruxsat etiladi va unique constraint bir nechta NULL bilan
    # to'qnashmaydi (Postgres ham, SQLite ham NULL'larni o'zaro teng emas deb
    # hisoblaydi) — `username` bilan bir xil naqsh.
    email = models.EmailField(max_length=254, unique=True, blank=True, null=True)
    email_verified_at = models.DateTimeField(null=True, blank=True)
    # JSON list of role keys: student | teacher | manager | owner | admin
    roles = models.JSONField(default=list, blank=True)
    is_platform_admin = models.BooleanField(default=False)
    is_premium = models.BooleanField(default=False, db_index=True)
    # Yangi ro'yxatdan o'tgan har bir foydalanuvchi uchun 1 oylik premium
    # sinov muddati (register'da o'rnatiladi). Bu vaqt hali o'tmagan bo'lsa
    # foydalanuvchi premium imkoniyatlardan foydalanadi — register paytida
    # `is_premium=True` ham qilinadi (questions/centers tekshiruvlari shu
    # flag'ga tayanadi). Sinov tugaganida lazy-expiry mantig'i (/me) va
    # Celery task `is_premium`ni False qaytaradi (agar admin/obuna orqali
    # premium berilmagan bo'lsa).
    premium_trial_end = models.DateTimeField(null=True, blank=True)
    # Trial→paid konversiya eslatmasi (P4): premium sinov muddati tugashiga
    # yaqin (2-3 kun) qolgan, hali pullik obunaga o'tmagan foydalanuvchilarga
    # bir martalik shaxsiylashtirilgan Telegram eslatma yuboriladi. Bu maydon
    # eslatma yuborilgan vaqtni saqlaydi — har trial bir martalik bo'lib,
    # `send_trial_ending_reminders` task NULL bo'lgan userlarnigina tanlaydi
    # (takror yubormaslik uchun). BooleanFlag o'rniga DateTimeField — qachon
    # yuborilganini bilish va kelajakda trial davriga bog'lash imkonini beradi.
    trial_reminder_sent_at = models.DateTimeField(null=True, blank=True)
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
    # Pro tarifi: yutuqlar portfoliosi (barcha vaqt statistikasi) PDF'ida QR
    # kod sifatida ko'rsatiladigan public verify URL uchun UUID:
    # prolymp.uz/portfolio/verify/<uuid>. Public endpoint shu UUID orqali
    # o'quvchining barcha vaqt yutuqlarini tasdiqlaydi. Mavjud userlarda NULL
    # bo'lishi mumkin (migratsiya null=True bilan qo'shadi) — portfolio yuklab
    # olinganda lazy ravishda to'ldiriladi (certificate_uuid naqshi kabi).
    portfolio_uuid = models.UUIDField(
        default=uuid.uuid4, unique=True, null=True, blank=True, db_index=True,
    )

    # Retention onboarding (OB1): yangi foydalanuvchi birinchi kirishda 3-4
    # bosqichli sehrgardan o'tadi. `onboarding_completed` True bo'lguncha
    # frontend wizard'ni ko'rsatadi. `onboarding_subjects` — qiziqadigan
    # fanlar ro'yxati (mini-test va olimpiada takliflari shu asosda).
    onboarding_completed = models.BooleanField(default=False)
    onboarding_grade = models.CharField(max_length=10, null=True, blank=True)
    onboarding_subjects = models.JSONField(default=list, blank=True)
    onboarding_goal = models.CharField(max_length=50, null=True, blank=True)
    # B2B onboarding (markaz egasi uchun): owner birinchi marta direktor
    # paneliga kirganda alohida 3 bosqichli sehrgar ko'rsatiladi (markazni
    # sozlash → birinchi olimpiada → o'quvchi qo'shish). `onboarding_center_
    # completed` True bo'lguncha frontend bu modalni ochadi. Student onboarding
    # (`onboarding_completed`) dan mustaqil — owner ham, student ham bo'lishi mumkin.
    onboarding_center_completed = models.BooleanField(default=False)
    # B2B onboarding (manager va o'qituvchi uchun): manager birinchi marta
    # paneliga kirganda uy tabida yengil orientatsiya banneri ko'rsatiladi
    # (arizalarni ko'rib chiqish → birinchi tadbir yaratish); o'qituvchiga esa
    # birinchi savol yaratishga yo'naltiruvchi banner. Center onboarding'dan
    # mustaqil — har biri o'z roli uchun bir marta ko'rsatiladi.
    onboarding_manager_completed = models.BooleanField(default=False)
    onboarding_teacher_completed = models.BooleanField(default=False)
    # Adaptiv daraja tizimi (ELO'ga o'xshash): har fan uchun joriy daraja va
    # ketma-ket urinish seriyasi. `subject_levels` — {fan: daraja}, masalan
    # {"Ingliz tili": "B1", "Matematika": "O'rta"}. `level_streak` — har fan
    # uchun {streak, direction} (3 ketma-ket bir yo'nalishda daraja o'zgaradi).
    subject_levels = models.JSONField(default=dict, blank=True)
    level_streak = models.JSONField(default=dict, blank=True)

    # TOTP 2FA (ixtiyoriy). Maxfiy kalit DB'da OCHIQ saqlanmaydi — Fernet bilan
    # shifrlangan holatda `encrypted_totp_secret` da yotadi (DB dump sizsa
    # kalitlar ochilmasin). Kod hamma joyda `user.totp_secret` (property) bilan
    # ishlaydi: o'qishda shifr ochiladi, yozishda avtomatik shifrlanadi. Shifr-
    # langan token plaintext base32'dan ancha uzun — shuning uchun max_length=255.
    # `totp_enabled` True bo'lsa login paytida qo'shimcha kod talab qilinadi.
    encrypted_totp_secret = models.CharField(max_length=255, blank=True, default='')
    totp_enabled = models.BooleanField(default=False)

    @property
    def totp_secret(self):
        """Shifrlangan TOTP kalitini ochib qaytaradi (ochiq base32)."""
        from .utils import decrypt_totp_secret
        return decrypt_totp_secret(self.encrypted_totp_secret)

    @totp_secret.setter
    def totp_secret(self, value):
        """Ochiq base32 kalitni shifrlab `encrypted_totp_secret` ga yozadi."""
        from .utils import encrypt_totp_secret
        self.encrypted_totp_secret = encrypt_totp_secret(value)

    is_active = models.BooleanField(default=True)
    # Admin bloki: `is_active=False` o'z-o'zicha "nega" va "qachongacha"
    # savollariga javob bermasdi — sabab qo'llab-quvvatlash uchun ham, blokni
    # ochish qaroriga qaytish uchun ham kerak. `blocked_until` NULL bo'lsa blok
    # muddatsiz (doimiy); to'ldirilgan bo'lsa o'sha vaqtdan keyin blok o'z-o'zidan
    # ochiladi (`release_expired_suspension` — login paytida lazy, va kuniga bir
    # marta `accounts.expire_stale_suspensions` task orqali).
    # Soft-delete (`deleted_at`) ham `is_active=False` qiladi, lekin
    # `blocked_until` ni to'ldirmaydi — avtomatik ochilish o'chirilgan hisobga
    # hech qachon tegmaydi.
    block_reason = models.CharField(max_length=255, blank=True, default='')
    blocked_until = models.DateTimeField(null=True, blank=True, db_index=True)
    exam_blocked_until = models.DateTimeField(null=True, blank=True, db_index=True)
    exam_block_reason = models.CharField(max_length=255, blank=True, default='')
    admin_tags = models.JSONField(default=list, blank=True)
    custom_practice_quota = models.PositiveIntegerField(default=0)
    custom_discount_percent = models.PositiveIntegerField(default=0)
    custom_discount_until = models.DateTimeField(null=True, blank=True)
    # `risk_score` USTUNI ATAYLAB YO'Q (migratsiya 0057 uni o'chirdi).
    # Antifrod balli hech qachon saqlanmaydi — u har safar YAGONA formuladan
    # hisoblanadi: ro'yxatda `security_queries.annotate_admin_risk` (bitta SQL
    # ifodasi), "Batafsil" oynasida `views.compute_user_risk_profile`.
    # Ustun bo'lgan paytda uning yagona yozuvchisi admin GET endpointi edi,
    # ya'ni qiymat admin oynani ochmagan hisoblarda abadiy 0 bo'lib qolardi
    # va o'sha eskirgan nol "xavf yo'q" degan yolg'on signal berardi.
    is_staff = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    # Admin panelidagi "Foydalanuvchilar holati" ro'yxati uchun: foydalanuvchi
    # oxirgi marta qachon so'rov yuborgan ("2 soat oldin"). Redis presence
    # to'plami (`analytics.presence`) bu savolga javob BERA OLMAYDI — u 3
    # daqiqalik oynadan chiqib ketgan yozuvni butunlay o'chiradi, ya'ni
    # oflayn foydalanuvchining vaqti u yerda umuman qolmaydi. Yozuv
    # `touch_last_seen()` orqali va har so'rovda emas (bkz. o'sha metod).
    # DIQQAT: yuqoridagi `last_active_date` — BOSHQA maydon (kunlik streak),
    # bu yerga aloqasi yo'q.
    last_seen_at = models.DateTimeField(null=True, blank=True)
    # Soft-delete: foydalanuvchi o'z hisobini o'chirganda hard delete o'rniga
    # shu vaqt yoziladi. Grace period (ACCOUNT_DELETE_GRACE_DAYS) ichida
    # /api/auth/restore/ orqali qayta tiklash mumkin; muddatdan keyin Celery
    # task hard-delete qiladi. is_active=False soft-delete bilan birga
    # o'rnatiladi (login bloklanadi).
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)

    objects = UserManager()

    USERNAME_FIELD = 'normalized_phone'
    REQUIRED_FIELDS = ['full_name']

    class Meta:
        ordering = ['-created_at']

    @property
    def is_exam_blocked(self):
        """Olimpiadalardan chetlatilganmi (vaqtincha yoki doimiy)."""
        if not self.exam_blocked_until and not self.exam_block_reason:
            return False
        if self.exam_blocked_until and self.exam_blocked_until <= timezone.now():
            return False
        return bool(self.exam_block_reason or self.exam_blocked_until)

    @property
    def is_soft_deleted(self):
        return bool(self.deleted_at)

    def release_expired_suspension(self):
        """Muddati tugagan vaqtinchalik blokni ochadi (lazy expiry).

        Bloklangan foydalanuvchi `/me` ga umuman kira olmaydi (token_version
        bloklash paytida oshiriladi), shuning uchun premium lazy-expiry'sidan
        farqli o'laroq bu tekshiruv KIRISH oqimlarida chaqiriladi: parol bilan
        login (`LoginSerializer`) va Google login. Ilovaga qaytmagan
        foydalanuvchilar uchun kuniga bir marta
        `accounts.expire_stale_suspensions` task xuddi shu ishni toplu
        bajaradi (admin ro'yxatida holat eskirib qolmasin).

        Blokni ochdimi — True qaytaradi. Doimiy blok (`blocked_until` NULL),
        muddati hali tugamagan blok va soft-delete qilingan hisob teginilmaydi.
        """
        if self.is_active or not self.blocked_until:
            return False
        if self.blocked_until > timezone.now():
            return False
        self.is_active = True
        self.block_reason = ''
        self.blocked_until = None
        self.save(update_fields=['is_active', 'block_reason', 'blocked_until'])
        return True

    def touch_last_seen(self):
        """`last_seen_at` ni yangilaydi — lekin HAR so'rovda emas.

        Chaqiruvchi `accounts.authentication`, ya'ni har bir
        autentifikatsiyalangan so'rov. Shu sababli ikkita qoida:

        1) Chegara tekshiruvi BEPUL: `self` allaqachon JWT autentifikatsiyasi
           uchun DB'dan o'qilgan, ya'ni `last_seen_at` xotirada turibdi —
           qo'shimcha SELECT ham, qo'shimcha Redis so'rovi ham kerak emas.
           Yozuv esa faqat qiymat `LAST_SEEN_WRITE_INTERVAL_SECONDS` dan
           eskirgan bo'lsa yuboriladi.
        2) `save()` emas, `update()`: `save()` signal'lardan tashqari
           `normalize_phone`/`full_name` mantig'ini ham qayta ishga tushirardi
           (`update_streak` dagi `_persist_streak` bilan bir xil sabab).

        Xato jimgina yutiladi (`AuditLog.log` naqshi): faollik belgisi yaroqli
        seansni buzib qo'ymasligi kerak — chaqiruv nuqtasi `authenticate()`
        ichida, `try`dan tashqarida.

        Yozuv bo'ldimi — True qaytaradi.
        """
        now = timezone.now()
        if self.last_seen_at and (
            (now - self.last_seen_at).total_seconds() < LAST_SEEN_WRITE_INTERVAL_SECONDS
        ):
            return False
        try:
            User.objects.filter(pk=self.pk).update(last_seen_at=now)
        except Exception:
            logger.exception('touch_last_seen xatosi: user_id=%s', self.pk)
            return False
        self.last_seen_at = now
        return True

    @property
    def email_verified(self):
        """Email tiklash kanali sifatida ishlatishga yaroqlimi?"""
        return bool(self.email and self.email_verified_at)

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
        # Email ham shu sababdan NULL'ga aylanadi; qo'shimcha ravishda kichik
        # harfga keltiriladi — unique tekshiruv va tiklash oqimi manzilni harf
        # registriga qarab ikkiga ajratmasligi kerak.
        if self.email is not None:
            self.email = str(self.email).strip().lower() or None
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.full_name} ({self.normalized_phone})'

    def has_role(self, role):
        return role in (self.roles or [])

    @property
    def trial_active(self):
        """Premium sinov muddati hali amal qilyaptimi?"""
        return bool(
            self.premium_trial_end and self.premium_trial_end > timezone.now()
        )

    @property
    def is_premium_active(self):
        """Premium holat — admin/obuna orqali berilgan (`is_premium`) YOKI
        hali amal qiluvchi sinov muddati. Frontend va serializer shu
        property'ni o'qiydi. Real-time obuna tekshiruvi (muddati o'tgan
        obunani rad etish) uchun `accounts.utils.is_user_premium` ishlatiladi.
        """
        return bool(self.is_premium) or self.trial_active

    # ─── Adaptiv daraja tizimi ────────────────────────────────────────────
    # CEFR — Ingliz tili uchun (A1..C2). Boshqa fanlar uchun 3 bosqichli
    # standart shkala. SUBJECT_LEVELS_MAP fan nomini o'z shkalasiga bog'laydi.
    CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
    STANDARD_LEVELS = ["Boshlang'ich", "O'rta", "Ilg'or"]
    SUBJECT_LEVELS_MAP = {
        'Ingliz tili': ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
        'Matematika': ["Boshlang'ich", "O'rta", "Ilg'or"],
        'Fizika': ["Boshlang'ich", "O'rta", "Ilg'or"],
        'Kimyo': ["Boshlang'ich", "O'rta", "Ilg'or"],
        'Biologiya': ["Boshlang'ich", "O'rta", "Ilg'or"],
        'Tarix': ["Boshlang'ich", "O'rta", "Ilg'or"],
        'Informatika': ["Boshlang'ich", "O'rta", "Ilg'or"],
        'IT': ["Boshlang'ich", "O'rta", "Ilg'or"],
    }

    def update_subject_level(self, subject: str, direction: str) -> dict:
        """ELO'ga o'xshash adaptiv daraja yangilash.

        `direction` — 'up' yoki 'down'. Bir xil yo'nalishda 3 ketma-ket
        urinishdan keyin daraja bir pog'ona ko'tariladi/tushadi va seriya
        nolga qaytadi. Yo'nalish o'zgarsa seriya 1 dan qayta boshlanadi.
        Foydalanuvchining shu fanda joriy darajasi bo'lmasa hech narsa
        qilmaydi (onboarding'da daraja belgilangan bo'lishi shart).
        """
        levels = self.SUBJECT_LEVELS_MAP.get(subject, self.STANDARD_LEVELS)
        current_level = (self.subject_levels or {}).get(subject)
        if not current_level or current_level not in levels:
            return {'subject': subject, 'old_level': current_level, 'new_level': current_level, 'changed': False}

        streaks = dict(self.level_streak or {})
        entry = streaks.get(subject, {'streak': 0, 'direction': None})

        if entry.get('direction') == direction:
            entry['streak'] = entry.get('streak', 0) + 1
        else:
            entry = {'streak': 1, 'direction': direction}

        old_level = current_level
        new_level = current_level

        if entry['streak'] >= 3:
            idx = levels.index(current_level)
            if direction == 'up' and idx < len(levels) - 1:
                new_level = levels[idx + 1]
            elif direction == 'down' and idx > 0:
                new_level = levels[idx - 1]
            entry = {'streak': 0, 'direction': None}

        streaks[subject] = entry
        new_subject_levels = dict(self.subject_levels or {})
        new_subject_levels[subject] = new_level

        User.objects.filter(pk=self.pk).update(
            subject_levels=new_subject_levels,
            level_streak=streaks,
        )
        self.subject_levels = new_subject_levels
        self.level_streak = streaks

        return {
            'subject': subject,
            'old_level': old_level,
            'new_level': new_level,
            'changed': new_level != old_level,
        }

    def update_streak(self):
        """ Ketma-ket faollik kunlarini (streak) yangilash logikasi.

        Har streak o'zgarishida `longest_streak` ham yangilanadi — joriy
        streak eng uzun rekorddan oshsa, rekord yangilanadi. Streak uzilib
        1 ga qaytsa ham longest_streak saqlanib qoladi.
        """
        from django.utils import timezone
        from datetime import timedelta

        def _persist_streak():
            # save() o'rniga to'g'ridan-to'g'ri SQL UPDATE: save() signal'lari va
            # normalize_phone/full_name kabi save() ichidagi ortiqcha logikani
            # chetlab o'tib, faqat streak maydonlarini yangilaymiz. self
            # atributlari allaqachon yangilangan, shuning uchun ulardan o'qiymiz.
            User.objects.filter(pk=self.pk).update(
                streak_count=self.streak_count,
                last_active_date=self.last_active_date,
                longest_streak=self.longest_streak,
            )

        today = timezone.now().date()
        if not self.last_active_date:
            self.streak_count = 1
            self.last_active_date = today
            self.longest_streak = max(self.longest_streak or 0, self.streak_count)
            _persist_streak()
            return True

        diff = today - self.last_active_date
        if diff.days == 1:
            self.streak_count += 1
            self.last_active_date = today
            self.longest_streak = max(self.longest_streak or 0, self.streak_count)
            _persist_streak()
            return True
        elif diff.days > 1:
            if self.is_premium:
                self.streak_count += 1
            else:
                self.streak_count = 1
            self.last_active_date = today
            self.longest_streak = max(self.longest_streak or 0, self.streak_count)
            _persist_streak()
            return True
        return False

    def get_badges(self):
        """ Foydalanuvchining nishonlari (Badges) ro'yxatini qaytaradi.

        Ko'p foydalanuvchi serialize qilinadigan joylarda (admin paneli)
        N+1'ni oldini olish uchun queryset darajasida hisoblangan
        `attempts_100_count` va `total_attempts_count` annotatsiyalari
        mavjud bo'lsa shulardan foydalanamiz — bo'lmasa BITTA shartli
        agregatsiya so'rovi bilan ikkalasini birdan hisoblaymiz (xulq
        o'zgarmaydi).

        Avval bu yerda ikkita alohida `COUNT(*)` so'rovi bor edi va ular
        bitta foydalanuvchi serialize qilinadigan har bir joyda (jumladan
        LOGIN javobida) ketma-ket ikki DB round-trip'ga tushardi. Filtr
        bazasi ikkalasida ham bir xil (`disqualified=False`), shuning uchun
        `score=100` shartini `filter=` bilan bitta so'rovga yig'ish mumkin.
        """
        try:
            badges = []

            annotated_100 = getattr(self, 'attempts_100_count', None)
            annotated_total = getattr(self, 'total_attempts_count', None)

            if annotated_100 is None or annotated_total is None:
                from attempts.models import TestAttempt

                counts = (
                    TestAttempt.objects
                    .filter(user=self, disqualified=False)
                    .aggregate(
                        total=models.Count('id'),
                        perfect=models.Count('id', filter=models.Q(score=100)),
                    )
                )
                if annotated_100 is None:
                    annotated_100 = counts['perfect'] or 0
                if annotated_total is None:
                    annotated_total = counts['total'] or 0

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
            attempts_100 = annotated_100
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
            total_attempts = annotated_total
            if total_attempts >= 10:
                badges.append({
                    'id': 'veteran',
                    'title': 'Tajribali',
                    'description': "10 tadan ortiq imtihonda qatnashgan",
                    'icon': '🎖️',
                    'color': 'from-cyan-500 to-blue-500'
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


class RewardProduct(models.Model):
    # Markaz do'koni: har bir o'quv markaz o'zining mahsulotlarini qo'sha
    # oladi. `center=None` bo'lgan mahsulotlar — platforma global do'koni
    # (admin boshqaradi, barcha o'quvchilarga ko'rinadi). Markazga bog'liq
    # mahsulotlar faqat o'sha markaz o'quvchilariga ko'rinadi.
    center = models.ForeignKey(
        'centers.EducationCenter',
        on_delete=models.CASCADE,
        null=True, blank=True,
        related_name='shop_products',
    )
    title = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    coin_cost = models.PositiveIntegerField()
    icon = models.CharField(max_length=10, default='🎁')
    image = models.ImageField(upload_to='shop_products/', blank=True, null=True)
    # Mahsulot xususiyatlari ro'yxati, masalan ["Hajmi: L", "Rangi: Qizil"].
    features = models.JSONField(default=list, blank=True)
    stock = models.PositiveIntegerField(default=10)
    is_premium_only = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
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
    # Bloklangan hisobning e'tirozi (`accounts.views_appeals`). Nega alohida
    # maqsad, `password_reset` ni qayta ishlatish emas: ikkala oqim ham AYNAN
    # bir xil so'rov bilan yozuv qidiradi (`purpose` + `verified_at__isnull`
    # + `otp_hash`), ya'ni bitta kod ikkala amalni ham bajara olardi —
    # e'tiroz uchun so'ralgan kod bilan parolni almashtirib yuborish mumkin
    # bo'lardi. Telegram'ga ketadigan matn ham shu maydonga qarab tanlanadi.
    PURPOSE_APPEAL = 'appeal'
    PURPOSE_CHOICES = [
        (PURPOSE_REGISTRATION, 'Registration'),
        (PURPOSE_ACCOUNT_LINK, 'Account link'),
        (PURPOSE_PASSWORD_RESET, 'Password reset'),
        (PURPOSE_APPEAL, 'Appeal'),
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


class EmailVerification(models.Model):
    """Email manzilini tasdiqlash sessiyasi (mavjud hisobga email bog'lash).

    `PhoneVerification` bilan bir xil xavfsizlik naqshi: OTP hech qachon ochiq
    saqlanmaydi (faqat Django hash), urinishlar sanaladi va muddat bilan
    cheklanadi. Alohida model — kalit telefon emas, email manzili
    (`PhoneVerification.normalized_phone` 20 belgi, email uchun yetmaydi) va
    yetkazish kanali Telegram chat emas, SMTP (`verify_token`/deep-link kerak
    emas). Sessiya har doim autentifikatsiyalangan foydalanuvchiga bog'langan,
    shuning uchun `user` FK — anonim oqim yo'q.
    """
    PURPOSE_ACCOUNT_LINK = 'account_link'
    PURPOSE_CHOICES = [
        (PURPOSE_ACCOUNT_LINK, 'Account link'),
    ]

    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='email_verifications',
    )
    email = models.EmailField(max_length=254, db_index=True)
    purpose = models.CharField(
        max_length=32,
        choices=PURPOSE_CHOICES,
        default=PURPOSE_ACCOUNT_LINK,
        db_index=True,
    )
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
            models.Index(fields=['user', 'created_at']),
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


class AuditLog(models.Model):
    """Xavfsizlik audit jurnali: admin/owner/manager qilgan muhim
    harakatlar shu yerda yoziladi (premium o'zgartirish, bloklash, markaz
    tasdiqlash/rad etish, olimpiada/savol yaratish-o'chirish, a'zo tasdiqlash).

    Hech qachon maxfiy ma'lumot (parol, OTP, token) yozilmaydi — faqat kim,
    qachon, qaysi obyektga, qanday harakat qilgani va IP manzili.
    """
    ACTION_CHOICES = [
        ('user_premium_toggle', "Premium holat o'zgardi"),
        ('user_block', 'Foydalanuvchi bloklandi'),
        ('user_role_change', "Foydalanuvchi rollari o'zgardi"),
        ('account_delete', "Hisob o'chirildi"),
        # Admin support amallari — kod avvaldan yoziladi, lekin choices'da
        # yo'q edi: `get_action_display()` xom kodni ('admin_phone_change')
        # qaytarardi va admin panelidagi "Amallar tarixi" jadvalida shu
        # ko'rinardi.
        ('admin_password_reset', 'Parol majburan tiklandi'),
        # Admin nomidan soft-delete: `account_delete` (foydalanuvchining o'zi)
        # dan ATAYLAB ajratilgan — "kim o'chirdi" savoliga javob aynan shu
        # ikki kod orqali beriladi.
        ('admin_account_delete', "Hisob admin tomonidan o'chirildi"),
        # Hisobga tegmasdan bitta kontent elementini (savol/olimpiada)
        # o'chirish. Yozuv kontent EGASIGA bog'lanadi, turi va id'si `extra` da.
        ('admin_content_delete', "Foydalanuvchi kontenti o'chirildi"),
        ('admin_phone_change', "Telefon raqami o'zgartirildi"),
        ('admin_totp_reset', "2FA majburan o'chirildi"),
        ('admin_force_logout', 'Barcha seanslar yakunlandi'),
        # Bitta seansni (LoginEvent.jti orqali topilgan refresh token) tugatish
        # — `admin_force_logout` dan farqli, boshqa qurilmalar ishlashda davom
        # etadi.
        ('admin_force_logout_session', 'Bitta seans majburiy tugatildi'),
        ('admin_user_warn', 'Foydalanuvchiga ogohlantirish yuborildi'),
        # Impersonatsiya ("foydalanuvchi sifatida ko'rish") — boshi va oxiri
        # ALOHIDA yoziladi: token qisqa muddatli bo'lsa ham, admin qancha
        # vaqt boshqa hisobda bo'lganini keyin faqat shu ikki yozuv ko'rsatadi.
        ('admin_impersonate_start', "Foydalanuvchi sifatida ko'rish boshlandi"),
        ('admin_impersonate_end', "Foydalanuvchi sifatida ko'rish yakunlandi"),
        # Takrorlangan hisoblarni birlashtirish. Yozuv MAQSADLI (tirik)
        # hisobga bog'lanadi, manba id'si `extra.source_id` da — manba hisob
        # o'z tarixida alohida `user_block` yozuvini oladi.
        ('admin_user_merge', 'Hisoblar birlashtirildi'),
        # IP/tarmoq bloki (`moderation.BlockedIP`). Qo'yilishi ham, olinishi
        # ham yoziladi: qator o'chirilganda ("blokni olib tashlash") jadvalda
        # hech qanday iz qolmaydi, ya'ni jurnal yagona manba
        # (`admin_content_delete` bilan bir xil sabab). Yozuv `BlockedIP`
        # qatoriga bog'lanadi, manzilning o'zi `extra.ip_address` da.
        ('admin_ip_block', 'IP manzil bloklandi'),
        ('admin_ip_unblock', 'IP bloki olib tashlandi'),
        # Foydalanuvchi e'tirozi (`ModerationFlag`, `flag_type='appeal'`)
        # bo'yicha qaror. Moderatsiya navbatidagi boshqa turlar yopilganda
        # jurnalga faqat YON TA'SIR tushadi (savol arxivlandi, IP bloklandi),
        # bu yerda esa qarorning o'zi hisobga tegishli: blok kuchida qoladimi
        # yoki qayta ko'riladimi. Yozuv APELLYATSIYA BERGAN hisobga
        # bog'lanadi — "Batafsil" oynasidagi amallar tarixi target bo'yicha
        # o'qiladi; qaror (`resolved`/`dismissed`) `extra.status` da.
        ('admin_appeal_review', "Appellyatsiya ko'rib chiqildi"),
        ('center_approve', 'Markaz tasdiqlandi'),
        ('center_reject', 'Markaz rad etildi'),
        ('olympiad_create', 'Olimpiada yaratildi'),
        ('olympiad_delete', "Olimpiada o'chirildi"),
        ('question_create', 'Savol yaratildi'),
        ('question_delete', "Savol o'chirildi"),
        ('question_bulk_delete', "Savollar ommaviy o'chirildi"),
        ('question_archive', 'Savol arxivlandi'),
        ('member_approve', "A'zo tasdiqlandi"),
        ('member_reject', "A'zo rad etildi"),
        ('admin_exam_ban', "Olimpiadalardan chetlatildi"),
        ('admin_exam_unban', "Olimpiada taqiqi bekor qilindi"),
        ('admin_user_note_add', "Ichki eslatma qo'shildi"),
        ('admin_user_note_delete', "Ichki eslatma o'chirildi"),
        ('admin_user_tags_update', "Admin teglari yangilandi"),
        ('admin_user_coins_adjust', "Tangalar balansi o'zgartirildi"),
        ('admin_attempt_retake', "Testni qayta topshirishga ruxsat berildi"),
        ('admin_broadcast_message', "Ommaviy xabarnoma yuborildi"),
        ('admin_device_ban', "Qurilma (Fingerprint) bloklandi"),
        ('admin_device_unban', "Qurilma bloki olib tashlandi"),
        ('admin_transfer_center', "O'quv markazi o'zgartirildi"),
        ('admin_set_quota', "Individual kvota va chegirma belgilandi"),
        ('admin_payment_refund', "To'lov qaytarildi (Refund)"),
        ('admin_send_telegram', "Telegram orqali to'g'ridan-to'g'ri xabar yuborildi"),
        ('admin_flash_alert', "Shaxsiy modal xabar yuborildi"),
        ('admin_live_terminate', "Jonli imtihon majburan to'xtatildi"),
        ('admin_bulk_import_users', "Foydalanuvchilar ommaviy import qilindi"),
        # Django admin (`/olympy-mgmt-2025/`) orqali qilingan profil tahriri.
        # API'dagi admin amallari har biri o'z kodiga ega, Django admin esa
        # hech narsa yozmasdi — ya'ni jurnalda ko'rinmaydigan yagona tahrir
        # yo'li shu edi. Qaysi maydonlar o'zgargani `extra.changed_fields` da.
        ('admin_django_admin_user_edit', "Django admin orqali profil tahrirlandi"),
        # Foydalanuvchining maxfiy ma'lumotlari (IP/qurilma/seans tafsilotlari)
        # admin tomonidan ochib ko'rilgani. O'qish amali bo'lgani uchun hech
        # narsani o'zgartirmaydi, lekin "kim kimning izini ko'rdi" savoliga
        # javob faqat shu yozuv orqali beriladi.
        ('admin_sensitive_data_view', "Maxfiy ma'lumot ko'rildi"),
    ]

    actor = models.ForeignKey(
        'accounts.User',
        on_delete=models.SET_NULL,
        null=True,
        related_name='audit_logs',
    )
    action = models.CharField(max_length=50, choices=ACTION_CHOICES)
    target_id = models.IntegerField(null=True, blank=True)
    target_type = models.CharField(max_length=50, blank=True)
    extra = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['actor', '-created_at']),
            models.Index(fields=['action', '-created_at']),
        ]

    def __str__(self):
        return f'audit:{self.action} by {self.actor_id} @ {self.created_at:%Y-%m-%d %H:%M}'

    @classmethod
    def log(cls, request, action, target=None, extra=None):
        """Audit yozuvini yaratadi. Hech qachon exception ko'tarmaydi —
        log yozish biror sababga ko'ra muvaffaqiyatsiz bo'lsa ham asosiy
        harakat (bloklash, tasdiqlash va h.k.) buzilmasligi kerak.
        """
        try:
            # IP'ni aniqlash mantig'i BITTA joyda — `security_logging.client_ip`.
            # Avval bu yerda X-Forwarded-For ning BIRINCHI elementi olinardi,
            # ya'ni mijoz `X-Forwarded-For: 1.2.3.4` qo'shib audit jurnaliga
            # istalgan IP'ni yozdira olardi (jurnal `admin_ip_block`,
            # `admin_account_delete`, `user_block` kabi sezgir amallarni
            # saqlaydi — soxta IP forensikani chalg'itadi). `client_ip` proxy
            # zanjirining OXIRGI, spoof qilib bo'lmaydigan elementini oladi.
            # Import funksiya ichida: `accounts.models` app registry yuklanish
            # paytida import qilinadi va `security_logging` DRF'ni tortadi.
            from olympy_api.security_logging import client_ip

            ip = client_ip(request)
            # `client_ip` manzil topilmasa '-' qaytaradi; `ip_address` esa
            # GenericIPAddressField — '-' yozilsa Postgres'da DataError bo'lib
            # audit yozuvi butunlay yo'qolardi.
            if ip in ('', '-'):
                ip = None
            cls.objects.create(
                actor=request.user if request.user.is_authenticated else None,
                action=action,
                target_id=getattr(target, 'pk', None),
                target_type=type(target).__name__ if target else '',
                extra=extra or {},
                ip_address=ip or None,
            )
        except Exception:
            logger.exception('AuditLog.log xatosi: action=%s', action)


class LoginEvent(models.Model):
    """Kirish (sessiya boshlanishi) tarixi — admin paneldagi "Kirish tarixi".

    Yozuv `accounts.views._auth_response` ichida, ya'ni yangi JWT beriladigan
    har bir joyda yaratiladi (login, Google login, ro'yxatdan o'tish, parol
    tiklash). Token yangilash (`/api/auth/token/refresh/`) `_auth_response`
    dan o'tmaydi — aks holda tarix haqiqiy kirishlar o'rniga avtomatik
    yangilanishlar bilan to'lib ketardi.

    Django'ning standart `last_login` maydoni bu loyihada hech qachon
    to'ldirilmaydi: login `django.contrib.auth.login()` orqali o'tmaydi va
    SIMPLE_JWT['UPDATE_LAST_LOGIN'] = False. Shu sababli kirish tarixi uchun
    alohida jurnal kerak.

    AuditLog kabi faqat meta-ma'lumot saqlaydi (IP, qurilma satri) — token,
    parol yoki OTP hech qachon yozilmaydi.
    """
    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='login_events',
    )
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    # User-Agent to'liq saqlanmaydi (ba'zi brauzerlarda 500+ belgi) —
    # qurilma/brauzerni ajratish uchun boshlang'ich qismi yetarli.
    user_agent = models.CharField(max_length=255, blank=True, default='')
    # Shu kirishda berilgan REFRESH tokenning `jti` da'vosi. Aynan shu qiymat
    # `token_blacklist.OutstandingToken.jti` ga yoziladi (simplejwt'ning
    # BlacklistMixin.for_user), shuning uchun bitta seansni (barcha
    # qurilmalarni emas) majburiy tugatish uchun yetarli.
    # Token o'zi HECH QACHON saqlanmaydi — faqat identifikator.
    # Eski yozuvlarda bo'sh: ular uchun seansni aniqlab bo'lmaydi.
    jti = models.CharField(max_length=255, blank=True, default='', db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            # Admin paneli faqat bitta foydalanuvchining oxirgi yozuvlarini
            # so'raydi: filter(user=...).order_by('-created_at')[:N].
            models.Index(fields=['user', '-created_at']),
            # Bir IP'dan kirgan hisoblarni topish (ko'p hisobli / shubhali
            # kirishlar tekshiruvi): filter(ip_address=...) — user'siz.
            models.Index(fields=['ip_address']),
        ]

    def __str__(self):
        return f'login:{self.user_id} @ {self.created_at:%Y-%m-%d %H:%M}'


class ReferralCode(models.Model):
    """Referral (do'stni taklif qilish) tizimi.

    Har foydalanuvchining yagona 8 belgilik kodi bo'ladi (talab qilinganda
    avtomatik yaratiladi). Boshqa foydalanuvchi shu kodni `referral/use/`
    orqali kiritsa, ikkalasiga ham `bonus_coins` (default 50) coin beriladi.
    `used_by` — kodni ishlatgan foydalanuvchilar (M2M): bir foydalanuvchi
    kodni faqat bir marta ishlata oladi va o'zining kodini ishlata olmaydi
    (tekshiruv view'da).
    """
    user = models.OneToOneField(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='referral_code',
    )
    code = models.CharField(max_length=8, unique=True, db_index=True)
    used_by = models.ManyToManyField(
        'accounts.User',
        related_name='used_referral_codes',
        blank=True,
    )
    bonus_coins = models.PositiveIntegerField(default=50)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'referral:{self.user_id}={self.code}'


class SupportMessage(models.Model):
    """AI Support yordamchi bilan foydalanuvchilar o'rtasidagi chat xabarlari.

    Ushbu ma'lumotlar Admin panelda "Support" (Murojaatlar) bo'limida ko'rinadi.
    """
    user = models.ForeignKey('accounts.User', on_delete=models.CASCADE, related_name='support_messages', null=True, blank=True)
    session_id = models.CharField(max_length=40, null=True, blank=True, db_index=True)
    role = models.CharField(max_length=10, choices=[('user', 'Foydalanuvchi'), ('model', 'AI Yordamchi'), ('admin', 'Platform Admin')])
    text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        user_part = self.user_id if self.user_id else f'guest:{self.session_id[:8]}'
        return f'{user_part}:{self.role} -> {self.text[:30]}'


class UserAdminNote(models.Model):
    """Admin/moderatorlarning foydalanuvchi bo'yicha ichki eslatmalari (CRM notes)."""
    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='admin_notes',
    )
    author = models.ForeignKey(
        'accounts.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='authored_admin_notes',
    )
    text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', '-created_at']),
        ]

    def __str__(self):
        return f'Note for user {self.user_id} by {self.author_id} @ {self.created_at:%Y-%m-%d %H:%M}'


class DeviceFingerprint(models.Model):
    """Foydalanuvchi qurilmasining apparat/brauzer izi (Browser/Device Fingerprint)."""
    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='device_fingerprints',
    )
    fingerprint_hash = models.CharField(max_length=64, db_index=True)
    browser_name = models.CharField(max_length=100, blank=True, default='')
    os_name = models.CharField(max_length=100, blank=True, default='')
    screen_resolution = models.CharField(max_length=50, blank=True, default='')
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True, default='')
    is_banned = models.BooleanField(default=False, db_index=True)
    ban_reason = models.CharField(max_length=255, blank=True, default='')
    banned_at = models.DateTimeField(null=True, blank=True)
    last_seen_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-last_seen_at']
        indexes = [
            models.Index(fields=['fingerprint_hash']),
            models.Index(fields=['user', '-last_seen_at']),
        ]

    def __str__(self):
        return f"Device {self.fingerprint_hash[:10]} (User {self.user_id}) {'[BANNED]' if self.is_banned else ''}"


class CoinTransaction(models.Model):
    """Tangalar (Coins) hisob-kitob jurnali (Kirim va Chiqim)."""
    TYPE_STREAK = 'streak'
    TYPE_DAILY_GOAL = 'daily_goal'
    TYPE_DAILY_QUESTION = 'daily_question'
    TYPE_REFERRAL = 'referral'
    TYPE_SHOP_REDEEM = 'shop_redeem'
    TYPE_ADMIN_ADJUST = 'admin_adjust'
    TYPE_OLYMPIAD_REWARD = 'olympiad_reward'
    TYPE_OTHER = 'other'

    TYPE_CHOICES = [
        (TYPE_STREAK, 'Streak bonusi'),
        (TYPE_DAILY_GOAL, 'Kunlik maqsad'),
        (TYPE_DAILY_QUESTION, 'Kunlik savol'),
        (TYPE_REFERRAL, 'Referral bonusi'),
        (TYPE_SHOP_REDEEM, 'Do‘kon xaridi'),
        (TYPE_ADMIN_ADJUST, 'Admin to‘g‘rilashi'),
        (TYPE_OLYMPIAD_REWARD, 'Olimpiada mukofoti'),
        (TYPE_OTHER, 'Boshqa'),
    ]

    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='coin_transactions',
    )
    amount = models.IntegerField()  # Musbat (kirim) yoki manfiy (chiqim)
    balance_after = models.PositiveIntegerField(default=0)
    transaction_type = models.CharField(max_length=32, choices=TYPE_CHOICES, default=TYPE_OTHER, db_index=True)
    description = models.CharField(max_length=255, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', '-created_at']),
        ]

    def __str__(self):
        return f"{self.user.full_name}: {self.amount:+d} coins ({self.transaction_type}) -> {self.balance_after}"


class UserFlashAlert(models.Model):
    """Admin tomonidan foydalanuvchiga yuborilgan shaxsiy modal xabar/ogohlantirish."""
    TYPE_INFO = 'info'
    TYPE_WARNING = 'warning'
    TYPE_URGENT = 'urgent'
    TYPE_SUCCESS = 'success'

    TYPE_CHOICES = [
        (TYPE_INFO, 'Ma‘lumot'),
        (TYPE_WARNING, 'Ogohlantirish'),
        (TYPE_URGENT, 'Muhim / Shoshilinch'),
        (TYPE_SUCCESS, 'Muvaffaqiyat'),
    ]

    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='flash_alerts',
    )
    title = models.CharField(max_length=150)
    message = models.TextField()
    alert_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default=TYPE_INFO)
    is_active = models.BooleanField(default=True, db_index=True)
    is_read = models.BooleanField(default=False, db_index=True)
    read_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        'accounts.User',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='authored_flash_alerts',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'is_active', 'is_read']),
        ]

    def __str__(self):
        return f"FlashAlert to {self.user.full_name}: {self.title} ({self.alert_type})"


class SystemConfig(models.Model):
    """Platforma global konfiguratsiyasi va Dynamic Feature Flags."""
    is_maintenance_mode = models.BooleanField(default=False, help_text="Texnik ishlar rejimi")
    maintenance_message = models.TextField(
        default="Platformada rejali texnik ishlar olib borilmoqda. Tez orada qaytamiz!",
        blank=True,
    )
    allow_registrations = models.BooleanField(default=True, help_text="Yangi foydalanuvchilar ro'yxatdan o'tishi")
    default_ai_model = models.CharField(max_length=50, default='gemini-2.5-flash')
    camera_proctoring_global = models.BooleanField(default=True, help_text="Global proktoring yoqilganligi")
    updated_at = models.DateTimeField(auto_now=True)

    @classmethod
    def get_settings(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        return f"SystemConfig (Maintenance={self.is_maintenance_mode})"


