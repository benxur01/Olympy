"""
Django settings for the Olympy API.

Defaults to SQLite for local development. To switch to PostgreSQL, set the
following environment variables:
    OLYMPY_DB_ENGINE=postgres
    OLYMPY_DB_NAME=olympy
    OLYMPY_DB_USER=olympy
    OLYMPY_DB_PASSWORD=...
    OLYMPY_DB_HOST=localhost
    OLYMPY_DB_PORT=5432
"""
from datetime import timedelta
import os
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent


def load_local_env(env_path):
    """Load simple KEY=VALUE pairs for local development without extra deps."""
    if not env_path.exists():
        return
    for raw_line in env_path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


load_local_env(BASE_DIR / '.env')


def env_bool(name, default=False):
    return os.environ.get(name, '1' if default else '0').lower() in (
        '1', 'true', 'yes', 'on',
    )


SECRET_KEY = os.environ.get('OLYMPY_SECRET_KEY')
if not SECRET_KEY:
    raise ImproperlyConfigured("OLYMPY_SECRET_KEY muhit o'zgaruvchisi o'rnatilmagan")
DEBUG = env_bool('OLYMPY_DEBUG', False)
_allowed = os.environ.get('OLYMPY_ALLOWED_HOSTS', '')
ALLOWED_HOSTS = [h.strip() for h in _allowed.split(',') if h.strip()] or (
    ['localhost', '127.0.0.1'] if DEBUG else []
)
if not DEBUG and not ALLOWED_HOSTS:
    raise ImproperlyConfigured('OLYMPY_ALLOWED_HOSTS must be set in production')

# Y5/P2: Cloudinary media storage faqat CLOUDINARY_CLOUD_NAME env mavjud
# bo'lganda yoqiladi. Paket o'rnatilmagan lokal muhitlarda app'larni qo'shish
# ImportError berishi sababli, app'lar ham, storage backend'i ham (pastda)
# shu bitta flag bilan boshqariladi — izchil holat.
USE_CLOUDINARY = bool(os.environ.get('CLOUDINARY_CLOUD_NAME'))

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    # cloudinary_storage django.contrib.staticfiles'dan OLDIN bo'lishi kerak
    # (django-cloudinary-storage talabi). Faqat Cloudinary yoqilganda qo'shamiz.
    *(['cloudinary_storage'] if USE_CLOUDINARY else []),
    'django.contrib.staticfiles',
    *(['cloudinary'] if USE_CLOUDINARY else []),
    # Third-party
    'rest_framework',
    'rest_framework.authtoken',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'django_celery_beat',
    # Anymail (Mailgun email backend) — faqat MAILGUN_API_KEY o'rnatilganda
    # qo'shamiz. Aks holda paket o'rnatilmagan lokal muhitda startup buzilmaydi.
    *(['anymail'] if os.environ.get('MAILGUN_API_KEY') else []),
    # Local
    'accounts',
    'centers',
    'olympiads',
    'questions',
    'attempts',
    'notifications',
    'practice',
    'billing',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    # GZip API javoblarini siqadi (JSON ro'yxatlar, katta payload'lar). Trafik
    # va yuklab olish vaqtini kamaytiradi. SecurityMiddleware'dan keyin va
    # WhiteNoise'dan oldin — statik fayllarni WhiteNoise o'zi siqadi.
    'django.middleware.gzip.GZipMiddleware',
    # WhiteNoise statik fayllarni production'da samarali serve qiladi —
    # SecurityMiddleware'dan keyin va boshqa middleware'lardan oldin.
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'olympy_api.middleware.SecurityHeadersMiddleware',
]

ROOT_URLCONF = 'olympy_api.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'olympy_api.wsgi.application'

DATABASE_URL = os.environ.get('DATABASE_URL', '').strip()
# DATABASE_SCHEMA ixtiyoriy: bo'sh bo'lmasa, Django shu PostgreSQL schema'da
# ishlaydi (search_path orqali). Bu bitta DB'ni boshqa loyiha bilan baham
# ko'rishda (masalan, Render free tier'da Quiz-bot bilan) table-name
# to'qnashishlarini oldini oladi. render_build.sh schema'ni yaratadi.
DATABASE_SCHEMA = os.environ.get('DATABASE_SCHEMA', '').strip()
if DATABASE_URL:
    parsed_db = urlparse(DATABASE_URL)
    if parsed_db.scheme not in ('postgres', 'postgresql'):
        raise ImproperlyConfigured('DATABASE_URL must use postgres:// or postgresql://')
    db_options = {}
    if DATABASE_SCHEMA:
        # search_path ni schema'ga qo'yamiz, public ham reachable bo'lsin
        # (masalan extension'lar yoki shared sequence'lar uchun).
        db_options['options'] = f'-c search_path={DATABASE_SCHEMA},public'
    # URL query string'dagi sslmode ni Django OPTIONS'ga o'tkazamiz.
    # Supabase va boshqa managed PostgreSQL xizmatlar sslmode=require talab qiladi.
    qs_params = parse_qs(parsed_db.query)
    if 'sslmode' in qs_params:
        db_options['sslmode'] = qs_params['sslmode'][0]
    # connect_timeout: psycopg ulanish vaqtini cheklaydi (soniyada).
    # Render → Supabase kabi managed DB ulanishlarida kerakli.
    db_options.setdefault('connect_timeout', 30)
    # Supabase transaction pooler (port 6543) prepared statements ni
    # qo'llab-quvvatlamaydi — DISABLE_SERVER_SIDE_CURSORS kerak.
    is_supabase_pooler = (parsed_db.port == 6543)
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': parsed_db.path.lstrip('/'),
            # URL-encoded user/password (masalan, `%40` → `@`, `%23` → `#`)
            # ni unquote orqali decode qilamiz. Aks holda Render kabi
            # avtomatik DATABASE_URL'da maxsus belgi bo'lsa auth fail bo'lardi.
            'USER': unquote(parsed_db.username or ''),
            'PASSWORD': unquote(parsed_db.password or ''),
            'HOST': parsed_db.hostname or '',
            'PORT': str(parsed_db.port or 5432),
            'OPTIONS': db_options,
            'DISABLE_SERVER_SIDE_CURSORS': is_supabase_pooler,
        }
    }
