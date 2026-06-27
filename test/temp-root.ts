import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const TREQ_TEST_TMPDIR = "TREQ_TEST_TMPDIR";

export function getTestTempRoot(): string {
	return process.env[TREQ_TEST_TMPDIR] ?? os.tmpdir();
}

export function getTestTempPath(...segments: string[]): string {
	return path.join(getTestTempRoot(), ...segments);
}

export function ensureTestTempRoot(): string {
	const root = getTestTempRoot();
	fs.mkdirSync(root, { recursive: true });
	return root;
}
