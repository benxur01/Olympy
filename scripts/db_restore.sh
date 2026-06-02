#!/bin/bash
# Ishlatish: ./scripts/db_restore.sh <backup.dump> <DATABASE_URL>
# Misol: ./scripts/db_restore.sh backups/backup_20260602_120000.dump 'postgresql://user:pass@host/dbname'

set -e

BACKUP_FILE="$1"
TARGET_URL="$2"

if [ -z "$BACKUP_FILE" ] || [ -z "$TARGET_URL" ]; then
    echo "Ishlatish: ./scripts/db_restore.sh <backup.dump> <DATABASE_URL>"
    echo "Misol:"
    echo "  ./scripts/db_restore.sh backups/backup_20260602_120000.dump 'postgresql://user:pass@host:5432/dbname'"
    exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo "ERROR: Backup fayli topilmadi: $BACKUP_FILE"
    exit 1
fi

echo "DIQQAT: Bu amal '$TARGET_URL' dagi mavjud ma'lumotlarni o'chiradi!"
read -p "Davom etasizmi? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "Bekor qilindi."
    exit 0
fi

echo ""
echo "Restore boshlanmoqda..."
echo "Backup: $BACKUP_FILE"
echo "Manzilik DB: $TARGET_URL"

pg_restore --no-acl --no-owner --clean --if-exists -d "$TARGET_URL" "$BACKUP_FILE"

echo ""
echo "Restore muvaffaqiyatli yakunlandi!"
echo "Yangi serverda Django migratsiyalarini tekshiring: python manage.py migrate --check"
