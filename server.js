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

async function start() {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    console.log(
      `Database connected (provider: ${process.env.DATABASE_PROVIDER || "mysql"}).`
    );
  } catch (err) {
    console.error(
      "FATAL: could not connect to the database. Check DATABASE_PROVIDER, " +
        "DATABASE_URL, and your credentials."
    );
    console.error(err.message);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

start();