elif os.environ.get('OLYMPY_DB_ENGINE', 'sqlite') == 'postgres':
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.environ.get('OLYMPY_DB_NAME', 'olympy'),
            'USER': os.environ.get('OLYMPY_DB_USER', 'olympy'),
            'PASSWORD': os.environ.get('OLYMPY_DB_PASSWORD', ''),
            'HOST': os.environ.get('OLYMPY_DB_HOST', 'localhost'),
            'PORT': os.environ.get('OLYMPY_DB_PORT', '5432'),
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }

# Persistent DB connections: har HTTP so'rovda yangi PostgreSQL ulanish ochish
# (TLS handshake + auth) sekin. CONN_MAX_AGE (soniya) ulanishni qayta
# ishlatishga ruxsat beradi va bog'lanish overhead'ini kamaytiradi.
# DIQQAT: Supabase transaction pooler (port 6543) har so'rovdan keyin
# ulanishni qaytarib oladi — bunda persistent connection mos kelmaydi,
# shuning uchun pooler aniqlangan bo'lsa CONN_MAX_AGE=0 qoldiriladi.
# SQLite uchun ham ahamiyatsiz, lekin zararsiz.
_conn_max_age = int(os.environ.get('CONN_MAX_AGE', 60))
if DATABASE_URL and locals().get('is_supabase_pooler'):
    _conn_max_age = 0
DATABASES['default']['CONN_MAX_AGE'] = _conn_max_age
# Django 4.1+: persistent connection qayta ishlatishdan oldin uning hali
# tirikligini tekshiradi. Eskirgan (server tomonidan yopilgan) ulanish
# avtomatik tashlanadi va yangisi ochiladi — bu "OperationalError: server
# closed the connection unexpectedly" xatosini oldini oladi.
DATABASES['default']['CONN_HEALTH_CHECKS'] = True

AUTH_USER_MODEL = 'accounts.User'

# Parol kuchaytirildi: minimal uzunlik 6 → 8. Mavjud foydalanuvchilarning
# saqlangan parollari qayta tekshirilmaydi (faqat ro'yxatdan o'tish, parol
# o'zgartirish/tiklashda amal qiladi). CommonPasswordValidator ("123456",
# "password" kabilarni rad etadi), NumericPasswordValidator (faqat raqamli
# parolni rad etadi) va UserAttributeSimilarityValidator (telefon/ismga
# o'xshash parol) ham yoqilgan.
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
     'OPTIONS': {'min_length': 8}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'uz'
TIME_ZONE = 'Asia/Tashkent'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
MEDIA_URL = '/media/'
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')

# Y5/P2: Render free tier'da disk persistent emas — har deploy'da yuklangan
# media fayllar yo'qoladi. CLOUDINARY_CLOUD_NAME env o'rnatilgan bo'lsa media
# fayllar Cloudinary'da saqlanadi (bepul tier), aks holda lokal FileSystem'da.
# Static fayllar har doim WhiteNoise orqali — uni o'zgartirmaymiz.
CLOUDINARY_STORAGE = {
    'CLOUD_NAME': os.environ.get('CLOUDINARY_CLOUD_NAME', ''),
    'API_KEY': os.environ.get('CLOUDINARY_API_KEY', ''),
    'API_SECRET': os.environ.get('CLOUDINARY_API_SECRET', ''),
}
if USE_CLOUDINARY:
    import cloudinary  # noqa: F401  (paket INSTALLED_APPS'ga ham qo'shilgan)

# WhiteNoise compress + immutable cache headers — production rejimida
# faylni hash bilan nomlaydi va brauzer cache'ini agressiv ishlatadi.
# Media (default) backend: Cloudinary yoqilgan bo'lsa MediaCloudinaryStorage,
# aks holda lokal FileSystemStorage.
STORAGES = {
    'default': {
        'BACKEND': 'cloudinary_storage.storage.MediaCloudinaryStorage'
        if USE_CLOUDINARY else 'django.core.files.storage.FileSystemStorage',
    },
    'staticfiles': {
        'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage'
        if not DEBUG else 'django.contrib.staticfiles.storage.StaticFilesStorage',
    },
}

# Cloudinary yoki S3 sozlanmagan production deployda ogohlantirish — yuklangan
# rasmlar har deploy'da yo'qolishini admin bilsin.
if not DEBUG and not USE_CLOUDINARY:
    _has_cloudinary_url = bool(os.environ.get('CLOUDINARY_URL'))
    _has_s3 = bool(os.environ.get('AWS_STORAGE_BUCKET_NAME'))
    if not (_has_cloudinary_url or _has_s3):
        import sys as _sys
        print(
            'WARNING: Production muhitda CLOUDINARY_CLOUD_NAME yoki '
            'AWS_STORAGE_BUCKET_NAME o\'rnatilmagan — yuklangan rasmlar '
            'har deploy\'da yo\'qoladi. Persistent storage sozlang.',
            file=_sys.stderr,
        )
