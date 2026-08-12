import { defineConfig } from "vitest/config";

/**
 * Default vitest entry: runs unit + integration as separate projects.
 * Prefer `npm run test:unit` / `npm run test:integration` in CI so setup
 * cost (NAPI build, jj) is only paid where needed.
 */
export default defineConfig({
  test: {
    projects: ["./vitest.unit.config.ts", "./vitest.integration.config.ts"],
  },
});
