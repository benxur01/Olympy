#!/bin/bash
# DB backup olish skripti
# Ishlatish: ./scripts/db_backup.sh
# Lokal .env dan yoki to'g'ridan-to'g'ri URL bilan ishlaydi
#
# Backup GPG (AES256, simmetrik parol) bilan shifrlanadi — CI'dagi
# .github/workflows/db_backup.yml bilan bir xil naqsh. Baza dump'i ism,
# telefon, email va parol xeshlarini o'z ichiga oladi, shuning uchun
# shifrlash MAJBURIY (fail-closed): BACKUP_PASSPHRASE bo'lmasa yoki juda
# qisqa bo'lsa, hech qanday dump olinmaydi.
#
# Parolni bering: BACKUP_PASSPHRASE="..." ./scripts/db_backup.sh
# Yaratish:        openssl rand -base64 48

set -e

# pg_dump o'rnatilganini tekshir
if ! command -v pg_dump &>/dev/null; then
    echo "XATO: pg_dump topilmadi."
    echo "O'rnatish: sudo apt-get install postgresql-client"
    exit 1
fi

if ! command -v gpg &>/dev/null; then
    echo "XATO: gpg topilmadi."
    echo "O'rnatish: sudo apt-get install gnupg"
    exit 1
fi

# ── FAIL-CLOSED darvoza ──────────────────────────────────────────────────
# Shifrlash paroli yo'q yoki kuchsiz bo'lsa hech qanday dump OLINMAYDI.
if [ -z "${BACKUP_PASSPHRASE:-}" ]; then
    echo "XATO: BACKUP_PASSPHRASE o'rnatilmagan. Backup TO'XTATILDI."
    echo "Baza dump'i foydalanuvchi ismlari, telefon raqamlari, email"
    echo "manzillari va parol xeshlarini o'z ichiga oladi — shifrlanmagan"
    echo "holda diskka yozish mumkin emas."
    echo ""
    echo "Ishlatish: BACKUP_PASSPHRASE=\"...\" ./scripts/db_backup.sh"
    echo "Yaratish:  openssl rand -base64 48"
    exit 1
fi
if [ "${#BACKUP_PASSPHRASE}" -lt 20 ]; then
    echo "XATO: BACKUP_PASSPHRASE juda qisqa (${#BACKUP_PASSPHRASE} belgi, minimum 20)."
    echo "Yaratish: openssl rand -base64 48"
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

# Eski dump'larni necha kun saqlaymiz. Hech narsa ularni o'chirmasdi — VPS
# diskida har kunlik backup to'planib borardi.
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

FILENAME="backup_$(date +%Y%m%d_%H%M%S).dump.gpg"
BACKUP_PATH="$BACKUP_DIR/$FILENAME"

# Oraliq shifrlanmagan dump vaqtinchalik faylda yoziladi (pg_dump --format=custom
# stdout'ga to'g'ridan-to'g'ri quvurlansa ham, gpg xatosi yuz berganda diskda
# yarim yozilgan shifrlangan fayl qolib ketmasligi uchun trap bilan tozalanadi).
UNENCRYPTED_TMP="$(mktemp "${BACKUP_DIR}/.unencrypted_XXXXXX.dump")"
cleanup() {
    rm -f "$UNENCRYPTED_TMP"
}
trap cleanup EXIT

echo "Backup boshlanmoqda..."
echo "Fayl: $BACKUP_PATH"

pg_dump --format=custom --no-acl --no-owner "$DB_URL" -f "$UNENCRYPTED_TMP"

# CI (.github/workflows/db_backup.yml) bilan bir xil GPG parametrlari:
# AES256, kuchli KDF (s2k-count maksimal), gpg allaqachon deyarli har bir
# Linux/macOS'da o'rnatilgan bo'lgani uchun ochish uchun qo'shimcha vosita
# shart emas.
gpg --batch --yes --quiet \
    --pinentry-mode loopback --passphrase-fd 3 \
    --symmetric --cipher-algo AES256 \
    --s2k-mode 3 --s2k-digest-algo SHA512 --s2k-count 65011712 \
    --compress-algo zlib \
    --output "$BACKUP_PATH" \
    "$UNENCRYPTED_TMP" \
    3< <(printf '%s' "$BACKUP_PASSPHRASE")

rm -f "$UNENCRYPTED_TMP"

SIZE=$(du -sh "$BACKUP_PATH" | cut -f1)
echo ""
echo "Backup muvaffaqiyatli yakunlandi (shifrlangan, AES256)!"
echo "Fayl: $BACKUP_PATH ($SIZE)"

# Faqat backup MUVAFFAQIYATLI bo'lgandan keyin eskilarini tozalaymiz.
echo ""
echo "Eski backup'lar tozalanmoqda (> $BACKUP_RETENTION_DAYS kun)..."
# Ikkala naqsh ham tozalanadi: yangi shifrlangan (.dump.gpg) va eski
# shifrlanmagan (.dump) — GPG qo'shilishidan oldingi backup'lar ham
# retention siyosatiga bo'ysunishi kerak.
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'backup_*.dump.gpg' -o -name 'backup_*.dump' \) -mtime +"$BACKUP_RETENTION_DAYS" -delete
echo ""
echo "Restore qilish uchun:"
echo "  ./scripts/db_restore.sh $BACKUP_PATH 'yangi_db_url'"