PROFILE_IMAGE_MAX_BYTES = int(os.environ.get('PROFILE_IMAGE_MAX_BYTES', str(5 * 1024 * 1024)))
CENTER_IMAGE_MAX_BYTES = int(os.environ.get('CENTER_IMAGE_MAX_BYTES', str(5 * 1024 * 1024)))
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# DRF
REST_FRAMEWORK = {
    # Faqat JWT autentifikatsiya. SessionAuthentication olib tashlandi —
    # API to'liq stateless JWT cookie/Authorization header orqali ishlaydi,
    # session-based CSRF yuzasi va cookie-auth xavfini kamaytiradi.
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'accounts.authentication.OlympyJWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
    ],
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        # Million foydalanuvchi uchun scale: anon/user limitlari per-minute
        # ga o'tkazildi, Redis cache bilan ishlaydi (locmem emas).
        'anon': '30/min',
        'user': '200/min',
        # Avval '5/min' edi — maktab/o'quv markazda 30+ talaba bitta IP
        # orqali (NAT) kirsa 25 tasi 429 olardi. Per-account brute-force
        # himoyasi LoginSerializer ichida bor (15 daqiqa lock per phone),
        # shu sababli IP-level limitni 10/min ga oshirish xavfsiz (login).
        'auth': '10/min',
        # Register endpoint'lari uchun brute-force himoya.
        # IP bo'yicha 5/min — ro'yxatdan o'tishni spamdan saqlaydi.
        'register': '5/min',
        'ai_question': '20/hour',
        # Submit endpoint uchun alohida cheklov: olimpiada paytida bir
        # foydalanuvchi tezda ko'p marta submit'ni urinmasin (duplicate,
        # race condition'ni keltirib chiqaradi). 30/min — normal foydalanuvchi
        # uchun yetarli, ammo abuse'ga qarshi himoyalaydi.
        'submit': '30/min',
        # Cheating signal endpoint: visibilitychange yoki blur kelganda
        # frontend yuboradigan signalni cheklash. Normal foydalanuvchi
        # daqiqada 1-2 ta signal yuborishi mumkin (tab almashtirish), 5/min
        # yetarli darajada keng, ammo skript-based DoS'ni to'sadi.
        'cheating': '5/min',
        # Test sessiya ping endpoint: olimpiada paytida frontend muntazam
        # (har bir necha soniyada) parallel sessiyani tekshirish uchun ping
        # yuboradi. 60/min normal foydalanuvchi uchun yetarli keng, ammo
        # skript-based DoS'ni to'sadi.
        'ping': '60/min',
        # AI endpointlari (xatolarni tushuntirish, bashorat, o'quv rejasi)
        # tashqi Gemini API'ga murojaat qiladi — qimmat va sekin. Spec bo'yicha
        # foydalanuvchi kuniga maksimal 10 ta so'rov yubora oladi; ortig'i
        # abuse hisoblanadi va 429 qaytariladi.
        'ai': '10/day',
        # AI tahlil audio (O4) — gTTS + Telegram, qimmat va sekin. Spec
        # bo'yicha kuniga 3 ta.
        'ai_audio': '3/day',
        # Olimpiada tayyorgarlik rejasi (O6) — Gemini'ga uzun JSON so'rov.
        # Spec bo'yicha kuniga 5 ta.
        'ai_prep': '5/day',
        # OTP/Telegram tasdiqlash so'rovi — TELEFON RAQAM bo'yicha (IP emas).
        # Bir raqamga soatiga ko'pi bilan 3 ta tasdiqlash so'rovi. Telefon-
        # bazali bo'lgani uchun NAT ortidagi maktablarni buzmaydi, faqat
        # bitta raqamga spam yuborishni to'sadi (accounts.throttling).
        'otp_request': '3/hour',
        # Parol o'zgartirish — autentifikatsiyalangan FOYDALANUVCHI bo'yicha.
        # Soatiga ko'pi bilan 5 marta (accounts.throttling).
        'password_change': '5/hour',
        # Xatolar ro'yxati (get_mistakes_list) — foydalanuvchining barcha
        # attempt'larini stream qilib yig'adi, xotira/CPU jihatdan og'ir.
        # 30/min dashboard uchun yetarli keng, ammo qayta-qayta spam'ni to'sadi.
        'mistakes': '30/min',
        # IT kod savolini AI bilan baholash — tashqi Gemini API'ga qimmat va
        # sekin murojaat qiladi. Spec bo'yicha o'quvchi soatiga 10 ta kod
        # tekshiruvi yubora oladi; ortig'i abuse hisoblanadi.
        'code_review': '10/hour',
        # Judge0 kod runner ("Ishga tushirish") — tashqi Judge0 CE API'ga
        # murojaat qiladi (bepul plan kuniga 50 req). Test case'lar ham har
        # biri alohida run bo'lganligi uchun bitta so'rov bir nechta Judge0
        # call'iga aylanadi. Spec bo'yicha o'quvchi soatiga 20 marta ishga
        # tushira oladi; ortig'i abuse va tashqi limit'ni tez tugatadi.
        'code_run': '20/hour',
        # A/B test event tracking (ab_track_event) — ochiq (AllowAny) endpoint.
        # Throttle bo'lmasa parallel/skriptli so'rovlar A/B counter'larni
        # sun'iy oshirib analitikani buzishi mumkin. IP bo'yicha 5/min normal
        # foydalanuvchi uchun yetarli (view/click/register hodisalari).
        'ab_track': '5/min',
    },
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 50,
    # Markazlashtirilgan xavfsizlik audit logging: 403/429 javoblar
    # 'security' logger'iga yoziladi (olympy_api.security_logging). Bu DRF
    # default handler'ni o'rab ishlaydi — javob xulqi o'zgarmaydi.
    'EXCEPTION_HANDLER': 'olympy_api.security_logging.security_exception_handler',
}

