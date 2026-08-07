#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# Olympy — Contabo VPS xavfsizlik qattiqlashtirish skripti (Ubuntu/Debian).
#
# Bu skript ATAYIN `scripts/deploy_contabo.sh` dan AJRATILGAN va ATAYIN
# INTERAKTIV: bu yerdagi har bir amal noto'g'ri bajarilsa sizni O'Z
# SERVERINGIZDAN chiqarib tashlashi mumkin. Deploy skripti esa har yangilanishda
# qayta ishlatiladi va u hech qachon aloqani uzish xavfini olmaydi.
#
# Nima qiladi:
#   1) ufw firewall  — default deny incoming / allow outgoing, SSH + 80/443.
#                      SSH porti AVVAL ochiladi, ufw undan KEYIN yoqiladi.
#   2) fail2ban      — SSH brute-force jail. Sizning hozirgi IP'ingiz
#                      `ignoreip` ga qo'shiladi (o'zingizni bloklab qo'ymaslik).
#   3) SSH (--ssh)   — parolli login o'chirish, root'ga faqat kalit bilan.
#                      FAQAT `--ssh` bayrog'i bilan va faqat kalitli kirish
#                      TASDIQLANGANDAN keyin.
#
# Ishlatish (root sifatida yoki sudo bilan):
#   bash deploy/harden_vps.sh              # firewall + fail2ban
#   bash deploy/harden_vps.sh --ssh        # yuqorisi + SSH qattiqlashtirish
#   bash deploy/harden_vps.sh --ssh-only   # faqat SSH
#
# ┌─ OLDIN O'QING ──────────────────────────────────────────────────────────┐
# │ • Skriptni SSH sessiyasi ichida ishga tushiring va u tugagach shu        │
# │   sessiyani YOPMANG. Avval YANGI oynadan qayta ulanib ko'ring.           │
# │ • Contabo panelidagi VNC/konsol kirishini oldindan tekshirib qo'ying —   │
# │   bu sizning "zaxira kaliti".                                           │
# │ • SSH kalitingiz yo'q bo'lsa `--ssh` ni ISHLATMANG. Avval kalit qo'shing:│
# │     (lokal mashinada)  ssh-keygen -t ed25519                            │
# │     (lokal mashinada)  ssh-copy-id root@<VPS_IP>                        │
# └─────────────────────────────────────────────────────────────────────────┘
#
# To'liq tartib va tushuntirishlar: deploy/README.md → "VPS qattiqlashtirish"
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

DO_FIREWALL=1
DO_FAIL2BAN=1
DO_SSH=0

for arg in "$@"; do
    case "$arg" in
        --ssh)      DO_SSH=1 ;;
        --ssh-only) DO_SSH=1; DO_FIREWALL=0; DO_FAIL2BAN=0 ;;
        -h|--help)
            # Fayl boshidagi izoh blokini (2-35 qatorlar) yordam matni sifatida
            # chiqaramiz — hujjat ikki joyda takrorlanmasin.
            sed -n '2,35p' "$0" | sed 's/^# \{0,1\}//'
            exit 0
            ;;
        *)
            echo "XATO: noma'lum parametr: $arg (yordam: --help)"
            exit 1
            ;;
    esac
done

if [ "$(id -u)" -eq 0 ]; then
    SUDO=""
elif command -v sudo &>/dev/null; then
    SUDO="sudo"
else
    echo "XATO: root huquqi kerak (yoki sudo o'rnating)."
    exit 1
fi

if ! command -v apt-get &>/dev/null; then
    echo "XATO: bu skript Ubuntu/Debian uchun yozilgan (apt-get topilmadi)."
    exit 1
fi

step()  { echo ""; echo "═══ $* ═══"; }
warn()  { echo "OGOHLANTIRISH: $*" >&2; }

