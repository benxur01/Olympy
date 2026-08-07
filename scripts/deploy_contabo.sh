#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# Olympy — Contabo VPS bootstrap skripti (Ubuntu/Debian).
#
# Yangi, bo'sh VPS'da BIR MARTA ishga tushiriladi va butun stack'ni ko'taradi:
#   Docker + Compose plugin o'rnatish → avtomatik xavfsizlik yangilanishlari →
#   repo clone/pull → image'larni build → postgres/redis ko'tarish → bir
#   martalik `release` (migrate, collectstatic, bootstrap) → stack'ni ishga
#   tushirish.
#
# Qayta ishga tushirish XAVFSIZ (idempotent): mavjud Docker qayta
# o'rnatilmaydi, repo pull qilinadi, migratsiyalar takror bajarilmaydi.
# Deploy'ni yangilash uchun ham shu skriptni qayta chaqirish kifoya.
#
# ┌─ BU SKRIPT NIMA QILMAYDI ────────────────────────────────────────────────┐
# │ Serverdan uzilib qolish xavfi bor hech qanday amal BAJARILMAYDI:         │
# │   • ufw firewall YOQILMAYDI (faqat allaqachon faol bo'lsa 80/443 ochadi) │
# │   • SSH sozlamalari O'ZGARTIRILMAYDI (parolli login o'chirilmaydi)       │
# │   • fail2ban o'rnatilmaydi                                              │
# │ Bular ATAYIN alohida, interaktiv skriptda:  bash deploy/harden_vps.sh   │
# │ U SSH portini aniqlaydi, ruxsatni AVVAL qo'shadi va tasdiq so'raydi.     │
# │ Batafsil tartib: deploy/README.md → "VPS qattiqlashtirish".              │
# └─────────────────────────────────────────────────────────────────────────┘
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

# Oxirida ko'rsatiladigan ogohlantirishlar (firewall va h.k.).
WARNINGS=()

# ─── 1. OS tekshiruvi ──────────────────────────────────────────────────────
step "1/9 OS tekshiruvi"
if ! command -v apt-get &>/dev/null; then
    echo "XATO: bu skript Ubuntu/Debian uchun yozilgan (apt-get topilmadi)."
    exit 1
fi
echo "OK: $(. /etc/os-release && echo "${PRETTY_NAME:-unknown}")"

# ─── 2. Asosiy paketlar ────────────────────────────────────────────────────
step "2/9 Asosiy paketlar"
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

# ─── 3. Avtomatik xavfsizlik yangilanishlari ───────────────────────────────
step "3/9 Avtomatik xavfsizlik yangilanishlari (unattended-upgrades)"
# OpenSSL/glibc/yadro kabi paketlarning xavfsizlik yamoqlari qo'lda kutmasdan
# o'rnatiladi. BU QADAM AVTOMATLASHTIRILGAN, chunki ulanishni uzish xavfi yo'q:
# faqat xavfsizlik omborlari yoqiladi va avtomatik REBOOT ATAYIN o'chirilgan.
if ! dpkg -s unattended-upgrades &>/dev/null; then
    echo "unattended-upgrades o'rnatilmoqda..."
    $SUDO apt-get update -qq
    $SUDO DEBIAN_FRONTEND=noninteractive apt-get install -y unattended-upgrades
else
    echo "OK: unattended-upgrades mavjud"
fi

# Konfiguratsiyani ATAYIN o'zimiz yozamiz: distro default'lari relizga qarab
# farq qiladi va ba'zilarida avtomatik reboot yoqilgan bo'ladi.
# `<<'CONF'` (qo'shtirnoqli marker) — ${distro_id} kabi qiymatlarni bash
# ochib yubormasligi uchun; ularni apt'ning O'ZI ochadi.
$SUDO tee /etc/apt/apt.conf.d/99olympy-unattended-upgrades >/dev/null <<'CONF'
// Olympy — avtomatik xavfsizlik yangilanishlari (scripts/deploy_contabo.sh yozdi).
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";

