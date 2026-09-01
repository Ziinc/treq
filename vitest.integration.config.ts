import { defineConfig } from "vitest/config";

/**
 * NAPI-backed integration tests: real Rust dispatch, real jj repos.
 *
 * Split into two projects so the ~30 files that don't contend for
 * spawn_blocking / jj-lib can run in parallel, while the Changes-list-heavy
 * review/workspace files (which time out under that contention, see
 * vitest.integration-serial.config.ts) keep running one-at-a-time as
 * before. See vitest.integration.base.ts for the config both share.
 */
export default defineConfig({
  test: {
    name: "integration",
    projects: [
      "./vitest.integration-serial.config.ts",
      "./vitest.integration-parallel.config.ts",
    ],
  },
});
