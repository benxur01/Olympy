#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# Olympy — nginx.conf dagi Cloudflare IP oraliqlarini tekshirish.
#
# NEGA KERAK: nginx `nginx/nginx.conf` dagi `set_real_ip_from` ro'yxatiga
# tayanib, Cloudflare'ning `CF-Connecting-IP` sarlavhasiga ISHONADI va undan
# haqiqiy klient IP'sini oladi. Cloudflare o'z oraliqlarini vaqti-vaqti bilan
# o'zgartiradi. Ro'yxat eskirsa:
#   • yangi CF oraliqlaridan kelgan trafik CF edge IP'si sifatida ko'rinadi;
#   • IP-bloklash (moderation.BlockedIPMiddleware) va DRF throttling barcha
#     shu edge orqali kelgan foydalanuvchilarni BITTA IP deb hisoblaydi.
# Xavfsizlik jihatidan bu "fail-safe" tomon (soxtalashtirish ochilmaydi),
# ammo bloklash/limitlar noto'g'ri ishlaydi.
#
# Bu skript HECH NARSANI O'ZGARTIRMAYDI — faqat taqqoslaydi va farq bo'lsa
# tayyor blokni chop etadi. Sabab: nginx.conf git bilan boshqariladi va
# `scripts/deploy_contabo.sh` `git merge --ff-only` qiladi — VPS'da faylni
# qo'lda tahrirlash keyingi deploy'ni to'xtatib qo'yardi.
#
# Ishlatish:
#   bash deploy/update-cloudflare-ips.sh
#
# Chiqish kodi: 0 — ro'yxat dolzarb, 1 — farq bor (yoki xato).
#
# Oyiga bir marta cron (VPS'da, faqat OGOHLANTIRISH uchun):
#   0 4 1 * * cd /opt/olympy && bash deploy/update-cloudflare-ips.sh \
#     || echo "Olympy: nginx.conf dagi Cloudflare IP ro'yxati eskirdi" | \
#        mail -s "Olympy CF IP drift" siz@example.com
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NGINX_CONF="$REPO_ROOT/nginx/nginx.conf"
BEGIN_MARKER='# >>> CLOUDFLARE-IPS-BEGIN'
END_MARKER='# <<< CLOUDFLARE-IPS-END'

if [ ! -f "$NGINX_CONF" ]; then
    echo "XATO: $NGINX_CONF topilmadi."
    exit 1
fi

if ! grep -qF "$BEGIN_MARKER" "$NGINX_CONF" || ! grep -qF "$END_MARKER" "$NGINX_CONF"; then
    echo "XATO: nginx.conf da CLOUDFLARE-IPS marker izohlari topilmadi."
    echo "Ular Cloudflare bloki chegarasini belgilaydi — tiklamasdan bu skript ishlamaydi."
    exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

# ─── Rasmiy ro'yxatni yuklab olamiz ────────────────────────────────────────
for family in v4 v6; do
    if ! curl -fsS --max-time 20 "https://www.cloudflare.com/ips-$family" \
         -o "$TMP_DIR/ips-$family"; then
        echo "XATO: https://www.cloudflare.com/ips-$family yuklab olinmadi (tarmoq?)."
        echo "Hech narsa o'zgartirilmadi."
        exit 1
    fi
    # Bo'sh javob "hamma oraliq o'chib ketdi" degan xulosaga olib kelmasin.
    if [ ! -s "$TMP_DIR/ips-$family" ]; then
        echo "XATO: ips-$family bo'sh javob qaytardi — tekshiruv ishonchsiz."
        exit 1
    fi
done

# CIDR ko'rinishidagi qatorlarni ajratib olamiz (sanity filtri).
grep -hE '^[0-9a-fA-F:.]+/[0-9]+$' "$TMP_DIR/ips-v4" "$TMP_DIR/ips-v6" \
    | sed 's/[[:space:]]*$//' > "$TMP_DIR/official"

OFFICIAL_COUNT="$(wc -l < "$TMP_DIR/official")"
if [ "$OFFICIAL_COUNT" -lt 10 ]; then
    echo "XATO: rasmiy ro'yxatdan faqat $OFFICIAL_COUNT oraliq o'qildi — juda kam."
    echo "Cloudflare javob formatini o'zgartirgan bo'lishi mumkin. Qo'lda tekshiring."
    exit 1
fi

# ─── nginx.conf dagi hozirgi ro'yxat ──────────────────────────────────────
awk -v b="$BEGIN_MARKER" -v e="$END_MARKER" '
    index($0, b) { inside = 1; next }
    index($0, e) { inside = 0 }
    inside && /^set_real_ip_from/ {
        gsub(/^set_real_ip_from[[:space:]]+/, "")
        gsub(/;[[:space:]]*$/, "")
        print
    }
' "$NGINX_CONF" > "$TMP_DIR/current"

CURRENT_COUNT="$(wc -l < "$TMP_DIR/current")"
echo "nginx.conf: $CURRENT_COUNT oraliq | Cloudflare: $OFFICIAL_COUNT oraliq"

# ─── Taqqoslash (tartib muhim emas) ───────────────────────────────────────
sort "$TMP_DIR/official" > "$TMP_DIR/official.sorted"
sort "$TMP_DIR/current"  > "$TMP_DIR/current.sorted"

if diff -q "$TMP_DIR/official.sorted" "$TMP_DIR/current.sorted" >/dev/null; then
    echo "OK: nginx.conf dagi Cloudflare oraliqlari dolzarb. Hech narsa qilish kerak emas."
    exit 0
fi

echo ""
echo "⚠ FARQ TOPILDI."
echo ""
echo "Cloudflare'da BOR, nginx.conf da YO'Q (qo'shish kerak):"
comm -23 "$TMP_DIR/official.sorted" "$TMP_DIR/current.sorted" | sed 's/^/  + /' || true
echo ""
echo "nginx.conf da BOR, Cloudflare'da YO'Q (olib tashlash kerak):"
comm -13 "$TMP_DIR/official.sorted" "$TMP_DIR/current.sorted" | sed 's/^/  - /' || true

cat <<EOS

─── QANDAY YANGILASH ──────────────────────────────────────────────────────
1) nginx/nginx.conf ni oching va marker izohlari ORASIDAGI barcha
   \`set_real_ip_from\` qatorlarini quyidagi blok bilan ALMASHTIRING.
2) Yuqoridagi izohdagi "Oxirgi tekshirilgan" sanasini yangilang.
3) Repo'ga commit qilib push qiling, so'ng VPS'da:
       bash scripts/deploy_contabo.sh
   (nginx.conf image ichiga BUILD vaqtida ko'chiriladi — faqat konteynerni
   restart qilish yetarli EMAS.)

─── YANGI BLOK (nusxa oling) ──────────────────────────────────────────────
EOS

echo "$BEGIN_MARKER (deploy/update-cloudflare-ips.sh shu markerlarga tayanadi — o'chirmang)"
sed 's/^/set_real_ip_from /; s/$/;/' "$TMP_DIR/official"
echo "$END_MARKER"
echo ""

exit 1
