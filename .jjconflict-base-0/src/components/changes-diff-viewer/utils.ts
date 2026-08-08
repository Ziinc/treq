import type { JjDiffHunk, LineComment as ApiLineComment } from "../../lib/api";
import type { ParsedFileChange } from "../../lib/git-utils";
import type { LineComment, PendingComment } from "./types";
import type { GithubQuote } from "./GithubCommentCard";

export function toLocalLineComment(c: ApiLineComment): LineComment {
	return {
		id: c.id,
		filePath: c.file_path,
		hunkId: c.hunk_id,
		startLine: c.start_line,
		endLine: c.end_line,
		lineContent: c.line_content,
		text: c.text,
		createdAt: c.created_at,
		lineSide: c.line_side,
		source: c.source,
		githubAuthor: c.github_author,
		githubAvatarUrl: c.github_avatar_url,
		githubCommentUrl: c.github_comment_url,
	};
}

export function toApiLineComment(c: LineComment): ApiLineComment {
	return {
		id: c.id,
		file_path: c.filePath,
		hunk_id: c.hunkId,
		start_line: c.startLine,
		end_line: c.endLine,
		line_content: c.lineContent,
		text: c.text,
		created_at: c.createdAt,
		line_side: c.lineSide,
		source: c.source,
		github_author: c.githubAuthor,
		github_avatar_url: c.githubAvatarUrl,
		github_comment_url: c.githubCommentUrl,
	};
}

export function buildQuotedPendingComment(
	args: {
		filePath: string;
		hunkId: string;
		displayAtLineIndex: number;
		lineNumber: number;
		lineSide: "old" | "new";
	},
	quote: GithubQuote,
): PendingComment {
	return {
		filePath: args.filePath,
		hunkId: args.hunkId,
		displayAtLineIndex: args.displayAtLineIndex,
		startLine: args.lineNumber,
		endLine: args.lineNumber,
		lineContent: [quote.text],
		lineSide: args.lineSide,
		githubMeta: {
			author: quote.author,
			avatarUrl: quote.avatarUrl,
			commentUrl: quote.commentUrl,
		},
	};
}

export function getQuoteProp(
	pendingComment: PendingComment | null,
): { text: string; author?: string } | undefined {
	if (!pendingComment?.githubMeta) return undefined;
	return {
		text: pendingComment.lineContent.join(" "),
		author: pendingComment.githubMeta.author,
	};
}

export const getLineTypeClass = (line: string): string => {
	if (line.startsWith("+")) return "bg-emerald-500/20";
	if (line.startsWith("-")) return "bg-red-500/20";
	return "";
};

export const getLinePrefix = (line: string): string => {
	if (line.startsWith("+")) return "+";
	if (line.startsWith("-")) return "-";
	return " ";
};

export const hunksEqual = (
	hunksA?: JjDiffHunk[] | null,
	hunksB?: JjDiffHunk[] | null,
): boolean => {
	if (!hunksA && !hunksB) return true;
	if (!hunksA || !hunksB) return false;
	if (hunksA.length !== hunksB.length) return false;
	return JSON.stringify(hunksA) === JSON.stringify(hunksB);
};

export const filesEqual = (
	filesA: ParsedFileChange[],
	filesB: ParsedFileChange[],
): boolean => {
	if (filesA.length !== filesB.length) return false;
	for (let idx = 0; idx < filesA.length; idx++) {
		if (
			filesA[idx].path !== filesB[idx].path ||
			filesA[idx].stagedStatus !== filesB[idx].stagedStatus ||
			filesA[idx].workspaceStatus !== filesB[idx].workspaceStatus ||
			filesA[idx].isUntracked !== filesB[idx].isUntracked
		) {
			return false;
		}
	}
	return true;
};

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

export const parseHunkHeader = (
	header: string,
): {
	newCount: number;
	newStart: number;
	oldCount: number;
	oldStart: number;
} => {
	const match = header.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
	if (!match) {
		return { newCount: 1, newStart: 1, oldCount: 1, oldStart: 1 };
	}
	return {
		newCount: match[4] ? parseInt(match[4], 10) : 1,
		newStart: parseInt(match[3], 10),
		oldCount: match[2] ? parseInt(match[2], 10) : 1,
		oldStart: parseInt(match[1], 10),
	};
};

export const computeHunkLineNumbers = (
	hunk: JjDiffHunk,
): Array<{ new?: number; old?: number }> => {
	const { oldStart, newStart } = parseHunkHeader(hunk.header);
	let oldLine = oldStart;
	let newLine = newStart;

	return hunk.lines.map((line) => {
		if (line.startsWith("+")) {
			return { new: newLine++ };
		} else if (line.startsWith("-")) {
			return { old: oldLine++ };
		} else {
			return { new: newLine++, old: oldLine++ };
		}
	});
};

export const computeHunksHash = (hunks: JjDiffHunk[]): string => {
	const content = hunks
		.map((hunk) => hunk.header + hunk.lines.join(""))
		.join("|");
	let hash = 5381;
	for (let idx = 0; idx < content.length; idx++) {
		hash = (hash * 33 + content.charCodeAt(idx)) % 4294967296;
	}
	return hash.toString(16);
};
