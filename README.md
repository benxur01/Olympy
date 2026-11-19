# Olympy 🏆

> **High-Performance Online Olympiad & Educational Assessment Platform**  
> Modern Full-Stack Architecture: **Go 1.22 (REST API)** + **React 18 (Vite & Tailwind CSS)** + **AI Anti-Cheat (TensorFlow.js)**.

---

## 🌟 Key Features

- **⚡ High-Performance Go Backend:** Clean Architecture using Go 1.22, Gin Web Framework, GORM ORM, and pure Go SQLite / PostgreSQL support.
- **🛡️ Real-Time Anti-Cheat (AI Proctoring):** In-browser face-mesh & voice monitoring running in a dedicated Web Worker (`faceWorker.js`) without freezing the UI.
- **🎯 Multimodal Testing:**
  - Automated coding problem evaluation via **Judge0 API**.
  - **Speaking** audio submission & scoring.
  - **Listening** with single-play audio constraints.
  - **Essay** submission and structured rubric grading.
  - **CEFR (A1–C2)** and **IELTS (0–9)** standardized scoring scales.
- **💳 Payment Gateways:** Native support for Uzbekistan's leading payment gateways:
  - **Payme:** Full JSON-RPC 2.0 Webhook implementation.
  - **Click:** Complete Prepare & Complete transaction cycle.
- **🔐 Enterprise Security:**
  - JWT Authentication + Bcrypt password hashing.
  - 6-digit cryptographic SMS OTP verification (5-minute TTL).
  - Two-Factor Authentication (**2FA TOTP RFC 6238**) with Google Authenticator.
  - Token-bucket Rate Limiter per IP/route.
- **📜 QR-Coded Certificates:** Instant PDF & HTML verifiable digital certificates with SHA-256 verification hashes.
- **🔄 Goroutines Background Worker:** Lightweight asynchronous workers replacing Celery/Redis for test auto-submission, streak updates, and database maintenance.
- **📚 Interactive API Docs:** Built-in Swagger UI available at `/api/docs/` and OpenAPI 3.0 specification at `/api/openapi.json`.

---

## 🏛 Project Architecture

```text
Olympy/
├── backend/                     # 100% Go (Golang) REST API
│   ├── cmd/api/main.go          # Application entrypoint & routes definition
│   ├── internal/
│   │   ├── config/              # Environment & config loader
│   │   ├── database/            # GORM database connection & seed data
│   │   ├── models/              # 25+ database models (User, Attempt, Question...)
│   │   ├── handlers/            # REST API controllers (Auth, Payments, Tests...)
│   │   ├── services/            # Scoring, OTP, PDF, Background Worker, Telegram
│   │   ├── middleware/          # JWT, CORS, Rate Limiting, RBAC
│   │   └── utils/               # Uzbek phone normalization, tokens, crypto
│   ├── go.mod & go.sum          # Go modules
│   └── Dockerfile               # Multi-stage lightweight Alpine build
├── pages/                       # React user-facing dashboards & pages
│   ├── AdminDashboard.jsx       # SuperAdmin management panel
│   ├── OlympiadTest.jsx         # Live test taking engine with timer & anti-cheat
│   ├── CodeEditor.jsx           # Online CodeMirror coding environment
│   ├── QuestionCreator.jsx      # Advanced multimodal question editor
│   ├── Results.jsx              # Score breakdown, CEFR/IELTS analytics
│   └── ...                      # Student, Teacher, Owner dashboards
├── src/                         # Frontend core & AI proctoring
│   ├── proctoring/              # TensorFlow.js face/voice AI monitors & Web Worker
│   ├── services/api.js          # Unified HTTP client with automatic JWT handling
│   └── index.css                # Tailwind CSS design system
├── public/                      # Static assets, PWA manifest & AI models
├── nginx/                       # Production Nginx reverse proxy configuration
├── deploy/                      # VPS hardening & Cloudflare sync scripts
├── docker-compose.yml           # Complete containerized production stack
└── start_local.bat              # One-click local start for Windows
```

---

## 🚀 Quick Start Guide

### Prerequisites
- **Go 1.22+**
- **Node.js 18+** & npm

---

### 1. Backend Setup (Go)

```bash
# Navigate to backend directory
cd backend

# Copy environment variables
cp .env.example .env

# Run the server directly
go run cmd/api/main.go
```
> The Go backend will start at: **http://localhost:8000**  
> Database auto-migrates and seeds initial demo data automatically on first launch.

---

### 2. Frontend Setup (React / Vite)

```bash
# In the project root directory
npm install

# Start the development server
npm run dev
```
> The frontend application will run at: **http://localhost:5173**

---

### ⚡ One-Click Start (Windows)
Double-click `start_local.bat` in the project root to launch both the Go backend and React frontend simultaneously in separate terminals.

---

## 📖 API Documentation (Swagger)

When the backend is running, explore and test the 50+ REST API endpoints interactively:

- **Swagger UI:** [http://localhost:8000/api/docs/](http://localhost:8000/api/docs/)
- **OpenAPI JSON Spec:** [http://localhost:8000/api/openapi.json](http://localhost:8000/api/openapi.json)

---

## 🐳 Production Deployment (Docker Compose)

Deploy the entire stack with a single command:

```bash
# Build and start all services in background
docker compose up -d
```

Included containers:
- `backend`: Go API container
- `nginx`: High-performance static asset server & reverse proxy
- `postgres`: Production relational database
- `redis`: High-speed caching layer

---

## 📄 License
Private proprietary software. All rights reserved.
