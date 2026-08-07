"""DRF permission class'lari.

Loyihada platforma admini roli ``User.is_platform_admin`` boolean maydoni
orqali ifodalanadi (Django'ning standart ``is_staff``/``is_superuser`` emas).
DRF'ning tayyor ``IsAdminUser`` permission'i esa ``is_staff`` ni tekshiradi —
shu sababli ``is_staff=True, is_platform_admin=False`` foydalanuvchi platforma
metrikasi yoki eksportiga noo'rin kira olardi. ``IsPlatformAdmin`` aynan shu
loyiha rolini tekshiradi.
"""
from urllib.parse import urlparse

from django.conf import settings
from rest_framework.permissions import BasePermission


class IsPlatformAdmin(BasePermission):
    """Faqat ``is_platform_admin=True`` foydalanuvchilarga ruxsat beradi."""

    message = 'Faqat platforma administratori uchun.'

    def has_permission(self, request, view):
        user = getattr(request, 'user', None)
        return bool(
            user
            and user.is_authenticated
            and getattr(user, 'is_platform_admin', False)
        )


# Origin/Referer tekshiruvidan ozod metodlar (holatni o'zgartirmaydi).
_SAFE_METHODS = frozenset({'GET', 'HEAD', 'OPTIONS', 'TRACE'})


def _allowed_origins(request):
    """Holatni o'zgartiruvchi so'rov kelishi mumkin bo'lgan origin'lar to'plami.

    Uchta manbadan yig'iladi:
      - ``CORS_ALLOWED_ORIGINS`` — frontend domenlari (asosiy allowlist),
      - ``CSRF_TRUSTED_ORIGINS`` — Django CSRF uchun ishonchli deb e'lon
        qilingan domenlar (env orqali qo'shimcha domen berilgan bo'lishi
        mumkin),
      - so'rovning O'Z origin'i (same-origin) — API va frontend bitta
        domenda turgan deploy (nginx reverse-proxy) uchun.
    Har so'rovda `settings` dan qayta o'qiladi: `override_settings` bilan
    yozilgan testlar va env o'zgarishi to'g'ri ishlashi uchun.
    """
    origins = set()
    for value in (getattr(settings, 'CORS_ALLOWED_ORIGINS', None) or []):
        origins.add(str(value).strip().rstrip('/'))
    for value in (getattr(settings, 'CSRF_TRUSTED_ORIGINS', None) or []):
        origins.add(str(value).strip().rstrip('/'))
    try:
        origins.add(f'{request.scheme}://{request.get_host()}')
    except Exception:
        # `get_host()` ALLOWED_HOSTS ga mos kelmasa xato beradi — bunday
        # so'rov baribir Django tomonidan rad etiladi.
        pass
    origins.discard('')
    return origins


def _origin_matches(origin, allowed):
    """Origin allowlist'ga mos keladimi (Django uslubidagi ``*.`` wildcard bilan).

    ``CSRF_TRUSTED_ORIGINS`` da Django ``https://*.example.com`` shaklini
    qo'llab-quvvatlaydi — env orqali shunday qiymat berilgan bo'lsa uni ham
    tan olamiz, aks holda mos deploy'da barcha yuklashlar 403 bo'lardi.
    """
    if origin in allowed:
        return True
    parsed = urlparse(origin)
    if not parsed.scheme or not parsed.netloc:
        return False
    for candidate in allowed:
        if '*' not in candidate:
            continue
        cand = urlparse(candidate)
        if cand.scheme != parsed.scheme or not cand.netloc.startswith('*.'):
            continue
        suffix = cand.netloc[1:]  # '*.example.com' -> '.example.com'
        if parsed.netloc.endswith(suffix):
            return True
    return False


class TrustedOrigin(BasePermission):
    """CSRF himoyasi: state-changing so'rovning ``Origin`` allowlist'da bo'lishi.

    NEGA KERAK: bu API'da Django/DRF ning standart CSRF himoyasi ISHLAMAYDI —
    ``SessionAuthentication`` ataylab olib tashlangan (settings.py), shu sababli
    DRF ``enforce_csrf()`` ni chaqirmaydi, ``CsrfViewMiddleware`` esa DRF
    ``APIView`` larini avtomatik ``csrf_exempt`` qiladi. Buning o'rniga ikki
    bilvosita himoya bor:
      1. default parser faqat JSON — HTML forma JSON tanasi yubora olmaydi,
      2. qat'iy CORS — ``fetch``/XHR preflight'da to'xtaydi.

    Fayl yuklaydigan view'lar ``@parser_classes([... MultiPartParser,
    FormParser])`` bilan birinchi himoyani ataylab o'chiradi va shu bilan
    IKKALASINI ham chetlab o'tish mumkin bo'lib qoladi: oddiy
    ``<form enctype="multipart/form-data" method="POST">`` CORS preflight
    talab qilmaydi va JSON emas. Production'da JWT cookie ``SameSite=None``
    (cross-domain frontend uchun) — ya'ni cookie bunday so'rovga avtomatik
    biriktiriladi. Shu sababli multipart qabul qiladigan har bir endpointga
    aniq Origin tekshiruvi qo'shiladi.

    ``Origin`` YO'Q bo'lgan holat: brauzerlar cross-origin (va zamonaviy
    brauzerlarda same-origin) POST/PUT/PATCH/DELETE so'rovlarida ``Origin``
    ni HAR DOIM yuboradi — shu jumladan HTML forma yuborishda. Header umuman
    bo'lmasligi brauzer bo'lmagan klientni bildiradi (mobil ilova, WebView
    ichidagi native so'rov, server-to-server, curl). Bunday so'rovlarda
    ``Referer`` bo'lsa unga qaraymiz, ikkalasi ham bo'lmasa — RUXSAT beramiz,
    aks holda brauzer bo'lmagan integratsiyalar buzilardi. CSRF hujumi
    ta'rifiga ko'ra brauzerdan keladi, ya'ni bu bo'shliq hujum vektori emas.
    ``Origin: null`` (sandboxed iframe, ``file://``) esa ATAYLAB rad etiladi —
    aynan u orqali tekshiruvni aylanib o'tish mumkin bo'lardi.

    To'lov/Telegram webhook'lari bu permission'ni ISHLATMAYDI: ular tashqi
    xizmatlardan keladi (``Origin`` yo'q yoki begona) va o'z imzo/token
    tekshiruviga ega.
    """

    message = "So'rov ishonchsiz manbadan yuborilgan."

    def has_permission(self, request, view):
        if request.method in _SAFE_METHODS:
            return True
        allowed = _allowed_origins(request)
        origin = request.META.get('HTTP_ORIGIN')
        if origin:
            return _origin_matches(origin.strip().rstrip('/'), allowed)
        referer = request.META.get('HTTP_REFERER')
        if referer:
            parsed = urlparse(referer)
            if not parsed.scheme or not parsed.netloc:
                return False
            return _origin_matches(f'{parsed.scheme}://{parsed.netloc}', allowed)
        # Na Origin, na Referer — brauzer emas (docstring'ga qarang).
        return True
