#!/bin/bash
# DB backup olish skripti
# Ishlatish: ./scripts/db_backup.sh
# Lokal .env dan yoki to'g'ridan-to'g'ri URL bilan ishlaydi

set -e

# pg_dump o'rnatilganini tekshir
if ! command -v pg_dump &>/dev/null; then
    echo "XATO: pg_dump topilmadi."
    echo "O'rnatish: sudo apt-get install postgresql-client"
    exit 1
fi

# DATABASE_URL aniqlash
if [ -n "$1" ]; then
    DB_URL="$1"
elif [ -n "$DATABASE_URL" ]; then
    DB_URL="$DATABASE_URL"
else
    ENV_FILE="$(dirname "$0")/../backend/.env"
    if [ -f "$ENV_FILE" ]; then
        DB_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | cut -d'=' -f2-)
    fi
fi

# Agar lokal .env da URL yo'q bo'lsa, tashqi Render URL ishlatish
if [ -z "$DB_URL" ]; then
    EXTERNAL_ENV="$(dirname "$0")/../backend/.env.external"
    if [ -f "$EXTERNAL_ENV" ]; then
        DB_URL=$(grep -E '^DATABASE_URL=' "$EXTERNAL_ENV" | cut -d'=' -f2-)
    fi
fi

if [ -z "$DB_URL" ]; then
    echo "XATO: DATABASE_URL topilmadi."
    echo "Quyidagilardan birini bajaring:"
    echo "  1. ./scripts/db_backup.sh 'postgresql://user:pass@host:5432/dbname'"
    echo "  2. backend/.env fayliga DATABASE_URL qo'shing"
    exit 1
fi

BACKUP_DIR="$(dirname "$0")/../backups"
mkdir -p "$BACKUP_DIR"

FILENAME="backup_$(date +%Y%m%d_%H%M%S).dump"
BACKUP_PATH="$BACKUP_DIR/$FILENAME"

echo "Backup boshlanmoqda..."
echo "Fayl: $BACKUP_PATH"

pg_dump --format=custom --no-acl --no-owner "$DB_URL" -f "$BACKUP_PATH"

SIZE=$(du -sh "$BACKUP_PATH" | cut -f1)
echo ""
echo "Backup muvaffaqiyatli yakunlandi!"
echo "Fayl: $BACKUP_PATH ($SIZE)"
echo ""
echo "Restore qilish uchun:"
echo "  ./scripts/db_restore.sh $BACKUP_PATH 'yangi_db_url'"
