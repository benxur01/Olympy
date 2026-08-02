#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# Olympy — Contabo VPS bootstrap skripti (Ubuntu/Debian).
#
# Yangi, bo'sh VPS'da BIR MARTA ishga tushiriladi va butun stack'ni ko'taradi:
#   Docker + Compose plugin o'rnatish → repo clone/pull → image'larni build →
#   postgres/redis ko'tarish → bir martalik `release` (migrate, collectstatic,
#   bootstrap) → butun stack'ni ishga tushirish.
#
# Qayta ishga tushirish XAVFSIZ (idempotent): mavjud Docker qayta
# o'rnatilmaydi, repo pull qilinadi, migratsiyalar takror bajarilmaydi.
# Deploy'ni yangilash uchun ham shu skriptni qayta chaqirish kifoya.
#
# Ishlatish (root sifatida yoki sudo bilan):
#   curl -fsSL https://raw.githubusercontent.com/benxur01/Olympy/main/scripts/deploy_contabo.sh -o deploy_contabo.sh
#   bash deploy_contabo.sh
# yoki repo allaqachon klon qilingan bo'lsa:
#   ./scripts/deploy_contabo.sh
#
# Sozlanadigan o'zgaruvchilar (env orqali):
#   APP_DIR   — o'rnatish katalogi (default: /opt/olympy)
#   REPO_URL  — git repo manzili
#   BRANCH    — git branch (default: main)
#
# To'liq cutover ketma-ketligi: deploy/README.md
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/olympy}"
REPO_URL="${REPO_URL:-https://github.com/benxur01/Olympy.git}"
BRANCH="${BRANCH:-main}"

if [ "$(id -u)" -eq 0 ]; then
    SUDO=""
elif command -v sudo &>/dev/null; then
    SUDO="sudo"
else
    echo "XATO: root huquqi kerak (yoki sudo o'rnating)."
    exit 1
fi

step() { echo ""; echo "═══ $* ═══"; }

# ─── 1. OS tekshiruvi ──────────────────────────────────────────────────────
step "1/8 OS tekshiruvi"
if ! command -v apt-get &>/dev/null; then
    echo "XATO: bu skript Ubuntu/Debian uchun yozilgan (apt-get topilmadi)."
    exit 1
fi
echo "OK: $(. /etc/os-release && echo "${PRETTY_NAME:-unknown}")"

# ─── 2. Asosiy paketlar ────────────────────────────────────────────────────
step "2/8 Asosiy paketlar"
# postgresql-client — mavjud scripts/db_backup.sh va scripts/db_restore.sh
# aynan pg_dump/pg_restore ni chaqiradi. Versiyasi postgres:16-alpine bilan
# mos bo'lishi kerak (Ubuntu 24.04 → 16, eskiroq relizda `apt-cache policy
# postgresql-client-16` bilan tekshiring).
MISSING_PKGS=()
for pkg in ca-certificates curl git postgresql-client; do
    dpkg -s "$pkg" &>/dev/null || MISSING_PKGS+=("$pkg")
