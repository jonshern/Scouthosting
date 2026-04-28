import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.js"],
    environment: "node",
    globals: false,
    // Integration tests share one Postgres + one Express app, so they
    // need to run sequentially. Lib-layer unit tests are pure and could
    // parallelise, but vitest's default per-file isolation already
    // gives us that — the `singleThread` flag here only constrains how
    // files are scheduled relative to each other, which is what we
    // need for DB-touching tests.
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