SIMPLE_JWT = {
    # Short-lived access token reduces the blast radius if a token leaks.
    # The frontend automatically refreshes via /api/auth/token/refresh/.
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=30),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'UPDATE_LAST_LOGIN': False,
}
JWT_ACCESS_COOKIE_NAME = os.environ.get('JWT_ACCESS_COOKIE_NAME', 'olympy_access')
JWT_REFRESH_COOKIE_NAME = os.environ.get('JWT_REFRESH_COOKIE_NAME', 'olympy_refresh')
# SameSite tanlash logikasi: dev rejimda Lax kifoya (frontend ham backend ham
# localhost). Production rejimida frontend va backend turli domenlarda bo'lishi
# mumkin (masalan app.olympy.uz va api.olympy.uz) — Lax cookie cross-site GET
# da yuborilmaydi va auth restore ishlamay qoladi. Shuning uchun production
# uchun 'None' tanlanadi (brauzer bunday cookie'ni faqat Secure+HTTPS bilan
# qabul qiladi). Override OLYMPY_JWT_COOKIE_SAMESITE env var orqali mavjud.
_default_samesite = 'Lax' if DEBUG else 'None'
JWT_COOKIE_SAMESITE = os.environ.get('OLYMPY_JWT_COOKIE_SAMESITE', _default_samesite)

CELERY_BROKER_URL = os.environ.get('CELERY_BROKER_URL', 'redis://localhost:6379/0')
CELERY_RESULT_BACKEND = (
    os.environ.get('CELERY_RESULT_BACKEND_URL')
    or os.environ.get('CELERY_BROKER_URL')
    or 'redis://localhost:6379/0'
)

# CELERY_BROKER_URL muhit o'zgaruvchisi o'rnatilmagan bo'lsa (development yoki
# Redis ulanmagan deploy) — task'lar broker'ga ulanolmay jim ravishda
# muvaffaqiyatsiz tugardi (masalan, ota-onaga xabar, AI tahlil yuborilmasdi).
# Bunday holatda task'larni sinxron (eager) ishga tushiramiz: ular chaqirilgan
# joyda darhol bajariladi, broker talab qilinmaydi. Ogohlantirish ham log'ga
# yoziladi — productionda Redis o'rnatish kerakligini ko'rsatadi.
CELERY_TASK_ALWAYS_EAGER = not bool(os.environ.get('CELERY_BROKER_URL'))
# Eager rejimda (broker yo'q — dev/staging) task ichidagi istisnolar jimgina
# yutilib ketmasligi uchun chaqiruvchiga propagate qilamiz. Aks holda task
# ichidagi buglar sezilmay qolardi. Bu faqat CELERY_TASK_ALWAYS_EAGER=True
# bo'lganda ta'sir qiladi; real broker bilan task'lar baribir worker'da
# bajariladi. Chaqiruvchi joylar allaqachon try/except bilan himoyalangan.
CELERY_TASK_EAGER_PROPAGATES = True
if CELERY_TASK_ALWAYS_EAGER:
    import logging as _logging
    _logging.getLogger('olympy.celery').warning(
        'CELERY_BROKER_URL o\'rnatilmagan — Celery task\'lari sinxron (EAGER) '
        'rejimda ishlaydi. Productionda Redis broker o\'rnating, aks holda '
        'og\'ir task\'lar (AI tahlil, ota-ona xabarlari) so\'rovni sekinlashtiradi.'
    )

# Cache — REDIS_URL bo'lsa Redis ishlatamiz, aks holda CELERY_BROKER_URL'dan
# yoki local fallback'dan. Bu rate limit, AI model discovery cache va boshqa
# joylarda ishlatiladi.
_redis_url_for_cache = (
    os.environ.get('REDIS_URL', '').strip()
    or os.environ.get('CELERY_BROKER_URL', '').strip()
)
if _redis_url_for_cache and _redis_url_for_cache.startswith('redis'):
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.redis.RedisCache',
            'LOCATION': _redis_url_for_cache,
        }
    }
else:
    # Test rejim yoki Redis yo'q joylar uchun local memory fallback.
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
            'LOCATION': 'olympy-default',
        }
    }
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = 'Asia/Tashkent'
CELERY_BEAT_SCHEDULER = 'django_celery_beat.schedulers:DatabaseScheduler'

# Periodic tasks (used as a fallback when DatabaseScheduler is empty;
# olympiads/migrations/0002_add_celery_beat_schedule.py also seeds these
# rows into django_celery_beat). Both define the same name so duplicate
# scheduling is safe.
CELERY_BEAT_SCHEDULE = {
    'finish-expired-olympiads': {
        'task': 'olympiads.tasks.finish_expired_olympiads',
        'schedule': timedelta(minutes=5),
    },
    'cleanup-phone-verifications': {
        'task': 'accounts.tasks.cleanup_phone_verifications',
        'schedule': timedelta(hours=1),
    },
}

# CORS — production rejimida faqat aniq ro'yxatdagi originlar.
CORS_ALLOW_ALL_ORIGINS = False
_cors_origins = os.environ.get(
    'OLYMPY_CORS_ALLOWED_ORIGINS',
    'http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:5500' if DEBUG else 'https://prolymp.uz,https://www.prolymp.uz',
)
CORS_ALLOWED_ORIGINS = [
    # Trailing slash bo'lsa CORS middleware origin'ni nomos deb hisoblaydi
    # va so'rovni rad etadi. `.strip('/')` har bir origin'dan slash'ni
    # tozalaydi (masalan `https://app.olympy.uz/` → `https://app.olympy.uz`).
    o.strip().rstrip('/') for o in _cors_origins.split(',')
    if o.strip()
]
# Har doim production va local frontend origin'larini qo'shib qo'yamiz (CORS muammolarini oldini olish uchun)
for origin in [
    'https://prolymp.uz', 'https://www.prolymp.uz',
    'http://localhost:5173', 'http://127.0.0.1:5173',
    # Capacitor mobile app originlari (Android va iOS)
    'capacitor://localhost', 'ionic://localhost', 'http://localhost', 'https://localhost',
]:
    if origin not in CORS_ALLOWED_ORIGINS:
        CORS_ALLOWED_ORIGINS.append(origin)
