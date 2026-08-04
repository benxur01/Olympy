"""Bloklangan IP'lardan kelgan so'rovlarni to'sadigan middleware.

Chora `BlockedIP` jadvalidan o'qiladi (izohi models.py da) va view'gacha
ishlaydi: DRF permission/throttle qatlamlari umuman ishga tushmaydi, ya'ni
bloklangan manzil na login qila oladi, na ro'yxatdan o'ta oladi, na
`AllowAny` endpoint'larga tega oladi.

NEGA MIDDLEWARE, throttle emas: DRF throttle KO'P so'rovni sekinlashtiradi
va faqat DRF view'larida ishlaydi (Django admin, health check, statik
fayllar undan o'tmaydi). Bu yerda esa qaror adminniki va u BUTUN saytga
tegishli.

NEGA CACHE YO'Q: har so'rovda bitta indeksli so'rov qo'shiladi. Cache
qo'yilsa (Redis yoki LocMem) adminning "hoziroq blokla" amali TTL tugagunicha
yoki qolgan gunicorn worker'larida umuman kuchga kirmasdi — enforcement
uchun bu noto'g'ri savdo. Ro'yxatning o'zi kichik (uni faqat admin qo'lda
to'ldiradi) va so'rov `BlockedIP.match` da iloji boricha tor.
"""
from django.http import JsonResponse

from olympy_api.security_logging import client_ip

from .models import BlockedIP

# Javob matni. Sabab (`BlockedIP.reason`) ATAYLAB berilmaydi: u ichki izoh va
# bloklangan tomonga tafsilot berish kerak emas.
BLOCKED_DETAIL = "Sizning IP manzilingiz bloklangan."


class BlockedIPMiddleware:
    """Bloklangan manzil uchun 403, qolganlari uchun to'liq shaffof."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # IP'ni aniqlash mantig'i BITTA joyda — `security_logging.client_ip`
        # (X-Forwarded-For zanjirining OXIRGI elementi, ya'ni mijoz spoof qila
        # olmaydigan qiymat). Bu yerda qayta yozilsa ikkala joy vaqt o'tib
        # bir-biridan ajralib ketardi va "loglardagi IP boshqa, bloklangan IP
        # boshqa" degan holat chiqardi.
        #
        # Manzil topilmasa `client_ip` `-` qaytaradi va `BlockedIP.match`
        # uni yaroqsiz deb None beradi — ya'ni "IP yo'q" hech qachon
        # bloklashga olib kelmaydi (lokal ishlab chiqish, testlar, noto'g'ri
        # sozlangan proxy).
        if BlockedIP.match(client_ip(request)) is not None:
            return JsonResponse({'detail': BLOCKED_DETAIL}, status=403)
        return self.get_response(request)
