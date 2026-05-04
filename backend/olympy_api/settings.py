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
from urllib.parse import urlparse

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
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
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
if DATABASE_URL:
    parsed_db = urlparse(DATABASE_URL)
    if parsed_db.scheme not in ('postgres', 'postgresql'):
        raise ImproperlyConfigured('DATABASE_URL must use postgres:// or postgresql://')
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': parsed_db.path.lstrip('/'),
            'USER': parsed_db.username or '',
            'PASSWORD': parsed_db.password or '',
            'HOST': parsed_db.hostname or '',
            'PORT': str(parsed_db.port or 5432),
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
MEDIA_URL = '/media/'
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# DRF
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'accounts.authentication.OlympyJWTAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticatedOrReadOnly',
    ],
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
    ],
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '20/min',
        'user': '100/min',
        'auth': '5/min',
        'ai_question': '20/hour',
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
JWT_COOKIE_SAMESITE = os.environ.get('JWT_COOKIE_SAMESITE', 'Lax')

CELERY_BROKER_URL = os.environ.get('CELERY_BROKER_URL', 'redis://localhost:6379/0')
CELERY_RESULT_BACKEND = os.environ.get('CELERY_BROKER_URL', 'redis://localhost:6379/0')
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
    'http://localhost:5173,http://localhost:3000,http://127.0.0.1:5500' if DEBUG else '',
)
CORS_ALLOWED_ORIGINS = [
    o.strip() for o in _cors_origins.split(',')
    if o.strip()
]
CORS_ALLOW_CREDENTIALS = True
if not DEBUG and not CORS_ALLOWED_ORIGINS:
    raise ImproperlyConfigured('OLYMPY_CORS_ALLOWED_ORIGINS must be set in production')
CSRF_TRUSTED_ORIGINS = [
    o.strip() for o in os.environ.get('OLYMPY_CSRF_TRUSTED_ORIGINS', '').split(',')
    if o.strip()
]

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

# Telegram phone verification
TELEGRAM_BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN', '')
TELEGRAM_BOT_USERNAME = os.environ.get('TELEGRAM_BOT_USERNAME', '')
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
AI_ROSTER_GEMINI_MODEL = os.environ.get('AI_ROSTER_GEMINI_MODEL', 'gemini-1.5-flash')
AI_ROSTER_AUTO_APPROVE = env_bool('AI_ROSTER_AUTO_APPROVE', True)
AI_ROSTER_MIN_CONFIDENCE = float(os.environ.get('AI_ROSTER_MIN_CONFIDENCE', '0.98'))
AI_ROSTER_MAX_NAMES = int(os.environ.get('AI_ROSTER_MAX_NAMES', '200'))
AI_ROSTER_MAX_IMAGE_BYTES = int(os.environ.get('AI_ROSTER_MAX_IMAGE_BYTES', str(5 * 1024 * 1024)))

# AI question generation for manager/teacher/owner panels. Generated questions
# are only previews until the staff user explicitly saves them.
AI_QUESTION_OPENAI_API_KEY = os.environ.get('AI_QUESTION_OPENAI_API_KEY', '')
AI_QUESTION_OPENAI_API_KEYS = [
    key.strip() for key in os.environ.get('AI_QUESTION_OPENAI_API_KEYS', '').split(',')
    if key.strip()
]
if AI_QUESTION_OPENAI_API_KEY:
    AI_QUESTION_OPENAI_API_KEYS.append(AI_QUESTION_OPENAI_API_KEY)
AI_QUESTION_OPENAI_API_KEYS = list(dict.fromkeys(AI_QUESTION_OPENAI_API_KEYS))
AI_QUESTION_MODEL = os.environ.get('AI_QUESTION_MODEL', 'gpt-4o-mini')
AI_QUESTION_MAX_COUNT = int(os.environ.get('AI_QUESTION_MAX_COUNT', '30'))
AI_QUESTION_MAX_OUTPUT_TOKENS = int(os.environ.get('AI_QUESTION_MAX_OUTPUT_TOKENS', '6000'))