CORS_ALLOW_CREDENTIALS = True
# Faqat API ishlatadigan metodlar — django-cors-headers default'i TRACE va
# boshqa keraksizlarni ham qo'shadi. Aniq ro'yxat hujum yuzasini kichraytiradi.
CORS_ALLOW_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
if not DEBUG and not CORS_ALLOWED_ORIGINS:
    raise ImproperlyConfigured('OLYMPY_CORS_ALLOWED_ORIGINS must be set in production')
OLYMPY_FRONTEND_URL = (
    os.environ.get('OLYMPY_FRONTEND_URL', '')
    or (CORS_ALLOWED_ORIGINS[0] if CORS_ALLOWED_ORIGINS else '')
    or ('http://localhost:5173' if DEBUG else '')
).rstrip('/')
CSRF_TRUSTED_ORIGINS = [
    o.strip() for o in os.environ.get('OLYMPY_CSRF_TRUSTED_ORIGINS', '').split(',')
    if o.strip()
]
# Har doim prolymp domenlarini CSRF ishonchli origin'lar ro'yxatiga qo'shamiz
for origin in ['https://prolymp.uz', 'https://www.prolymp.uz']:
    if origin not in CSRF_TRUSTED_ORIGINS:
        CSRF_TRUSTED_ORIGINS.append(origin)

# Production security flags. HTTPS hosting platform (Render) HTTPS'ni terminate
# qiladi va X-Forwarded-Proto header yuboradi — shu sababli production'da
# (DEBUG=False) SSL redirect default yoqilgan. Render allaqachon HTTPS'ga
# yo'naltirsa ham, bu ikkinchi himoya qatlami (HSTS bilan birga). Agar boshqa
# muhit HTTPS'ni terminate qila olmasa, OLYMPY_SECURE_SSL_REDIRECT=0 bilan
# o'chirib qo'yish mumkin.
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SECURE_SSL_REDIRECT = env_bool('OLYMPY_SECURE_SSL_REDIRECT', not DEBUG)
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
# Session/CSRF cookie SameSite=Lax — CSRF himoyasi (cross-site POST'da cookie
# yuborilmaydi), ammo oddiy top-level navigatsiyada (Lax) ishlaydi. JWT auth
# cookie'lari alohida JWT_COOKIE_SAMESITE bilan boshqariladi (cross-domain
# frontend uchun production'da None) — bu sozlama ularga ta'sir qilmaydi.
SESSION_COOKIE_SAMESITE = 'Lax'
CSRF_COOKIE_SAMESITE = 'Lax'
# CSRF cookie'ni JS o'qiy olmasin (XSS orqali o'g'irlash xavfini kamaytiradi).
# Frontend CSRF token'ni JS orqali o'qimaydi — autentifikatsiya JWT cookie /
# Authorization header orqali, shu sababli HttpOnly xavfsiz.
CSRF_COOKIE_HTTPONLY = True
SECURE_HSTS_SECONDS = int(os.environ.get('OLYMPY_SECURE_HSTS_SECONDS', '0' if DEBUG else '31536000'))
SECURE_HSTS_INCLUDE_SUBDOMAINS = env_bool('OLYMPY_SECURE_HSTS_INCLUDE_SUBDOMAINS', not DEBUG)
# HSTS preload — production'da default yoqilgan. Brauzer preload ro'yxatiga
# qo'shilishi uchun zarur (Django security.W021). Faqat barcha subdomenlar
# HTTPS'ni qo'llab-quvvatlasa yoqilishi kerak — shu sababli env orqali
# o'chirib qo'yish imkoni qoldirildi.
SECURE_HSTS_PRELOAD = env_bool('OLYMPY_SECURE_HSTS_PRELOAD', not DEBUG)
SECURE_CONTENT_TYPE_NOSNIFF = True
# Referrer: tashqi saytlarga to'liq URL (yo'l/query bilan) sizdirilmasin —
# faqat origin, va u ham bir xil sxema (HTTPS→HTTP downgrade'da yuborilmaydi).
SECURE_REFERRER_POLICY = 'strict-origin-when-cross-origin'
# COOP: oyna boshqa origin'lar bilan window reference baham ko'rmasin
# (Spectre/cross-window hujum yuzasini kamaytiradi).
SECURE_CROSS_ORIGIN_OPENER_POLICY = 'same-origin'
X_FRAME_OPTIONS = 'DENY'
# Eski brauzerlarning ichki XSS filtri yoqilsin (legacy himoya qatlami).
SECURE_BROWSER_XSS_FILTER = True
# Django session cookie'sini JS o'qiy olmasin (XSS orqali sessiya o'g'irlash
# xavfini kamaytiradi). API JWT bilan ishlaydi, session asosan admin panel uchun.
SESSION_COOKIE_HTTPONLY = True

# Telegram bots. `TELEGRAM_BOT_*` stays as the backward-compatible default.
# Auth bot handles phone verification codes; manager bot handles notifications
# and inline approval callbacks.
TELEGRAM_BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN', '')
TELEGRAM_BOT_USERNAME = os.environ.get('TELEGRAM_BOT_USERNAME', '')
TELEGRAM_AUTH_BOT_TOKEN = os.environ.get('TELEGRAM_AUTH_BOT_TOKEN', TELEGRAM_BOT_TOKEN)
TELEGRAM_AUTH_BOT_USERNAME = os.environ.get('TELEGRAM_AUTH_BOT_USERNAME', TELEGRAM_BOT_USERNAME)
TELEGRAM_MANAGER_BOT_TOKEN = os.environ.get('TELEGRAM_MANAGER_BOT_TOKEN', TELEGRAM_BOT_TOKEN)
TELEGRAM_MANAGER_BOT_USERNAME = os.environ.get('TELEGRAM_MANAGER_BOT_USERNAME', TELEGRAM_BOT_USERNAME)
PHONE_VERIFICATION_OTP_TTL_SECONDS = int(
    os.environ.get('PHONE_VERIFICATION_OTP_TTL_SECONDS', '300')
)
PHONE_VERIFICATION_MAX_ATTEMPTS = int(
    os.environ.get('PHONE_VERIFICATION_MAX_ATTEMPTS', '5')
)

