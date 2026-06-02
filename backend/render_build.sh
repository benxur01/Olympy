#!/usr/bin/env bash
# Render web service build hook. Runs on every deploy.
set -o errexit

echo "=== ENV: Python=$(python --version 2>&1) Pip=$(pip --version 2>&1 | head -1) ==="

echo "=== STEP 1: pip install ==="
pip install --no-cache-dir -r requirements.txt
echo "=== pip install OK ==="

echo "=== STEP 2: DB schema ==="
python <<'PY'
import os, sys

url = os.environ.get('DATABASE_URL', '').strip()
schema = os.environ.get('DATABASE_SCHEMA', 'olympy').strip() or 'olympy'
if not url:
    print('[render_build] DATABASE_URL not set — skipping schema bootstrap')
    sys.exit(0)

safe_schema = schema.replace('"', '""')
try:
    import psycopg
    with psycopg.connect(url, connect_timeout=15) as conn:
        with conn.cursor() as cur:
            cur.execute(f'CREATE SCHEMA IF NOT EXISTS "{safe_schema}"')
        conn.commit()
    print(f'[render_build] schema "{schema}" ready')
except Exception as e:
    print(f'[render_build] WARNING: schema creation failed: {e}')
    print('[render_build] Continuing — migrate will handle it')
PY

echo "=== STEP 3: collectstatic ==="
python manage.py collectstatic --no-input
echo "=== collectstatic OK ==="

echo "=== STEP 4: migrate ==="
python manage.py migrate --no-input
echo "=== migrate OK ==="

echo "=== STEP 5: ensure_platform_admin ==="
python manage.py ensure_platform_admin
echo "=== BUILD COMPLETE ==="
