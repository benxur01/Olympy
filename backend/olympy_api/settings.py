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
from urllib.parse import unquote, urlparse

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

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Third-party
    'rest_framework',
    'rest_framework.authtoken',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'django_celery_beat',
    # Local
    'accounts',
    'centers',
    'olympiads',
    'questions',
    'attempts',
    'notifications',
    'practice',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    # WhiteNoise statik fayllarni production'da samarali serve qiladi —
    # SecurityMiddleware'dan keyin va boshqa middleware'lardan oldin.
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
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

AUTH_USER_MODEL = 'accounts.User'

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
     'OPTIONS': {'min_length': 6}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'uz'
TIME_ZONE = 'Asia/Tashkent'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
# WhiteNoise compress + immutable cache headers — production rejimida
# faylni hash bilan nomlaydi va brauzer cache'ini agressiv ishlatadi.
STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {
        'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage'
        if not DEBUG else 'django.contrib.staticfiles.storage.StaticFilesStorage',
    },
}
MEDIA_URL = '/media/'
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')
# Y5/P2: Render free tier'da disk persistent emas — har deploy'da media
# fayllar yo'qoladi. Production'da CLOUDINARY_URL yoki AWS_STORAGE_BUCKET_NAME
# o'rnatilmagan bo'lsa, ogohlantirish chiqaramiz. Hozircha kod bilan
# avtomatik o'tib ketish yo'q (zavisimosti talab qiladi), lekin warning
# bilan admin xabardor bo'ladi.
if not DEBUG:
    _has_cloudinary = bool(os.environ.get('CLOUDINARY_URL'))
    _has_s3 = bool(os.environ.get('AWS_STORAGE_BUCKET_NAME'))
    if not (_has_cloudinary or _has_s3):
        import sys as _sys
        print(
            'WARNING: Production muhitda CLOUDINARY_URL yoki '
            'AWS_STORAGE_BUCKET_NAME o\'rnatilmagan — yuklangan rasmlar '
            'har deploy\'da yo\'qoladi. Persistent storage sozlang.',
            file=_sys.stderr,
        )
PROFILE_IMAGE_MAX_BYTES = int(os.environ.get('PROFILE_IMAGE_MAX_BYTES', str(5 * 1024 * 1024)))
CENTER_IMAGE_MAX_BYTES = int(os.environ.get('CENTER_IMAGE_MAX_BYTES', str(5 * 1024 * 1024)))
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# DRF
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'accounts.authentication.OlympyJWTAuthentication',
        'rest_framework.authentication.SessionAuthentication',
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
        'anon': '60/min',
        'user': '100/min',
        # Avval '5/min' edi — maktab/o'quv markazda 30+ talaba bitta IP
        # orqali (NAT) kirsa 25 tasi 429 olardi. Per-account brute-force
        # himoyasi LoginSerializer ichida bor (15 daqiqa lock per phone),
        # shu sababli IP-level limitni 60/min ga oshirish xavfsiz.
        'auth': '60/min',
        # Register endpoint'lari uchun alohida cheklov. Avval bu endpoint'larda
        # rate limit yo'q edi va hujumchi soatiga 1000+ ta hisob yarata olardi
        # — endi IP bo'yicha soatiga 5 ta ro'yxatdan o'tish.
        'register': '5/hour',
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
    },
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 50,
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
CELERY_RESULT_BACKEND = os.environ.get('CELERY_BROKER_URL', 'redis://localhost:6379/0')

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
    'http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:5500' if DEBUG else '',
)
CORS_ALLOWED_ORIGINS = [
    # Trailing slash bo'lsa CORS middleware origin'ni nomos deb hisoblaydi
    # va so'rovni rad etadi. `.strip('/')` har bir origin'dan slash'ni
    # tozalaydi (masalan `https://app.olympy.uz/` → `https://app.olympy.uz`).
    o.strip().rstrip('/') for o in _cors_origins.split(',')
    if o.strip()
]
CORS_ALLOW_CREDENTIALS = True
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
# P1: production domenlari uchun default — env bo'sh bo'lsa ham CSRF
# tasdiqlash ishlasin. Custom domen ishlatuvchilar OLYMPY_CSRF_TRUSTED_ORIGINS
# orqali override qilishi mumkin.
if not CSRF_TRUSTED_ORIGINS and not DEBUG:
    CSRF_TRUSTED_ORIGINS = ['https://prolymp.uz', 'https://www.prolymp.uz']

# Production security flags. Enable OLYMPY_SECURE_SSL_REDIRECT only after HTTPS
# is correctly terminated by your hosting platform or reverse proxy.
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SECURE_SSL_REDIRECT = env_bool('OLYMPY_SECURE_SSL_REDIRECT', False)
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
SECURE_HSTS_SECONDS = int(os.environ.get('OLYMPY_SECURE_HSTS_SECONDS', '0' if DEBUG else '31536000'))
SECURE_HSTS_INCLUDE_SUBDOMAINS = env_bool('OLYMPY_SECURE_HSTS_INCLUDE_SUBDOMAINS', not DEBUG)
SECURE_HSTS_PRELOAD = env_bool('OLYMPY_SECURE_HSTS_PRELOAD', False)
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'

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
AI_ROSTER_AUTO_APPROVE = env_bool('AI_ROSTER_AUTO_APPROVE', True)
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

# Bepul rejimda markaz oyiga maksimal nechta olimpiada yarata oladi. Premium
# markazlar uchun limit yo'q (kelajakda flag orqali ochiladi).
FREE_OLYMPIAD_MONTHLY_LIMIT = int(os.environ.get('FREE_OLYMPIAD_MONTHLY_LIMIT', '2'))