# Judge0 kod runner (IT/dasturlash savollari uchun "Ishga tushirish").
# JUDGE0_URL — self-hosted Judge0 instansiyasi yoki public CE API. JUDGE0_API_KEY
# — RapidAPI kaliti (judge0-ce.p.rapidapi.com uchun). Kalit bo'lmasa ham
# endpoint ishlaydi, ammo public API limiti juda past bo'ladi.
JUDGE0_URL = os.environ.get('JUDGE0_URL', 'https://ce.judge0.com')
JUDGE0_API_KEY = os.environ.get('JUDGE0_API_KEY', '')

# AI-assisted roster approval. AI extracts names only; backend permissions and
# deterministic matching decide whether a pending student can be approved.
AI_ROSTER_OPENAI_API_KEY = os.environ.get('AI_ROSTER_OPENAI_API_KEY') or os.environ.get('OPENAI_API_KEY', '')
AI_ROSTER_OPENAI_API_KEYS = [
    key.strip() for key in os.environ.get('AI_ROSTER_OPENAI_API_KEYS', '').split(',')
    if key.strip()
]
if AI_ROSTER_OPENAI_API_KEY:
    AI_ROSTER_OPENAI_API_KEYS.append(AI_ROSTER_OPENAI_API_KEY)
AI_ROSTER_OPENAI_API_KEYS = list(dict.fromkeys(AI_ROSTER_OPENAI_API_KEYS))
AI_ROSTER_GEMINI_API_KEY = os.environ.get('AI_ROSTER_GEMINI_API_KEY') or os.environ.get('GEMINI_API_KEY', '')
AI_ROSTER_GEMINI_API_KEYS = [
    key.strip() for key in os.environ.get('AI_ROSTER_GEMINI_API_KEYS', '').split(',')
    if key.strip()
]
if AI_ROSTER_GEMINI_API_KEY:
    AI_ROSTER_GEMINI_API_KEYS.append(AI_ROSTER_GEMINI_API_KEY)
AI_ROSTER_GEMINI_API_KEYS = list(dict.fromkeys(AI_ROSTER_GEMINI_API_KEYS))
AI_ROSTER_MODEL = os.environ.get('AI_ROSTER_MODEL', 'gpt-4o-mini')
AI_ROSTER_GEMINI_MODEL = os.environ.get('AI_ROSTER_GEMINI_MODEL', 'gemini-2.5-flash')
# Default False (xavfsiz). True qilinsa AI ajratgan o'quvchi ismlari inson
# tasdig'isiz avtomatik qabul qilinadi. Faqat ishonchli muhitda env orqali yoqing.
AI_ROSTER_AUTO_APPROVE = env_bool('AI_ROSTER_AUTO_APPROVE', False)
AI_ROSTER_ALLOW_NAME_ONLY_APPROVAL = env_bool('AI_ROSTER_ALLOW_NAME_ONLY_APPROVAL', True)
AI_ROSTER_MIN_CONFIDENCE = float(os.environ.get('AI_ROSTER_MIN_CONFIDENCE', '0.98'))
AI_ROSTER_MAX_NAMES = int(os.environ.get('AI_ROSTER_MAX_NAMES', '1000'))
AI_ROSTER_MAX_IMAGE_BYTES = int(os.environ.get('AI_ROSTER_MAX_IMAGE_BYTES', str(5 * 1024 * 1024)))
AI_MANAGER_BOT_MAX_DOCUMENT_BYTES = int(
    os.environ.get('AI_MANAGER_BOT_MAX_DOCUMENT_BYTES', str(10 * 1024 * 1024))
)
AI_MANAGER_BOT_OPENAI_API_KEY = (
    os.environ.get('AI_MANAGER_BOT_OPENAI_API_KEY')
    or AI_ROSTER_OPENAI_API_KEY
    or os.environ.get('OPENAI_API_KEY', '')
)
AI_MANAGER_BOT_OPENAI_API_KEYS = [
    key.strip() for key in os.environ.get('AI_MANAGER_BOT_OPENAI_API_KEYS', '').split(',')
    if key.strip()
]
if AI_MANAGER_BOT_OPENAI_API_KEY:
    AI_MANAGER_BOT_OPENAI_API_KEYS.append(AI_MANAGER_BOT_OPENAI_API_KEY)
AI_MANAGER_BOT_OPENAI_API_KEYS = list(dict.fromkeys(AI_MANAGER_BOT_OPENAI_API_KEYS))
AI_MANAGER_BOT_MODEL = os.environ.get('AI_MANAGER_BOT_MODEL', AI_ROSTER_MODEL)
AI_MANAGER_BOT_TEMPERATURE = float(os.environ.get('AI_MANAGER_BOT_TEMPERATURE', '0.7'))
AI_MANAGER_BOT_GEMINI_API_KEY = (
    os.environ.get('AI_MANAGER_BOT_GEMINI_API_KEY')
    or AI_ROSTER_GEMINI_API_KEY
    or os.environ.get('GEMINI_API_KEY', '')
)
AI_MANAGER_BOT_GEMINI_API_KEYS = [
    key.strip() for key in os.environ.get('AI_MANAGER_BOT_GEMINI_API_KEYS', '').split(',')
    if key.strip()
]
if AI_MANAGER_BOT_GEMINI_API_KEY:
    AI_MANAGER_BOT_GEMINI_API_KEYS.append(AI_MANAGER_BOT_GEMINI_API_KEY)
