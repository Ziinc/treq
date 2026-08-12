import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * NAPI-backed integration tests: real Rust dispatch, real jj repos.
 * Serial file execution avoids shared native-addon / DB races.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    name: "integration",
    environment: "jsdom",
    setupFiles: ["./test/setup.integration.ts"],
    include: ["test/integration/**/*.test.{ts,tsx}"],
    globals: true,
    fileParallelism: false,
    testTimeout: 15000,
  },
});
