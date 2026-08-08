import type { JjFileChange } from "./api";

export interface ParsedFileChange {
	path: string;
	stagedStatus?: string;
	workspaceStatus?: string;
	oldPath?: string;
	isUntracked?: boolean;
	isConflicted?: boolean;
}

/**
 * Check if a file is binary based on its extension
 */
export function isBinaryFile(path: string): boolean {
	const binaryExtensions = [
		".png",
		".jpg",
		".jpeg",
		".gif",
		".bmp",
		".ico",
		".svg",
		".pdf",
		".zip",
		".tar",
		".gz",
		".rar",
		".7z",
		".exe",
		".dll",
		".so",
		".dylib",
		".mp3",
		".mp4",
		".avi",
		".mov",
		".wmv",
		".woff",
		".woff2",
		".ttf",
		".eot",
	];
	return binaryExtensions.some((ext) => path.toLowerCase().endsWith(ext));
}

/**
 * Parse JJ changed files into ParsedFileChange format
 */
export function parseJjChangedFiles(
	files:
		| JjFileChange[]
		| Array<{ path: string; status: string; previous_path?: string | null }>,
): ParsedFileChange[] {
	return files.map((file) => ({
		isConflicted: file.status === "C",
		oldPath: file.previous_path ?? undefined,
		path: file.path,
		workspaceStatus: file.status,
	}));
}

/**
 * Unique file count for the Review tab badge: working-copy changes plus
 * committed-but-not-yet-in-target changes, with overlapping paths counted once.
 */
export function countUniqueReviewChangePaths(
	uncommitted: Array<{ path: string }>,
	committed: Array<{ path: string }> = [],
): number {
	const paths = new Set<string>();
	for (const file of uncommitted) {
		paths.add(file.path);
	}
	for (const file of committed) {
		paths.add(file.path);
	}
	return paths.size;
}
