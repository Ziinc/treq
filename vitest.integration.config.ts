import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import os from "node:os";

/**
 * NAPI-backed integration tests: real Rust dispatch, real jj repos.
 *
 * Isolation model:
 * - Per-repo `local.db` lives under each `createTestRepo` temp dir — safe to
 *   run files in parallel.
 * - App-level DB (`TREQ_APP_DB_PATH` / napi `OnceLock`) is process-global, so
 *   we use `pool: "forks"` (not threads): each file gets its own process and
 *   its own app.db. Settings / default-agent tests that touch app.db are fine
 *   under forks; they must not share a process with other files.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    name: "integration",
    environment: "jsdom",
    setupFiles: ["./test/setup.integration.ts"],
    include: ["test/integration/**/*.test.{ts,tsx}"],
    globals: true,
    pool: "forks",
    fileParallelism: true,
    // Each fork loads the ~500MB debug NAPI addon and talks to jj-lib.
    // Four workers starve spawn_blocking invokes: Changes file lists never
    // appear (empty dashboard snapshot) and jj working-copy asserts fire.
    maxWorkers: Math.min(2, os.cpus().length),
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
