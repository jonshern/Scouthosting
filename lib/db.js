// Prisma client singleton.
//
// We intentionally cache one client on globalThis so `node --watch` reloads
// don't leak connections.

import { PrismaClient } from "@prisma/client";

const g = globalThis;

export const prisma =
  g.__compassPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  g.__compassPrisma = prisma;
}
