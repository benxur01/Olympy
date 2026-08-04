"""Moderatsiya bayroqlari — admin paneldagi "tekshirish navbati".

Model ATAYLAB generic: bayroqning turi (`flag_type`) va nishoni
(`target_type` + `target_id`) oddiy matn/son maydonlarida saqlanadi, turga
xos qolgan hamma narsa esa `extra` (JSON) ichida. Shu sababli yangi bayroq
turi qo'shish uchun JADVAL sxemasi o'zgarmaydi — faqat `FLAG_TYPE_CHOICES`
ga bitta qator qo'shiladi (Django buning uchun no-op `AlterField`
migratsiyasi yozadi, ustun/indeks tegilmaydi).

Birinchi manba — soatlik `moderation.tasks.detect_suspicious_activity`
(bir xil IP ortidagi ko'p hisob); keyingisi savol moderatsiyasi bo'ladi va
u xuddi shu jadvalga yozadi.

`AuditLog` bilan aralashtirmaslik kerak: audit jurnali "kim nima QILDI" ni
yozadi (o'tgan zamon, faqat o'qish uchun), bu jadval esa "nimani tekshirish
KERAK" ni — yozuvning o'z holati bor va admin uni yopadi.
"""
import ipaddress

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone


class ModerationFlag(models.Model):
    """Tekshirilishi kerak bo'lgan bitta hodisa (avtomatik yoki qo'lda)."""

    FLAG_TYPE_QUESTION = 'question'
    # Markaz xodimi shikoyat qilgan TADBIR (`olympiads.views.flag_olympiad`).
    # `question` bilan bir xil naqsh, faqat boshqa kontent turi: bayroq
    # turlari nishonning turi bo'yicha nomlanadi.
    FLAG_TYPE_OLYMPIAD = 'olympiad'
    FLAG_TYPE_SUSPICIOUS_IP = 'suspicious_ip'
    # Bir foydalanuvchi qisqa muddat ichida bir nechta rasmiy ogohlantirish
    # olgani (`moderation.services.maybe_flag_warning_threshold`). Nishon —
    # foydalanuvchining O'ZI, savol/IP emas.
    FLAG_TYPE_WARNING_THRESHOLD = 'warning_threshold'
    FLAG_TYPE_CHOICES = [
        (FLAG_TYPE_QUESTION, 'Savol'),
        (FLAG_TYPE_OLYMPIAD, 'Olimpiada'),
        (FLAG_TYPE_SUSPICIOUS_IP, 'Shubhali IP'),
        (FLAG_TYPE_WARNING_THRESHOLD, 'Ogohlantirishlar chegarasi'),
    ]

    STATUS_PENDING = 'pending'
    STATUS_RESOLVED = 'resolved'
    STATUS_DISMISSED = 'dismissed'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Kutilmoqda'),
        (STATUS_RESOLVED, 'Hal qilindi'),
        (STATUS_DISMISSED, 'Rad etildi'),
    ]

    flag_type = models.CharField(max_length=20, choices=FLAG_TYPE_CHOICES, db_index=True)
    # Nishon generic (`AuditLog.target_type`/`target_id` bilan bir xil naqsh):
    # `ForeignKey` qo'yib bo'lmaydi, chunki bir bayroq savolga, boshqasi esa
    # umuman model bo'lmagan narsaga (IP manzil) ishora qiladi. Shu sababli
    # IP kabi nishonlarda `target_id` NULL bo'ladi va aniq qiymat `extra` da.
    target_type = models.CharField(max_length=50, blank=True, default='')
    target_id = models.IntegerField(null=True, blank=True)
    reason = models.CharField(max_length=255)
    # Avtomatik detektor yaratgan bayroqda NULL — "Tizim" degani (audit
    # jurnalidagi `AuditLog.actor` bilan bir xil qoida).
    raised_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='raised_moderation_flags',
    )
    status = models.CharField(
        max_length=10, choices=STATUS_CHOICES, default=STATUS_PENDING, db_index=True,
    )
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='resolved_moderation_flags',
    )
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolution_note = models.CharField(max_length=255, blank=True, default='')
    extra = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        # Navbat HAR DOIM "tur + holat" bo'yicha filtrlanib, yangisidan
        # boshlab ko'rsatiladi (`admin_moderation_queue`) — compound indeks
        # aynan shu so'rov uchun.
        indexes = [
            models.Index(fields=['flag_type', 'status', '-created_at']),
        ]

    def __str__(self):
        return f'flag:{self.flag_type}/{self.status} #{self.pk}'


def _parse_ip(value):
    """Matnni `ipaddress` obyektiga aylantiradi; yaroqsiz bo'lsa None.

    Kirish manbai ishonchsiz (mijoz nazorat qiladigan header), shuning uchun
    hech qachon otmaydi: `ValueError` — yaroqsiz manzil, `TypeError` — umuman
    matn emas (None).
    """
    try:
        return ipaddress.ip_address(value)
    except (ValueError, TypeError):
        return None


