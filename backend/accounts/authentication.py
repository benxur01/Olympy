from django.conf import settings
from django.core.cache import cache
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed

from analytics.presence import record_activity


def impersonation_block_key(jti):
    """Bekor qilingan impersonatsiya tokenining cache kaliti.

    Impersonatsiya tokeni (``accounts.views.admin_impersonate_user``) qisqa
    muddatli va refresh'siz, lekin admin "Admin panelga qaytish"ni bosgach uni
    KUTMASDAN o'lik qilish kerak — aks holda token admin brauzerida muddati
    tugagunicha yaroqli qolardi. Foydalanuvchining ``token_version``ini oshirib
    bekor qilib bo'lmaydi: u aybsiz foydalanuvchini barcha qurilmalaridan
    chiqarib yuborardi. Shu sababli faqat SHU tokenning ``jti`` si cache'da
    qora ro'yxatga tushadi (TTL — tokenning qolgan umri, undan keyin token
    baribir o'zi yaroqsiz).
    """
    return f'impersonation_revoked:{jti}'


class OlympyJWTAuthentication(JWTAuthentication):
    """JWT auth with per-user token version checks.

    Every successful login increments ``User.token_version`` and new JWTs carry
    that version. Older tokens are rejected, which keeps one active login set
    per account and reduces account sharing.
    """

    def authenticate(self, request):
        # Manba tanlash: Authorization header cookie'dan USTUN turadi va header
        # bo'lganda cookie'ga UMUMAN qaytilmaydi — impersonatsiya aynan shunga
        # tayanadi (aks holda seans bekor qilingach so'rov jimgina adminning
        # cookie'si bilan bajarilib ketardi).
        header = self.get_header(request)
        if header is not None:
            try:
                raw_token = self.get_raw_token(header)
            except Exception:
                # Buzilgan Authorization header — yaroqsiz kredensial bilan bir
                # xil muomala (pastdagi izoh).
                return None
        else:
            raw_token = request.COOKIES.get(getattr(settings, 'JWT_ACCESS_COOKIE_NAME', 'olympy_access'))
        if raw_token is None:
            return None
        try:
            validated_token = self.get_validated_token(raw_token)
            user = self.get_user(validated_token)
        except Exception:
            # Kredensial eskirgan yoki yaroqsiz — AllowAny endpoint'larni
            # (login, register, token/refresh) bloklamaslik uchun None
            # qaytaramiz. IsAuthenticated endpoint'lar anonim so'rovni
            # standart DRF 401 bilan rad etadi.
            #
            # NEGA HEADER UCHUN HAM: avval bu yumshoq muomala FAQAT cookie'ga
            # tegishli edi, header esa to'g'ridan-to'g'ri
            # `super().authenticate()` ga ketardi va u muddati o'tgan token
            # uchun `InvalidToken` (401 "Given token not valid for any token
            # type") ko'tarardi — permission_classes=[AllowAny] bo'lsa ham,
            # chunki autentifikatsiya ruxsatdan OLDIN ishlaydi. Frontend esa
            # saqlangan access tokenni HAR bir so'rovga qo'shadi
            # (src/services/api.js — `Authorization: Bearer ...`), shu jumladan
            # `/api/auth/login/` va `/api/auth/token/refresh/` ga. Natijada
            # access token muddati tugagan (30 daqiqa) foydalanuvchi uchun:
            #   1) silent refresh 401 olardi — refresh token 90 kun yaroqli
            #      bo'lsa ham view'gacha yetib bormasdi → majburiy logout;
            #   2) login ham 401 "token not valid" olardi va foydalanuvchi
            #      "Sessiya muddati tugadi. Iltimos, qayta kiring." xabarini
            #      ko'rib, hech qanday yo'l bilan qayta kira olmasdi.
            # Eskirgan kredensial hech qachon YANGI kirishga to'sqinlik
            # qilmasligi kerak — shuning uchun ikkala manba ham bir xil.
            return None
        # Admin panelidagi "Hozir onlayn" sanog'i uchun faollik belgisi. Aynan
        # shu yer: API JWT-only (SessionAuthentication yo'q), shu sababli
        # Django'ning `AuthenticationMiddleware`'i API so'rovlarida doim
        # AnonymousUser ko'radi — oddiy middleware hech qachon ishlamasdi.
        # Bu nuqta esa har bir autentifikatsiyalangan so'rovda (FBV, CBV —
        # farqi yo'q) bir marta bajariladi va JWT dekod mantig'i takrorlanmaydi.
        # `try`dan TASHQARIDA: bu yerdagi kutilmagan xato yaroqli seansni
        # anonimga aylantirib qo'ymasligi kerak (`record_activity` o'zi ham
        # hech qachon otmaydi).
        record_activity(user.id)
        return user, validated_token

    def get_user(self, validated_token):
        # Impersonatsiya tokeni erta bekor qilingan bo'lishi mumkin. Tekshiruv
        # FAQAT `impersonated_by` da'vosi bo'lgan tokenlarda bajariladi —
        # oddiy sessiyalar hech qanday qo'shimcha cache so'rovi olmaydi.
        # Cache ishlamasa (Redis o'chgan) tekshiruv o'tib ketadi va token o'z
        # muddati (15 daqiqa) tugaganda yaroqsiz bo'ladi — qora ro'yxat
        # qo'shimcha qatlam, yagona to'siq emas.
        if validated_token.get('impersonated_by'):
            jti = validated_token.get('jti')
            if jti and cache.get(impersonation_block_key(jti)):
                raise AuthenticationFailed(
                    "Impersonatsiya seansi yakunlangan", code='impersonation_ended',
                )
        user = super().get_user(validated_token)
        token_version = validated_token.get('token_version')
        if token_version is None:
            if getattr(user, 'token_version', 0) == 0:
                return user
            raise AuthenticationFailed('Token eskirgan', code='token_stale')
        try:
            token_version = int(token_version)
        except (TypeError, ValueError):
            raise AuthenticationFailed('Token eskirgan', code='token_stale')
        if token_version != getattr(user, 'token_version', 0):
            raise AuthenticationFailed('Token eskirgan', code='token_stale')
        return user
