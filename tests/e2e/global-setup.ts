import { execSync } from "node:child_process";
import path from "node:path";

// Must match playwright.config.ts#webServer.env.MASTER_KEY exactly so
// the seeded org's DEK is wrappable with the same key that the running
// app uses to unwrap it.
const TEST_MASTER_KEY =
  "0000000000000000000000000000000000000000000000000000000000000001";

export default async function globalSetup() {
  const env = {
    ...process.env,
    DATABASE_URL: "postgresql://compass:compass@localhost:5433/compass_test?schema=public",
    MASTER_KEY: TEST_MASTER_KEY,
  };
  const cwd = path.resolve(__dirname, "../..");
  execSync("npx prisma migrate deploy", { cwd, env, stdio: "inherit" });
  execSync("npx tsx prisma/seed.ts", { cwd, env, stdio: "inherit" });
}