# Aniq "yes/ha" javobini talab qiladi. Interaktiv bo'lmagan muhitda (masalan
# `curl | bash` yoki cron) TO'XTAYDI — jimgina "ha" deb hisoblamaydi.
confirm() {
    local prompt="$1" expected="${2:-ha}" answer
    if [ ! -t 0 ]; then
        echo ""
        echo "XATO: bu skript interaktiv terminal talab qiladi (tasdiqlash uchun)."
        echo "SSH sessiyasi ichida qo'lda ishga tushiring."
        exit 1
    fi
    echo ""
    echo "$prompt"
    printf 'Davom etish uchun AYNAN "%s" deb yozing: ' "$expected"
    read -r answer
    if [ "$answer" != "$expected" ]; then
        echo "Bekor qilindi (hech narsa o'zgartirilmadi)."
        exit 1
    fi
}

# ─── Hozirgi SSH sessiyasi haqidagi ma'lumot ───────────────────────────────
# SSH_CONNECTION = "<klient_ip> <klient_port> <server_ip> <server_port>"
CLIENT_IP=""
SSH_SERVER_PORT=""
CLIENT_PORT=""
if [ -n "${SSH_CONNECTION:-}" ]; then
    # shellcheck disable=SC2086
    set -- $SSH_CONNECTION
    CLIENT_IP="${1:-}"
    CLIENT_PORT="${2:-}"
    SSH_SERVER_PORT="${4:-}"
fi

# sshd amaldagi (barcha Include'lar hisobga olingan) konfiguratsiyasi.
sshd_effective() { $SUDO /usr/sbin/sshd -T 2>/dev/null || true; }

# SSH portlari: sshd konfiguratsiyasidan + hozirgi sessiya porti. Standart
# bo'lmagan port (masalan 2222) ishlatilayotgan bo'lsa uni ham ochamiz —
# faqat 22 ni ochib ufw yoqilsa aloqa uzilardi.
SSH_PORTS="$(sshd_effective | awk '/^port /{print $2}' | sort -u)"
if [ -n "$SSH_SERVER_PORT" ]; then
    SSH_PORTS="$(printf '%s\n%s\n' "$SSH_PORTS" "$SSH_SERVER_PORT" | grep -E '^[0-9]+$' | sort -un)"
fi
if [ -z "$SSH_PORTS" ]; then
    warn "SSH porti aniqlanmadi — 22 deb hisoblanadi."
    SSH_PORTS="22"
fi

echo "Aniqlangan holat:"
echo "  SSH port(lar)i : $(echo "$SSH_PORTS" | tr '\n' ' ')"
echo "  Sizning IP     : ${CLIENT_IP:-<aniqlanmadi>}"

# ═══ 1. UFW FIREWALL ═══════════════════════════════════════════════════════
if [ "$DO_FIREWALL" -eq 1 ]; then
    step "1. Firewall (ufw)"

    if ! dpkg -s ufw &>/dev/null; then
        echo "ufw o'rnatilmoqda..."
        $SUDO apt-get update -qq
        $SUDO DEBIAN_FRONTEND=noninteractive apt-get install -y ufw
    fi

    echo ""
    echo "Qo'llanadigan qoidalar:"
    echo "  default deny  incoming   (kiruvchi hamma narsa taqiqlanadi)"
    echo "  default allow outgoing   (chiquvchi trafik ochiq)"
    for p in $SSH_PORTS; do
        echo "  allow ${p}/tcp            (SSH — SIZNING ULANISHINGIZ)"
    done
    echo "  allow 80/tcp             (HTTP / Let's Encrypt tekshiruvi)"
    echo "  allow 443/tcp            (HTTPS)"
    echo ""
    echo "DIQQAT: Postgres (5432) allaqachon faqat 127.0.0.1 da tinglaydi"
    echo "(docker-compose.yml), Redis va backend esa umuman publish qilinmagan."
    echo ""
    echo "MUHIM — Docker va ufw haqida: Docker o'z iptables qoidalarini"
    echo "ufw'dan CHETLAB O'TIB qo'yadi. Ya'ni 'ports:' bilan publish qilingan"
    echo "portlar (80/443) ufw \"deny\" bo'lsa ham ochiq qoladi. Bu bizda"
    echo "kutilgan xulq (80/443 baribir ochiq bo'lishi kerak), ammo kelajakda"
    echo "yangi port publish qilsangiz ufw uni HIMOYA QILMAYDI — 127.0.0.1 ga"
    echo "bog'lang (masalan \"127.0.0.1:5432:5432\")."

    confirm "ufw yoqilsin? Ruxsat qoidalari YOQISHDAN OLDIN qo'shiladi, ya'ni
