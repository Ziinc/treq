import type { JjDiffHunk } from "./api";
import type { ParsedFileChange } from "./git-utils";

/** Return the Tailwind background class for a diff line based on its leading character. */
export const getLineTypeClass = (line: string): string => {
	if (line.startsWith("+")) return "bg-emerald-500/20";
	if (line.startsWith("-")) return "bg-red-500/20";
	return "";
};

/** Return the diff prefix character (+, -, or space) for a line. */
export const getLinePrefix = (line: string): string => {
	if (line.startsWith("+")) return "+";
	if (line.startsWith("-")) return "-";
	return " ";
};

/** Deep-equality check for two hunk arrays using JSON serialisation. */
export const hunksEqual = (
	a?: JjDiffHunk[] | null,
	b?: JjDiffHunk[] | null,
): boolean => {
	if (!a && !b) return true;
	if (!a || !b) return false;
	if (a.length !== b.length) return false;
	return JSON.stringify(a) === JSON.stringify(b);
};

/** Shallow equality for ParsedFileChange arrays (path + status fields only). */
export const filesEqual = (
	a: ParsedFileChange[],
	b: ParsedFileChange[],
): boolean => {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (
			a[i].path !== b[i].path ||
			a[i].stagedStatus !== b[i].stagedStatus ||
			a[i].workspaceStatus !== b[i].workspaceStatus ||
			a[i].isUntracked !== b[i].isUntracked
		) {
			return false;
		}
	}
	return true;
};

/** Parse a cached JSON string back to a hunk array; returns null on failure. */
export const parseCachedHunks = (raw: string): JjDiffHunk[] | null => {
	try {
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed)) {
			return parsed as JjDiffHunk[];
		}
	} catch {
		// Silently ignore parse failures
	}
	return null;
};

/**
 * Parse a unified-diff hunk header of the form `@@ -a,b +c,d @@` into its
 * numeric components.  Returns safe defaults when the header cannot be parsed.
 */
export const parseHunkHeader = (
	header: string,
): {
	oldStart: number;
	newStart: number;
	oldCount: number;
	newCount: number;
} => {
	const match = header.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
	if (!match) {
		return { oldStart: 1, newStart: 1, oldCount: 1, newCount: 1 };
	}
	return {
		oldStart: parseInt(match[1], 10),
		oldCount: match[2] ? parseInt(match[2], 10) : 1,
		newStart: parseInt(match[3], 10),
		newCount: match[4] ? parseInt(match[4], 10) : 1,
	};
};

/** Compute the old/new line number pair for every line in a hunk. */
export const computeHunkLineNumbers = (
	hunk: JjDiffHunk,
): Array<{ old?: number; new?: number }> => {
	const { oldStart, newStart } = parseHunkHeader(hunk.header);
	let oldLine = oldStart;
	let newLine = newStart;

	return hunk.lines.map((line) => {
		if (line.startsWith("+")) {
			return { new: newLine++ };
		} else if (line.startsWith("-")) {
			return { old: oldLine++ };
		} else {
			// Context line — both counters advance
			return { old: oldLine++, new: newLine++ };
		}
	});
};

/** Compute a djb2 hex hash of the combined hunk content for change detection. */
export const computeHunksHash = (hunks: JjDiffHunk[]): string => {
	const content = hunks.map((h) => h.header + h.lines.join("")).join("|");
	let hash = 5381;
	for (let i = 0; i < content.length; i++) {
		hash = (hash << 5) + hash + content.charCodeAt(i);
		hash = hash & hash; // keep 32-bit integer
	}
	return hash.toString(16);
};
