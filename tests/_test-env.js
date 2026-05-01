// Test environment overrides — runs before any test file imports
// production modules. Wired via vitest.config.js#setupFiles.
//
// The integration test setup truncates every table and re-creates a
// known-state org. We point Prisma at a separate `compass_test`
// database so that work doesn't clobber the dev seed (super-admin,
// scoutmaster, cubmaster, troop-leader accounts).
//
// CI can override via TEST_DATABASE_URL.

const DEFAULT_TEST_DB =
  "postgresql://compass:compass@localhost:5432/compass_test?schema=public";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || DEFAULT_TEST_DB;
process.env.DISABLE_RATE_LIMIT = "1";