hozirgi SSH sessiyangiz uzilmasligi kerak. Shunga qaramay bu sessiyani
YOPMANG — tugagach yangi oynadan qayta ulanib tekshiring."

    # TARTIB MUHIM: avval ruxsatlar, keyin default policy, eng oxirida enable.
    for p in $SSH_PORTS; do
        $SUDO ufw allow "${p}/tcp" comment 'SSH'
    done
    $SUDO ufw allow 80/tcp  comment 'HTTP (olympy nginx)'
    $SUDO ufw allow 443/tcp comment 'HTTPS (olympy nginx)'
    $SUDO ufw default deny incoming
    $SUDO ufw default allow outgoing
    # --force : "Command may disrupt existing ssh connections" savolini
    # o'tkazib yuboradi. Biz uni yuqorida O'ZIMIZ so'radik va SSH portini
    # allaqachon ochdik.
    $SUDO ufw --force enable
    $SUDO ufw status verbose

    echo ""
    echo "✓ ufw yoqildi. HOZIR yangi terminal oynasidan qayta ulanib ko'ring:"
    echo "    ssh -p $(echo "$SSH_PORTS" | head -n1) root@<VPS_IP>"
fi

# ═══ 2. FAIL2BAN ═══════════════════════════════════════════════════════════
if [ "$DO_FAIL2BAN" -eq 1 ]; then
    step "2. fail2ban (SSH brute-force himoyasi)"

    if ! dpkg -s fail2ban &>/dev/null; then
        echo "fail2ban o'rnatilmoqda..."
        $SUDO apt-get update -qq
        $SUDO DEBIAN_FRONTEND=noninteractive apt-get install -y fail2ban
    else
        echo "OK: fail2ban mavjud"
    fi

    # `ignoreip` — o'zingizni bloklab qo'ymaslik uchun. Parolni bir necha marta
    # xato kiritish (yoki noto'g'ri kalit bilan urinish) sizni ham banlashi
    # mumkin edi.
    IGNORE_IPS="127.0.0.1/8 ::1"
    if [ -n "$CLIENT_IP" ]; then
        IGNORE_IPS="$IGNORE_IPS $CLIENT_IP"
        echo "Sizning IP'ingiz ($CLIENT_IP) ignoreip ro'yxatiga qo'shiladi."
        echo "DIQQAT: uy internetingiz dinamik IP bo'lsa bu vaqt o'tib eskiradi."
    else
        warn "Sizning IP'ingiz aniqlanmadi (SSH_CONNECTION bo'sh) —"
        warn "ignoreip'ga faqat loopback qo'shiladi. Parolni ketma-ket xato"
        warn "kiritsangiz O'ZINGIZ ham 1 soatga bloklanishingiz mumkin."
    fi

    # jail.local — distro'ning jail.conf'i yangilanishda ustiga yozilishi
    # mumkin, .local esa hech qachon.
    SSH_PORTS_CSV="$(echo "$SSH_PORTS" | paste -sd, -)"
    $SUDO tee /etc/fail2ban/jail.local >/dev/null <<CONF
# Olympy — fail2ban asosiy sozlamasi (deploy/harden_vps.sh yozdi).
# Qo'lda tahrirlash mumkin; skript qayta ishga tushirilsa USTIGA YOZILADI.
[DEFAULT]
# 1 soat ichida 5 martadan ko'p muvaffaqiyatsiz urinish → 1 soatga ban.
bantime  = 1h
findtime = 1h
maxretry = 5
# O'zimizni bloklab qo'ymaslik uchun.
ignoreip = $IGNORE_IPS
# Ubuntu 22.04+ da SSH log'lari faylga emas, journald'ga yoziladi.
backend  = systemd

