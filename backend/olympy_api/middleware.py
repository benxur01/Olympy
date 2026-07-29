import logging

from django.conf import settings

logger = logging.getLogger(__name__)


class DrainRequestBodyMiddleware:
    """Javob qaytarishdan oldin o'qilmay qolgan so'rov tanasini oxirigacha o'qib tashlaydi.

    MUAMMO: DRF view'ning o'zi ishga tushmasdan OLDIN qaytariladigan javoblar
    (401 autentifikatsiya, 403 ruxsat, 429 throttle, shuningdek APPEND_SLASH /
    SSL redirect) so'rov tanasiga umuman tegmaydi. HTTP/1.1 da bunday holatda
    server ulanishni yopishga majbur — klient esa hali fayl yuborayotgan bo'ladi
    va yozuvi RST bilan uziladi. Brauzerda bu HTTP status sifatida emas,
    `fetch()` ning TypeError'i ("Failed to fetch") sifatida ko'rinadi, ya'ni
    frontend uni TARMOQ xatosi deb hisoblaydi va foydalanuvchiga "Server bilan
    bog'lanishda xatolik yuz berdi" deb ko'rsatadi. Katta PDF yuklashda
    (savol ajratish) aynan shu yuz berardi: token muddati tugagan yoki soatlik
    AI limiti (20/hour) tugagan bo'lsa, foydalanuvchi haqiqiy sababni EMAS,
    "internetingizni tekshiring" degan chalg'ituvchi xabarni olardi.

    YECHIM: javob socketga yozilishidan oldin qolgan tanani o'qib tashlaymiz —
    klientning yuborishi to'liq yakunlanadi va brauzer javobni (401/403/429)
    normal o'qiy oladi.

    Tana allaqachon o'qilgan bo'lsa (odatdagi holat) `read()` darhol b'' qaytaradi,
    ya'ni qo'shimcha xarajat yo'q. Cheklovsiz o'qish DoS vektori bo'lmasligi uchun
    `MAX_DRAIN_REQUEST_BODY_BYTES` chegarasi bor: undan katta tanani oxirigacha
    o'qimaymiz (bunday so'rov baribir hech bir endpoint limitiga sig'maydi).
    """

    CHUNK_SIZE = 64 * 1024
    BODY_METHODS = frozenset({'POST', 'PUT', 'PATCH', 'DELETE'})

    def __init__(self, get_response):
        self.get_response = get_response
        self.max_bytes = int(
            getattr(settings, 'MAX_DRAIN_REQUEST_BODY_BYTES', 32 * 1024 * 1024)
        )

    def __call__(self, request):
        response = self.get_response(request)
        self._drain(request)
        return response

    def _drain(self, request):
        if request.method not in self.BODY_METHODS:
            return
        try:
            content_length = int(request.META.get('CONTENT_LENGTH') or 0)
        except (TypeError, ValueError):
            return
        if content_length <= 0 or content_length > self.max_bytes:
            return
        try:
            while request.read(self.CHUNK_SIZE):
                pass
        except Exception:
            # Ulanish allaqachon uzilgan yoki oqim o'qilmaydi — javobni baribir
            # qaytaramiz, bu yerda qila oladigan boshqa ish yo'q.
            logger.debug('So\'rov tanasini oxirigacha o\'qib bo\'lmadi', exc_info=True)


class SecurityHeadersMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        # CSP'ni har so'rovda qayta qurмаслик uchun bir marta hisoblaymiz.
        self._csp = self._build_csp()

    def _build_csp(self):
        """Loyihaning haqiqiy CDN/API domenlariga moslangan CSP.

        Frontend resurslari: Google Fonts (fonts.googleapis.com / gstatic.com),
        media — Cloudinary (https: orqali qoplanadi). API ulanishlari onrender /
        prolymp.uz domenlari va Sentry (*.ingest.sentry.io). DEBUG rejimida Vite
        dev server (localhost + ws HMR) ishlaydi — uni bloklamaslik uchun
        connect-src kengaytiriladi.
        """
        # Production: faqat o'z domenlari + monitoring. DEBUG: kengroq (Vite HMR).
        if settings.DEBUG:
            connect_src = [
                "'self'", 'https:', 'wss:', 'ws:',
                'http://localhost:*', 'http://127.0.0.1:*',
            ]
            script_src = "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
        else:
            site = (getattr(settings, 'SITE_URL', '') or 'https://prolymp.uz').rstrip('/')
            connect_src = [
                "'self'",
                site,
                'https://api.prolymp.uz',
                'https://*.onrender.com',
                'https://*.sentry.io',
                'https://*.ingest.sentry.io',
                'https://generativelanguage.googleapis.com',
                'https://api.telegram.org',
                # Google Identity Services (Google orqali kirish) so'rovlari.
                'https://accounts.google.com/gsi/',
            ]
            # Google Sign-In: gsi/client skripti CSP tomonidan bloklanmasin.
            script_src = "script-src 'self' https://accounts.google.com/gsi/client"

        directives = [
            "default-src 'self'",
            script_src,
            # style-src'ga GIS injected stillari (accounts.google.com/gsi/style).
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/style",
            "font-src 'self' https://fonts.gstatic.com data:",
            # Cloudinary va boshqa media https: orqali; data:/blob: avatarlar uchun.
            "img-src 'self' data: https: blob:",
            "connect-src " + ' '.join(connect_src),
            # Google Identity Services One Tap iframe'i (accounts.google.com/gsi/).
            "frame-src https://accounts.google.com/gsi/",
            # Clickjacking himoyasi — sayt iframe ichida ko'rsatilmaydi.
            "frame-ancestors 'none'",
        ]
        return '; '.join(directives) + ';'

    def __call__(self, request):
        response = self.get_response(request)
        response.setdefault('Referrer-Policy', 'strict-origin-when-cross-origin')
        response.setdefault('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
        response.setdefault('Content-Security-Policy', self._csp)
        return response
