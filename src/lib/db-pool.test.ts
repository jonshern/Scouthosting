import { describe, expect, it } from "vitest";
import { pooledDatabaseUrl } from "./db";
import { jobsPoolSize } from "./jobs";

describe("database connection budget", () => {
  const base = "postgresql://u:p@host:5432/compass";

  it("adds a connection limit, 4 by default", () => {
    expect(pooledDatabaseUrl(base, {})).toBe(`${base}?connection_limit=4`);
    expect(pooledDatabaseUrl(`${base}?schema=public`, { DB_POOL_SIZE: "7" })).toBe(
      `${base}?schema=public&connection_limit=7`,
    );
  });

  it("keeps a limit already in the URL and ignores nonsense sizes", () => {
    const set = `${base}?connection_limit=12`;
    expect(pooledDatabaseUrl(set, { DB_POOL_SIZE: "3" })).toBe(set);
    expect(pooledDatabaseUrl(base, { DB_POOL_SIZE: "zero" })).toBe(`${base}?connection_limit=4`);
    expect(pooledDatabaseUrl(undefined, {})).toBeUndefined();
  });

  it("caps the job queue's pool at 2 by default", () => {
    expect(jobsPoolSize({})).toBe(2);
    expect(jobsPoolSize({ JOBS_POOL_SIZE: "5" })).toBe(5);
  });
});
