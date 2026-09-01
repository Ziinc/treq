import { fileURLToPath } from "node:url";
import path from "node:path";
import type { ViteUserConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const dirname = path.dirname(fileURLToPath(import.meta.url));
// DUCKDB_DOWNLOAD_LIB copies the prebuilt libduckdb.so here (see
// libduckdb-sys's build.rs); the dynamic loader needs it on the search path
// to resolve the treq_lib addon's dependency at require() time.
const duckdbLibDir = path.join(dirname, "target", "debug", "deps");

/**
 * Shared config for the NAPI-backed integration projects: real Rust
 * dispatch, real jj repos. Each project (serial/parallel, see
 * vitest.integration.config.ts) layers its own `include`/`pool` settings
 * on top of this.
 */
export const integrationBaseTest: ViteUserConfig["test"] = {
  environment: "jsdom",
  setupFiles: ["./test/setup.integration.ts"],
  globals: true,
  // Per-repo `local.db` lives under each `createTestRepo` temp dir. The
  // app-level DB (`TREQ_APP_DB_PATH` / napi `OnceLock`) is process-global,
  // so every project still needs one process per file ("forks", not
  // "threads") -- otherwise files sharing a worker process would share an
  // app.db.
  pool: "forks",
  testTimeout: 15_000,
  hookTimeout: 15_000,
  env: {
    LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH
      ? `${duckdbLibDir}:${process.env.LD_LIBRARY_PATH}`
      : duckdbLibDir,
  },
};

export const integrationPlugins = [
  react({
    babel: {
      plugins: [["babel-plugin-react-compiler", { target: "19" }]],
    },
  }),
];
