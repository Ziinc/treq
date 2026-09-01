import { defineConfig } from "vitest/config";

/**
 * Default vitest entry: runs unit + integration as separate projects.
 * Prefer `npm run test:unit` / `npm run test:integration` in CI so setup
 * cost (NAPI build, jj) is only paid where needed.
 *
 * Lists the integration serial/parallel projects directly rather than via
 * vitest.integration.config.ts -- Vitest doesn't support a project entry
 * that itself declares `projects`.
 */
export default defineConfig({
  test: {
    projects: [
      "./vitest.unit.config.ts",
      "./vitest.integration-serial.config.ts",
      "./vitest.integration-parallel.config.ts",
    ],
  },
});
