# Olympy — Render → Contabo VPS ko'chirish

Bu katalog Docker Compose asosidagi self-hosted deploy uchun. Render'dagi
konfiguratsiya (`render.yaml`, `backend/render_build.sh`, `backend/render_start.sh`)
**o'zgartirilmagan** — cutover kunigacha Render ishlashda davom etadi.

---

## 🛑 AVVAL SHUNI O'QING — serverdan chiqib qolmaslik uchun

**`deploy/harden_vps.sh --ssh` SSH parolli loginni O'CHIRADI. Agar sizning
SSH ochiq kalitingiz serverda sozlanmagan bo'lsa, bu sizni serverdan
BUTUNLAY chiqarib tashlaydi** — na parol bilan, na kalit bilan kira olmaysiz.
Qolgan yagona yo'l Contabo panelidagi VNC konsoli bo'ladi.

Skript buni o'z-o'zidan qilmaydi va o'zi ham tekshiradi — quyidagilarning
**hammasi** bajarilmasa SSH qadamini rad etadi:

1. `--ssh` yoki `--ssh-only` bayrog'i **aniq berilgan** bo'lishi kerak
   (bayroqsiz ishga tushirilsa SSH'ga umuman tegmaydi);
2. `authorized_keys` da kamida bitta yaroqli ochiq kalit bo'lishi kerak;
3. **hozirgi sessiyangiz** journal'ga ko'ra `Accepted publickey` bilan kirgan
   bo'lishi kerak (parol bilan kirgan bo'lsangiz — to'xtatadi);
4. `sshd -t` sintaksis tekshiruvidan va `sshd -T` bilan **amaldagi** natija
   tasdig'idan o'tishi kerak (aks holda fayl o'chiriladi, holat o'zgarmaydi);
5. siz `kalitim ishlaydi` deb qo'lda yozib tasdiqlashingiz kerak.

Shundan keyin ham `reload` ishlatiladi (`restart` emas) — **ochiq sessiyangiz
uzilmaydi**. Baribir:

> **Skript tugagach hozirgi SSH oynasini YOPMANG.** Avval YANGI oynadan
> `ssh root@<VPS_IP>` bilan ulanib ko'ring. Ishlamasa — eski (hali ochiq)
> oynada orqaga qaytaring:
> ```bash
> rm /etc/ssh/sshd_config.d/00-olympy-hardening.conf
> sshd -t && systemctl reload ssh
> ```

Kalitingiz yo'q bo'lsa, **oldin** lokal mashinangizda:

```bash
ssh-keygen -t ed25519          # kalitingiz yo'q bo'lsa
ssh-copy-id root@<VPS_IP>      # serverga qo'shish
ssh -o PreferredAuthentications=publickey root@<VPS_IP>   # ishlashini tasdiqlang
```

`scripts/deploy_contabo.sh` (asosiy deploy skripti) **hech qachon** SSH'ga,
firewall'ga yoki fail2ban'ga tegmaydi — uzilib qolish xavfi bor barcha amallar
ataylab `harden_vps.sh` ga ajratilgan.

---

## Stack

| Xizmat | Image | Vazifasi |
|---|---|---|
| `postgres` | postgres:16-alpine | Ma'lumotlar bazasi (`postgres_data` volume), faqat 127.0.0.1 |
| `redis` | redis:7-alpine | Celery broker + result + Django cache (`redis_data`), **parol majburiy** |
| `backend` | `backend/Dockerfile` | Gunicorn (Django API), port faqat ichkarida |
| `celery-worker` | (aynan shu image) | Fon task'lari |
| `celery-beat` | (aynan shu image) | Davriy jadval (DatabaseScheduler) |
| `nginx` | `nginx/Dockerfile` | Frontend `dist/` + reverse proxy, 80/443 |

Render'da Celery web jarayoni ichida (`worker -B`) ishlardi; Compose'da uchtasi
ham **alohida konteyner** — beat aynan bitta nusxada bo'lishi shart.

Fayllar:

```
backend/Dockerfile                 # web + worker + beat uchun yagona image
backend/docker-entrypoint.sh       # web | worker | beat | release
backend/.env.production.example    # muhit o'zgaruvchilari namunasi
docker-compose.yml                 # butun stack
nginx/Dockerfile                   # Vite build (1-bosqich) + nginx (2-bosqich)
nginx/nginx.conf                   # reverse proxy + Cloudflare realip + TLS izohlari
scripts/deploy_contabo.sh          # VPS bootstrap va yangilash (idempotent, xavfsiz)
deploy/harden_vps.sh               # ufw + fail2ban + SSH (INTERAKTIV, xavfli qadamlar)
deploy/update-cloudflare-ips.sh    # Cloudflare IP oraliqlari eskirganini tekshiradi
```

## Talablar

- Ubuntu 22.04 / 24.04 LTS (Contabo default), minimum 4GB RAM tavsiya etiladi
  (Postgres + Redis + 2 gunicorn worker + Celery + frontend build).
- Domen va uning DNS boshqaruvi (hozir Cloudflare orqali).
- Render'dagi barcha maxfiy kalitlar (dashboard → Environment).
- **SSH ochiq kaliti** — qattiqlashtirish qadami uchun (yuqoridagi ogohlantirish).
- Tashqi backup uchun joy: Backblaze B2 / S3 / boshqa server.

---

## Cutover ketma-ketligi

### 1. VPS tayyorlash va stack'ni ko'tarish

```bash
ssh root@<VPS_IP>
curl -fsSL https://raw.githubusercontent.com/benxur01/Olympy/main/scripts/deploy_contabo.sh -o deploy_contabo.sh
bash deploy_contabo.sh
```

Skript birinchi ishga tushganda `backend/.env` ni namunadan yaratadi va
**to'xtaydi**. Uni to'ldiring (`CHANGE_ME` qolmasin), so'ng skriptni qayta
ishga tushiring:

```bash
nano /opt/olympy/backend/.env
bash deploy_contabo.sh
```

**Majburiy qiymatlar** (skript ularni tekshiradi va yetishmasa to'xtaydi):

| O'zgaruvchi | Izoh |
|---|---|
| `OLYMPY_SECRET_KEY` | Render'dagini AYNAN ko'chiring — aks holda barcha sessiyalar va 2FA kalitlari yaroqsiz bo'ladi |
| `OLYMPY_ALLOWED_HOSTS` | Domen + `127.0.0.1,localhost` (healthcheck uchun) |
| `POSTGRES_PASSWORD` / `DATABASE_URL` | Paroli AYNAN bir xil bo'lsin |
| `REDIS_PASSWORD` | **YANGI, majburiy** — pastga qarang |
| `REDIS_URL` / `CELERY_BROKER_URL` | `redis://:<REDIS_PASSWORD>@redis:6379/0` |

#### Redis paroli (yangi, MAJBURIY)

Redis konteyneri endi `--requirepass` bilan ishga tushadi. Avval himoya faqat
Docker tarmoq izolyatsiyasiga tayanardi — bu bitta qatlam: debug uchun
`ports:` qo'shib unutilsa yoki boshqa konteyner buzilsa, parolsiz Redis'da
Celery task'larini o'zgartirish va Django cache orqali login-lockout /
throttle hisoblarini nolga tushirish mumkin bo'lardi.

```bash
openssl rand -hex 32        # parol yarating
```

`backend/.env` ga:

```
REDIS_PASSWORD=<yuqoridagi hex parol>
REDIS_URL=redis://:<parol>@redis:6379/0
CELERY_BROKER_URL=redis://:<parol>@redis:6379/0
```

> **Faqat hex (yoki harf-raqam) parol ishlating.** Parol URL ichiga yoziladi —
> `@ : / # %` kabi belgilar URL-encode qilinishi kerak bo'lardi (`@` → `%40`).
> Hex parol bu muammoni butunlay yo'q qiladi.

> **Fail-closed:** `REDIS_PASSWORD` bo'sh bo'lsa Redis konteyneri ataylab ishga
> tushmaydi (`--requirepass ""` Redis'da autentifikatsiyani jimgina
> O'CHIRIB qo'yardi). `deploy_contabo.sh` ham parol yo'qligini, URL'lar
> parolsiz ekanini va parol nomuvofiqligini oldindan tekshiradi.

Skript nima qiladi: Docker o'rnatadi → avtomatik xavfsizlik yangilanishlarini
yoqadi → repo'ni klon qiladi → `backend/.env` ni tekshiradi → image'larni build
qiladi → postgres/redis ni ko'taradi → bir martalik `release` qadamini
(migrate + collectstatic + `ensure_*`) bajaradi → butun stack'ni ishga tushiradi.
Oxirida firewall / fail2ban / SSH holati bo'yicha **ogohlantirishlar** chiqadi.

### 2. VPS qattiqlashtirish (firewall + fail2ban + SSH)

> Yuqoridagi 🛑 ogohlantirishni o'qigan bo'lishingiz kerak.

Ikki bosqichda bajaring — avval xavfsiz qismi, keyin SSH.

**2a. Firewall + fail2ban** (uzilib qolish xavfi juda kichik: SSH porti
ufw yoqilishidan OLDIN ochiladi):

```bash
cd /opt/olympy
bash deploy/harden_vps.sh
```

Nima qiladi:

- `ufw`: `default deny incoming`, `default allow outgoing`,
  `allow <SSH porti>/tcp`, `allow 80/tcp`, `allow 443/tcp`.
  SSH porti `sshd -T` dan va hozirgi sessiyangizdan aniqlanadi — standart
  bo'lmagan port (masalan 2222) ishlatsangiz ham to'g'ri ochiladi.
- `fail2ban`: `sshd` jail, 1 soat ichida 5 xato urinish → 1 soatga ban.
  **Sizning hozirgi IP'ingiz `ignoreip` ga qo'shiladi** — o'zingizni bloklab
  qo'ymaslik uchun. (Uy internetingiz dinamik IP bo'lsa bu vaqt o'tib eskiradi;
  banlangan IP'ni ochish: `fail2ban-client set sshd unbanip <IP>`.)

> **Docker va ufw:** Docker o'z iptables qoidalarini ufw'dan chetlab o'tib
> qo'yadi. `ports:` bilan publish qilingan portlar (80/443) ufw "deny" bo'lsa
> ham ochiq qoladi — bizda bu kutilgan xulq. Ammo kelajakda yangi port publish
> qilsangiz **ufw uni himoya qilmaydi**: `127.0.0.1:PORT:PORT` ko'rinishida
> bog'lang (Postgres allaqachon shunday).

Tugagach **yangi oynadan** qayta ulanib tekshiring.

**2b. SSH qattiqlashtirish** (faqat kalitingiz ishlashini tasdiqlagandan keyin):

```bash
bash deploy/harden_vps.sh --ssh-only
```

Qo'llanadigan sozlamalar (`/etc/ssh/sshd_config.d/00-olympy-hardening.conf`):

```
PasswordAuthentication no          # parol bilan kirish o'chadi
KbdInteractiveAuthentication no    # parolning ikkinchi yo'li ham
PubkeyAuthentication yes
PermitEmptyPasswords no
PermitRootLogin prohibit-password  # root faqat KALIT bilan
MaxAuthTries 3
X11Forwarding no
```

> Fayl nomi `00-` bilan boshlanadi **ataylab**: sshd har sozlama uchun
> BIRINCHI topilgan qiymatni oladi va `Include` fayllari alifbo tartibida
> o'qiladi. Ubuntu'dagi `50-cloud-init.conf` ko'pincha
> `PasswordAuthentication yes` yozadi — `99-` nomli fayl unga yutqazardi.

`PermitRootLogin no` (root'ga umuman ruxsat bermaslik) qat'iyroq, ammo hozirgi
deploy oqimi root'ga tayanadi (`ssh root@VPS`, `/opt/olympy`). O'tish tartibi:
avval sudo huquqli oddiy foydalanuvchi yarating → uning kaliti bilan kirishni
sinang → deploy'ni o'sha foydalanuvchi ostida bajaring → shundan keyingina
`no` ga o'tkazing.

**2c. Avtomatik xavfsizlik yangilanishlari** — `deploy_contabo.sh` buni
avtomatik qiladi (`/etc/apt/apt.conf.d/99olympy-unattended-upgrades`):
faqat xavfsizlik omborlari, **avtomatik reboot O'CHIQ**. Reboot kerak
bo'lganda `/var/run/reboot-required` fayli paydo bo'ladi — qulay vaqtda
qo'lda bajaring:

```bash
ls /var/run/reboot-required 2>/dev/null && echo "REBOOT KERAK"
unattended-upgrade --dry-run --debug | tail -20   # nima o'rnatilishini ko'rish
```

### 3. Render bazasidan dump olish

```bash
cd /opt/olympy
./scripts/db_backup.sh 'postgresql://<render_external_database_url>'
# → backups/backup_YYYYMMDD_HHMMSS.dump
```

> Render'ning **external** (tashqi) DATABASE_URL'ini oling — internal manzil
> faqat Render tarmog'i ichida ishlaydi.

### 4. Yangi Postgres'ga restore

`postgres` konteyneri 5432 portni **faqat 127.0.0.1** da ochadi, shuning uchun
mavjud restore skripti to'g'ridan-to'g'ri ishlaydi:

```bash
./scripts/db_restore.sh backups/backup_YYYYMMDD_HHMMSS.dump \
  'postgresql://olympy:<POSTGRES_PASSWORD>@127.0.0.1:5432/olympy'
```

Restore'dan keyin migratsiyalar ustma-ust tushishini tekshiring:

```bash
docker compose run --rm backend python manage.py migrate --check
# "No planned migration operations" bo'lishi kerak.
# Agar yangi migratsiya bo'lsa: docker compose run --rm backend release
```

**Media fayllar:** Cloudinary ishlatilayotgan bo'lsa hech narsa ko'chirilmaydi
(rasmlar Cloudinary'da qoladi, DB'dagi URL'lar ishlaydi). Cloudinary'siz
ishlagan bo'lsangiz, Render diskidagi `media/` ni qo'lda `media_data`
volume'iga ko'chirish kerak — bu holat uchun alohida reja tuzing.

### 5. Smoke-test (DNS'gacha, IP orqali)

```bash
curl -s http://<VPS_IP>/api/health/          # {"status": "ok"}
curl -sI http://<VPS_IP>/                    # 200, index.html
docker compose ps                            # hammasi Up / healthy
docker compose logs --tail=50 celery-worker  # xatosiz ishga tushgan
```

Redis parol bilan ishlayotganini tasdiqlang:

```bash
# Parolsiz — NOAUTH xatosi KUTILADI (bu yaxshi belgi):
docker compose exec redis redis-cli ping
# Parol bilan — PONG:
docker compose exec redis sh -c 'redis-cli --no-auth-warning -a "$REDIS_PASSWORD" ping'
# Celery brokerga ulanganini tekshirish:
docker compose logs --tail=30 celery-worker | grep -i "connected to redis"
```

Brauzerda `http://<VPS_IP>` — landing sahifasi ochilishi kerak.

> **LOGIN bu bosqichda ISHLAMAYDI va bu normal.** Production rejimida auth
> cookie'lari `Secure` bayrog'i bilan yuboriladi, brauzer esa ularni oddiy HTTP
> ustidan saqlamaydi. To'liq login testi TLS o'rnatilgandan keyin.

### 6. DNS'ni ko'chirish

Domen A yozuvini VPS IP'siga yo'naltiring. TTL'ni bir kun oldin 300s ga
tushirib qo'ying — orqaga qaytish tez bo'ladi.

**Cloudflare ishlatilayotgan bo'lsa** (hozirgi holat — jonli javoblarda
`server: cloudflare` va `cf-ray` bor): sertifikat olishdan oldin DNS yozuvini
**vaqtincha "DNS only"** (kulrang bulut) qilib qo'ying. Sabab keyingi qadamda.

### 7. TLS (MAJBURIY)

> Bu **ixtiyoriy emas**. TLS'siz login umuman ishlamaydi (auth cookie'lari
> `Secure`), parollar ochiq matnda ketadi va HSTS/CSP himoyasi ma'nosiz bo'ladi.

Tartib (buyruqlarning to'liq matni `nginx/nginx.conf` faylining oxirida):

1. **Cloudflare proxy'ni vaqtincha o'chiring** (kulrang bulut).
   Sabab: CF'da "Always Use HTTPS" yoqilgan bo'lsa HTTP-01 tekshiruvi HTTPS'ga
   redirect qilinadi, origin esa hali sertifikatsiz → CF **526** xatosi beradi
   va certbot yiqiladi (klassik "tuxum-tovuq" muammosi).
2. **Sertifikat oling** (host mashinada, stack ishlab turganda):
   ```bash
   cd /opt/olympy && docker run --rm \
     -v "$PWD/deploy/certbot/www:/var/www/certbot" \
     -v "$PWD/deploy/certbot/conf:/etc/letsencrypt" \
     certbot/certbot certonly --webroot -w /var/www/certbot \
     -d prolymp.uz -d www.prolymp.uz \
     --email siz@example.com --agree-tos --no-eff-email
   ```
3. **`docker-compose.yml`** da nginx xizmatiga sertifikat volume'ini ulang
   (izohdagi qatorni oching): `- ./deploy/certbot/conf:/etc/letsencrypt:ro`
   (443 porti allaqachon publish qilingan).
4. **`nginx/nginx.conf`** oxiridagi 443 blokini izohdan chiqaring, domenni
   yozing va 80-portdagi blokda ACME location'idan tashqari hammasini
   HTTPS'ga yo'naltiring: `location / { return 301 https://$host$request_uri; }`
5. **`backend/.env`**:
   ```
   OLYMPY_SECURE_SSL_REDIRECT=1
   OLYMPY_SECURE_HSTS_SECONDS=31536000
   ```
6. **Qo'llash:**
   ```bash
   docker compose up -d --force-recreate backend celery-worker celery-beat
   docker compose exec nginx nginx -t && docker compose exec nginx nginx -s reload
   ```
7. **Cloudflare proxy'ni qayta yoqing** (to'q sariq bulut) va SSL/TLS rejimini
   **"Full (strict)"** ga o'rnating.
   > **"Flexible" QILMANG.** U holda CF→origin ulanishi HTTP bo'ladi, nginx
   > `$scheme=http` yuboradi va `OLYMPY_SECURE_SSL_REDIRECT=1` bilan cheksiz
   > redirect halqasi paydo bo'ladi (`ERR_TOO_MANY_REDIRECTS`).
8. **Avtomatik yangilash** (cron, oyiga bir marta yetarli):
   ```
   0 3 1 * * cd /opt/olympy && docker run --rm \
     -v "$PWD/deploy/certbot/www:/var/www/certbot" \
     -v "$PWD/deploy/certbot/conf:/etc/letsencrypt" \
     certbot/certbot renew --webroot -w /var/www/certbot --quiet \
     && docker compose exec nginx nginx -s reload
   ```
   Cron o'rnatilganini **tekshiring** (`crontab -l`) va bir marta qo'lda
   `certbot renew --dry-run` bilan sinab ko'ring — sertifikat 90 kunda
   tugaydi va yangilanmasa sayt to'liq to'xtaydi.

### 8. Deploy'dan keyingi tekshiruv (TLS o'rnatilgach)

**8a. Sarlavhalar haqiqatan kelayotganini tasdiqlang.** Konfiguratsiyada
yozilgani yetarli emas — javobda ko'ring:

```bash
# Statik/frontend javobi (nginx snippet beradi):
curl -sI https://prolymp.uz/ | grep -iE \
  'strict-transport-security|content-security-policy|x-frame-options|x-content-type-options|referrer-policy|permissions-policy'

# API javobi (Django SecurityHeadersMiddleware beradi — CSP boshqacha, bu normal):
curl -sI https://prolymp.uz/api/health/ | grep -iE \
  'strict-transport-security|content-security-policy|referrer-policy'

# HTTP → HTTPS yo'naltirish ishlayaptimi (301 kutiladi):
curl -sI http://prolymp.uz/ | head -1
```

**8b. Frontend API bazasi nisbiy ekanini tasdiqlang.** Image `VITE_API_BASE_URL`
default `/` bilan quriladi (`docker-compose.yml`) — buni **absolyut manzilga
o'zgartirmang**. Sabab shunchaki chiroylilik emas:

- nisbiy baza bilan frontend va API **bitta origin** bo'ladi;
- `src/services/api.js` dagi `_apiIsCrossSite()` `false` qaytaradi va
  `ALLOW_TOKEN_STORAGE` **o'chadi** — JWT `sessionStorage`ga umuman
  yozilmaydi, faqat `HttpOnly` cookie'da yashaydi (XSS blast radiusi kichrayadi);
- bo'sh qoldirilsa yoki noto'g'ri qiymat berilsa `api.js` eski Render manziliga
  (`https://olympy-api.onrender.com`) qaytib ketadi va migratsiya "ishlagandek"
  ko'rinib, aslida hali Render'ga urib turadi.

Tekshirish — brauzerda saytga **login qiling**, so'ng DevTools:

```js
// Console:
sessionStorage.getItem('olympy_api_token')   // null BO'LISHI KERAK
localStorage.getItem('olympy_api_token')     // null BO'LISHI KERAK
```

```
Application → Cookies → https://prolymp.uz
  auth cookie mavjud, HttpOnly ✓, Secure ✓
Network → istalgan /api/ so'rovi → Request Headers:
  Cookie: ... bor
  Authorization: Bearer ... BO'LMASLIGI kerak
```

Agar `sessionStorage` da token bo'lsa — bundle noto'g'ri `VITE_API_BASE_URL`
bilan qurilgan. Tuzatish:
`docker compose build --no-cache nginx && docker compose up -d nginx`.

**8c. Haqiqiy klient IP** (Cloudflare qatlami to'g'ri ishlayaptimi):

```bash
# Django log'larida O'Z IP'ingiz ko'rinishi kerak, Cloudflare edge IP'si emas:
docker compose logs --tail=50 backend | grep -i "$(curl -fsS https://ifconfig.me)"
```

Yoki admin panelda (`/olympy-mgmt-2025/`) audit yozuvlaridagi IP'ga qarang —
u sizning haqiqiy manzilingiz bo'lishi kerak. Agar hamma yozuvda bir xil
`104.x` / `172.6x` ko'rinsa — realip ishlamayapti, `nginx/nginx.conf` dagi
Cloudflare oraliqlarini tekshiring (pastdagi bo'limga qarang).

**8d. To'liq funksional test:** login, olimpiada boshlash, natijalar,
sertifikat yuklab olish, to'lov oqimi, admin panel.

### 9. Backup: VPS + tashqi nusxa (MAJBURIY)

> Avval bu yerda "tashqi joyga ko'chirishni rejalashtiring" degan TODO turardi.
> Endi bu aniq qadam: **bajarilmasa cutover tugallangan hisoblanmaydi.**

Diskning o'zi nosoz bo'lsa yoki VPS buzib kirilsa, VPS'dagi backup'lar ham
ma'lumot bilan birga yo'qoladi. Kamida bitta nusxa **boshqa provayderda**
bo'lishi kerak.

**9a. Kunlik lokal backup (cron):**

```bash
crontab -e
```
```
0 2 * * * cd /opt/olympy && ./scripts/db_backup.sh 'postgresql://olympy:PAROL@127.0.0.1:5432/olympy' >> /var/log/olympy-backup.log 2>&1
```

Skript 14 kundan eski dump'larni o'zi o'chiradi (`BACKUP_RETENTION_DAYS`).

**9b. Tashqi nusxa — rclone + shifrlash** (Backblaze B2 arzon; S3, Wasabi,
boshqa server ham bo'ladi):

```bash
# 1) O'rnatish
curl https://rclone.org/install.sh | sudo bash

# 2) Ikkita remote sozlang:
#    - "b2raw"  : provayder (Backblaze B2 / S3 / sftp)
#    - "b2crypt": TURI `crypt`, remote = b2raw:olympy-backups
#      → fayllar YUBORILISHIDAN OLDIN shifrlanadi, provayder ochiq matnni
#        hech qachon ko'rmaydi (dump ichida parol xeshlari, telefon raqamlari
#        va email manzillari bor).
rclone config

# 3) Sinab ko'ring
rclone copy /opt/olympy/backups b2crypt:daily --progress
rclone ls b2crypt:daily
```

Cron (lokal backup'dan 30 daqiqa keyin):

```
30 2 * * * rclone copy /opt/olympy/backups b2crypt:daily --max-age 25h --log-file /var/log/olympy-rclone.log
0  3 * * 0 rclone delete b2crypt:daily --min-age 90d --log-file /var/log/olympy-rclone.log
```

> **`rclone config` da yaratilgan crypt parollarini parol menejerida saqlang.**
> `~/.config/rclone/rclone.conf` faylining o'zi ham VPS'da qoladi — u yo'qolsa
> va parol boshqa joyda bo'lmasa, shifrlangan backup'lar **ochilmaydi**.

**9c. Tiklashni sinab ko'ring** (oyiga bir marta — backup'ni faqat mavjudligi
uchun emas, **ishlashi** uchun olamiz):

```bash
rclone copy b2crypt:daily/backup_YYYYMMDD_HHMMSS.dump /tmp/restore-test/
docker compose exec -T postgres psql -U olympy -c 'CREATE DATABASE restore_test;'
./scripts/db_restore.sh /tmp/restore-test/backup_*.dump \
  'postgresql://olympy:PAROL@127.0.0.1:5432/restore_test'
docker compose exec -T postgres psql -U olympy -d restore_test \
  -c 'SELECT count(*) FROM accounts_user;'
docker compose exec -T postgres psql -U olympy -c 'DROP DATABASE restore_test;'
```

**9d. GitHub Actions backup'ini o'chiring.** Yangi Postgres faqat loopback'da
tinglaydi — GitHub runner'i unga ulanolmaydi, workflow esa eskirgan Render
bazasidan nusxa olishda davom etadi. GitHub → Actions → **DB Backup (Haftalik)**
→ `···` → **Disable workflow**.

> Cutover'gacha esa u ishlashda davom etadi va endi dump'ni **GPG (AES-256)
> bilan shifrlaydi**. Ishlashi uchun `BACKUP_PASSPHRASE` repo secret'i
> **qo'lda qo'shilishi shart** — aks holda workflow ataylab yiqiladi va
> shifrlanmagan baza yuklanmaydi. Parol yaratish, secret qo'shish va
> `gpg --decrypt` bilan ochish: **`DB_MIGRATION.md`**.

### 10. Tashqi integratsiyalarni yangi domenga o'tkazish

- Telegram webhook'lari (auth va manager botlari uchun alohida) — buyruq
  namunasi `backend/.env.production.example` dagi Telegram bo'limida.
- Payme va Click kabinetlaridagi callback URL'lari.
- Google OAuth Console — "Authorized JavaScript origins" ga yangi domen.
- UptimeRobot monitorini `https://<domen>/api/health/` ga yo'naltiring.
- Sentry — yangi environment nomi (ixtiyoriy).

### 11. Render'ni to'xtatish

Hammasi bir necha kun barqaror ishlagach Render xizmatlarini **suspend** qiling
(darhol o'chirmang — orqaga qaytish yo'li ochiq qolsin), so'ng keyingi hisob
davridan oldin butunlay bekor qiling.

**Render bazasini o'chirishdan oldin:** `DB_MIGRATION.md` dagi ogohlantirishni
o'qing — eski connection string (parol bilan) git tarixida oshkor bo'lgan,
shuning uchun bazani o'chirish yoki parolni rotate qilish **shart**.

---

## Cloudflare va haqiqiy klient IP

Trafik `Browser → Cloudflare → nginx → Django` yo'lidan o'tadi. Cloudflare TCP
ulanishni o'zi ochadi, ya'ni maxsus sozlamasiz nginx uchun klient IP'si —
Cloudflare edge serverining IP'si. Bu ikki muammoni keltirardi:

- IP-bloklash (`moderation.BlockedIPMiddleware`) bitta buzg'unchini bloklaganda
  o'sha edge orqali kelgan yuzlab begunoh foydalanuvchini ham bloklardi;
- DRF throttling hammani bitta bucket'ga qo'shib, limitni ma'nosiz qilardi.

`nginx/nginx.conf` boshida `ngx_http_realip_module` sozlangan:
`set_real_ip_from` ro'yxatidagi (Cloudflare) manzillardan kelgan so'rovlarda
`CF-Connecting-IP` sarlavhasi ishonchli deb qabul qilinadi va `$remote_addr`
haqiqiy klient IP'siga o'rnatiladi.

**Cloudflare'dan voz kechsangiz ham xavfsiz:** boshqa manzildan (masalan
to'g'ridan-to'g'ri VPS IP'siga) kelgan so'rovda oraliqlar mos kelmaydi va
`CF-Connecting-IP` butunlay e'tiborsiz qoldiriladi — hujumchi bu sarlavhani
soxtalashtirib IP-bloklashni chetlab o'ta olmaydi.

`NUM_PROXIES=1` **o'zgarmaydi** (jismoniy zanjir ikki qatlam bo'lsa ham):
bu qiymat hop'lar soni emas, `X-Forwarded-For` oxiriga ishonchli proksi
qo'shgan elementlar soni. nginx bu sarlavhani butunlay qayta yozadi
(`X-Forwarded-For $remote_addr`), ya'ni Django aynan bitta, soxtalashtirib
bo'lmaydigan qiymat ko'radi. Batafsil izoh:
`backend/.env.production.example` → `NUM_PROXIES`.

### IP oraliqlarini yangilash

Cloudflare oraliqlarni vaqti-vaqti bilan o'zgartiradi. Oyiga bir marta:

```bash
cd /opt/olympy
bash deploy/update-cloudflare-ips.sh
```

Skript **hech narsani o'zgartirmaydi** — faqat taqqoslaydi va farq bo'lsa
tayyor blokni chop etadi. Farq topilsa:

1. `nginx/nginx.conf` dagi `CLOUDFLARE-IPS-BEGIN` / `CLOUDFLARE-IPS-END`
   markerlari orasini yangi blok bilan almashtiring (**lokal mashinada**,
   VPS'da emas);
2. commit + push;
3. VPS'da `bash scripts/deploy_contabo.sh`.

> VPS'da `nginx.conf` ni qo'lda tahrirlamang: fayl image ichiga **build
> vaqtida** ko'chiriladi (konteynerni restart qilish yetarli emas) va deploy
> skripti `git merge --ff-only` qiladi — lokal o'zgarish keyingi deploy'ni
> to'xtatib qo'yadi.

---

## Kundalik operatsiyalar

```bash
cd /opt/olympy

docker compose ps                     # holat
docker compose logs -f backend        # log'lar
docker compose restart backend        # qayta ishga tushirish

# Yangi kodni deploy qilish (git pull + build + migrate + restart):
bash scripts/deploy_contabo.sh

# Ixtiyoriy management buyrug'i:
docker compose run --rm backend python manage.py shell
docker compose run --rm backend python manage.py showmigrations

# Redis (parol bilan):
docker compose exec redis sh -c 'redis-cli --no-auth-warning -a "$REDIS_PASSWORD" info clients'

# Xavfsizlik holati:
ufw status verbose
fail2ban-client status sshd
sshd -T | grep -E '^(passwordauthentication|permitrootlogin|port) '
ls /var/run/reboot-required 2>/dev/null && echo "REBOOT KERAK"
bash deploy/update-cloudflare-ips.sh
```

## Orqaga qaytish (rollback)

DNS'ni Render manziliga qaytarish kifoya — Render xizmatlari suspend
holatidan qaytarilsa ishlaydi. Shu sababli Render'ni bir necha kun o'chirmang
va bu davrda ikkala bazani birdan yozmang (cutover paytida "read-only oyna"
yoki qisqa texnik tanaffus e'lon qiling).

SSH qattiqlashtirishni orqaga qaytarish:

```bash
rm /etc/ssh/sshd_config.d/00-olympy-hardening.conf
sshd -t && systemctl reload ssh
```

Firewall'ni o'chirish: `ufw disable`.

---

## Cutover checklist

Xavfsizlik va ishonchlilik uchun **majburiy** bandlar qalin.

- [ ] `backend/.env` to'liq (`CHANGE_ME` qolmagan)
- [ ] **`REDIS_PASSWORD` o'rnatilgan, `REDIS_URL`/`CELERY_BROKER_URL` parol bilan**
- [ ] Stack ko'tarilgan, `docker compose ps` — hammasi healthy
- [ ] **SSH kaliti ishlaydi (kalit bilan kirish sinovdan o'tgan)**
- [ ] **`bash deploy/harden_vps.sh` — ufw + fail2ban**
- [ ] **`bash deploy/harden_vps.sh --ssh-only` — parolli login o'chirilgan**
- [ ] **Yangi SSH sessiyasi ochilgan va ishlagan** (eski oyna yopilishidan oldin)
- [ ] unattended-upgrades faol (`deploy_contabo.sh` qiladi)
- [ ] Baza restore qilingan, `migrate --check` toza
- [ ] DNS ko'chirilgan
- [ ] **TLS sertifikati olingan, 443 bloki yoqilgan, HTTP → HTTPS 301**
- [ ] **`OLYMPY_SECURE_SSL_REDIRECT=1` va `OLYMPY_SECURE_HSTS_SECONDS=31536000`**
- [ ] **Certbot avtomatik yangilash cron'i o'rnatilgan va `--dry-run` sinovdan o'tgan**
- [ ] **Cloudflare SSL rejimi "Full (strict)"**, proxy qayta yoqilgan
- [ ] `curl -sI` bilan HSTS/CSP/X-Frame-Options tasdiqlangan (8a)
- [ ] DevTools'da JWT `sessionStorage`da YO'Q, HttpOnly cookie'da BOR (8b)
- [ ] Audit log'larda haqiqiy klient IP ko'rinadi, CF edge IP emas (8c)
- [ ] Login, olimpiada, sertifikat, to'lov, admin panel — hammasi ishlaydi
- [ ] **Kunlik backup cron'i ishlaydi**
- [ ] **Tashqi (rclone crypt) nusxa ishlaydi va restore SINAB KO'RILGAN**
- [ ] GitHub Actions `DB Backup` workflow o'chirilgan
- [ ] `BACKUP_PASSPHRASE` va rclone crypt parollari parol menejerida
- [ ] Telegram webhook, Payme/Click callback, Google OAuth origin yangilangan
- [ ] **Render DB paroli rotate qilingan yoki baza o'chirilgan** (git tarixida oshkor)
- [ ] Render xizmatlari suspend (bir necha kun o'chirmasdan)

## Bajarilishi kerak bo'lgan ishlar (TODO)

- [ ] Haqiqiy domen: `nginx/nginx.conf` dagi `server_name`, CSP va
      `backend/.env` dagi barcha `CHANGE_ME` qiymatlari.
- [ ] Render'dagi maxfiy kalitlarni `backend/.env` ga ko'chirish.
- [ ] Cloudinary'siz ishlanayotgan bo'lsa — media fayllarni ko'chirish rejasi
      (va `media_data` volume'ini backup rejasiga qo'shish — hozir faqat baza
      backup qilinadi).
- [ ] Monitoring: disk to'lishi va sertifikat muddati uchun ogohlantirish
      (UptimeRobot faqat `/api/health/` ni kuzatadi).
