# Admin panel + Tailscale

The **Admin Console** in `/app.html` calls `/api/admin/*`. When `ADMIN_REQUIRE_TAILSCALE=true`, those routes reject requests that are not from your tailnet.

## What is allowed

| Source | Allowed |
|--------|---------|
| Tailscale IP (`100.64.0.0/10`) | Yes |
| `Tailscale-User-Login` header (Tailscale Serve) | Yes |
| `127.0.0.1` / `localhost` if `ADMIN_TAILSCALE_ALLOW_LOCAL=true` | Yes (local dev) |
| Public internet | **403** `TAILSCALE_REQUIRED` |

Customer and operator routes are **not** Tailscale-gated — only admin API.

## Local workflow

```bash
npm run local:setup
npm run local:bootstrap

# Terminal 1
npm run local:start-tailscale

# Terminal 2
npm run local:tailscale
```

Sign in as admin at the **HTTPS Tailscale URL** printed by `local:tailscale`.

On `localhost`, admin still works if `ADMIN_TAILSCALE_ALLOW_LOCAL=true` (default in `local/.env.local.example`).

## Production (Hostinger)

In `.env` on the server:

```env
ADMIN_REQUIRE_TAILSCALE=true
ADMIN_TAILSCALE_ALLOW_LOCAL=false
TRUST_PROXY=true
```

On the same machine:

```bash
tailscale serve --bg --https=443 http://127.0.0.1:3000
```

Access admin only via `https://your-server.tailnet-name.ts.net/app.html`.

## Implementation

- Middleware: `src/tailscale.js` → `requireTailscale` on `/api/admin` in `src/api.js`
- Scripts: `scripts/local/tailscale-serve.sh`, `start-tailscale.sh` (no changes to main `scripts/seed.js`, etc.)
