# Olympy

> Online Olympiad & Educational Assessment Platform  
> Full-Stack Architecture: **Go 1.22 (Gin + GORM + SQLite)** + **React (Vite + Tailwind CSS)** + **In-Browser AI Proctoring (TensorFlow.js)**

---

## Key Features

- **Go REST API (`backend/`):** Modular architecture with Gin, GORM, SQLite persistence, role-based access control (`student`, `teacher`, `manager`, `owner`, `admin`), and background maintenance goroutines (`worker.go`).
- **Security & Auth:** JWT access/refresh token separation, Bcrypt password hashing, TOTP 2FA (`RFC 6238`), rate limiting, and webhook signature verification (Payme, Click, Telegram).
- **Assessment & Scoring:** Automatic scoring engine with percentage, CEFR (`A1`–`C2`), IELTS band mapping, question pagination, duplicate-submission prevention, and verifiable HTML certificates (`/api/certificates/verify/:uuid/`).
- **AI Proctoring (`src/proctoring/`):** Client-side face and voice monitoring running inside a dedicated Web Worker (`faceWorker.js`).
- **API Documentation:** Interactive Swagger UI at `/api/docs/` and OpenAPI spec at `/api/openapi.json`.

---

## Project Architecture

```text
Olympy/
├── backend/                     # Go 1.22 REST API
│   ├── cmd/api/                 # Server entrypoint, router, and HTTP integration tests
│   ├── internal/
│   │   ├── config/              # Env config loader (fail-closed JWT check in release mode)
│   │   ├── database/            # Auto-migration & initial demo seeding
│   │   ├── models/              # Domain models (Users, Centers, Olympiads, Attempts, Billing)
│   │   ├── handlers/            # REST endpoints, serializers, RBAC guards
│   │   ├── middleware/          # Auth, CORS (credentials-safe), IP rate limiter
│   │   ├── services/            # Scoring, OTP, Telegram, certificates, background worker
│   │   └── utils/               # Phone normalization (+998), JWT, bcrypt
│   ├── Dockerfile               # Pure Go static Alpine container build
│   └── go.mod & go.sum
├── pages/                       # React dashboards & exam views
├── src/                         # API client, proctoring monitors, Tailwind styles
├── nginx/                       # Production Nginx reverse proxy & security headers
├── scripts/                     # Build & Playwright smoke scripts
├── docker-compose.yml           # Full stack (Go backend + Nginx frontend)
├── render.yaml                  # Render Blueprint (Go web service + static site)
└── start_local.bat              # Windows local launcher
```

---

## Quick Start

### Prerequisites
- **Go 1.22+**
- **Node.js 20+**

### 1. Backend (Go)

```bash
cd backend
go mod download
go run ./cmd/api
```

- API base URL: `http://127.0.0.1:8000`
- Swagger Docs: `http://127.0.0.1:8000/api/docs/`
- On first startup, the SQLite database auto-migrates and seeds demo accounts (`+998901234567`/`admin123`, `+998902223344`/`owner123`, `+998901112233`/`teacher123`, `+998909998877`/`student123`).

### 2. Frontend (Vite + React)

```bash
npm install
npm run dev
```

- Frontend URL: `http://localhost:5173`

### Windows One-Click Launch
Double-click `start_local.bat` in the repository root to start both backend and frontend.

---

## Verification & Tests

```bash
# Backend static checks, unit & HTTP integration tests
cd backend
go vet ./...
CGO_ENABLED=0 go test -race -v ./...
CGO_ENABLED=0 go build -o /dev/null ./cmd/api

# Frontend production build
cd ..
npm ci
npm run build
```

---

## Docker Compose Deployment

```bash
docker compose up -d --build
```

Services started:
- `backend`: Statically compiled Go 1.22 API with persistent SQLite volume (`/app/data/olympy.db`)
- `nginx`: Built React static bundle + reverse proxy (`/api/*` -> `backend:8000`)

---

## License
Private proprietary software. All rights reserved.
