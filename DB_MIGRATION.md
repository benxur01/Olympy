# Ma'lumotlar xavfsizligi va ko'chirish qo'llanmasi

## ⚠ SHOSHILINCH: eski parol repoda oshkor bo'lgan

Bu faylning avvalgi versiyasida Render bazasining **to'liq connection string'i
(parol bilan)** ochiq matnda yozilgan edi. Fayl tuzatildi, ammo **parol git
tarixida qoldi** (`3722f9c` commit) — repo'ga o'qish huquqi bor har kim uni
`git log -p` bilan ko'ra oladi. Tarixni qayta yozish (`git filter-repo`) ham
muammoni yechmaydi: qiymat allaqachon oshkor bo'lgan deb hisoblanishi kerak.

**Qilish kerak:** Render dashboard → PostgreSQL → parolni **rotate** qiling
(yoki Contabo'ga ko'chgach eski bazani butunlay o'chirib tashlang), so'ng
`DATABASE_URL_EXTERNAL` secret'ini yangi qiymat bilan almashtiring.

Qoida: connection string, token va parollar **faqat** GitHub secret'lari yoki
`backend/.env` (gitignore'da) ichida yashaydi — hujjatlarda hech qachon.

---

## Avtomatik backup (GitHub Actions)

Har dushanba soat 02:00 UTC da backup olinadi, **GPG (AES-256) bilan
shifrlanadi** va GitHub artifact sifatida 90 kun saqlanadi.

Nega shifrlash shart: dump ichida foydalanuvchilarning ismlari, telefon
raqamlari, email manzillari va parol xeshlari bor. Artifact'ni repo'ga o'qish
huquqi bor har qanday hamkor yoki `actions:read` scope'li token yuklab olishi
mumkin.

### Bir marta sozlash — 2 ta secret kerak

GitHub → Olympy repo → **Settings** → **Secrets and variables** → **Actions**
→ **New repository secret**:

| Secret | Qiymat |
|---|---|
| `DATABASE_URL_EXTERNAL` | Bazaning **tashqi** connection URL'i |
| `BACKUP_PASSPHRASE` | Shifrlash paroli — **o'zingiz yaratasiz va yo'qotmaysiz** |

Parol yaratish:

```bash
openssl rand -base64 48
```

> **`BACKUP_PASSPHRASE` ni parol menejerida saqlang.** Bu parol yo'qolsa
> **birorta ham backup ochilmaydi** — na GitHub'da, na boshqa joyda zaxira
> nusxasi bor. Minimum uzunlik 20 belgi (workflow tekshiradi va rad etadi).

**Fail-closed:** `BACKUP_PASSPHRASE` o'rnatilmagan bo'lsa workflow **birinchi
qadamda** aniq xato bilan to'xtaydi va `pg_dump` umuman ishga tushmaydi.
Shifrlanmagan dump artifact'ga hech qachon tushmaydi: pg_dump natijasi
to'g'ridan-to'g'ri quvur orqali gpg'ga uzatiladi, ya'ni ochiq `.dump` fayl
runner diskida **paydo bo'lmaydi**.

### Backup'ni yuklab olish va ochish

1. GitHub → **Actions** → **DB Backup (Haftalik)** → kerakli run →
   **Artifacts** → zip'ni yuklab oling va oching. Ichida bitta fayl:
   `backup_YYYYMMDD_HHMMSS.dump.gpg`
2. Shifrni ochish (parol interaktiv so'raladi):

```bash
gpg --output backup.dump --decrypt backup_20260810_020000.dump.gpg
```

3. Restore:

```bash
./scripts/db_restore.sh backup.dump 'postgresql://user:parol@host:5432/dbname'
```

Skript ichida (parol so'ramasdan) ochish:

```bash
gpg --batch --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" \
    --output backup.dump --decrypt backup_20260810_020000.dump.gpg
```

> Flaglar `--decrypt` dan **OLDIN** yozilishi kerak — undan keyingi har qanday
> so'zni gpg fayl nomi deb qabul qiladi.

Har bir backup workflow ichida avtomatik tekshiriladi: shifri ochiladimi va
`pg_restore --list` dump tarkibini o'qiy oladimi. Ya'ni "ochilmaydigan backup"
holati haftalar davomida sezilmasdan qolmaydi.

---

## ⚠ Contabo'ga ko'chgandan keyin bu workflow ISHLAMAYDI

Yangi VPS'da Postgres **faqat 127.0.0.1** da tinglaydi (`docker-compose.yml`),
ya'ni GitHub Actions runner'i unga umuman ulanolmaydi. Cutover'dan keyin:

- haftalik GitHub backup **eskirgan Render bazasidan** nusxa olishda davom
  etadi (foydasiz), Render o'chirilgach esa butunlay yiqiladi;
- backup VPS'ning O'ZIDA cron bilan olinadi va **tashqi joyga** ko'chiriladi.

To'liq tartib: `deploy/README.md` → **"Backup: VPS + tashqi nusxa (MAJBURIY)"**.
O'sha bosqichda bu workflow'ni o'chirib qo'ying (GitHub → Actions → DB Backup →
`···` → Disable workflow).

---

## Qo'lda backup olish (lokal yoki VPS'da)

```bash
# pg_dump o'rnatilmagan bo'lsa:
sudo apt-get install postgresql-client

./scripts/db_backup.sh 'postgresql://user:parol@host:5432/dbname'
```

Backup `backups/` papkasiga saqlanadi (`.gitignore` da — GitHub'ga chiqmaydi).
Skript 14 kundan eski dump'larni avtomatik o'chiradi
(`BACKUP_RETENTION_DAYS` bilan o'zgartiriladi).

> `scripts/db_backup.sh` fayllarni **shifrlamaydi** — ular serverdan
> chiqmaydi degan taxminda yozilgan. Tashqi joyga (S3/Backblaze) yuborishdan
> oldin shifrlash SHART: `deploy/README.md` dagi rclone retseptida shu sababdan
> `crypt` remote ishlatilgan.

---

## Yangi DB yoki serverga ko'chirish

### 1-qadam: Avval backup oling
```bash
./scripts/db_backup.sh 'postgresql://...'
```

### 2-qadam: Yangi DB yarating
- **Contabo VPS (hozirgi reja):** `docker-compose.yml` dagi `postgres` xizmati
  bazani birinchi ishga tushishda o'zi yaratadi — `deploy/README.md` ga qarang.
- **Boshqa:** Railway, Supabase, boshqa VPS — connection string oling.

### 3-qadam: Restore qiling
```bash
./scripts/db_restore.sh backups/backup_YYYYMMDD_HHMMSS.dump 'yangi_db_url'
```

### 4-qadam: Ilovada DATABASE_URL ni yangilang
- **Contabo:** `backend/.env` → `DATABASE_URL` → so'ng
  `docker compose up -d --force-recreate backend celery-worker celery-beat`
- **Render:** dashboard → **olympy-api** → **Environment** → `DATABASE_URL` →
  **Save** (avtomatik qayta deploy bo'ladi)

---

## MUHIM qoidalar

| Holat | Nima qilish kerak |
|-------|-------------------|
| DB plan yoki server o'zgartirish | **Oldin backup oling** — plan o'zgarsa yangi instance yaratiladi |
| Yangi serverga o'tish | **Oldin backup oling** |
| Har haftada | Avtomatik backup (cutover'dan keyin — VPS cron'i) |
| Har oyda | Backup'ni **haqiqatan restore qilib** sinab ko'ring, faqat mavjudligini tekshirish yetarli emas |
| `BACKUP_PASSPHRASE` | Parol menejerida saqlanadi; yo'qolsa barcha shifrlangan backup yaroqsiz |

---

## Fayllar

| Fayl | Maqsad |
|------|--------|
| `scripts/db_backup.sh` | Lokal/VPS backup skripti (shifrlamaydi) |
| `scripts/db_restore.sh` | Restore skripti |
| `.github/workflows/db_backup.yml` | Haftalik backup + GPG shifrlash (cutover'dan keyin o'chiriladi) |
| `deploy/README.md` | Contabo cutover, backup va qattiqlashtirish checklist'lari |
| `backups/` | Lokal backup fayllar (`.gitignore` da) |
