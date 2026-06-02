# Ma'lumotlar xavfsizligi va ko'chirish qo'llanmasi

## Avtomatik backup (GitHub Actions)

Har dushanba soat 02:00 UTC da avtomatik backup olinadi va GitHub'da 90 kun saqlanadi.

**Bir marta sozlash kerak:**
1. GitHub → Olympy repo → **Settings** → **Secrets and variables** → **Actions**
2. **New repository secret** → ism: `DATABASE_URL_EXTERNAL`
3. Qiymat:
   ```
   postgresql://olympy:0hhYOTZcxjLG1badV5W8oKNMUik0NbWJ@dpg-d8fd738g4nts738rhe60-a.ohio-postgres.render.com:5432/olympy
   ```

**Backupni qo'lda yuklab olish:**
GitHub → Olympy repo → **Actions** → **DB Backup** → kerakli run → **Artifacts**

---

## Qo'lda backup olish (lokal)

```bash
# pg_dump o'rnatilmagan bo'lsa:
sudo apt-get install postgresql-client

# Backup olish (Render DB ga tashqaridan ulanadi)
./scripts/db_backup.sh
```

Backup `backups/` papkasiga saqlanadi (GitHubga chiqmaydi).

---

## Yangi DB yoki serverga ko'chirish

### 1-qadam: Avval backup oling
```bash
./scripts/db_backup.sh
```

### 2-qadam: Yangi DB yarating
- **Render:** dashboard.render.com → New → PostgreSQL → External Database URL ni oling
- **Boshqa:** Railway, Supabase, VPS — connection string oling

### 3-qadam: Restore qiling
```bash
./scripts/db_restore.sh backups/backup_YYYYMMDD_HHMMSS.dump 'yangi_db_url'
```

### 4-qadam: Render'da DATABASE_URL ni yangilang
Render dashboard → **olympy-api** → **Environment** → `DATABASE_URL` → yangi URL ni kiriting → **Save**

### 5-qadam: Deploy
Render avtomatik qayta deploy qiladi. Tayyor!

---

## MUHIM qoidalar

| Holat | Nima qilish kerak |
|-------|-------------------|
| Render DB plan o'zgartirish | **Oldin backup oling** — plan o'zgartirsa yangi instance yaratiladi |
| Yangi serverga o'tish | **Oldin backup oling** |
| Har haftada | Avtomatik GitHub Actions backup ishlaydi |
| Har oyda | Eski backup fayllarni tekshirib turing |

---

## Fayllar

| Fayl | Maqsad |
|------|--------|
| `scripts/db_backup.sh` | Lokal backup skripti |
| `scripts/db_restore.sh` | Restore skripti |
| `backend/.env.external` | Render DB tashqi connection URL (GitHubga chiqmaydi) |
| `.github/workflows/db_backup.yml` | Haftalik avtomatik backup |
| `backups/` | Lokal backup fayllar (GitHubga chiqmaydi) |
