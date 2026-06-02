#!/usr/bin/env bash
# Render web service build hook. Runs on every deploy.
# Steps:
#   1) Install Python deps from requirements.txt
#   2) Olympy uchun PostgreSQL schema'sini yaratamiz (agar yo'q bo'lsa).
#      Quiz-bot bilan bitta DB'ni baham ko'rganda, table to'qnashishlarini
#      oldini olish uchun Olympy o'zining olympy schema'sida ishlaydi.
#      DATABASE_SCHEMA env var (default 'olympy') Django settings'da ham
#      search_path uchun ishlatiladi.
#   3) Collect static files into STATIC_ROOT (served by WhiteNoise)
#   4) Apply database migrations (Django avtomatik olympy schema'siga yozadi)
#   5) If bootstrap admin env vars are set, create/update the platform admin.
set -o errexit

echo "=== ENV: Python=$(python --version 2>&1) Pip=$(pip --version 2>&1 | head -1) ==="
echo "=== DATABASE_URL host: $(python -c "from urllib.parse import urlparse; import os; u=urlparse(os.environ.get('DATABASE_URL','')); print(u.hostname)" 2>/dev/null || echo 'parse failed') ==="

echo "=== STEP 1: pip install ==="
pip install --upgrade pip
echo "=== pip upgraded ==="
pip install --no-cache-dir -r requirements.txt
echo "=== pip install OK ==="

python <<'PY'
import os
import sys

url = os.environ.get('DATABASE_URL', '').strip()
schema = os.environ.get('DATABASE_SCHEMA', 'olympy').strip() or 'olympy'
if not url:
    print('[render_build] DATABASE_URL not set — skipping schema bootstrap', file=sys.stderr)
    sys.exit(0)

safe_schema = schema.replace('"', '""')
try:
    import psycopg
    with psycopg.connect(url, connect_timeout=15) as conn:
        with conn.cursor() as cur:
            cur.execute(f'CREATE SCHEMA IF NOT EXISTS "{safe_schema}"')
        conn.commit()
    print(f'[render_build] schema "{schema}" ready (psycopg3)')
except Exception as e:
    print(f'[render_build] psycopg3 failed: {e}', file=sys.stderr)
    try:
        import psycopg2
        conn = psycopg2.connect(url)
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute(f'CREATE SCHEMA IF NOT EXISTS "{safe_schema}"')
        conn.close()
        print(f'[render_build] schema "{schema}" ready (psycopg2)')
    except Exception as e2:
        print(f'[render_build] WARNING: schema creation failed: {e2}', file=sys.stderr)
        print('[render_build] Continuing — schema may already exist', file=sys.stderr)
PY

echo "=== STEP 2.5: DB connection check ==="
python -c "
import os, sys
url = os.environ.get('DATABASE_URL', '')
if not url:
    print('DATABASE_URL not set, skipping check')
    sys.exit(0)
try:
    import psycopg
    conn = psycopg.connect(url, connect_timeout=15)
    cur = conn.cursor()
    cur.execute('SELECT 1')
    conn.close()
    print('DB connection OK (psycopg3)')
except Exception as e:
    print(f'DB connection FAILED: {e}', file=sys.stderr)
    sys.exit(1)
"

echo "=== STEP 3: collectstatic ==="
python manage.py collectstatic --no-input
echo "=== collectstatic OK ==="

echo "=== STEP 4: migrate ==="
python manage.py migrate --no-input
echo "=== migrate OK ==="

echo "=== STEP 5: ensure_platform_admin ==="
python manage.py ensure_platform_admin
echo "=== BUILD COMPLETE ==="
