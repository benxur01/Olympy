# Olympy — Render → Contabo VPS ko'chirish

Bu katalog Docker Compose asosidagi self-hosted deploy uchun. Render'dagi
konfiguratsiya (`render.yaml`, `backend/render_build.sh`, `backend/render_start.sh`)
**o'zgartirilmagan** — cutover kunigacha Render ishlashda davom etadi.

## Stack

| Xizmat | Image | Vazifasi |
|---|---|---|
| `postgres` | postgres:16-alpine | Ma'lumotlar bazasi (`postgres_data` volume) |
| `redis` | redis:7-alpine | Celery broker + result + Django cache (`redis_data`) |
| `backend` | `backend/Dockerfile` | Gunicorn (Django API), port faqat ichkarida |
| `celery-worker` | (aynan shu image) | Fon task'lari |
| `celery-beat` | (aynan shu image) | Davriy jadval (DatabaseScheduler) |
| `nginx` | `nginx/Dockerfile` | Frontend `dist/` + reverse proxy, 80/443 |

Render'da Celery web jarayoni ichida (`worker -B`) ishlardi; Compose'da uchtasi
ham **alohida konteyner** — beat aynan bitta nusxada bo'lishi shart.

Fayllar:

```
backend/Dockerfile              # web + worker + beat uchun yagona image
backend/docker-entrypoint.sh    # web | worker | beat | release
backend/.env.production.example # muhit o'zgaruvchilari namunasi
docker-compose.yml              # butun stack
nginx/Dockerfile                # Vite build (1-bosqich) + nginx (2-bosqich)
nginx/nginx.conf                # reverse proxy + statik + TLS uchun izohlar
scripts/deploy_contabo.sh       # VPS bootstrap (idempotent)
```

## Talablar

- Ubuntu 22.04 / 24.04 LTS (Contabo default), minimum 4GB RAM tavsiya etiladi
  (Postgres + Redis + 2 gunicorn worker + Celery + frontend build).
- Domen va uning DNS boshqaruvi.
- Render'dagi barcha maxfiy kalitlar (dashboard → Environment).

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

Skript nima qiladi: Docker o'rnatadi → repo'ni klon qiladi → image'larni build
qiladi → postgres/redis ni ko'taradi → bir martalik `release` qadamini
(migrate + collectstatic + `ensure_*`) bajaradi → butun stack'ni ishga tushiradi.

### 2. Render bazasidan dump olish

Mavjud skript ishlatiladi (qayta yozilmagan):

```bash
cd /opt/olympy
./scripts/db_backup.sh 'postgresql://<render_external_database_url>'
# → backups/backup_YYYYMMDD_HHMMSS.dump
```

> Render'ning **external** (tashqi) DATABASE_URL'ini oling — internal manzil
> faqat Render tarmog'i ichida ishlaydi.

### 3. Yangi Postgres'ga restore

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

### 4. Smoke-test (DNS'gacha, IP orqali)

```bash
curl -s http://<VPS_IP>/api/health/          # {"status": "ok"}
curl -sI http://<VPS_IP>/                    # 200, index.html
docker compose ps                            # hammasi Up / healthy
docker compose logs --tail=50 celery-worker  # xatosiz ishga tushgan
```

Brauzerda `http://<VPS_IP>` — landing sahifasi ochilishi kerak.

> **LOGIN bu bosqichda ISHLAMAYDI va bu normal.** Production rejimida auth
> cookie'lari `Secure` bayrog'i bilan yuboriladi, brauzer esa ularni oddiy HTTP
> ustidan saqlamaydi. To'liq login testi TLS o'rnatilgandan keyin (6-qadam).

### 5. DNS'ni ko'chirish

Domen A yozuvini VPS IP'siga yo'naltiring. TTL'ni bir kun oldin 300s ga
tushirib qo'ying — orqaga qaytish tez bo'ladi.

### 6. TLS (Let's Encrypt)

DNS tarqalgach — buyruqlar `nginx/nginx.conf` faylining oxirida izoh sifatida
yozilgan (certbot webroot, 443 blokini yoqish, avtomatik yangilash cron'i).
Sertifikat o'rnatilgach `backend/.env` da:

```
OLYMPY_SECURE_SSL_REDIRECT=1
OLYMPY_SECURE_HSTS_SECONDS=31536000
```

```bash
docker compose up -d --force-recreate backend celery-worker celery-beat
```

Endi to'liq testni bajaring: login, olimpiada boshlash, natijalar, sertifikat
yuklab olish, admin panel (`/olympy-mgmt-2025/`).

### 7. Tashqi integratsiyalarni yangi domenga o'tkazish

- Telegram webhook'lari (auth va manager botlari uchun alohida) — buyruq
  namunasi `backend/.env.production.example` dagi Telegram bo'limida.
- Payme va Click kabinetlaridagi callback URL'lari.
- Google OAuth Console — "Authorized JavaScript origins" ga yangi domen.
- UptimeRobot monitorini `https://<domen>/api/health/` ga yo'naltiring.
- Sentry — yangi environment nomi (ixtiyoriy).

### 8. Render'ni to'xtatish

Hammasi bir necha kun barqaror ishlagach Render xizmatlarini **suspend** qiling
(darhol o'chirmang — orqaga qaytish yo'li ochiq qolsin), so'ng keyingi hisob
davridan oldin butunlay bekor qiling.

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

# Kunlik backup (cron misoli — 14 kundan eski dump'lar avtomatik o'chadi):
0 2 * * * cd /opt/olympy && ./scripts/db_backup.sh 'postgresql://olympy:PAROL@127.0.0.1:5432/olympy' >> /var/log/olympy-backup.log 2>&1
```

> Backup'lar VPS'ning O'ZIDA saqlanadi — diskning o'zi nosoz bo'lsa ular ham
> yo'qoladi. `backups/` katalogini tashqi joyga (S3/Backblaze yoki boshqa
> server) ko'chirishni rejalashtiring.

## Orqaga qaytish (rollback)

DNS'ni Render manziliga qaytarish kifoya — Render xizmatlari suspend
holatidan qaytarilsa ishlaydi. Shu sababli Render'ni bir necha kun o'chirmang
va bu davrda ikkala bazani birdan yozmang (cutover paytida "read-only oyna"
yoki qisqa texnik tanaffus e'lon qiling).

## Bajarilishi kerak bo'lgan ishlar (TODO)

- [ ] Haqiqiy domen: `nginx/nginx.conf` dagi `server_name`, CSP va
      `backend/.env` dagi barcha `CHANGE_ME` qiymatlari.
- [ ] Render'dagi maxfiy kalitlarni `backend/.env` ga ko'chirish.
- [ ] TLS sertifikati va `OLYMPY_SECURE_SSL_REDIRECT=1`.
- [ ] Backup'larni VPS'dan tashqariga chiqarish.
- [ ] Cloudinary'siz ishlanayotgan bo'lsa — media fayllarni ko'chirish rejasi.
