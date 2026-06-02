#!/bin/bash
# DB restore skripti
# Ishlatish: ./scripts/db_restore.sh <backup.dump> <DATABASE_URL>

set -e

BACKUP_FILE="$1"
TARGET_URL="$2"

if ! command -v pg_restore &>/dev/null; then
    echo "XATO: pg_restore topilmadi."
    echo "O'rnatish: sudo apt-get install postgresql-client"
    exit 1
fi

if [ -z "$BACKUP_FILE" ] || [ -z "$TARGET_URL" ]; then
    echo "Ishlatish: ./scripts/db_restore.sh <backup.dump> <DATABASE_URL>"
    echo ""
    echo "Misol:"
    echo "  ./scripts/db_restore.sh backups/backup_20260602_120000.dump 'postgresql://user:pass@host:5432/dbname'"
    exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo "XATO: Backup fayli topilmadi: $BACKUP_FILE"
    echo ""
    echo "Mavjud backuplar:"
    ls -lh "$(dirname "$0")/../backups/" 2>/dev/null || echo "  backups/ papkasi bo'sh"
    exit 1
fi

SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
echo "Backup: $BACKUP_FILE ($SIZE)"
echo "Manzil: $TARGET_URL"
echo ""
echo "DIQQAT: Bu amal manzil DB dagi barcha ma'lumotlarni o'chirib, backup bilan almashtiradi!"
read -p "Davom etasizmi? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "Bekor qilindi."
    exit 0
fi

echo ""
echo "Restore boshlanmoqda..."

pg_restore --no-acl --no-owner --clean --if-exists -d "$TARGET_URL" "$BACKUP_FILE"

echo ""
echo "Restore muvaffaqiyatli yakunlandi!"
echo ""
echo "Keyingi qadamlar:"
echo "  1. Render'da DATABASE_URL ni yangilang (agar yangi DB bo'lsa)"
echo "  2. python manage.py migrate --check  (migratsiyalarni tekshiring)"
echo "  3. Ilovani qayta deploy qiling"
