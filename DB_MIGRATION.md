# DB yoki Server ko'chirish qo'llanmasi

## Qachon backup olish SHART

- Render DB plan o'zgartirishdan **oldin**
- Yangi serverga ko'chirishdan **oldin**
- Har hafta (muntazam)

---

## 1. Backup olish

```bash
# Render DB URL ni backend/.env dan o'qib backup oladi
./scripts/db_backup.sh

# Yoki DATABASE_URL ni to'g'ridan-to'g'ri bering
./scripts/db_backup.sh 'postgresql://user:pass@host:5432/dbname'
```

Backup `backups/` papkasiga `backup_YYYYMMDD_HHMMSS.dump` formatida saqlanadi.

---

## 2. Yangi DB ga ko'chirish

### Render'da yangi DB yaratish (agar kerak bo'lsa)

1. [dashboard.render.com](https://dashboard.render.com) → **New** → **PostgreSQL**
2. Yangi DB ning `Internal Database URL` ni ko'chiring

### Restore qilish

```bash
./scripts/db_restore.sh backups/backup_20260602_120000.dump 'yangi_db_url'
```

### Render'da DATABASE_URL ni yangilash

```bash
# Render API orqali (API key kerak)
curl -X PUT https://api.render.com/v1/services/SERVICE_ID/env-vars \
  -H "Authorization: Bearer RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '[{"key":"DATABASE_URL","value":"yangi_db_url"}]'
```

Yoki Render dashboard → **olympy-api** → **Environment** → `DATABASE_URL` ni yangilang.

---

## 3. Boshqa serverga (masalan VPS, Railway, Supabase) ko'chirish

1. Yangi joyda PostgreSQL yarating va connection string oling
2. Backup oling (yuqoridagi 1-qadam)
3. Restore qiling (yuqoridagi 2-qadam)
4. Yangi serverda `DATABASE_URL` env var ni o'rnating
5. `python manage.py migrate --check` bilan tekshiring

---

## Muhim eslatmalar

- `pg_dump` va `pg_restore` o'rnatilgan bo'lishi kerak (`sudo apt install postgresql-client`)
- Render free tier DB **90 kun** dan keyin o'chadi — paid plan ishlatish tavsiya etiladi
- Render DB **plan o'zgartirsa yangi instance yaratadi** — backup olmasdan o'zgartirmang
- `backups/` papkasi `.gitignore` ga qo'shilgan — backup fayllar GitHubga chiqmaydi
