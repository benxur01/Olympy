#!/usr/bin/env bash
# Render web service build hook. Runs on every deploy.
set -o errexit

echo "=== ENV: Python=$(python --version 2>&1) ==="

echo "=== STEP 1: pip install ==="
pip install --upgrade pip
pip install --no-cache-dir -r requirements.txt
echo "=== pip install OK ==="

echo "=== STEP 2: DB connectivity check (informational) ==="
python - <<'PYEOF' || echo "[WARNING] DB check failed — build continuing"
import os, sys, socket

db_url = os.environ.get('DATABASE_URL', '')
if not db_url:
    print('DATABASE_URL not set')
    sys.exit(0)

from urllib.parse import urlparse
p = urlparse(db_url)
host = p.hostname
port = p.port or 5432
print(f'Trying to reach {host}:{port} ...')
try:
    ip = socket.getaddrinfo(host, port, socket.AF_INET)
    print(f'DNS resolved: {ip[0][4][0]}')
except Exception as dns_err:
    print(f'DNS FAILED: {dns_err}')
    sys.exit(0)

try:
    import psycopg
    conn = psycopg.connect(db_url, connect_timeout=10)
    cur = conn.cursor()
    cur.execute('SELECT 1')
    print('DB connection OK')
    schema = os.environ.get('DATABASE_SCHEMA', 'olympy').strip() or 'olympy'
    cur.execute(f'CREATE SCHEMA IF NOT EXISTS "{schema}"')
    conn.commit()
    conn.close()
    print(f'Schema "{schema}" ready')
except Exception as e:
    print(f'DB connection failed: {type(e).__name__}: {e}')
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
