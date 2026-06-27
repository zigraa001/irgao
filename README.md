# IraGo

AI-powered air mobility platform. Express + Prisma backend serving a static
single-page app (`app.html`) gated by user role (customer / operator / admin).

## Stack

- **Express** — serves the static site (`index.html`, `app.html`, assets) and
  the JSON API under `/api`.
- **Prisma** — data layer. The database engine is selected at runtime by env
  vars (MySQL on Hostinger for production, SQLite locally).
- **bcrypt** — one-way password hashing (added in the auth story).

## Project layout

```
server.js            Express entry point (static + /api)
src/db.js            Shared Prisma client singleton
src/api.js           /api router (health, plus future routes)
prisma/schema.prisma Prisma schema (datasource provider is swapped per env)
prisma/seed.js       Seeds sample users + aircraft
scripts/db-setup.js  Swaps the Prisma provider based on DATABASE_PROVIDER
.env.example         Documented env template (copy to .env)
```

## Data model

Defined in `prisma/schema.prisma`:

- **User** — `id, name, email (unique), passwordHash, role, createdAt, updatedAt`.
  `role` is one of `customer` | `operator` | `admin`.
- **Aircraft** — `id, name (tail number), model, status, capacity, timestamps`.
  `status` is one of `available` | `in_flight` | `maintenance`.
- **Booking** — `id, customerId →User, pickup{Name,Lat,Lng}, dest{Name,Lat,Lng},
  service, distanceKm, fareEstimate, status, operatorId? →User, aircraftId? →Aircraft,
  timestamps`. `status` is one of `requested` | `assigned` | `accepted` |
  `rejected` | `enroute` | `picked_up` | `flying` | `arrived` | `completed` |
  `cancelled`.

> **Why `String` instead of Prisma `enum`?** Prisma `enum` types are not
> supported on SQLite, and the schema must work on both SQLite (local) and
> MySQL (Hostinger). Role/status columns are therefore plain strings whose
> allowed values are enforced in application code. We also avoid DB-specific
> column types so a single schema migrates cleanly on both engines.

## Environment variables

Copy `.env.example` to `.env` (gitignored) and fill in values.

| Variable            | Purpose                                                        |
| ------------------- | -------------------------------------------------------------- |
| `DATABASE_PROVIDER` | `mysql` (Hostinger / production, **default**) or `sqlite` (local). |
| `DATABASE_URL`      | Prisma connection string (datasource `url`).                   |
| `PORT`              | Port the Express server listens on (default `3000`).           |

### Why the provider swap?

Prisma requires the datasource `provider` to be a **string literal** — it
cannot be read from an env var. So `DATABASE_PROVIDER` is applied to
`prisma/schema.prisma` by `scripts/db-setup.js`, which rewrites the provider
line. The `npm run db:*` scripts run it automatically before any Prisma command.

## Local development (SQLite)

```bash
npm install
cp .env.example .env
# In .env, uncomment the local SQLite override:
#   DATABASE_PROVIDER=sqlite
#   DATABASE_URL="file:./dev.db"
npm run db:setup     # swap provider to sqlite + generate the Prisma client
npm run db:push      # create the local dev.db
npm run db:seed      # seed sample users + aircraft (idempotent)
npm start            # http://localhost:3000
```

Seeded accounts (all share the demo password `password123`):

| Role     | Email               |
| -------- | ------------------- |
| admin    | `admin@irago.test`  |
| operator | `olivia@irago.test`, `owen@irago.test` |
| customer | `casey@irago.test`, `cleo@irago.test`  |

Verify the API + DB connection:

```bash
curl http://localhost:3000/api/health
# { "status": "ok", "db": "connected" }
```

`npm start` connects to the database on boot and **exits loudly (exit 1)** if
the connection or credentials are bad.

## Production on Hostinger (MySQL)

Following Hostinger's Node.js + MySQL setup:

1. **Create the MySQL database** in hPanel → *Databases* → *MySQL Databases*.
   Note the database name, username, password, and host.
2. **Build the connection string** and put it in `.env` on the server:
   ```
   DATABASE_PROVIDER=mysql
   DATABASE_URL="mysql://USER:PASSWORD@HOST:3306/DATABASE"
   ```
   (Hostinger's host is often `localhost` when the app runs on the same plan;
   use the remote MySQL host otherwise and whitelist the app server's IP under
   *Remote MySQL*.)
3. **Set up the Node.js app** in hPanel → *Advanced* → *Node.js*, pointing the
   application startup file at `server.js`.
4. **Install + migrate** on the server:
   ```bash
   npm install
   npm run db:setup        # provider -> mysql + generate client
   npm run db:migrate      # apply migrations to the Hostinger MySQL DB
   ```
5. **Start** the app (`npm start` or via the hPanel Node.js app manager).

## NPM scripts

| Script            | Description                                              |
| ----------------- | -------------------------------------------------------- |
| `npm start`       | Boot the Express server (connects to the DB first).      |
| `npm run db:setup`| Swap the Prisma provider per env + `prisma generate`.    |
| `npm run db:push` | Swap provider + `prisma db push` (no migration history). |
| `npm run db:migrate` | Swap provider + `prisma migrate dev`.                 |
| `npm run db:seed` | Seed sample users + aircraft (idempotent).               |
| `npm run typecheck`  | `tsc --noEmit` over the backend JS.                   |

> **Migrations and the provider swap:** because the datasource provider is
> swapped per environment, generated migration SQL is dialect-specific (SQLite
> vs MySQL) and is **not** committed. Use `db:push` to apply the schema to a
> fresh database on either engine; the schema itself is the source of truth.