[sshd]
enabled = true
port    = $SSH_PORTS_CSV
CONF

    # Konfiguratsiyani AVVAL tekshiramiz — buzilgan jail.local fail2ban'ni
    # ishga tushmaydigan holatga olib keladi va SSH himoyasiz qoladi.
    if ! $SUDO fail2ban-client -t &>/dev/null; then
        echo "XATO: fail2ban konfiguratsiyasi tekshiruvdan o'tmadi:"
        $SUDO fail2ban-client -t || true
        $SUDO rm -f /etc/fail2ban/jail.local
        echo "jail.local o'chirildi (fail2ban avvalgi holatda qoldi)."
        exit 1
    fi

    $SUDO systemctl enable fail2ban
    $SUDO systemctl restart fail2ban
    sleep 2
    $SUDO fail2ban-client status sshd || warn "sshd jail holati o'qilmadi (log backend'ini tekshiring)."
    echo ""
    echo "✓ fail2ban ishlayapti. Banlangan IP'ni qo'lda ochish:"
    echo "    fail2ban-client set sshd unbanip <IP>"
fi

# ═══ 3. SSH QATTIQLASHTIRISH ═══════════════════════════════════════════════
if [ "$DO_SSH" -eq 1 ]; then
    step "3. SSH qattiqlashtirish (parolli login o'chirish)"

    # ── 3a. Kalit mavjudligini TEKSHIRISH ─────────────────────────────────
    # Bu eng xavfli qadam: kalit ishlamasa va parol o'chirilsa serverga
    # SSH orqali kirish YO'LI QOLMAYDI.
    KEY_COUNT=0
    KEY_FILES=()
    while IFS= read -r akf; do
        [ -f "$akf" ] || continue
        n="$($SUDO ssh-keygen -l -f "$akf" 2>/dev/null | grep -c . || true)"
        if [ "${n:-0}" -gt 0 ]; then
            KEY_COUNT=$((KEY_COUNT + n))
            KEY_FILES+=("$akf ($n kalit)")
        fi
    done < <(
        # Root va sudo bilan chaqirgan foydalanuvchining authorized_keys'lari.
        echo /root/.ssh/authorized_keys
        [ -n "${SUDO_USER:-}" ] && getent passwd "$SUDO_USER" | awk -F: '{print $6"/.ssh/authorized_keys"}'
        # sshd boshqa yo'l ishlatishi mumkin (AuthorizedKeysFile).
        sshd_effective | awk '/^authorizedkeysfile /{for(i=2;i<=NF;i++) if ($i ~ /^\//) print $i}'
    )

    echo "Topilgan SSH kalitlari: $KEY_COUNT"
    for kf in "${KEY_FILES[@]:-}"; do
        [ -n "$kf" ] && echo "  • $kf"
    done

    if [ "$KEY_COUNT" -eq 0 ]; then
        echo ""
        echo "XATO: birorta ham SSH ochiq kaliti topilmadi."
        echo "Parolli loginni o'chirish sizni serverdan BUTUNLAY chiqarib"
        echo "tashlaydi. Avval lokal mashinangizda:"
        echo "    ssh-keygen -t ed25519            # kaliting yo'q bo'lsa"
        echo "    ssh-copy-id root@<VPS_IP>"
        echo "so'ng YANGI oynadan kalit bilan kirib ko'ring va shundan keyin"
        echo "bu skriptni --ssh bilan qayta ishga tushiring."
        exit 1
    fi

    # ── 3b. HOZIRGI sessiya kalit bilan kirganini tekshirish ──────────────
    # `authorized_keys` da kalit bo'lishi kifoya emas: u boshqa mashinaning
    # kaliti bo'lishi mumkin. Journal'dan aynan SHU ulanish qanday
    # autentifikatsiya qilinganini o'qiymiz.
    AUTH_METHOD="aniqlanmadi"
    if [ -n "$CLIENT_IP" ] && [ -n "$CLIENT_PORT" ] && command -v journalctl &>/dev/null; then
        if $SUDO journalctl -u ssh -u sshd --since "-12h" --no-pager 2>/dev/null \
             | grep -qE "Accepted publickey for .* from ${CLIENT_IP} port ${CLIENT_PORT}\b"; then
            AUTH_METHOD="publickey"
        elif $SUDO journalctl -u ssh -u sshd --since "-12h" --no-pager 2>/dev/null \
             | grep -qE "Accepted password for .* from ${CLIENT_IP} port ${CLIENT_PORT}\b"; then
            AUTH_METHOD="password"
        fi
    fi
    echo "Hozirgi sessiya autentifikatsiyasi: $AUTH_METHOD"

    if [ "$AUTH_METHOD" = "password" ]; then
        echo ""
        echo "XATO: siz hozir PAROL bilan kirgansiz."
        echo "Parolli loginni o'chirsak shu sessiya uzilgandan keyin qayta"
        echo "kirolmaysiz. Avval kalit bilan kirishni sinab ko'ring:"
        echo "    ssh -o PreferredAuthentications=publickey root@<VPS_IP>"
        echo "Ishlagach shu skriptni qayta ishga tushiring."
        exit 1
    fi

    if [ "$AUTH_METHOD" != "publickey" ]; then
        warn "Sessiya turini journal'dan aniqlab bo'lmadi (log saqlanmagan"
        warn "bo'lishi mumkin). Kalit bilan kirganingizga ISHONCH bo'lmasa"
        warn "TO'XTANG va avval kalit bilan kirishni sinab ko'ring."
    fi

    # ── 3c. Konfiguratsiya ────────────────────────────────────────────────
    # Fayl nomi ATAYIN `00-` bilan boshlanadi: sshd bir sozlama uchun BIRINCHI
    # topilgan qiymatni oladi va Include'lar alifbo tartibida o'qiladi.
    # Ubuntu'da `50-cloud-init.conf` ko'pincha `PasswordAuthentication yes`
    # yozadi — `99-` nomli fayl unga YUTQAZARDI.
    SSHD_DROPIN=/etc/ssh/sshd_config.d/00-olympy-hardening.conf

    if ! grep -qE '^\s*Include\s+/etc/ssh/sshd_config\.d/' /etc/ssh/sshd_config; then
        echo ""
        echo "XATO: /etc/ssh/sshd_config da 'Include /etc/ssh/sshd_config.d/*.conf'"
        echo "qatori yo'q — drop-in fayl O'QILMAYDI (eski Debian/Ubuntu)."
        echo "Sozlamalarni /etc/ssh/sshd_config ga QO'LDA qo'shing:"
        echo "    PasswordAuthentication no"
        echo "    KbdInteractiveAuthentication no"
        echo "    PermitRootLogin prohibit-password"
        echo "so'ng: sshd -t && systemctl reload ssh"
        exit 1
    fi

    confirm "Quyidagilar qo'llanadi ($SSHD_DROPIN):
    PasswordAuthentication no          — parol bilan kirish O'CHADI
    KbdInteractiveAuthentication no    — parolning ikkinchi yo'li ham
    PermitRootLogin prohibit-password  — root faqat KALIT bilan
    PubkeyAuthentication yes
    PermitEmptyPasswords no
    MaxAuthTries 3
    X11Forwarding no

