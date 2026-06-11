"""Phone normalization helpers — must mirror the frontend rules in store.jsx.

The platform rule: one phone number = one account. The same number written in
many shapes must be treated as identical.

Examples that all collapse to ``+998901234567``:
    +998 90 123 45 67
    +998901234567
    998901234567
    90 123 45 67
    (90) 123-45-67
"""
import re


# ─── User-scoped cache helpers ────────────────────────────────────────────────
# Bashorat (predictions) va obuna (subscription) holatlari har HTTP so'rovda
# DB aggregate/filter talab qiladi. Bularni qisqa muddatli cache'da saqlaymiz
# va tegishli ma'lumot o'zgarganda (yangi attempt, obuna o'zgarishi) bekor
# qilamiz. Kalitlar markazda — invalidatsiya har joyda bir xil bo'lsin.

def predictions_cache_key(user_id):
    return f"user_predictions_{user_id}"


def subscription_cache_key(user_id):
    return f"user_subscription_{user_id}"


def invalidate_user_predictions_cache(user_id):
    """Foydalanuvchi natijalari o'zgarganda bashorat cache'ini tozalaydi."""
    if not user_id:
        return
    try:
        from django.core.cache import cache
        cache.delete(predictions_cache_key(user_id))
    except Exception:
        pass


def invalidate_user_subscription_cache(user_id):
    """Obuna holati o'zgarganda (premium berildi/bekor qilindi) cache tozalanadi."""
    if not user_id:
        return
    try:
        from django.core.cache import cache
        cache.delete(subscription_cache_key(user_id))
        cache.delete(premium_realtime_cache_key(user_id))
    except Exception:
        pass


def premium_realtime_cache_key(user_id):
    return f"user_premium_rt_{user_id}"


# is_user_premium natijasi qisqa muddat keshlanadi — premium-only endpoint'lar
# har so'rovda DB'ga subscription query yubormasin.
PREMIUM_CHECK_CACHE_TTL = 60


def is_user_premium(user):
    """Premium holatini real vaqtda tekshiradi (60 soniyalik cache bilan).

    `user.is_premium` flag'i obuna muddati tugaganda darhol yangilanmaydi
    (Celery task 60 daqiqada bir yuradi, /me lazy expiry esa faqat /me
    so'rovida ishlaydi). Premium-only endpoint'lar shu helper orqali
    flag + aktiv obuna (`is_active=True, end_date > now`) ikkalasini
    tekshiradi — muddati o'tgan obuna bilan premium imkoniyat ochilmaydi.
    """
    if user is None or not getattr(user, 'is_authenticated', True):
        return False
    if not getattr(user, 'is_premium', False):
        return False
    try:
        from django.core.cache import cache
        key = premium_realtime_cache_key(user.id)
        cached = cache.get(key)
        if cached is not None:
            return bool(cached)
    except Exception:
        cache = None
    from django.utils import timezone
    active = user.subscriptions.filter(
        is_active=True, end_date__gt=timezone.now(),
    ).exists()
    if cache is not None:
        try:
            cache.set(key, 1 if active else 0, PREMIUM_CHECK_CACHE_TTL)
        except Exception:
            pass
    return active


def normalize_phone(raw):
    """Return canonical ``+998<9 digits>`` form, or ``''`` if invalid."""
    if raw is None:
        return ''
    digits = re.sub(r'\D', '', str(raw))
    if not digits:
        return ''
    last9 = digits[-9:]
    if len(last9) != 9:
        return ''
    return '+998' + last9


def avatar_url_for(user, request=None):
    """Foydalanuvchi avatari uchun URL qaytaradi (bo'sh bo'lsa '').

    Bu helper barcha serializer/view'larda ishlatilishi uchun `request`
    kontekstidan mustaqil ishlaydi:

    - Cloudinary/S3 ishlatilganda `avatar.url` allaqachon to'liq absolyut
      URL (``https://...``) qaytaradi — o'shani o'zgartirmasdan beramiz.
    - Lokal FileSystem storage'da `avatar.url` nisbiy (``/media/avatars/..``)
      bo'ladi; `request` mavjud bo'lsa absolyut URL yasaymiz, aks holda
      nisbiy URL qaytaramiz (frontend uni API base bilan birlashtiradi).
    """
    avatar = getattr(user, 'avatar', None) if user is not None else None
    if not avatar:
        return ''
    try:
        url = avatar.url
    except Exception:
        return ''
    if not url:
        return ''
    # Allaqachon absolyut (Cloudinary/S3) bo'lsa o'zgartirmaymiz.
    if url.startswith('http://') or url.startswith('https://'):
        return url
    if request is not None:
        try:
            return request.build_absolute_uri(url)
        except Exception:
            return url
    return url


