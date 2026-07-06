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

# Celery worker + Beat bitta jarayonda (-B flag — embedded beat scheduler).
# SABAB: web service 512MB RAM'da ishlaydi. Avval alohida worker VA alohida
# beat processi ishga tushirilardi — har biri to'liq Django/Celery'ni xotiraga
# yuklaydi (~120-180MB har biri). 2 ta gunicorn worker + celery worker + celery
# beat = 4 ta to'liq Python/Django jarayoni bir vaqtda — bu 512MB limitni
# osonlik bilan oshirib yuborib, "Ran out of memory (used over 512MB)" xatosiga
# olib keldi. -B bilan beat scheduler worker jarayoni ICHIDA embedded thread
# sifatida ishlaydi — alohida jarayon shart emas. DIQQAT: bir nechta celery
# worker instance (masalan numInstances>1) bo'lsa -B ishlatilmaydi (beat bir
# nechta joyda bir vaqtda ishlab, task'lar takrorlanib qoladi) — lekin bu
# servis numInstances: 1 bilan ishlaydi, shu sababli xavfsiz.
echo "=== Starting Celery Worker (+ embedded Beat) ==="
celery -A olympy_api worker -B -l info -c 1 \
    --scheduler django_celery_beat.schedulers:DatabaseScheduler \
    --pidfile=/tmp/celeryworker.pid &

# gthread worker class — har worker ko'p thread bilan bir vaqtda I/O-bound
# so'rovlarni (DB, tashqi API) parallel ishlaydi. Xotira tejash uchun default
# gunicorn worker soni 2'dan 1'ga tushirildi (har qo'shimcha worker butun
# Django appni yana bir marta xotiraga yuklaydi — bu 512MB limit uchun juda
# qimmat, ayniqsa Celery worker+beat ham shu konteynerda ishlayotganda).
# Thread soni 2'dan 3'ga oshirildi — bitta worker ko'proq parallel so'rovni
# I/O-bound holatda ushlab turishi uchun (GIL thread'lar orasida I/O paytida
# bo'shatiladi). GUNICORN_WORKERS / GUNICORN_THREADS env var orqali override
# qilinadi — agar plan Standard/512MB'dan yuqori bo'lsa, GUNICORN_WORKERS=2
# ga qaytarish mumkin.
#
# --timeout 300: AI savol yaratish va PDF generatsiya kabi og'ir so'rovlar 120s
# dan oshib worker kill bo'lib foydalanuvchiga 502 qaytarardi. 300s ularning
# yakunlanishiga yetarli vaqt beradi (bu I/O-bound, gthread bilan boshqa
# so'rovlarni bloklamaydi).
exec gunicorn olympy_api.wsgi:application \
    --bind "0.0.0.0:${PORT:-10000}" \
    --workers "${GUNICORN_WORKERS:-1}" \
    --threads "${GUNICORN_THREADS:-3}" \
    --worker-class gthread \
    --timeout 300 \
    --access-logfile - \
    --error-logfile -