Bu SESSIYA uzilmaydi (reload, restart emas), ammo yangi ulanishlar faqat
kalit bilan bo'ladi. Sessiyani YOPMANG — avval yangi oynadan tekshiring." \
        "kalitim ishlaydi"

    # Avvalgi holatni saqlab qo'yamiz (rollback uchun).
    if [ -f "$SSHD_DROPIN" ]; then
        $SUDO cp -a "$SSHD_DROPIN" "${SSHD_DROPIN}.bak.$(date +%s)"
    fi

    $SUDO mkdir -p /etc/ssh/sshd_config.d
    $SUDO tee "$SSHD_DROPIN" >/dev/null <<'CONF'
# Olympy — SSH qattiqlashtirish (deploy/harden_vps.sh yozdi).
#
# Fayl nomi `00-` bilan boshlanadi ATAYIN: sshd har sozlama uchun BIRINCHI
# topilgan qiymatni oladi, Include'lar esa alifbo tartibida o'qiladi. Shu
# sababli bu fayl `50-cloud-init.conf` kabi drop-in'lardan USTUN turadi.
#
# ORQAGA QAYTARISH (parolli loginni tiklash):
#   rm /etc/ssh/sshd_config.d/00-olympy-hardening.conf
#   sshd -t && systemctl reload ssh

PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
PermitEmptyPasswords no

# `prohibit-password` — root KALIT bilan kira oladi, parol bilan yo'q.
# `no` qat'iyroq, ammo deploy oqimi (ssh root@VPS, /opt/olympy) root'ga
# tayanadi — avval sudo huquqli oddiy foydalanuvchi yarating va uni
# sinovdan o'tkazing, keyingina `no` ga o'tkazing.
PermitRootLogin prohibit-password

MaxAuthTries 3
X11Forwarding no
CONF
    $SUDO chmod 644 "$SSHD_DROPIN"

    # ── 3d. Tekshiruv: sintaksis VA amaldagi natija ────────────────────────
    if ! $SUDO /usr/sbin/sshd -t; then
        echo "XATO: sshd konfiguratsiyasi sintaksis tekshiruvidan o'tmadi."
        $SUDO rm -f "$SSHD_DROPIN"
        echo "Fayl o'chirildi — SSH avvalgi holatda qoldi. Hech narsa reload qilinmadi."
        exit 1
    fi

    # Eng ishonchli tekshiruv: AMALDAGI qiymat (barcha drop-in'lar hisobga
    # olinib). Boshqa fayl bizni bekor qilgan bo'lsa shu yerda ko'rinadi.
    EFF="$(sshd_effective)"
    EFF_PASS="$(echo "$EFF"  | awk '/^passwordauthentication /{print $2}')"
    EFF_ROOT="$(echo "$EFF"  | awk '/^permitrootlogin /{print $2}')"
    echo ""
    echo "Amaldagi konfiguratsiya:"
    echo "  passwordauthentication = ${EFF_PASS:-?}"
    echo "  permitrootlogin        = ${EFF_ROOT:-?}"

    if [ "$EFF_PASS" != "no" ]; then
        echo ""
        echo "XATO: parolli login hali ham YOQILGAN — boshqa konfiguratsiya"
        echo "faylimizni bekor qilmoqda. Qidiring:"
        echo "    grep -rn PasswordAuthentication /etc/ssh/sshd_config /etc/ssh/sshd_config.d/"
        $SUDO rm -f "$SSHD_DROPIN"
        echo "Bizning faylimiz o'chirildi (holat o'zgarmadi)."
        exit 1
    fi

    # `reload`, `restart` EMAS: mavjud sessiyalar uzilmaydi.
    if $SUDO systemctl reload ssh 2>/dev/null || $SUDO systemctl reload sshd 2>/dev/null; then
        echo "✓ sshd qayta yuklandi (mavjud sessiyalar uzilmadi)."
    else
        warn "systemctl reload ishlamadi — qo'lda bajaring: systemctl reload ssh"
    fi

    cat <<'EOS'

┌─ HOZIR BAJARING (bu sessiyani YOPMASDAN) ────────────────────────────────┐
│ 1) YANGI terminal oynasi ochib qayta ulaning:                            │
│      ssh root@<VPS_IP>                                                   │
│ 2) Ishladi → tayyor, eski sessiyani yopishingiz mumkin.                  │
│ 3) ISHLAMADI → ESKI (hali ochiq) sessiyada orqaga qaytaring:             │
│      rm /etc/ssh/sshd_config.d/00-olympy-hardening.conf                  │
│      sshd -t && systemctl reload ssh                                     │
└──────────────────────────────────────────────────────────────────────────┘
EOS
fi

step "Yakuniy holat"
if command -v ufw &>/dev/null; then
    $SUDO ufw status | head -n 12
fi
if command -v fail2ban-client &>/dev/null; then
    $SUDO fail2ban-client status 2>/dev/null || true
fi
sshd_effective | grep -E '^(passwordauthentication|permitrootlogin|port) ' || true

echo ""
echo "Qattiqlashtirish yakunlandi."
if [ "$DO_SSH" -eq 0 ]; then
    echo "SSH qattiqlashtirish BAJARILMADI (xavfli qadam, alohida so'raladi)."
    echo "SSH kalitingiz ishlayotganini tekshirgach:"
    echo "    bash deploy/harden_vps.sh --ssh-only"
fi
