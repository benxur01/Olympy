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
import os
from pathlib import Path

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

SECRET_KEY = os.environ.get('OLYMPY_SECRET_KEY')
if not SECRET_KEY:
    raise ImproperlyConfigured("OLYMPY_SECRET_KEY muhit o'zgaruvchisi o'rnatilmagan")
DEBUG = os.environ.get('OLYMPY_DEBUG', '0') == '1'
ALLOWED_HOSTS = os.environ.get('OLYMPY_ALLOWED_HOSTS', '*').split(',')

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
    'corsheaders',
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

if os.environ.get('OLYMPY_DB_ENGINE', 'sqlite') == 'postgres':
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
]

LANGUAGE_CODE = 'uz'
TIME_ZONE = 'Asia/Tashkent'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# DRF
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.TokenAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticatedOrReadOnly',
    ],
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
    ],
}

# CORS — production rejimida ham faqat aniq ro'yxatdagi originlar.
# Dev rejimda ham hech qachon ALL_ORIGINS ochilmaydi: developer
# OLYMPY_CORS_ALLOWED_ORIGINS ga localhost portlarini ro'yxatga oladi.
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = [
    o.strip() for o in
    os.environ.get(
        'OLYMPY_CORS_ALLOWED_ORIGINS',
        'http://localhost:5173,http://localhost:3000,http://127.0.0.1:5500',
    ).split(',')
    if o.strip()
]

# Telegram phone verification
TELEGRAM_BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN', '')
TELEGRAM_BOT_USERNAME = os.environ.get('TELEGRAM_BOT_USERNAME', '')
PHONE_VERIFICATION_OTP_TTL_SECONDS = int(
    os.environ.get('PHONE_VERIFICATION_OTP_TTL_SECONDS', '300')
)
PHONE_VERIFICATION_MAX_ATTEMPTS = int(
    os.environ.get('PHONE_VERIFICATION_MAX_ATTEMPTS', '5')
)
