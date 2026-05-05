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

pip install --upgrade pip
pip install -r requirements.txt

python <<'PY'
import os
import sys
import psycopg

url = os.environ.get('DATABASE_URL', '').strip()
schema = os.environ.get('DATABASE_SCHEMA', 'olympy').strip() or 'olympy'
if not url:
    print('DATABASE_URL not set — skipping schema bootstrap', file=sys.stderr)
    sys.exit(0)
# Identifier'ni xavfsiz tarzda quote qilamiz (SQL injection oldini olish).
safe_schema = schema.replace('"', '""')
with psycopg.connect(url) as conn:
    with conn.cursor() as cur:
        cur.execute(f'CREATE SCHEMA IF NOT EXISTS "{safe_schema}"')
    conn.commit()
print(f'[render_build] schema "{schema}" ready')
PY

python manage.py collectstatic --no-input
python manage.py migrate --no-input
python manage.py ensure_platform_admin
