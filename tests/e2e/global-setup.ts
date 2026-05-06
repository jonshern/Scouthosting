import { execSync } from "node:child_process";
import path from "node:path";

export default async function globalSetup() {
  const env = {
    ...process.env,
    DATABASE_URL: "postgresql://compass:compass@localhost:5433/compass_test?schema=public",
  };
  const cwd = path.resolve(__dirname, "../..");
  execSync("npx prisma migrate deploy", { cwd, env, stdio: "inherit" });
  execSync("npx tsx prisma/seed.ts", { cwd, env, stdio: "inherit" });
}