def mask_phone(raw):
    """Telefon raqamni qisman yashirish: ``+998 ** *** 78 90`` formatida.

    Faqat oxirgi 4 raqam ko'rsatiladi — leaderboard/public endpoint'larda
    PII sizdirilishini kamaytiradi. To'liq raqam faqat profil egasi va
    admin uchun ochiq. Noto'g'ri/bo'sh raqam uchun bo'sh string qaytaradi.

    Eslatma: bu DISPLAY-only maskalash — backend filtrlash, login va parol
    tiklash hamon to'liq normalized_phone bilan ishlaydi.
    """
    norm = normalize_phone(raw)
    if not norm:
        return ''
    # norm = +998 + 9 raqam. Oxirgi 4 ta raqamni ochamiz.
    last4 = norm[-4:]
    return f"+998 ** *** {last4[:2]} {last4[2:]}"


def predict_success_ai(student_name, avg_score, attempts_count, subject_performance):
    """
    Generates a personalized AI success predictor report for a student in Uzbek.
    """
    from questions.ai_generation import _gemini_api_keys, _gemini_models
    import urllib.request, urllib.parse, json

    keys = _gemini_api_keys()
    if not keys:
        return "AI tahlil sozlanmagan."

    subj_str = ", ".join(f"{sub}: {avg}%" for sub, avg in subject_performance.items())
    prompt = (
        f"Siz professional ta'lim ekspertisiz. O'quvchi haqida quyidagi ma'lumotlar bor:\n"
        f"Ismi: {student_name}\n"
        f"O'rtacha bali: {avg_score}%\n"
        f"Jami topshirgan imtihonlari: {attempts_count} ta\n"
        f"Fanlar kesmidagi natijalari: {subj_str}\n\n"
        f"Ushbu ma'lumotlarga ko'ra, o'quvchining Prezident maktabiga kirish imtihonlari, Al-Xorazmiy olimpiadasi va DTM testlaridagi "
        f"tayyorgarlik darajasi va kelajakdagi muvaffaqiyati bo'yicha o'zbek tilida motivatsion tahlil va maslahatlar yozib bering. "
        f"O'quvchi qaysi mavzularda ko'proq shug'ullanishi kerakligi haqida aniq yo'l xaritasini ko'rsating.\n\n"
        f"Javobni faqat o'zbek tilida va formatlashda Markdown (masalan, ro'yxatlar, sarlavhalar, muhim qismlarini qalin qilish) ishlatib yozing."
    )

    payload = {
        'contents': [{
            'role': 'user',
            'parts': [{'text': prompt}],
        }],
        'generationConfig': {
            'maxOutputTokens': 2048,
        },
    }
    body = json.dumps(payload).encode('utf-8')

    for model in _gemini_models():
        model_path = urllib.parse.quote(model, safe='-_.~/')
        url = f'https://generativelanguage.googleapis.com/v1beta/models/{model_path}:generateContent'
        for api_key in keys:
            req = urllib.request.Request(
                url,
                data=body,
                method='POST',
                headers={
                    'Content-Type': 'application/json',
                    'x-goog-api-key': api_key,
                },
            )
            try:
                with urllib.request.urlopen(req, timeout=45) as response:
                    raw = json.loads(response.read().decode('utf-8'))
                parts = (((raw.get('candidates') or [{}])[0].get('content') or {}).get('parts') or [])
                text = ''.join(part.get('text') or '' for part in parts)
                if text.strip():
                    return text.strip()
            except Exception:
                pass
    return "Hozircha AI tahlilini yuklab bo'lmadi. Iltimos keyinroq qayta urinib ko'ring."

