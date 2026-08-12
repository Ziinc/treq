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
import { randomUUID } from "crypto";
import { afterEach, beforeAll, expect, vi } from "vitest";

// Shared DOM polyfills, browser API stubs, Tauri plugin mocks, and hook mocks
import "./setup.common";

// Keep integration tests deterministic: avoid background auto-rebase races
// during commit creation in Rust core.
process.env.TREQ_DISABLE_AUTO_REBASE = "1";

// Load the napi addon (built by `npm run build:napi`)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const napi = require("../crates/treq-napi");

// ── Initialize state ─────────────────────────────────────────────────────────
//
// App-level DB (`TREQ_APP_DB_PATH`) is process-global inside the native addon.
// With `pool: "forks"` + fileParallelism, each test file gets its own process
// and therefore its own app.db. Include pid + uuid so parallel workers never
// collide on the same path when started in the same millisecond.

const testDbPath = path.join(
  os.tmpdir(),
  `treq-integration-${process.pid}-${randomUUID()}.db`,
);

beforeAll(() => {
  napi.initState(testDbPath);
});

// ── Replace Tauri invoke with real Rust dispatch ──────────────────────────────

// Track jj_* calls made during each test. Commands that already have a real
// NAPI implementation (restore/snapshot for Review discard) are allowlisted.
const jjCalls: string[] = [];
const ALLOWED_JJ_COMMANDS = new Set([
  "jj_restore_file",
  "jj_restore_all",
  "jj_snapshot_working_copy",
  "jj_restore_snapshot",
]);

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd: string, args?: Record<string, unknown>) => {
    if (cmd.startsWith("jj_") && !ALLOWED_JJ_COMMANDS.has(cmd)) {
      jjCalls.push(cmd);
    }
    try {
      const result = napi.invokeSync(cmd, args ?? {});
      return Promise.resolve(result);
    } catch (err: unknown) {
      return Promise.reject(
        err instanceof Error ? err : new Error(String(err)),
      );
    }
  }),
}));

afterEach(() => {
  const calls = [...jjCalls];
  jjCalls.length = 0;
  expect(
    calls,
    "jj_* commands should not be called in integration tests",
  ).toEqual([]);
});

// ── Cleanup db file on exit ───────────────────────────────────────────────────

process.on("exit", () => {
  try {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  } catch {
    // ignore
  }
});
