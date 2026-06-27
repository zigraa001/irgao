// Shared Prisma client singleton for the IraGo API.
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

module.exports = { prisma };
