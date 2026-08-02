#!/usr/bin/env bash
# Olympy backend konteyneri uchun yagona kirish nuqtasi (Docker Compose).
#
# Compose'da har bir xizmat shu skriptga bitta buyruq beradi:
#   web     — Gunicorn (Django API)
#   worker  — Celery worker
#   beat    — Celery beat (davriy jadval, DatabaseScheduler)
#   release — bir martalik deploy qadamlari: DB kutish + schema, collectstatic,
#             migrate, ensure_platform_admin / ensure_manager / ensure_center_owner
#
# Boshqa har qanday argument to'g'ridan-to'g'ri bajariladi, masalan:
#   docker compose run --rm backend python manage.py shell
#
# DIQQAT: Render'dagi render_start.sh Celery'ni web bilan BIR jarayonda
# (`worker -B`) ishga tushiradi. Compose'da esa har biri alohida konteyner,
# shuning uchun bu yerda embedded rejim YO'Q — beat faqat `beat` buyrug'ida
# ishlaydi (aks holda davriy task'lar ikki marta bajarilardi).
set -o errexit
set -o nounset
set -o pipefail

# ── DB tayyorligini kutish + schema ─────────────────────────────────────────
# Compose'ning `depends_on: service_healthy` sharti Postgres konteynerini
# kutadi, ammo `release` qadami qo'lda ham (`docker compose run`) ishga
# tushirilishi mumkin — shu sababli qo'shimcha himoya qatlami.
# Schema faqat DATABASE_SCHEMA bo'sh BO'LMAGANDA yaratiladi: settings.py ham
# aynan shu shartda search_path'ni o'zgartiradi (bo'sh bo'lsa `public`).
wait_for_db() {
    python - <<'PYEOF'
import os
import sys
import time

url = os.environ.get('DATABASE_URL', '').strip()
if not url:
    # Discrete OLYMPY_DB_* o'zgaruvchilari ishlatilgan bo'lishi mumkin —
    # bu holatda kutishni o'tkazib yuboramiz (compose healthcheck bor).
    print("DATABASE_URL yo'q — DB kutish o'tkazib yuborildi")
    sys.exit(0)

import psycopg

timeout = int(os.environ.get('DB_WAIT_TIMEOUT', '90'))
deadline = time.time() + timeout
schema = os.environ.get('DATABASE_SCHEMA', '').strip()
last_error = None

while time.time() < deadline:
    try:
        with psycopg.connect(url, connect_timeout=5) as conn:
            with conn.cursor() as cur:
                cur.execute('SELECT version()')
                print('PostgreSQL:', cur.fetchone()[0][:50])
            if schema:
                with conn.cursor() as cur:
                    cur.execute(f'CREATE SCHEMA IF NOT EXISTS "{schema}"')
                conn.commit()
                print(f'Schema "{schema}": OK')
        print('DB ulanish: OK')
        sys.exit(0)
    except Exception as exc:  # noqa: BLE001 — har qanday ulanish xatosi
        last_error = exc
        time.sleep(2)

print(f'DB ulanmadi ({timeout}s): {type(last_error).__name__}: {last_error}', file=sys.stderr)
sys.exit(1)
PYEOF
}

# ── Bir martalik deploy qadamlari ───────────────────────────────────────────
# render_build.sh dagi ketma-ketlikning aynan o'zi, faqat `pip install`siz —
# bog'liqliklar image build paytida o'rnatiladi.
run_release() {
    echo "=== STEP 1: DB kutish ==="
    wait_for_db

    echo "=== STEP 2: collectstatic ==="
    # --clear: WhiteNoise ManifestStaticFilesStorage fayllarni content-hash
    # bilan nomlaydi. Bu yerda staticfiles NAMED VOLUME'da (deploy'lar orasida
    # saqlanadi), shuning uchun --clear bo'lmasa eski hash'li JS/CSS bundle'lar
    # cheksiz to'planib borardi.
    python manage.py collectstatic --no-input --clear

    echo "=== STEP 3: migrate ==="
    python manage.py migrate --no-input

    echo "=== STEP 4: ensure_platform_admin ==="
    python manage.py ensure_platform_admin

    echo "=== STEP 5: ensure_manager ==="
    python manage.py ensure_manager || echo "[WARNING] ensure_manager skipped"

    echo "=== STEP 6: ensure_center_owner ==="
    python manage.py ensure_center_owner || echo "[WARNING] ensure_center_owner: OLYMPY_BOOTSTRAP_OWNER_PHONE yoki CENTER o'rnatilmagan, skip"

    echo "=== RELEASE COMPLETE ==="
}

case "${1:-web}" in
    web)
        # gthread worker class — har worker ko'p thread bilan I/O-bound
        # so'rovlarni (DB, tashqi API) parallel ishlaydi.
        # --timeout 300: AI savol yaratish va PDF generatsiya kabi og'ir
        # so'rovlar uchun (nginx tomonda ham proxy_read_timeout 300s).
        # GUNICORN_WORKERS default 2: Render'dagi 1 chegarasi 512MB starter
        # rejasi sababli edi (render_start.sh izohi) — VPS'da bu cheklov yo'q.
        # 2GB RAM'li VPS'da 1 ga tushiring, 8GB+ da 3-4 ga ko'taring.
        exec gunicorn olympy_api.wsgi:application \
            --bind "0.0.0.0:${PORT:-8000}" \
            --workers "${GUNICORN_WORKERS:-2}" \
            --threads "${GUNICORN_THREADS:-6}" \
            --worker-class gthread \
            --timeout 300 \
            --access-logfile - \
            --error-logfile -
        ;;
    worker)
        exec celery -A olympy_api worker \
            -l "${CELERY_LOG_LEVEL:-info}" \
            -c "${CELERY_CONCURRENCY:-2}"
        ;;
    beat)
        # --pidfile= (bo'sh) — pidfile umuman yaratilmaydi. Konteyner nooddiy
        # to'xtasa qolib ketgan pidfile keyingi ishga tushirishni bloklardi.
        exec celery -A olympy_api beat \
            -l "${CELERY_LOG_LEVEL:-info}" \
            --scheduler django_celery_beat.schedulers:DatabaseScheduler \
            --pidfile=
        ;;
    release)
        run_release
        ;;
    *)
        exec "$@"
        ;;
esac
