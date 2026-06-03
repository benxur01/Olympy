#!/usr/bin/env bash
# Render web service start command. Runs gunicorn with sane production
# defaults. Render injects $PORT (10000 by default).
set -o errexit

# Celery broker majburiy tekshiruvi (production). DEBUG=False bo'lib, ammo
# CELERY_BROKER_URL o'rnatilmagan bo'lsa — Celery EAGER rejimga tushadi va
# og'ir task'lar (AI tahlil, Telegram xabarnoma, kod tekshirish) HTTP so'rovni
# sinxron bloklaydi. Bu zaif holatda serverni qotirib qo'yishi mumkin. Shu
# sababli production deploy'da broker yo'qligi haqida aniq ogohlantiramiz
# (deploy'ni to'xtatmaymiz — eager fallback hali ishlaydi, lekin admin
# Redis o'rnatishi kerakligini bilishi shart).
if [ "${DEBUG:-}" != "True" ] && [ "${DEBUG:-}" != "true" ] && [ "${DEBUG:-}" != "1" ]; then
    if [ -z "${CELERY_BROKER_URL:-}" ]; then
        echo "OGOHLANTIRISH: CELERY_BROKER_URL o'rnatilmagan. Celery EAGER (sinxron) rejimda ishlaydi va og'ir task'lar HTTP so'rovni sekinlashtiradi. Productionda Redis broker o'rnating." >&2
    fi
fi

# gthread worker class — har worker ko'p thread bilan bir vaqtda I/O-bound
# so'rovlarni (DB, tashqi API) parallel ishlaydi. --workers 4 --threads 2
# default'i Render Starter (0.5 CPU) uchun muvozanatli; GUNICORN_WORKERS va
# GUNICORN_THREADS env var orqali override qilinadi.
exec gunicorn olympy_api.wsgi:application \
    --bind "0.0.0.0:${PORT:-10000}" \
    --workers "${GUNICORN_WORKERS:-4}" \
    --threads "${GUNICORN_THREADS:-2}" \
    --worker-class gthread \
    --timeout 120 \
    --access-logfile - \
    --error-logfile -
