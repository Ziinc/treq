import { defineConfig } from "vitest/config";

// Node-only harness against the local Supabase CLI stack. Kept out of
// vitest.config.ts / `npm test` so the main suite does not require Docker.
export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./test/setup.service-qa.ts"],
    include: ["scripts/service-qa/specs/**/*.spec.ts"],
    globals: true,
    fileParallelism: false,
    testTimeout: 60_000,
  },
});
