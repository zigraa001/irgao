# Local development

Self-contained local testing using Docker MySQL. **Does not change** the main scripts in `scripts/` — wrappers live in `scripts/local/`.

## Quick start

```bash
npm run local:setup      # MySQL + .env + schema + aircraft seed
npm run local:bootstrap  # first admin from local/.env.local
npm run local:start      # server → http://localhost:3002/app.html
```

### Admin panel via Tailscale

The admin API (`/api/admin/*`) can be restricted to your tailnet:

```bash
# Terminal 1 — server with Tailscale gate (local/.env.local)
npm run local:start-tailscale

# Terminal 2 — HTTPS on your tailnet
npm run local:tailscale
# Open the printed https://<machine>.ts.net/app.html
```

| Variable | Purpose |
|----------|---------|
| `ADMIN_REQUIRE_TAILSCALE=true` | Block admin API from the public internet |
| `ADMIN_TAILSCALE_ALLOW_LOCAL=true` | Still allow admin on `localhost` while devving |
| `TRUST_PROXY=true` | Trust `X-Forwarded-For` from `tailscale serve` |

Stop Tailscale Serve: `npm run local:tailscale-stop`

See [local/TAILSCALE.md](TAILSCALE.md) for details.

## Layout

```
local/
  docker-compose.yml     # MySQL on port 3307
  .env.local.example     # copy → .env.local
  sql/
    reset.sql            # wipe data for fresh auth tests
    docker-init/         # first-run SQL for Docker
scripts/local/
  setup.sh, start.sh, …  # wrappers only
```

## Commands

| npm script | What it does |
|------------|--------------|
| `local:mysql-up` | Start Docker MySQL |
| `local:mysql-down` | Stop Docker MySQL |
| `local:setup` | Full first-time setup |
| `local:init` | Create tables only |
| `local:seed` | Aircraft sample data only |
| `local:bootstrap` | Create admin from ADMIN_PASSWORD |
| `local:reset` | Run `local/sql/reset.sql` |
| `local:start` | Start server with local env |

## Pure auth (no demo users)

- **Admin:** `local:bootstrap` after setting `ADMIN_PASSWORD` in `local/.env.local`
- **Customers:** register on `/app.html` with OTP
- **Staff:** admin dashboard → Add Team Member