done
if [ ${#MISSING_PKGS[@]} -gt 0 ]; then
    echo "O'rnatilmoqda: ${MISSING_PKGS[*]}"
    $SUDO apt-get update -qq
    $SUDO DEBIAN_FRONTEND=noninteractive apt-get install -y "${MISSING_PKGS[@]}"
else
    echo "OK: barcha paketlar mavjud"
fi

# ─── 3. Docker ─────────────────────────────────────────────────────────────
step "3/8 Docker"
if command -v docker &>/dev/null; then
    echo "OK: $(docker --version)"
else
    echo "Docker o'rnatilmoqda (get.docker.com)..."
    curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
    $SUDO sh /tmp/get-docker.sh
    rm -f /tmp/get-docker.sh
    $SUDO systemctl enable --now docker
fi

# Compose plugin get.docker.com bilan birga keladi; eski o'rnatishlarda yo'q.
if $SUDO docker compose version &>/dev/null; then
    echo "OK: $($SUDO docker compose version)"
else
    echo "Docker Compose plugin o'rnatilmoqda..."
    $SUDO apt-get update -qq
    $SUDO DEBIAN_FRONTEND=noninteractive apt-get install -y docker-compose-plugin
    $SUDO docker compose version
fi

# ─── 4. Repo ───────────────────────────────────────────────────────────────
step "4/8 Repo: $APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
    echo "Mavjud repo yangilanmoqda ($BRANCH)..."
    # `--depth 1` ATAYIN yo'q: to'liq klon ustiga shallow fetch qilinsa
    # keyingi merge g'alati holatlarga tushadi. Repo kichik, to'liq fetch arzon.
    $SUDO git -C "$APP_DIR" fetch origin "$BRANCH"
    $SUDO git -C "$APP_DIR" checkout "$BRANCH"
    # Lokal o'zgarishlar (masalan backend/.env) yo'qolmasin — reset EMAS, merge.
    $SUDO git -C "$APP_DIR" merge --ff-only "origin/$BRANCH"
else
    echo "Klon qilinmoqda: $REPO_URL"
    $SUDO mkdir -p "$(dirname "$APP_DIR")"
    $SUDO git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"

# ─── 5. Konfiguratsiya ─────────────────────────────────────────────────────
step "5/8 Konfiguratsiya: backend/.env"
if [ ! -f backend/.env ]; then
    $SUDO cp backend/.env.production.example backend/.env
    $SUDO chmod 600 backend/.env
    echo ""
    echo "backend/.env yaratildi (namunadan nusxa)."
    echo "DAVOM ETISHDAN OLDIN uni to'ldiring:"
    echo "  nano $APP_DIR/backend/.env"
    echo ""
    echo "Eng muhimi: OLYMPY_SECRET_KEY, OLYMPY_ALLOWED_HOSTS, POSTGRES_PASSWORD,"
    echo "DATABASE_URL (paroli POSTGRES_PASSWORD bilan bir xil bo'lsin) va"
    echo "Telegram/Cloudinary/to'lov kalitlari (Render dashboard'idan ko'chiring)."
    echo ""
    echo "To'ldirgach shu skriptni QAYTA ishga tushiring."
    exit 0
fi

# To'ldirilmagan CHANGE_ME qiymatlar qolgan bo'lsa — deploy'ni to'xtatamiz.
# Aks holda Django ishga tushib, keyin tushunarsiz xato berardi.
if grep -qE '^[A-Z_]+=.*CHANGE_ME' backend/.env; then
    echo "XATO: backend/.env da to'ldirilmagan qiymatlar bor:"
    grep -nE '^[A-Z_]+=.*CHANGE_ME' backend/.env | sed 's/^/  /'
    exit 1
fi
echo "OK: backend/.env to'ldirilgan"

# Let's Encrypt webroot (nginx uni bind mount qiladi — katalog mavjud bo'lsin).
$SUDO mkdir -p deploy/certbot/www deploy/certbot/conf

# ─── 6. Image'larni build ──────────────────────────────────────────────────
step "6/8 Image'lar build qilinmoqda (birinchi marta 5-10 daqiqa)"
# Frontend bundle build PAYTIDA quriladi — VITE_* o'zgaruvchilarini
# o'zgartirsangiz `--no-cache` yoki `docker compose build nginx` kerak bo'ladi.
$SUDO docker compose build

# ─── 7. Ma'lumotlar bazasi + release ───────────────────────────────────────
step "7/8 Postgres/Redis va bir martalik release qadami"
$SUDO docker compose up -d postgres redis

wait_healthy() {
    local service="$1"
    local tries=60
    local cid status
    while [ "$tries" -gt 0 ]; do
        cid="$($SUDO docker compose ps -q "$service" || true)"
        if [ -n "$cid" ]; then
            status="$($SUDO docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null || echo starting)"
            [ "$status" = "healthy" ] && { echo "  $service: healthy"; return 0; }
        fi
        tries=$((tries - 1))
        sleep 2
    done
    echo "XATO: $service 120 soniyada healthy bo'lmadi. Log: docker compose logs $service"
    return 1
}
wait_healthy postgres
wait_healthy redis

# migrate + collectstatic + ensure_* — batafsil: backend/docker-entrypoint.sh
$SUDO docker compose run --rm backend release

# ─── 8. Stack'ni ishga tushirish ───────────────────────────────────────────
step "8/8 Barcha xizmatlar ishga tushirilmoqda"
$SUDO docker compose up -d
$SUDO docker compose ps

# Firewall — faqat ufw allaqachon YOQILGAN bo'lsa aralashamiz.
if command -v ufw &>/dev/null && $SUDO ufw status 2>/dev/null | grep -q "Status: active"; then
    echo ""
    echo "ufw faol — 80/443 portlari ochilmoqda"
    $SUDO ufw allow 80/tcp
    $SUDO ufw allow 443/tcp
fi

PUBLIC_IP="$(curl -fsS --max-time 5 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"

cat <<EOF

═══════════════════════════════════════════════════════════════════════════
DEPLOY TUGADI. VPS IP: ${PUBLIC_IP}

Tezkor tekshiruv:
  curl -s http://${PUBLIC_IP}/api/health/     # {"status": "ok"} kutiladi
  curl -sI http://${PUBLIC_IP}/               # frontend index.html

KEYINGI QADAMLAR (batafsil: deploy/README.md)

  1) Render bazasidan dump olish (lokal mashinada yoki shu VPS'da):
       ./scripts/db_backup.sh 'postgresql://...render_external_url...'

  2) Dump'ni yangi Postgres konteyneriga yuklash (port faqat loopback'da):
       ./scripts/db_restore.sh backups/backup_XXXX.dump \\
         'postgresql://olympy:PAROL@127.0.0.1:5432/olympy'

  3) Restore'dan keyin migratsiyalarni tekshirish:
       docker compose run --rm backend python manage.py migrate --check

  4) Smoke-test: sayt ochiladimi, /api/health/ "ok" beradimi, admin panel
     (/olympy-mgmt-2025/) ochiladimi. DIQQAT: TLS'gacha LOGIN ishlamaydi —
     production'da auth cookie'lari Secure, ya'ni HTTP orqali saqlanmaydi.

  5) DNS: domen A yozuvini ${PUBLIC_IP} ga yo'naltiring (TTL'ni oldindan
     kamaytirib qo'ying).

  6) TLS sertifikati (DNS ko'chgandan keyin) — buyruqlar nginx/nginx.conf
     faylining oxiridagi izohda. Keyin backend/.env da:
       OLYMPY_SECURE_SSL_REDIRECT=1
       OLYMPY_SECURE_HSTS_SECONDS=31536000
     va: docker compose up -d --force-recreate backend celery-worker celery-beat

  7) Telegram webhook'lari va Payme/Click callback URL'larini yangi domenga
     o'tkazing.

  8) Hammasi ishlagach Render xizmatlarini to'xtating (bir necha kun
     "suspend" holatida qoldiring — orqaga qaytish yo'li ochiq bo'lsin).

Foydali buyruqlar:
  docker compose logs -f backend
  docker compose ps
  docker compose restart backend
═══════════════════════════════════════════════════════════════════════════
EOF
