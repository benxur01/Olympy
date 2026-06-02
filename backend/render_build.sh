#!/usr/bin/env bash
# Render web service build hook. Runs on every deploy.
set -o errexit

echo "=== ENV: Python=$(python --version 2>&1) Pip=$(pip --version 2>&1) ==="

echo "=== STEP 1: pip install ==="
pip install --no-cache-dir -r requirements.txt
echo "=== pip install OK ==="

echo "=== STEP 2: DB check & schema ==="
python - <<'PYEOF' || echo "[WARNING] DB check failed"
import os, sys, socket
from urllib.parse import urlparse

db_url = os.environ.get('DATABASE_URL', '')
if not db_url:
    print('DATABASE_URL not set, skipping')
    sys.exit(0)

p = urlparse(db_url)
host, port = p.hostname, p.port or 5432
print(f'DB host: {host}:{port}')

try:
    addrs = socket.getaddrinfo(host, port, socket.AF_INET)
    print(f'IPv4 resolved: {addrs[0][4][0]}')
except Exception as e:
    print(f'DNS/IPv4 failed: {e}')

try:
    import psycopg
    schema = os.environ.get('DATABASE_SCHEMA', 'olympy').strip() or 'olympy'
    conn = psycopg.connect(db_url, connect_timeout=20)
    cur = conn.cursor()
    cur.execute('SELECT 1')
    cur.execute(f'CREATE SCHEMA IF NOT EXISTS "{schema}"')
    conn.commit()
    conn.close()
    print(f'DB OK, schema "{schema}" ready')
except Exception as e:
    print(f'DB failed: {type(e).__name__}: {e}')
PYEOF

echo "=== STEP 3: collectstatic ==="
python manage.py collectstatic --no-input
echo "=== collectstatic OK ==="

echo "=== STEP 4: migrate ==="
python manage.py migrate --no-input
echo "=== migrate OK ==="

echo "=== STEP 5: ensure_platform_admin ==="
python manage.py ensure_platform_admin
echo "=== BUILD COMPLETE ==="
