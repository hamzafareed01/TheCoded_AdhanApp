// db/prisma.js
// Shared Prisma client (prevents creating too many connections in dev/hot reload)
const { PrismaClient } = require('@prisma/client');

const prisma = global.__prisma__ || new PrismaClient();
if (process.env.NODE_ENV !== 'production') {
  global.__prisma__ = prisma;
}

module.exports = { prisma };
