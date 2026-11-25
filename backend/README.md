# Olympy Go Backend API

Go 1.22 REST API built with Gin, GORM, and SQLite.

## Structure

```text
backend/
├── cmd/api/
│   ├── main.go              # Entrypoint and router setup
│   └── main_test.go         # HTTP router, auth, RBAC, and exam flow tests
├── internal/
│   ├── config/              # Environment configuration loader
│   ├── database/            # SQLite schema migration and seed helpers
│   ├── models/              # GORM models (Core, Billing, Gamification, AntiCheat, OTP)
│   ├── handlers/            # REST API controllers, RBAC helpers, and serializers
│   ├── middleware/          # JWT access verification, CORS, and IP rate limiting
│   ├── services/            # Scoring (CEFR/IELTS), OTP, HTML/PDF certificates, workers
│   └── utils/               # Uzbek phone normalization, bcrypt, and JWT signing
├── Dockerfile
├── docker-compose.yml
├── go.mod & go.sum
└── start_go.bat
```

## Development & Verification

```bash
cd backend
go mod verify
go vet ./...
CGO_ENABLED=0 go test -v ./...
go run ./cmd/api
```

- **Health Check:** `http://127.0.0.1:8000/api/health/`
- **Swagger UI:** `http://127.0.0.1:8000/api/docs/`
- **OpenAPI Spec:** `http://127.0.0.1:8000/api/openapi.json`