// FAQAT xavfsizlik omborlari. Oddiy (funksional) yangilanishlar kutilmagan
// xulq o'zgarishlarini keltirishi mumkin — ularni qo'lda qilamiz.
Unattended-Upgrade::Allowed-Origins {
        "${distro_id}:${distro_codename}-security";
        "${distro_id}ESMApps:${distro_codename}-apps-security";
        "${distro_id}ESM:${distro_codename}-infra-security";
};

// Server O'ZI qayta ishga tushmasin: olimpiada o'rtasida reboot qabul
// qilinmaydi. Reboot kerak bo'lganda /var/run/reboot-required fayli paydo
// bo'ladi — qulay vaqtda qo'lda bajaring.
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
CONF

# Konfiguratsiya sintaksisini tekshiramiz — buzilgan apt.conf butun apt'ni
# ishdan chiqaradi, keyingi qadamlar tushunarsiz xato berardi.
if ! $SUDO apt-config dump >/dev/null 2>&1; then
    echo "XATO: /etc/apt/apt.conf.d/99olympy-unattended-upgrades apt tomonidan o'qilmadi."
    $SUDO rm -f /etc/apt/apt.conf.d/99olympy-unattended-upgrades
    echo "Fayl o'chirildi (apt tiklandi). Skriptni qayta ishga tushiring."
    exit 1
fi

$SUDO systemctl enable --now unattended-upgrades.service &>/dev/null || true
$SUDO systemctl enable --now apt-daily.timer apt-daily-upgrade.timer &>/dev/null || true
echo "OK: xavfsizlik yangilanishlari yoqildi (avtomatik reboot O'CHIQ)"

# ─── 4. Docker ─────────────────────────────────────────────────────────────
step "4/9 Docker"
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

# ─── 5. Repo ───────────────────────────────────────────────────────────────
step "5/9 Repo: $APP_DIR"
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

# ─── 6. Konfiguratsiya ─────────────────────────────────────────────────────
step "6/9 Konfiguratsiya: backend/.env"
if [ ! -f backend/.env ]; then
    $SUDO cp backend/.env.production.example backend/.env
    $SUDO chmod 600 backend/.env
    echo ""
    echo "backend/.env yaratildi (namunadan nusxa)."
    echo "DAVOM ETISHDAN OLDIN uni to'ldiring:"
    echo "  nano $APP_DIR/backend/.env"
    echo ""
    echo "Eng muhimi: OLYMPY_SECRET_KEY, OLYMPY_ALLOWED_HOSTS, POSTGRES_PASSWORD,"
    echo "DATABASE_URL (paroli POSTGRES_PASSWORD bilan bir xil bo'lsin),"
    echo "REDIS_PASSWORD + REDIS_URL/CELERY_BROKER_URL (parol bilan) va"
    echo "Telegram/Cloudinary/to'lov kalitlari (Render dashboard'idan ko'chiring)."
    echo ""
    echo "To'ldirgach shu skriptni QAYTA ishga tushiring."
    exit 0
fi

# Faylni BIR MARTA o'qib olamiz. `$SUDO` SHART: backend/.env chmod 600 va root
# egaligida bo'ladi — sudo bilan (lekin root bo'lmagan foydalanuvchi sifatida)
# chaqirilganda oddiy `grep` "Permission denied" berib, quyidagi tekshiruvlar
# JIMGINA o'tib ketardi (fail-open).
ENV_CONTENT="$($SUDO cat backend/.env)"

# backend/.env dan bitta o'zgaruvchi qiymati. Oxirgi ta'rif g'olib — Docker
# `env_file` semantikasi ham aynan shunday.
# `|| true` SHART: skript boshida `set -o pipefail` bor, ya'ni o'zgaruvchi
# topilmasa grep 1 qaytaradi va butun quvur yiqiladi. `set -e` bilan birga bu
# skriptni JIM (xabarsiz) to'xtatib qo'yardi — quyidagi tushunarli xatolar
# umuman chiqmasdan.
env_value() {
    grep -E "^$1=" <<<"$ENV_CONTENT" | tail -n1 | cut -d= -f2- || true
}

