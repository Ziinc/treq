import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Reuses the same jsdom + NAPI integration harness as vitest.config.ts
// (test/setup.integration.ts), but points at scripts/screenshot specs
// instead of test/integration so screenshot runs stay out of `npm test`.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.integration.ts"],
    include: ["scripts/screenshot/specs/**/*.spec.tsx"],
    globals: true,
    fileParallelism: false,
    testTimeout: 60000,
  },
});
