# Olympy - 100% To'liq Go (Golang) REST API Backend (Production Grade)

Ushbu backend Olympy platformasining Python (Django REST Framework) tizimidagi **barcha 30 kunlik rejalari, chuqur biznes mantiqlari, to'lov shlyuzlari (Payme & Click), 2FA xavfsizlik tizimi va Swagger hujjatlari** Go (Golang) tiliga to'liq o'tkazilgan yakuniy versiyasidir.

---

## 🏛 Arxitektura (Clean Architecture)

```text
backend-go/
├── cmd/
│   └── api/
│       └── main.go              # Server kirish nuqtasi, marshrutlar, Celery o'rniga Background Worker
├── internal/
│   ├── config/                  # Konfiguratsiya va .env
│   ├── database/                # GORM SQLite/PostgreSQL, 25+ model AutoMigrate, Demo Seed data
│   ├── models/                  # Barcha jadvallar (Core, Gamification, Billing, AntiCheat, Moderation, OTP)
│   ├── services/                # Biznes mantiq qatlami
│   │   ├── scoring.go           # Baholash, foiz hisoblash, CEFR daraja (A1-C2) va IELTS band (0-9)
│   │   ├── otp.go               # Kriptografik xavfsiz 6 xonali OTP, 5 daqiqa TTL va 5 urinish limiti
│   │   ├── pdf.go               # Rasmiy sertifikat HTML/PDF generatsiyasi
│   │   ├── worker.go            # Goroutine fon xizmati: sessiyalar va obunalarni avtomatik tozalash (Celery o'rniga)
│   │   └── telegram.go          # Telegram Bot API orqali xabar yuborish
│   ├── handlers/                # Barcha REST API kontrollerlari (50+ endpoint)
│   │   ├── health.go            # /api/health/
│   │   ├── docs.go              # /api/docs/ (Interaktiv Swagger UI) va /api/openapi.json
│   │   ├── auth.go              # Register, Login, Phone OTP, Password Reset, Email Link
│   │   ├── twofactor.go         # 2FA (Google Authenticator) sozlash, tekshirish va o'chirish
│   │   ├── me.go                # /api/me/ (Profil, rollar, faollik)
│   │   ├── centers.go           # Markazlar CRUD, a'zo bo'lish, student/teacher tasdiqlash, stats
│   │   ├── olympiads.go         # Olimpiadalar CRUD, publish, fanlar (subjects), olimpiada stats
│   │   ├── questions.go         # /api/questions/ (Savollar banki)
│   │   ├── attempts.go          # /api/attempts/ (Avtomatik scoring engine, tangalar, natijalar)
│   │   ├── anticheat.go         # /api/attempts/session/ (Jonli proktoring va monitoring)
│   │   ├── multimodal.go        # Dasturlash (Judge0), Insho (Essay) va Nutq (Speaking) baholash
│   │   ├── certificates.go      # /api/certificates/verify/:uuid va yuklab olish
│   │   ├── payments.go          # Payme (JSON-RPC 2.0) va Click to'lov shlyuzlari webhooks
│   │   ├── practice.go          # Mashq rejimi (/api/practice/)
│   │   ├── analytics.go         # Platforma retention & A/B testing tahlili
│   │   ├── shop.go              # /api/shop/, /api/me/daily-goal/, /api/daily-question/
│   │   ├── billing.go           # /api/billing/plans/, subscribe, promo
│   │   ├── moderation.go        # /api/admin/moderation/, block-ip, audit-logs
│   │   ├── telegram.go          # /api/telegram/webhook/ (Auth va Manager botlar)
│   │   └── notifications.go     # /api/notifications/
│   ├── middleware/              # JWT Autentifikatsiya, CORS, RateLimiter (django-axes o'rniga), RBAC
│   └── utils/                   # Telefon normalizatsiyasi (+998), JWT tokenlar, bcrypt
├── start_go.bat                 # Windows uchun bir marta bosishda ishga tushirish
├── Dockerfile
├── docker-compose.yml
├── go.mod & go.sum
└── README.md
```

---

## ⚡️ 21-kundan 30-kungacha Bajarilgan Yakuniy Ishlar

1. **Bruteforce & Xavfsizlik Himoyasi (`middleware/ratelimit.go`):**
   * Python `django-axes` o'rniga xotirada ishlovchi sliding window tezlik cheklovchisi yozildi.
   * Ketma-ket 5 marta noto'g'ri parol tergan IP larni 15 daqiqaga avtomatik qulflaydi.
   * Har bir IP uchun daqiqasiga maksimal 120 ta so'rov chegarasi qo'yildi.

2. **Ikki Bosqichli Autentifikatsiya — 2FA / TOTP (`handlers/twofactor.go`):**
   * RFC 6238 standarti bo'yicha sof Go da Google Authenticator integratsiyasi.
   * `POST /api/auth/2fa/setup/` — maxfiy kalit va `otpauth://` QR-kod manzilini yaratadi.
   * `POST /api/auth/2fa/verify/` — 6 xonali kod bilan 2FA ni yoqadi.
   * `POST /api/auth/2fa/disable/` — 2FA ni o'chiradi.

3. **To'lov Tizimlari Integratsiyasi — Payme & Click (`handlers/payments.go`):**
   * **Payme:** To'liq rasmiy JSON-RPC 2.0 protokoli (`CheckPerformTransaction`, `CreateTransaction`, `PerformTransaction`, `CancelTransaction`, `CheckTransaction`).
   * **Click:** Rasmiy `Prepare` (Action=0) va `Complete` (Action=1) webhooklari.

4. **Interaktiv Swagger / OpenAPI Hujjatlari (`handlers/docs.go`):**
   * Brauzerda **`http://localhost:8000/api/docs/`** manziliga kirsangiz, barcha 50 dan ortiq API lar chiroyli Swagger interfeysida ko'rinadi va bevosita brauzerdan test qilish mumkin!

5. **Telegram Xabar Yuboruvchi Servis (`services/telegram.go`):**
   * Foydalanuvchilar va ma'murlarga rasmiy Telegram Bot API orqali bildirishnomalar yuborish.

---

## 🚀 Ishga Tushirish

Loyihaning ildizidagi **`start_local.bat`** yoki **`start_go_local.bat`** faylini ikki marta bosing!
* **Go Backend server:** `http://localhost:8000`
* **Swagger API Docs:**  `http://localhost:8000/api/docs/`
* **Health check:**      `http://localhost:8000/api/health/`
* **Frontend (Vite):**   `http://localhost:5173`