# To'ldirilmagan CHANGE_ME qiymatlar qolgan bo'lsa — deploy'ni to'xtatamiz.
# Aks holda Django ishga tushib, keyin tushunarsiz xato berardi.
if grep -qE '^[A-Z_]+=.*CHANGE_ME' <<<"$ENV_CONTENT"; then
    echo "XATO: backend/.env da to'ldirilmagan qiymatlar bor:"
    grep -nE '^[A-Z_]+=.*CHANGE_ME' <<<"$ENV_CONTENT" | sed 's/^/  /'
    exit 1
fi

# ── Redis paroli (MAJBURIY) ────────────────────────────────────────────────
# Redis konteyneri `--requirepass` bilan ishga tushadi (docker-compose.yml) va
# parol bo'sh bo'lsa ATAYIN ishga tushmaydi. Xatoni shu yerda, tushunarli
# ko'rinishda aytamiz — aks holda foydalanuvchi konteyner log'larini kavlashi
# kerak bo'lardi.
REDIS_PASSWORD_VALUE="$(env_value REDIS_PASSWORD)"
if [ -z "$REDIS_PASSWORD_VALUE" ]; then
    echo "XATO: backend/.env da REDIS_PASSWORD yo'q yoki bo'sh."
    echo ""
    echo "Redis parolsiz ishga tushirilmaydi (Celery task'larini o'zgartirish va"
    echo "Django cache orqali login-lockout/throttle hisoblarini nolga tushirish"
    echo "mumkin bo'lib qolardi). Bajaring:"
    echo "  1) Parol yarating:      openssl rand -hex 32"
    echo "  2) backend/.env ga:     REDIS_PASSWORD=<parol>"
    echo "  3) Shu parol bilan:     REDIS_URL=redis://:<parol>@redis:6379/0"
    echo "                          CELERY_BROKER_URL=redis://:<parol>@redis:6379/0"
    exit 1
fi

# URL'lar ham parol bilan bo'lishi kerak. Aks holda Redis AUTH talab qiladi,
# Django/Celery esa parolsiz ulanib "NOAUTH Authentication required" bilan
# yiqiladi — va bu xato faqat birinchi so'rov/task paytida ko'rinadi.
for redis_var in REDIS_URL CELERY_BROKER_URL CELERY_RESULT_BACKEND_URL; do
    redis_value="$(env_value "$redis_var")"
    # Bo'sh qiymat — settings.py fallback zanjirini ishlatadi, muammo emas.
    [ -z "$redis_value" ] && continue
    case "$redis_value" in
        redis://:*@*|rediss://:*@*) ;;
        *)
            echo "XATO: backend/.env dagi $redis_var parolsiz ko'rinishda."
            echo "  Hozir:  $redis_var=$redis_value"
            echo "  Kerak:  $redis_var=redis://:<REDIS_PASSWORD>@redis:6379/0"
            exit 1
            ;;
    esac
    # Nomuvofiq parol — eng ko'p uchraydigan xato.
    url_pass="${redis_value#*://:}"
    url_pass="${url_pass%%@*}"
    if [ "$url_pass" != "$REDIS_PASSWORD_VALUE" ]; then
        echo "XATO: $redis_var ichidagi parol REDIS_PASSWORD bilan mos kelmadi."
        echo "Ikkalasi AYNAN bir xil bo'lishi kerak."
        echo "Parolda @ : / # % kabi belgi bo'lsa URL-encode talab qilinadi —"
        echo "eng oson yechim: parolni faqat hex belgilardan qiling"
        echo "  openssl rand -hex 32"
        exit 1
    fi
done

