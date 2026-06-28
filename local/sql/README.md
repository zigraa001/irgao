# Local SQL files

| File | Purpose |
|------|---------|
| `docker-init/01-grant.sql` | First-boot Docker MySQL grants (auto-run on new volume) |
| `reset.sql` | Truncate all tables — fresh auth testing |

Apply `reset.sql` manually:

```bash
npm run local:reset
```

Or:

```bash
docker exec -i irago-mysql-local mysql -uirago -pirago_local irago < local/sql/reset.sql
```

Schema is created by the app (`src/schema.js`) via `npm run db:init`, not from SQL files here.