class BlockedIP(models.Model):
    """Bloklangan IP manzil yoki tarmoq — so'rov view'ga YETIB BORMAYDI.

    `ModerationFlag` dan farqi shu: bayroq faqat "tekshiring" deydi, bu jadval
    esa haqiqiy chora. Yozuvni faqat admin qo'shadi (avtomatik detektor
    HECH QACHON bloklamaydi — bitta IP ortidagi ko'p hisob o'z-o'zicha
    qoidabuzarlik emas: markaz sinfxonasi, oila Wi-Fi'si, operator NAT'i).

    NIMA SAQLANADI. Bitta manzil ham, CIDR tarmoq ham SHU jadvalda:
      * `prefix_length` NULL — aynan shu manzil (`93.184.216.34`);
      * to'ldirilgan — tarmoq (`93.184.216.0` + 24 → `93.184.216.0/24`).
    Manzilning o'zi `GenericIPAddressField` da: Django uni IPv4/IPv6 sifatida
    tekshiradi (matn ustuni bunday kafolat bermasdi) va bitta manzil bo'yicha
    qidiruv indeksdan foydalanadi. Tarmoqqa tegishlilik esa SQL'da emas,
    `ipaddress` bilan Python tomonida hisoblanadi (`matches`) — sqlite'da
    tarmoq operatorlari umuman yo'q va tarmoq qatorlari sanoqli.

    MUDDAT. `expires_at` NULL bo'lsa blok doimiy, to'ldirilgan bo'lsa o'sha
    vaqtdan keyin O'Z-O'ZIDAN kuchini yo'qotadi — foydalanuvchi blokidagi
    (`User.blocked_until`) bilan bir xil semantika. Farqi: bu yerda muddati
    o'tgan qator TOZALANMAYDI (`accounts.expire_stale_suspensions` kabi task
    kerak emas). Foydalanuvchi blokida holat `is_active` ustunida yotadi va
    eskirgan qiymat butun admin ro'yxatini noto'g'ri ko'rsatardi; bu yerda
    esa yagona haqiqat `expires_at` ning o'zi — muddati o'tgan qator hech
    nimani to'smaydi va "shu manzil qachon, nega bloklangan edi" degan
    tarixni saqlaydi (admin uni ro'yxatdan o'chirib tashlashi mumkin).
    """

    ip_address = models.GenericIPAddressField(db_index=True)
    # NULL — bitta manzil; son — CIDR prefiksi (IPv4 uchun 0–32, IPv6 uchun
    # 0–128). Tekshiruv `moderation.views._parse_ip_address` da: qiymat
    # `ipaddress` orqali parse qilinadi, ya'ni bu yerga faqat haqiqiy tarmoq
    # tushadi.
    prefix_length = models.PositiveSmallIntegerField(null=True, blank=True)
    reason = models.CharField(max_length=255)
    # Blokni HAR DOIM admin qo'yadi (`raised_by` dagi "Tizim" holati yo'q),
    # lekin hisob o'chirilsa blok kuchda qolishi kerak — shuning uchun
    # `SET_NULL`, `CASCADE` emas.
    blocked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='blocked_ips',
    )
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'blocked-ip:{self.cidr}'

    @property
    def cidr(self):
        """Ko'rinish uchun matn: `1.2.3.4` yoki `1.2.3.0/24`."""
        if self.prefix_length is None:
            return self.ip_address
        return f'{self.ip_address}/{self.prefix_length}'

    def is_expired(self, now=None):
        """Muddati o'tganmi (doimiy blok uchun har doim False)."""
        if self.expires_at is None:
            return False
        return self.expires_at <= (now or timezone.now())

    def matches(self, ip_address):
        """Shu qator berilgan manzilni qamrab oladimi.

        Bitta manzilda ham solishtiruv matn bo'yicha EMAS, `ipaddress`
        obyektlari bo'yicha: `::1` va `0:0:0:0:0:0:0:1` — bir xil manzilning
        ikki yozuvi. (`match` dagi SQL tengligi ham to'g'ri ishlaydi, chunki
        `GenericIPAddressField` IPv6'ni so'rovga berishdan oldin
        normallashtiradi — bu yerdagi tekshiruv esa metodni mustaqil ham
        to'g'ri qiladi.)
        """
        candidate = _parse_ip(ip_address)
        if candidate is None:
            return False
        try:
            if self.prefix_length is None:
                return candidate == ipaddress.ip_address(self.ip_address)
            network = ipaddress.ip_network(
                f'{self.ip_address}/{self.prefix_length}', strict=False,
            )
        except ValueError:
            # Qator qandaydir yo'l bilan buzilgan (qo'lda SQL, migratsiya) —
            # bunday yozuv hech kimni bloklamaydi, aks holda bitta noto'g'ri
            # qator butun saytni yiqitardi.
            return False
        # IPv4 manzil IPv6 tarmog'iga (va aksincha) hech qachon tushmaydi:
        # `ipaddress` versiyalar mos kelmasa False qaytaradi, otmaydi.
        return candidate in network

    @classmethod
    def match(cls, ip_address):
        """Shu manzilni to'sayotgan KUCHDAGI blok (yo'q bo'lsa None).

        Har so'rovda bitta so'rov (`BlockedIPMiddleware`), shuning uchun
        tanlov iloji boricha tor: `ip_address` bo'yicha aniq moslik
        (indeksli) YOKI tarmoq qatorlari — ular sanoqli va faqat ularni
        Python tomonida tekshirish kerak.

        Muddat SQL darajasida kesiladi, ya'ni muddati o'tgan blok hech qachon
        qaytmaydi (`User.release_expired_suspension` dagi "lazy expiry" bilan
        bir xil g'oya, faqat bu yerda yozuv yangilanmaydi).

        Manzil yaroqsiz bo'lsa (bo'sh satr, `security_logging.client_ip`
        ning "IP yo'q" belgisi `-`, spoof qilingan axlat header) — None,
        so'rov ham DB'ga UMUMAN bormaydi. "Manzil noma'lum" hech qachon
        "bloklangan" degani emas: aks holda proxy noto'g'ri sozlangan
        muhitda (yoki testda) butun sayt yopilib qolardi.
        """
        if _parse_ip(ip_address) is None:
            return None
        now = timezone.now()
        rows = (
            cls.objects
            .filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now))
            .filter(Q(ip_address=ip_address) | Q(prefix_length__isnull=False))
        )
        for row in rows:
            if row.matches(ip_address):
                return row
        return None