AI_MANAGER_BOT_GEMINI_API_KEYS = list(dict.fromkeys(AI_MANAGER_BOT_GEMINI_API_KEYS))
AI_MANAGER_BOT_GEMINI_MODEL = os.environ.get('AI_MANAGER_BOT_GEMINI_MODEL', AI_ROSTER_GEMINI_MODEL)
AI_MANAGER_BOT_GEMINI_FALLBACK_MODELS = [
    model.strip() for model in os.environ.get(
        'AI_MANAGER_BOT_GEMINI_FALLBACK_MODELS',
        (
            'gemini-2.5-flash-lite,gemini-flash-lite-latest,gemini-flash-latest,'
            'gemini-3-flash-preview,gemini-3-pro-preview,gemini-3.1-pro-preview,'
            'gemini-3.1-flash-lite-preview,gemini-2.5-pro,gemini-pro-latest,'
            'gemini-2.0-flash,gemini-2.0-flash-001,gemini-2.0-flash-lite,'
            'gemini-2.0-flash-lite-001'
        ),
    ).split(',')
    if model.strip()
]
AI_MANAGER_BOT_GEMINI_AUTO_DISCOVER_MODELS = env_bool('AI_MANAGER_BOT_GEMINI_AUTO_DISCOVER_MODELS', True)
AI_MANAGER_BOT_GEMINI_MODEL_CACHE_SECONDS = int(os.environ.get('AI_MANAGER_BOT_GEMINI_MODEL_CACHE_SECONDS', str(6 * 60 * 60)))
AI_MANAGER_BOT_GEMINI_MAX_MODELS = int(os.environ.get('AI_MANAGER_BOT_GEMINI_MAX_MODELS', '40'))
AI_MANAGER_BOT_MEMORY_ENABLED = env_bool('AI_MANAGER_BOT_MEMORY_ENABLED', True)
AI_MANAGER_BOT_MEMORY_TTL_SECONDS = int(os.environ.get('AI_MANAGER_BOT_MEMORY_TTL_SECONDS', str(6 * 60 * 60)))
AI_MANAGER_BOT_HISTORY_MESSAGES = int(os.environ.get('AI_MANAGER_BOT_HISTORY_MESSAGES', '8'))

# AI question generation for manager/teacher/owner panels. Generated questions
# are only previews until the staff user explicitly saves them.
AI_QUESTION_OPENAI_API_KEY = (
    os.environ.get('AI_QUESTION_OPENAI_API_KEY')
    or AI_MANAGER_BOT_OPENAI_API_KEY
    or AI_ROSTER_OPENAI_API_KEY
    or os.environ.get('OPENAI_API_KEY', '')
)
AI_QUESTION_OPENAI_API_KEYS = [
    key.strip() for key in os.environ.get('AI_QUESTION_OPENAI_API_KEYS', '').split(',')
    if key.strip()
]
if AI_QUESTION_OPENAI_API_KEY:
    AI_QUESTION_OPENAI_API_KEYS.append(AI_QUESTION_OPENAI_API_KEY)
AI_QUESTION_OPENAI_API_KEYS = list(dict.fromkeys(AI_QUESTION_OPENAI_API_KEYS))
AI_QUESTION_MODEL = os.environ.get('AI_QUESTION_MODEL', 'gpt-4o-mini')
AI_QUESTION_GEMINI_API_KEY = (
    os.environ.get('AI_QUESTION_GEMINI_API_KEY')
    or AI_MANAGER_BOT_GEMINI_API_KEY
    or AI_ROSTER_GEMINI_API_KEY
    or os.environ.get('GEMINI_API_KEY', '')
)
AI_QUESTION_GEMINI_API_KEYS = [
    key.strip() for key in os.environ.get('AI_QUESTION_GEMINI_API_KEYS', '').split(',')
    if key.strip()
]
if AI_QUESTION_GEMINI_API_KEY:
    AI_QUESTION_GEMINI_API_KEYS.append(AI_QUESTION_GEMINI_API_KEY)
AI_QUESTION_GEMINI_API_KEYS = list(dict.fromkeys(AI_QUESTION_GEMINI_API_KEYS))
AI_QUESTION_GEMINI_MODEL = os.environ.get('AI_QUESTION_GEMINI_MODEL', AI_MANAGER_BOT_GEMINI_MODEL)
AI_QUESTION_GEMINI_FALLBACK_MODELS = [
    model.strip() for model in os.environ.get(
        'AI_QUESTION_GEMINI_FALLBACK_MODELS',
        # Mavjud bo'lmagan gemini-3.x modellari o'rniga real publik
        # modellar. Avvalgi default'da gemini-3.1-flash-lite va
        # gemini-3-flash-preview yo'q edi va birinchi fallback ham 404
        # qaytarardi.
        'gemini-2.5-flash,gemini-2.0-flash,gemini-1.5-flash-latest,gemini-2.5-pro',
    ).split(',')
    if model.strip()
]
AI_QUESTION_MAX_COUNT = int(os.environ.get('AI_QUESTION_MAX_COUNT', '30'))
AI_QUESTION_MAX_OUTPUT_TOKENS = int(os.environ.get('AI_QUESTION_MAX_OUTPUT_TOKENS', '12000'))
AI_QUESTION_GEMINI_MAX_OUTPUT_TOKENS = int(os.environ.get('AI_QUESTION_GEMINI_MAX_OUTPUT_TOKENS', '8192'))
AI_QUESTION_PDF_MAX_BYTES = int(os.environ.get('AI_QUESTION_PDF_MAX_BYTES', str(20 * 1024 * 1024)))
AI_QUESTION_PDF_MAX_TEXT_CHARS = int(os.environ.get('AI_QUESTION_PDF_MAX_TEXT_CHARS', '300000'))
AI_QUESTION_PDF_CHUNK_CHARS = int(os.environ.get('AI_QUESTION_PDF_CHUNK_CHARS', '25000'))
AI_QUESTION_PDF_MAX_CHUNKS = int(os.environ.get('AI_QUESTION_PDF_MAX_CHUNKS', '20'))

