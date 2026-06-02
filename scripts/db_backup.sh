#!/bin/bash
# Ishlatish: ./scripts/db_backup.sh [DATABASE_URL]
# DATABASE_URL berilmasa backend/.env dan o'qiladi

set -e

if [ -n "$1" ]; then
    DB_URL="$1"
else
    ENV_FILE="$(dirname "$0")/../backend/.env"
    if [ -f "$ENV_FILE" ]; then
        DB_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | cut -d'=' -f2-)
    fi
fi

if [ -z "$DB_URL" ]; then
    echo "ERROR: DATABASE_URL topilmadi."
    echo "Ishlatish: ./scripts/db_backup.sh 'postgresql://user:pass@host:5432/dbname'"
    exit 1
fi

BACKUP_DIR="$(dirname "$0")/../backups"
mkdir -p "$BACKUP_DIR"

FILENAME="backup_$(date +%Y%m%d_%H%M%S).dump"
BACKUP_PATH="$BACKUP_DIR/$FILENAME"

echo "Backup boshlanmoqda..."
echo "Manba: $DB_URL"
echo "Fayl: $BACKUP_PATH"

pg_dump --format=custom --no-acl --no-owner "$DB_URL" -f "$BACKUP_PATH"

SIZE=$(du -sh "$BACKUP_PATH" | cut -f1)
echo ""
echo "Backup muvaffaqiyatli yakunlandi!"
echo "Fayl: $BACKUP_PATH ($SIZE)"
