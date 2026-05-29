"""Maxsus rate-limit (throttle) klasslari.

DRF'ning standart AnonRateThrottle/UserRateThrottle IP yoki user bo'yicha
cheklaydi. Bu yerdagi klasslar aniqroq kalitlar bo'yicha cheklaydi:

- ``OtpRequestThrottle`` — TELEFON RAQAM bo'yicha. Bir raqamga soatiga
  ko'pi bilan 3 ta OTP/Telegram tasdiqlash so'rovi. IP bo'yicha emasligi
  muhim: maktab/o'quv markazda 30+ talaba bitta IP (NAT) orqali kirsa,
  IP-bazali cheklov barchasini bloklab qo'yardi. Telefon-bazali cheklov esa
  faqat bitta raqamga spam yuborishni to'sadi va boshqa talabalarga ta'sir
  qilmaydi.

- ``PasswordChangePerUserThrottle`` — autentifikatsiyalangan FOYDALANUVCHI
  bo'yicha. Parolni soatiga ko'pi bilan 5 marta o'zgartirish — abuse va
  parol-urinish skriptlarini to'sadi, oddiy foydalanuvchiga xalal bermaydi.

Eslatma: login (``auth`` scope) ataylab IP bo'yicha keng (60/min) qoldirilgan,
chunki per-account brute-force himoyasi LoginSerializer ichida bor (bir telefon
uchun 5 ta noto'g'ri urinishdan keyin 15 daqiqa lock). IP-bazali qattiq login
cheklovi NAT ortidagi maktablarni buzardi.
"""
from rest_framework.throttling import SimpleRateThrottle

from .utils import normalize_phone


class OtpRequestThrottle(SimpleRateThrottle):
    """Telefon raqam bo'yicha OTP/tasdiqlash so'rovini cheklash (3/soat)."""

    scope = 'otp_request'

    def get_cache_key(self, request, view):
        raw_phone = (request.data or {}).get('phone') if hasattr(request, 'data') else None
        norm = normalize_phone(raw_phone)
        if not norm:
            # Telefon noto'g'ri/yo'q bo'lsa serializer 400 qaytaradi —
            # throttle qilmaymiz (None => limit qo'llanilmaydi).
            return None
        return self.cache_format % {'scope': self.scope, 'ident': norm}


class PasswordChangePerUserThrottle(SimpleRateThrottle):
    """Autentifikatsiyalangan foydalanuvchi bo'yicha parol o'zgartirish (5/soat)."""

    scope = 'password_change'

    def get_cache_key(self, request, view):
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return None
        return self.cache_format % {'scope': self.scope, 'ident': user.pk}
