/**
 * Screenshot harness setup (scripts/screenshot/specs/**).
 *
 * Same real NAPI dispatch as test/setup.integration.ts, with one
 * difference: it does not fail a run when a still-un-migrated jj_* command
 * gets invoked. test/integration/** enforces zero jj_* calls as an ongoing
 * migration-debt tracker; the screenshot harness exists to show current real
 * behavior (including that debt) rather than gate on it, so it only logs
 * which jj_* commands fired instead of failing the spec.
 *
 * Prerequisites:
 *   1. Run `npm run build:napi` to compile the .node addon.
 *   2. Have `jj` and `git` installed and on PATH.
 */

import os from "os";
import path from "path";
import fs from "fs";
import { afterEach, beforeAll, vi } from "vitest";

// Shared DOM polyfills, browser API stubs, Tauri plugin mocks, and hook mocks
import "./setup.common";

// Keep runs deterministic: avoid background auto-rebase races during commit
// creation in Rust core.
process.env.TREQ_DISABLE_AUTO_REBASE = "1";

// Load the napi addon (built by `npm run build:napi`)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const napi = require("../crates/treq-napi");

// ── Initialize state ─────────────────────────────────────────────────────────

const testDbPath = path.join(
	os.tmpdir(),
	`treq-screenshot-${Date.now()}.db`,
);

beforeAll(() => {
	napi.initState(testDbPath);
});

// ── Replace Tauri invoke with real Rust dispatch ──────────────────────────────

// Track jj_* calls made during each spec, for visibility only (not asserted).
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
	if (jjCalls.length > 0) {
		console.log(
			`[app-qa] un-migrated jj_* commands exercised in this spec: ${jjCalls.join(", ")}`,
		);
	}
	jjCalls.length = 0;
});

// ── Cleanup db file on exit ───────────────────────────────────────────────────

process.on("exit", () => {
	try {
		if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
	} catch {
		// ignore
	}
});
