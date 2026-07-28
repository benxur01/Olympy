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

# Celery: default embedded (web bilan birga). Agar alohida Background Worker
# (render.yaml: olympy-celery) ishlatilsa, web'da CELERY_EXTERNAL_WORKER=1
# o'rnating — o'shanda web faqat Gunicorn ishga tushadi (OOM xavfi pastroq).
if [ "${CELERY_EXTERNAL_WORKER:-0}" = "1" ] || [ "${CELERY_EXTERNAL_WORKER:-}" = "true" ]; then
    echo "=== Celery external worker rejimi — web ichida Celery ishga tushirilmaydi ==="
else
    # Celery worker + Beat bitta jarayonda (-B). numInstances:1 bo'lganda xavfsiz.
    echo "=== Starting Celery Worker (+ embedded Beat) ==="
    celery -A olympy_api worker -B -l info -c 1 \
        --scheduler django_celery_beat.schedulers:DatabaseScheduler \
        --pidfile=/tmp/celeryworker.pid &
fi

# gthread worker class — har worker ko'p thread bilan bir vaqtda I/O-bound
# so'rovlarni (DB, tashqi API) parallel ishlaydi. Worker soni bir vaqtlar 1 ga
# tushirilgan edi: o'shanda konteynerda 512MB xotira chegarasi bor edi va
# Celery worker+beat AYNAN shu web konteynerda ishlardi, ya'ni har qo'shimcha
# gunicorn worker (butun Django appning yana bir nusxasi) OOM xavfini oshirardi.
# Ikkala shart ham endi o'rinli emas: render.yaml'da olympy-api uchun
# CELERY_EXTERNAL_WORKER=1 — Celery alohida `olympy-celery` service'ida ishlaydi
# va bu konteyner xotirasidan umuman joy olmaydi; xizmat esa `plan: standard`
# da (512MB'dan sezilarli ko'p). Shu sababli default 2 ga qaytarildi:
# 2 worker x 6 thread = bir vaqtda 12 so'rov (avvalgi 6 o'rniga) va ikkinchi
# worker bitta jarayon qotib qolganda ham xizmatni tirik saqlaydi.
# Thread soni 3'dan 6'ga oshirilgan — bitta worker ko'proq parallel so'rovni
# I/O-bound holatda ushlab turishi uchun (GIL thread'lar orasida I/O paytida
# bo'shatiladi; bu yerdagi view'lar asosan DB/tashqi API kutadi, CPU emas —
# shu sababli qo'shimcha thread deyarli tekin). Ikkalasi ham GUNICORN_WORKERS /
# GUNICORN_THREADS env var orqali override qilinadi — masalan kichikroq planga
# qaytilsa GUNICORN_WORKERS=1 qilib qo'yish kifoya.
#
# --timeout 300: AI savol yaratish va PDF generatsiya kabi og'ir so'rovlar 120s
# dan oshib worker kill bo'lib foydalanuvchiga 502 qaytarardi. 300s ularning
# yakunlanishiga yetarli vaqt beradi (bu I/O-bound, gthread bilan boshqa
# so'rovlarni bloklamaydi).
exec gunicorn olympy_api.wsgi:application \
    --bind "0.0.0.0:${PORT:-10000}" \
    --workers "${GUNICORN_WORKERS:-2}" \
    --threads "${GUNICORN_THREADS:-6}" \
    --worker-class gthread \
    --timeout 300 \
    --access-logfile - \
    --error-logfile -
