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
# so'rovlarni (DB, tashqi API) parallel ishlaydi. Render Standard (0.5-1 CPU)
# uchun (2 × CPU) + 1 = 3 worker overcommit'siz muvozanatli; oldingi 4 worker
# CPU'ni ortiqcha yuklardi. GUNICORN_WORKERS / GUNICORN_THREADS env var orqali
# override qilinadi.
#
# --timeout 300: AI savol yaratish va PDF generatsiya kabi og'ir so'rovlar 120s
# dan oshib worker kill bo'lib foydalanuvchiga 502 qaytarardi. 300s ularning
# yakunlanishiga yetarli vaqt beradi (bu I/O-bound, gthread bilan boshqa
# so'rovlarni bloklamaydi).
exec gunicorn olympy_api.wsgi:application \
    --bind "0.0.0.0:${PORT:-10000}" \
    --workers "${GUNICORN_WORKERS:-3}" \
    --threads "${GUNICORN_THREADS:-2}" \
    --worker-class gthread \
    --timeout 300 \
    --access-logfile - \
    --error-logfile -
