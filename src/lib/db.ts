import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// Connections are budgeted, not left to Prisma's default (2 per CPU + 1,
// which differs by machine). Cloud SQL on db-f1-micro allows 50; prod
// and staging share it, and during a blue-green deploy both revisions
// run. Each process holds DB_POOL_SIZE for queries plus JOBS_POOL_SIZE
// for pg-boss (src/lib/jobs). An explicit connection_limit in
// DATABASE_URL wins. Budget: docs/gcp-deployment.md, "Database connections".
export function pooledDatabaseUrl(url: string | undefined, env: Record<string, string | undefined> = process.env): string | undefined {
  if (!url || /[?&]connection_limit=/.test(url)) return url;
  const size = Math.max(1, Math.floor(Number(env.DB_POOL_SIZE)) || 4);
  return `${url}${url.includes("?") ? "&" : "?"}connection_limit=${size}`;
}

export const prisma =
  global.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    datasourceUrl: pooledDatabaseUrl(process.env.DATABASE_URL),
  });

if (process.env.NODE_ENV !== "production") global.__prisma = prisma;
