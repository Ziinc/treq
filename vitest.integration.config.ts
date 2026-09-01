import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const dirname = path.dirname(fileURLToPath(import.meta.url));
// DUCKDB_DOWNLOAD_LIB copies the prebuilt libduckdb.so here (see
// libduckdb-sys's build.rs); the dynamic loader needs it on the search path
// to resolve the treq_lib addon's dependency at require() time.
const duckdbLibDir = path.join(dirname, "target", "debug", "deps");

/**
 * NAPI-backed integration tests: real Rust dispatch, real jj repos.
 *
 * Isolation model:
 * - Per-repo `local.db` lives under each `createTestRepo` temp dir.
 * - App-level DB (`TREQ_APP_DB_PATH` / napi `OnceLock`) is process-global, so
 *   we use `pool: "forks"` (not threads): each file gets its own process and
 *   its own app.db.
 * - Files run serially. Parallel forks each load the debug NAPI addon and
 *   starve spawn_blocking / jj-lib; review tests then time out waiting for
 *   the Changes file list.
 */
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler", { target: "19" }]],
      },
    }),
  ],
  test: {
    name: "integration",
    environment: "jsdom",
    setupFiles: ["./test/setup.integration.ts"],
    include: ["test/integration/**/*.test.{ts,tsx}"],
    globals: true,
    pool: "forks",
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 5_000,
    hookTimeout: 5_000,
    env: {
      LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH
        ? `${duckdbLibDir}:${process.env.LD_LIBRARY_PATH}`
        : duckdbLibDir,
    },
  },
});
