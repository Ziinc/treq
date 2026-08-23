/**
 * Integration test setup.
 *
 * Replaces the Tauri invoke() mock with real Rust commands via tauri-test
 * (N-API bridge compiled into src-tauri with `--features tauri-test`).
 *
 * Prerequisites:
 *   1. Run `npm run build:napi` to compile the src-tauri cdylib.
 *   2. Have `jj` and `git` installed and on PATH.
 */

import os from "os";
import path from "path";
import fs from "fs";
import { createRequire } from "node:module";
import { randomUUID } from "crypto";
import { workspaceDiffCoalesce } from "../src/lib/coalesce-in-flight";
import { configure } from "@testing-library/dom";

// Shared DOM polyfills, browser API stubs, Tauri plugin mocks, and hook mocks
import "./setup.common";

// tauri-test invoke runs on spawn_blocking; the default 5s async util timeout
// flakes under CI load when waiting for Changes file lists. Kept in line with
// the global 15s test timeout (vitest.integration.config.ts) so a stuck
// waitFor fails fast instead of silently eating the whole test budget.
configure({ asyncUtilTimeout: 15_000 });

// Keep integration tests deterministic: avoid background auto-rebase races
// during commit creation in Rust core.
process.env.TREQ_DISABLE_AUTO_REBASE = "1";
// Skip startup auto-update curl checks (spawn_blocking contention under CI).
process.env.TREQ_DISABLE_AUTO_UPDATE = "1";

const testDbPath = path.join(
  os.tmpdir(),
  `treq-integration-${process.pid}-${randomUUID()}.db`,
);
process.env.TREQ_APP_DB_PATH = testDbPath;
process.env.TREQ_APP_DATA_DIR = path.dirname(testDbPath);

const require = createRequire(import.meta.url);
const tauriTest = require("../src-tauri/target") as {
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
};

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd: string, args?: Record<string, unknown>) => {
    return tauriTest.invoke(cmd, args ?? {});
  }),
  // The real Rust dispatch behind this harness represents the shipped app's
  // production code path (unlike the screenshot harness, which flips this to
  // false so a browser preview iframe renders for visual QA) -- tests here
  // exercise the real native-webview commands, e.g. openBrowserWebview.
  isTauri: () => true,
}));

afterEach(() => {
  workspaceDiffCoalesce.reset();
});

afterAll(() => {
  try {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  } catch {
    // ignore
  }
});
