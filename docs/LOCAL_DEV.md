# Run IraGo locally

## First-time setup

```bash
cp .env.example .env
npm run env:gen          # generates AUTH_SECRET into .env

# Edit .env: DB_PASSWORD (or local Docker DB_*), ADMIN_PASSWORD, SMTP (required for OTP)

docker start irago-mysql   # or see Docker command below
npm run db:init
npm run db:seed            # aircraft only — no demo users
npm run admin:bootstrap    # first admin from ADMIN_USER + ADMIN_PASSWORD in .env
npm start
# → http://localhost:3002/app.html  (use PORT from .env if 3000 is busy)
```

## Local Docker MySQL

```bash
docker run -d --name irago-mysql \
  -e MYSQL_DATABASE=irago -e MYSQL_USER=irago -e MYSQL_PASSWORD=irago_local \
  -e MYSQL_ROOT_PASSWORD=root -p 3307:3306 mysql:8.0
```

```env
DB_HOST=127.0.0.1
DB_PORT=3307
DB_USER=irago
DB_PASSWORD=irago_local
DB_NAME=irago
PORT=3002
ADMIN_PASSWORD=your-strong-password-here
```

## Pure auth flow (no seeded users)

| How | Who |
|-----|-----|
| `npm run admin:bootstrap` | First admin (from `.env`) |
| `/app.html` → Register + OTP | Customers |
| Admin Console → Add Team Member | Operators & additional admins |
| Forgot password + OTP | Any role |

There is **no** `password123` demo seed.

## OTP locally

SMTP is **required**. OTP codes are **never** printed in the server terminal.

Use a real provider (Gmail app password, SendGrid, etc.) or a dev inbox like [Mailtrap](https://mailtrap.io):

```env
SMTP_HOST=sandbox.smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=your-mailtrap-user
SMTP_PASS=your-mailtrap-pass
```

If SMTP is missing or misconfigured, signup and password reset return a clear error — they do not silently succeed.

## Commands

| Script | Purpose |
|--------|---------|
| `npm run env:gen` | Create/update `.env` with random `AUTH_SECRET` |
| `npm run env:gen -- --rotate` | Replace existing `AUTH_SECRET` |
| `npm run db:init` | Create tables |
| `npm run db:seed` | Sample aircraft only |
| `npm run admin:bootstrap` | Create/update admin from env |
