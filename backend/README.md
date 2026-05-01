# Olympy backend

Django REST Framework foundation for the Olympy online olimpiada platform.
Pairs with the existing `Olympy.html` frontend prototype but is otherwise
independent.

## Structure

```
backend/
├── manage.py
├── requirements.txt
├── olympy_api/         # project (settings, urls, wsgi/asgi)
├── accounts/           # custom User, phone normalization, auth
├── centers/            # EducationCenter + CenterMembership + approval flows
├── olympiads/          # Olympiad model, publish flow
├── questions/          # Question bank
├── attempts/           # TestAttempt + scoring + leaderboard
└── notifications/      # in-app + Telegram-mock service
```

## One-time setup

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python manage.py makemigrations
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

Use a 9-digit Uzbek phone like `901234567` when creating a superuser.

By default Django uses SQLite. To switch to PostgreSQL, set `OLYMPY_DB_ENGINE=postgres`
and the `OLYMPY_DB_*` env vars (see `olympy_api/settings.py`).

## API surface (matches frontend store)

| Method | Path                                          | Notes                                  |
| ------ | --------------------------------------------- | -------------------------------------- |
| POST   | `/api/auth/register/`                         | Phone is normalized, must be unique    |
| POST   | `/api/auth/login/`                            | Returns DRF token + user payload       |
| POST   | `/api/auth/phone/start-telegram-verification/` | Starts Telegram phone verification     |
| POST   | `/api/auth/phone/verify-otp/`                 | Verifies Telegram-delivered OTP        |
| POST   | `/api/telegram/webhook/`                      | Telegram bot webhook                   |
| GET    | `/api/me/`                                    | Auth required                          |
| GET    | `/api/centers/`                               | Public — approved centers only         |
| POST   | `/api/centers/`                               | Auth — creates *pending* center        |
| POST   | `/api/centers/{id}/join/`                     | Student requests membership            |
| POST   | `/api/centers/{id}/approve-student/`          | Owner / approved Manager only          |
| POST   | `/api/centers/{id}/approve-teacher/`          | Owner / approved Manager only          |
| POST   | `/api/centers/{id}/approve-manager/`          | Owner / Platform Admin                 |
| POST   | `/api/admin/centers/{id}/approve/`            | Platform Admin only                    |
| POST   | `/api/admin/centers/{id}/reject/`             | Platform Admin only                    |
| GET    | `/api/olympiads/`                             | Filtered by user's approved centers    |
| POST   | `/api/olympiads/`                             | Manager / Owner of target center       |
| POST   | `/api/olympiads/{id}/publish/`                | Notifies approved students             |
| GET    | `/api/questions/?center=<id>`                 | Center-scoped                          |
| POST   | `/api/questions/`                             | Approved teacher/manager/owner only    |
| POST   | `/api/attempts/`                              | Student submits answers; auto-scored   |
| GET    | `/api/results/me/`                            | Current user's attempt history         |
| GET    | `/api/leaderboard/?olympiad=<id>`             | Top scores                             |
| GET    | `/api/notifications/`                         | Bell list                              |
| POST   | `/api/notifications/{id}/read/`               | Mark read                              |
| POST   | `/api/notifications/read-all/`                | Mark all read                          |

## Business rules enforced

- Phone is normalized (`+998 90 123 45 67` ≡ `+998901234567`); unique per user.
- New centers are `pending` until Platform Admin approves.
- Students cannot participate until approved at the olympiad's center.
- Managers can only manage their own center (approved membership required).
- Owners can only manage their own center (after admin approval).
- Teachers / Managers / Owners can create questions only after approval.
- Olympiad publish notifies *only* approved students of the same center.

## Telegram phone verification

Environment variables:

```bash
TELEGRAM_BOT_TOKEN=123456:telegram-bot-token
TELEGRAM_BOT_USERNAME=your_bot_username
PHONE_VERIFICATION_OTP_TTL_SECONDS=300
PHONE_VERIFICATION_MAX_ATTEMPTS=5
```

Flow:

1. Website posts phone to `/api/auth/phone/start-telegram-verification/`.
2. Backend creates a `verify_token` and returns a Telegram deep link.
3. User opens the bot link; Telegram sends `/start <verify_token>` to `/api/telegram/webhook/`.
4. Backend binds `telegram_chat_id` only from that `/start <verify_token>` update.
5. User shares their Telegram contact.
6. Backend normalizes `contact.phone_number` and compares it with the website phone.
7. If the numbers match, backend sends an OTP to Telegram and stores only its hash.
8. Website posts phone + OTP to `/api/auth/phone/verify-otp/`.

Local development can leave `TELEGRAM_BOT_TOKEN` blank. In that mode, messages
are logged instead of sent to Telegram. For a real bot, expose the local backend
through a tunnel or deploy it, then set the webhook:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook?url=https://example.com/api/telegram/webhook/"
```

For local real-bot testing without a public webhook, run polling in a second
terminal while the Django server is running:

```bash
python manage.py telegram_polling
```

Other in-app notification helpers in `notifications/services.py` still log
Telegram-style messages for local development.

## Auth

For the prototype, DRF's `TokenAuthentication` is used. To migrate to JWT,
swap the auth class in `olympy_api/settings.py` for
`rest_framework_simplejwt.authentication.JWTAuthentication` and add
`/api/auth/token/` endpoints from `rest_framework_simplejwt.views`.
