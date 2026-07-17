from django.conf import settings


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
                'https://api.openai.com',
                'https://api.telegram.org',
            ]
            script_src = "script-src 'self'"

        directives = [
            "default-src 'self'",
            script_src,
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' https://fonts.gstatic.com data:",
            # Cloudinary va boshqa media https: orqali; data:/blob: avatarlar uchun.
            "img-src 'self' data: https: blob:",
            "connect-src " + ' '.join(connect_src),
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