# Logging: WARNING va undan yuqori darajadagi xabarlar console'ga (stderr)
# chiqadi — Render kabi platformalar stdout/stderr'ni avtomatik yig'adi.
# Production'da django.request logger ERROR darajasida (5xx javoblar,
# unhandled exception'lar). DEBUG rejimda biroz tafsilotliroq.
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'standard': {
            'format': '[{asctime}] {levelname} {name}: {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'standard',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'WARNING',
    },
    'loggers': {
        'django': {
            'handlers': ['console'],
            'level': 'INFO' if DEBUG else 'WARNING',
            'propagate': False,
        },
        # 5xx va so'rov ishlovidagi xatolar production'da ERROR darajasida.
        'django.request': {
            'handlers': ['console'],
            'level': 'WARNING' if DEBUG else 'ERROR',
            'propagate': False,
        },
        # Django'ning ichki xavfsizlik loggeri (masalan DisallowedHost,
        # SuspiciousOperation) — WARNING darajasida console'ga.
        'django.security': {
            'handlers': ['console'],
            'level': 'WARNING',
            'propagate': False,
        },
        # Loyihaning xavfsizlik audit loggeri: muvaffaqiyatsiz login, OTP
        # tekshiruv xatolari, permission denied (403) va rate-limit (429)
        # holatlari shu logger orqali yoziladi (logging.getLogger('security')).
        # Render stdout/stderr'ni avtomatik yig'adi — xavfsizlik hodisalari
        # log oqimida ko'rinadi.
        'security': {
            'handlers': ['console'],
            'level': 'WARNING',
            'propagate': False,
        },
    },
}

# Bepul rejimda markaz oyiga maksimal nechta olimpiada yarata oladi. Premium
# markazlar uchun limit yo'q (kelajakda flag orqali ochiladi).
FREE_OLYMPIAD_MONTHLY_LIMIT = int(os.environ.get('FREE_OLYMPIAD_MONTHLY_LIMIT', '2'))

# CLICK to'lov tizimi sozlamalari. Placeholder default'larsiz: env var
# o'rnatilmagan bo'lsa None bo'ladi va views.py noto'g'ri qiymat bilan jim
# ishlashning o'rniga checkout/webhook'ni rad etadi (production'da silent bug emas).
CLICK_SERVICE_ID = os.environ.get('CLICK_SERVICE_ID') or None
CLICK_MERCHANT_ID = os.environ.get('CLICK_MERCHANT_ID') or None
CLICK_SECRET_KEY = os.environ.get('CLICK_SECRET_KEY') or None

# PAYME to'lov tizimi sozlamalari (yuqoridagi bilan bir xil mantiq).
PAYME_MERCHANT_ID = os.environ.get('PAYME_MERCHANT_ID') or None
PAYME_SECRET_KEY = os.environ.get('PAYME_SECRET_KEY') or None

# Derived flag'lar — billing/views.py har bir provayder to'liq sozlanganligini
# bitta joydan aniqlaydi (per-key getattr tekshiruvlarini takrorlamasdan).
# Provayder kalitlaridan birortasi None bo'lsa, o'sha provayder o'chiq deb
# hisoblanadi va checkout/webhook 503 qaytaradi.
CLICK_ENABLED = bool(CLICK_SERVICE_ID and CLICK_MERCHANT_ID and CLICK_SECRET_KEY)
PAYME_ENABLED = bool(PAYME_MERCHANT_ID and PAYME_SECRET_KEY)
BILLING_ENABLED = CLICK_ENABLED or PAYME_ENABLED

# Menejer komissiya foizi — muvaffaqiyatli to'lovdan menejerga hisoblanadigan
# ulush (0.20 = 20%). Avval billing/views.py'da ikki joyda hardcoded edi;
# bitta manbaga keltirildi. Env orqali sozlanadi (masalan, "0.15").
from decimal import Decimal as _Decimal
MANAGER_COMMISSION_RATE = _Decimal(os.environ.get('MANAGER_COMMISSION_RATE', '0.20'))

# Sentry — xato monitoring. Faqat SENTRY_DSN env o'rnatilgan bo'lsa yoqiladi;
# bo'lmasa hech narsa qilmaydi (lokal development va DSN'siz deploylarda
# graceful fallback). send_default_pii=False — foydalanuvchi shaxsiy ma'lumoti
# (IP, cookie, headers) Sentry'ga yuborilmaydi.
SENTRY_DSN = os.environ.get('SENTRY_DSN', '')
if SENTRY_DSN:
    import sentry_sdk
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        environment=os.environ.get('DJANGO_ENV', 'production'),
        traces_sample_rate=0.1,
        profiles_sample_rate=0.05,
        send_default_pii=False,
    )

# ─── Email sozlamalari ────────────────────────────────────────────────────────
# Default — console backend (lokal development'da email'ni terminalga chiqaradi).
# Production'da MAILGUN_API_KEY o'rnatilsa avtomatik Mailgun backend yoqiladi.
EMAIL_BACKEND = os.environ.get(
    'EMAIL_BACKEND',
    'django.core.mail.backends.console.EmailBackend',
)
DEFAULT_FROM_EMAIL = os.environ.get('DEFAULT_FROM_EMAIL', 'Olympy <noreply@prolymp.uz>')
SERVER_EMAIL = DEFAULT_FROM_EMAIL

# Mailgun (anymail) — MAILGUN_API_KEY mavjud bo'lsa yoqiladi. anymail
# INSTALLED_APPS'ga ham shu shart bilan qo'shilgan.
if os.environ.get('MAILGUN_API_KEY'):
    EMAIL_BACKEND = 'anymail.backends.mailgun.EmailBackend'
    ANYMAIL = {
        'MAILGUN_API_KEY': os.environ.get('MAILGUN_API_KEY', ''),
        'MAILGUN_SENDER_DOMAIN': os.environ.get('MAILGUN_SENDER_DOMAIN', 'prolymp.uz'),
    }

