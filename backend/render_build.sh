#!/usr/bin/env bash
# Render web service build hook. Runs on every deploy.

echo "=== ENV: Python=$(python --version 2>&1) Pip=$(pip --version 2>&1 | head -1) ==="

echo "=== STEP 1: pip install ==="
if pip install --no-cache-dir -r requirements.txt; then
    echo "=== pip install OK ==="
else
    echo "=== pip install FAILED (exit $?) ===" && exit 1
fi

echo "=== STEP 2: DB ulanish tekshiruvi ==="
python3 - <<'PYEOF'
import os, sys, socket
from urllib.parse import urlparse

url = os.environ.get('DATABASE_URL', '')
if not url:
    print('DATABASE_URL yo\'q')
    sys.exit(0)

p = urlparse(url)
host, port = p.hostname, p.port or 5432
print(f'Host: {host}:{port}')
print(f'User: {p.username}')

try:
    addrs = socket.getaddrinfo(host, port, socket.AF_INET)
    ip = addrs[0][4][0]
    print(f'IPv4: {ip}')
    s = socket.create_connection((ip, port), timeout=10)
    print('TCP ulanish: OK')
    s.close()
except Exception as e:
    print(f'TCP ulanish XATO: {e}')
    sys.exit(0)

try:
    import psycopg
    with psycopg.connect(url, connect_timeout=10) as conn:
        with conn.cursor() as cur:
            cur.execute('SELECT version()')
            print('PostgreSQL:', cur.fetchone()[0][:50])
        schema = os.environ.get('DATABASE_SCHEMA', 'olympy').strip() or 'olympy'
        with conn.cursor() as cur:
            cur.execute(f'CREATE SCHEMA IF NOT EXISTS "{schema}"')
        conn.commit()
        print(f'Schema "{schema}": OK')
except Exception as e:
    print(f'DB xato: {type(e).__name__}: {e}')
PYEOF
echo "=== STEP 2 OK ==="

echo "=== STEP 3: collectstatic ==="
if python manage.py collectstatic --no-input; then
    echo "=== collectstatic OK ==="
else
    echo "=== collectstatic FAILED (exit $?) ===" && exit 1
fi

echo "=== STEP 4: migrate ==="
if python manage.py migrate --no-input; then
    echo "=== migrate OK ==="
else
    echo "=== migrate FAILED (exit $?) ===" && exit 1
fi

echo "=== STEP 5: ensure_platform_admin ==="
if python manage.py ensure_platform_admin; then
    echo "=== ensure_platform_admin OK ==="
else
    echo "=== ensure_platform_admin FAILED (exit $?) ===" && exit 1
fi

echo "=== BUILD COMPLETE ==="
