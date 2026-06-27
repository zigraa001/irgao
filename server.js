// IraGo Express server.
// Serves the existing static site (index.html, app.html, assets, etc.) and
// mounts the JSON API under /api. The database is selected by env vars
// (DATABASE_PROVIDER + DATABASE_URL) via Prisma — see README and .env.example.
require("dotenv").config();

const path = require("path");
const express = require("express");
const { prisma } = require("./src/db");
const apiRouter = require("./src/api");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const app = express();

app.use(express.json());

// JSON API.
app.use("/api", apiRouter);

// Static site (express.static guards against directory traversal and serves
// index.html at "/").
app.use(express.static(ROOT));

// Tracks whether the initial DB connection succeeded so other parts of the
// app (e.g. a health check) can report a degraded state instead of guessing.
let dbConnected = false;

async function connectDatabase() {
  // The DB connection is wrapped in try/catch so a database outage or bad
  // credentials degrade the service instead of crashing the whole process —
  // the static site and any DB-independent routes keep working.
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    dbConnected = true;
    console.log(
      `Database connected (provider: ${process.env.DATABASE_PROVIDER || "mysql"}).`
    );
  } catch (err) {
    dbConnected = false;
    console.error(
      "WARNING: could not connect to the database. The server will keep " +
        "running, but database-backed routes will fail until the connection " +
        "is restored. Check DATABASE_PROVIDER, DATABASE_URL, and your credentials."
    );
    console.error(err.message);
  }
}

async function start() {
  await connectDatabase();

  app.listen(PORT, () => {
    console.log(
      `Server running on port ${PORT} (database: ${
        dbConnected ? "connected" : "unavailable"
      }).`
    );
  });
}

start();
