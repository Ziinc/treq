/**
 * Integration test setup.
 *
 * Replaces the Tauri invoke() mock with real Rust calls via the treq-napi
 * native addon. Commands that are deliberately not implemented (direct jj::*
 * calls) will throw errors, signalling which UI code needs to be migrated to
 * proper core::* equivalents.
 *
 * Prerequisites:
 *   1. Run `npm run build:napi` to compile the .node addon.
 *   2. Have `jj` and `git` installed and on PATH.
 */

import os from "os";
import path from "path";
import fs from "fs";
import { beforeAll, afterEach, vi, expect } from "vitest";

// Shared DOM polyfills, browser API stubs, Tauri plugin mocks, and hook mocks
import "./setup.common";

// Load the napi addon (built by `npm run build:napi`)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const napi = require("../crates/treq-napi");

// ── Initialize state ─────────────────────────────────────────────────────────

const testDbPath = path.join(
  os.tmpdir(),
  `treq-integration-test-${Date.now()}.db`
);

beforeAll(() => {
  napi.initState(testDbPath);
});

// ── Replace Tauri invoke with real Rust dispatch ──────────────────────────────

// Track jj_* calls made during each test
const jjCalls: string[] = [];

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) => {
    if (cmd.startsWith("jj_")) {
      jjCalls.push(cmd);
    }
    try {
      const result = napi.invokeSync(cmd, args ?? {});
      return Promise.resolve(result);
    } catch (err: unknown) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }
  },
}));

afterEach(() => {
  const calls = [...jjCalls];
  jjCalls.length = 0;
  expect(calls, "jj_* commands should not be called in integration tests").toEqual([]);
});

// ── Cleanup db file on exit ───────────────────────────────────────────────────

process.on("exit", () => {
  try {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  } catch {
    // ignore
  }
});
