/**
 * Verifies that every command declared in src/lib/api.ts via invoke() is also
 * declared in:
 *   - crates/treq-napi/src/dispatch.rs  (NAPI dispatch match arms)
 *   - src-tauri/src/lib.rs              (Tauri generate_handler! registration)
 *
 * Catches drift where a command is added to the frontend API but not wired up
 * in one of the backend layers.
 */

import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../..");

function readFile(relative: string): string {
	return fs.readFileSync(path.join(ROOT, relative), "utf-8");
}

/** Extract all snake_case command names passed to invoke() in api.ts */
function extractApiCommands(content: string): Set<string> {
	const commands = new Set<string>();
	for (const match of content.matchAll(/invoke\(\s*["'](\w+)["']/g)) {
		commands.add(match[1]);
	}
	return commands;
}

/**
 * Extract command names from dispatch.rs match arms.
 *
 * Top-level dispatch arms are indented with exactly 8 spaces, either as:
 *   - `        "command_name" =>`  (single arm)
 *   - `        "command_name"\n`   (first in a multi-arm chain)
 *   - `        | "command_name"`   (continuation of a multi-arm chain)
 *
 * Inner match arms (inside arm bodies) are indented at 12+ spaces and are
 * intentionally excluded.
 */
function extractDispatchCommands(content: string): Set<string> {
	const commands = new Set<string>();
	// Single arm or first in a chain: 8 spaces then a quoted string
	for (const match of content.matchAll(/^ {8}"([a-z][a-z0-9_]*)"/gm)) {
		commands.add(match[1]);
	}
	// Continuation arms in a chain: 8 spaces, pipe, then a quoted string
	for (const match of content.matchAll(/^ {8}\| "([a-z][a-z0-9_]*)"/gm)) {
		commands.add(match[1]);
	}
	return commands;
}

/** Extract command names from generate_handler![] in lib.rs */
function extractTauriCommands(content: string): Set<string> {
	const commands = new Set<string>();
	for (const match of content.matchAll(/commands::(\w+)/g)) {
		commands.add(match[1]);
	}
	return commands;
}

function setDiff<T>(setA: Set<T>, setB: Set<T>): T[] {
	return [...setA].filter((elem) => !setB.has(elem)).sort() as T[];
}

describe("command consistency", () => {
	const apiContent = readFile("src/lib/api.ts");
	const dispatchContent = readFile("crates/treq-napi/src/dispatch.rs");
	const tauriLibContent = readFile("src-tauri/src/lib.rs");

	const apiCommands = extractApiCommands(apiContent);
	const dispatchCommands = extractDispatchCommands(dispatchContent);
	const tauriCommands = extractTauriCommands(tauriLibContent);

	it("every invoke() command in api.ts is handled in dispatch.rs", () => {
		const missing = setDiff(apiCommands, dispatchCommands);
		expect(
			missing,
			`Commands in api.ts missing from dispatch.rs:\n  ${missing.join("\n  ")}`,
		).toEqual([]);
	});

	it("every invoke() command in api.ts is registered in Tauri generate_handler!", () => {
		const missing = setDiff(apiCommands, tauriCommands);
		expect(
			missing,
			`Commands in api.ts missing from src-tauri/src/lib.rs generate_handler!:\n  ${missing.join("\n  ")}`,
		).toEqual([]);
	});

	it("every dispatch.rs command is registered in Tauri generate_handler!", () => {
		const missing = setDiff(dispatchCommands, tauriCommands);
		expect(
			missing,
			`Commands in dispatch.rs missing from src-tauri/src/lib.rs generate_handler!:\n  ${missing.join("\n  ")}`,
		).toEqual([]);
	});
});