# Ikkalasi ham bo'sh bo'lsa settings.py `redis://localhost:6379/0` fallback'ini
# oladi — konteyner ichida localhost'da Redis YO'Q. Natijada Django cache
# locmem'ga tushadi (login-lockout va throttle worker'lar orasida bo'linmaydi)
# va Celery EAGER rejimga o'tib og'ir task'larni HTTP so'rov ichida bajaradi.
if [ -z "$(env_value REDIS_URL)" ] && [ -z "$(env_value CELERY_BROKER_URL)" ]; then
    echo "XATO: REDIS_URL va CELERY_BROKER_URL ikkisi ham bo'sh."
    echo "Kamida bittasi to'ldirilishi SHART:"
    echo "  REDIS_URL=redis://:\$REDIS_PASSWORD@redis:6379/0"
    exit 1
fi

echo "OK: backend/.env to'ldirilgan (Redis paroli ham mos)"

# Let's Encrypt webroot (nginx uni bind mount qiladi — katalog mavjud bo'lsin).
$SUDO mkdir -p deploy/certbot/www deploy/certbot/conf

# ─── 7. Image'larni build ──────────────────────────────────────────────────
step "7/9 Image'lar build qilinmoqda (birinchi marta 5-10 daqiqa)"
# Frontend bundle build PAYTIDA quriladi — VITE_* o'zgaruvchilarini
# o'zgartirsangiz `--no-cache` yoki `docker compose build nginx` kerak bo'ladi.
$SUDO docker compose build

# ─── 8. Ma'lumotlar bazasi + release ───────────────────────────────────────
step "8/9 Postgres/Redis va bir martalik release qadami"
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

# ─── 9. Stack'ni ishga tushirish ───────────────────────────────────────────
step "9/9 Barcha xizmatlar ishga tushirilmoqda"
$SUDO docker compose up -d
$SUDO docker compose ps

# ─── Firewall holati ───────────────────────────────────────────────────────
# Bu skript ufw'ni O'ZI YOQMAYDI va bu ATAYIN: yoqish paytida SSH porti
# ruxsat ro'yxatiga tushmasa (yoki SSH standart bo'lmagan portda bo'lsa) siz
# server bilan aloqani BUTUNLAY yo'qotasiz — VPS'ga faqat Contabo panelidagi
# konsol orqali kirish qoladi. Yoqish deploy/harden_vps.sh da: u SSH portini
# aniqlaydi, ruxsatni AVVAL qo'shadi va tasdiqlashni so'raydi.
if command -v ufw &>/dev/null && $SUDO ufw status 2>/dev/null | grep -q "Status: active"; then
    echo ""
    echo "ufw faol — 80/443 portlari ochilmoqda"
    $SUDO ufw allow 80/tcp
    $SUDO ufw allow 443/tcp
else
    WARNINGS+=("Firewall (ufw) FAOL EMAS — barcha portlar internetga ochiq. Yoqish: bash deploy/harden_vps.sh")
fi

# fail2ban — SSH brute-force himoyasi. O'rnatish ham harden_vps.sh da, chunki
# noto'g'ri sozlangan jail administratorning O'ZINI bloklab qo'yishi mumkin.
if ! command -v fail2ban-server &>/dev/null && ! [ -x /usr/bin/fail2ban-server ]; then
    WARNINGS+=("fail2ban o'rnatilmagan — SSH brute-force himoyasi yo'q. O'rnatish: bash deploy/harden_vps.sh")
fi

# SSH parolli login — eng ko'p ekspluatatsiya qilinadigan kirish yo'li.
# `sshd -T` amaldagi (barcha include'lar hisobga olingan) konfiguratsiyani beradi.
# /usr/sbin/ to'liq yo'l bilan: `sshd` root bo'lmagan foydalanuvchining PATH'ida
# bo'lmaydi.
if [ -x /usr/sbin/sshd ] && $SUDO /usr/sbin/sshd -T 2>/dev/null | grep -qi '^passwordauthentication yes'; then
    WARNINGS+=("SSH parolli login YOQILGAN — brute-force uchun ochiq. O'chirish: bash deploy/harden_vps.sh --ssh")
fi

PUBLIC_IP="$(curl -fsS --max-time 5 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"

cat <<EOF

═══════════════════════════════════════════════════════════════════════════
DEPLOY TUGADI. VPS IP: ${PUBLIC_IP}

