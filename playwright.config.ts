import { defineConfig, devices } from "@playwright/test";

// E2E_DATABASE_URL points the suite at another disposable database, e.g. a
// second checkout sharing the same Postgres. global-setup.ts reads it too.
const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  "postgresql://compass:compass@localhost:5433/compass_test?schema=public";

const SERVER_ENV: Record<string, string> = {
  // Local Compass postgres runs on 5433 (5432 is occupied by another
  // container on the dev Mac — see project CLAUDE.md trap #4).
  DATABASE_URL: E2E_DATABASE_URL,
  NODE_ENV: "production",
  APEX_HOST: "localhost",
  SESSION_SECRET: "test-only-not-secret-replace-in-prod-0123456789abcdef",
  PORT: "3000",
  // Tests sign in as a seeded admin (scoutmaster). The policy gate
  // (lib/auth/policy.ts) blocks admin password login when
  // NODE_ENV=production unless this bypass is set — same convention
  // as Compass staging.
  ALLOW_ADMIN_PASSWORD_LOGIN: "1",
  // The seeded admin has no two-step sign-in; production requires it
  // for organizers (lib/auth/requirements.ts) unless this is set.
  ALLOW_ADMIN_WITHOUT_MFA: "1",
  // Don't run the pg-boss worker in tests — keeps the queue
  // create/work spam out of the test logs.
  JOBS_DISABLED: "1",
  // E2E suite predates the apex Coming Soon gate; bypass it so the
  // existing marketing tests don't have to enter an invite code.
  DISABLE_INVITE_GATE: "1",
  // Per-org PII encryption (lib/encryption/master-key.ts) refuses to
  // boot under NODE_ENV=production without MASTER_KEY. The seed
  // script generates fresh org DEKs against this key on each `npm
  // run db:seed`, so a fixed test value is fine — it never wraps
  // real customer data.
  MASTER_KEY:
    "0000000000000000000000000000000000000000000000000000000000000001",
};

// Second server: same build and database, but without
// ALLOW_ADMIN_WITHOUT_MFA, so the production rule "organizers need
// two-step sign-in" is live. Used only by mfa-required.spec.ts.
const MFA_SERVER_ENV: Record<string, string> = { ...SERVER_ENV, PORT: "3001" };
delete MFA_SERVER_ENV.ALLOW_ADMIN_WITHOUT_MFA;

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm run start",
      url: "http://localhost:3000/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: SERVER_ENV,
    },
    {
      command: "npx next start -H 0.0.0.0 -p 3001",
      url: "http://localhost:3001/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: MFA_SERVER_ENV,
    },
  ],
});
