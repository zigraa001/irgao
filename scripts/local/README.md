# Local testing scripts

Wrappers around the **unchanged** main scripts (`scripts/db-init.js`, `scripts/seed.js`, etc.).

They load `local/.env.local` + root `.env`, start Docker MySQL, and run SQL from `local/sql/`.

See [local/README.md](../../local/README.md) for the full guide.
