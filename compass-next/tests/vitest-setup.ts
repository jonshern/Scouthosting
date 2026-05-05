// Vitest module-load shim. Several lib modules (e.g. src/lib/env.ts)
// throw on import if DATABASE_URL is unset. Pure unit tests don't
// touch the DB, so we provide a dummy connection string so module-init
// succeeds. Real DB-backed tests should override these explicitly.

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/compass_test?schema=public";
}
if (!process.env.SESSION_SECRET) {
  process.env.SESSION_SECRET = "test-only-not-secret-replace-in-prod-0123456789abcdef";
}
