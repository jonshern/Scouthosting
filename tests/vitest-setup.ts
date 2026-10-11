// Vitest module-load shim. Several lib modules (e.g. src/lib/env.ts)
// throw on import if DATABASE_URL is unset. Pure unit tests don't
// touch the DB, so we provide a dummy connection string so module-init
// succeeds.
//
// DB-backed tests (*.db.test.ts) run only when TEST_DATABASE_URL points
// at a migrated, disposable database; it then becomes DATABASE_URL so
// the shared Prisma client talks to it.

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/compass_test?schema=public";
}
if (!process.env.SESSION_SECRET) {
  process.env.SESSION_SECRET = "test-only-not-secret-replace-in-prod-0123456789abcdef";
}