Tezkor tekshiruv:
  curl -s http://${PUBLIC_IP}/api/health/     # {"status": "ok"} kutiladi
  curl -sI http://${PUBLIC_IP}/               # frontend index.html

KEYINGI QADAMLAR (batafsil: deploy/README.md)

  1) VPS QATTIQLASHTIRISH — birinchi navbatda, server kunlab ochiq turmasin:
       bash deploy/harden_vps.sh              # ufw + fail2ban (xavfsiz qism)
       bash deploy/harden_vps.sh --ssh-only   # parolli loginni o'chirish
     DIQQAT: --ssh-only dan OLDIN SSH kalitingiz bilan kira olishingizni
     tasdiqlang. Kalitsiz parolli loginni o'chirish sizni serverdan butunlay
     chiqarib tashlaydi (skript o'zi ham tekshiradi va rad etadi).

  2) Render bazasidan dump olish (lokal mashinada yoki shu VPS'da):
       ./scripts/db_backup.sh 'postgresql://...render_external_url...'

  3) Dump'ni yangi Postgres konteyneriga yuklash (port faqat loopback'da):
       ./scripts/db_restore.sh backups/backup_XXXX.dump \\
         'postgresql://olympy:PAROL@127.0.0.1:5432/olympy'

  4) Restore'dan keyin migratsiyalarni tekshirish:
       docker compose run --rm backend python manage.py migrate --check

  5) Smoke-test: sayt ochiladimi, /api/health/ "ok" beradimi, admin panel
     (/olympy-mgmt-2025/) ochiladimi. DIQQAT: TLS'gacha LOGIN ishlamaydi —
     production'da auth cookie'lari Secure, ya'ni HTTP orqali saqlanmaydi.

  6) DNS: domen A yozuvini ${PUBLIC_IP} ga yo'naltiring (TTL'ni oldindan
     kamaytirib qo'ying). Cloudflare ishlatsangiz — sertifikat olguningizcha
     yozuvni vaqtincha "DNS only" (kulrang bulut) qiling.

  7) TLS sertifikati (DNS ko'chgandan keyin) — MAJBURIY, ixtiyoriy emas.
     Buyruqlar nginx/nginx.conf faylining oxiridagi izohda va to'liq
     checklist deploy/README.md → "TLS (MAJBURIY)" da. Keyin backend/.env:
       OLYMPY_SECURE_SSL_REDIRECT=1
       OLYMPY_SECURE_HSTS_SECONDS=31536000
     va: docker compose up -d --force-recreate backend celery-worker celery-beat
     Cloudflare SSL rejimi "Full (strict)" bo'lishi SHART ("Flexible" cheksiz
     redirect halqasi beradi).

  8) Backup: kunlik cron + TASHQI nusxa (rclone crypt). VPS'dagi backup disk
     nosoz bo'lsa ma'lumot bilan birga yo'qoladi.
     deploy/README.md → "Backup: VPS + tashqi nusxa (MAJBURIY)"

  9) Telegram webhook'lari va Payme/Click callback URL'larini yangi domenga
     o'tkazing.

 10) Hammasi ishlagach Render xizmatlarini to'xtating (bir necha kun
     "suspend" holatida qoldiring — orqaga qaytish yo'li ochiq bo'lsin).

Foydali buyruqlar:
  docker compose logs -f backend
  docker compose ps
  docker compose restart backend
═══════════════════════════════════════════════════════════════════════════
EOF

# ─── Xavfsizlik ogohlantirishlari ──────────────────────────────────────────
# Banner OXIRIDA chiqadi — terminal tepasiga aylanib ketmasin.
if [ ${#WARNINGS[@]} -gt 0 ]; then
    echo ""
    echo "⚠  XAVFSIZLIK OGOHLANTIRISHLARI (${#WARNINGS[@]}):"
    for w in "${WARNINGS[@]}"; do
        echo "   • $w"
    done
    echo ""
    echo "   Batafsil tartib: deploy/README.md → \"VPS qattiqlashtirish\""
    echo ""
fi
