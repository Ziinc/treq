import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * NAPI-backed integration tests: real Rust dispatch, real jj repos.
 *
 * File parallelism uses forks (not threads): each file gets its own process,
 * so `napi.initState` / `TREQ_APP_DB_PATH` (the shared app.db) stay isolated.
 * Per-repo `local.db` already lives under each createTestRepo temp dir.
 *
 * Do not switch this pool to `threads` — the native addon keeps process-global
 * OnceLock state that is not safe across concurrent files in one process.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    name: "integration",
    environment: "jsdom",
    setupFiles: ["./test/setup.integration.ts"],
    include: ["test/integration/**/*.test.{ts,tsx}"],
    globals: true,
    // Forks (not threads): each file gets its own process so the native
    // addon's OnceLock app.db (`TREQ_APP_DB_PATH` from initState) is isolated.
    // Per-repo local.db already lives under each createTestRepo temp dir.
    pool: "forks",
    fileParallelism: true,
    // Cap workers — each fork loads the ~500MB NAPI addon; too many thrash.
    maxWorkers: 2,
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
