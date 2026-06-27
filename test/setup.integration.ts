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

import path from "path";
import fs from "fs";
import { afterEach, beforeAll, expect, vi } from "vitest";
import { ensureTestTempRoot, getTestTempRoot } from "./temp-root";

// Shared DOM polyfills, browser API stubs, Tauri plugin mocks, and hook mocks
import "./setup.common";

// Keep integration tests deterministic: avoid background auto-rebase races
// during commit creation in Rust core.
process.env.TREQ_DISABLE_AUTO_REBASE = "1";

// Load the napi addon (built by `npm run build:napi`)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const napi = require("../crates/treq-napi");

// ── Initialize state ─────────────────────────────────────────────────────────

const testDbPath = path.join(
	ensureTestTempRoot(),
	`treq-integration-test-${Date.now()}.db`,
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
			return Promise.reject(
				err instanceof Error ? err : new Error(String(err)),
			);
		}
	},
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

export const testDatabasePath = testDbPath;
export const testTempRoot = getTestTempRoot();
