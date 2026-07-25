import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
	createCommit,
	getWorkspaceFileLines,
	jjRestoreAll,
	jjRestoreFile,
	jjSplit,
} from "../../../lib/api";
import type { DiffLineSelection, FileHunksData } from "../types";
import { computeHunkLineNumbers, parseHunkHeader } from "../utils";
import type { useToast } from "../../ui/toast";

interface UseFileActionsParams {
	workspacePath: string;
	repoPath: string | undefined;
	workspaceId: number | undefined;
	readOnly: boolean;
	selectedUnstagedFiles: Set<string>;
	stagedFiles: Set<string>;
	setStagedFiles: React.Dispatch<React.SetStateAction<Set<string>>>;
	setSelectedUnstagedFiles: React.Dispatch<React.SetStateAction<Set<string>>>;
	allFileHunks: Map<string, FileHunksData>;
	diffLineSelection: DiffLineSelection | null;
	setContextMenuPosition: (pos: { x: number; y: number } | null) => void;
	invalidateCache: () => Promise<void>;
	refresh: () => void;
	loadChangedFiles: () => void;
	refreshCommittedChanges: () => void;
	addToast: ReturnType<typeof useToast>["addToast"];
}

export function useFileActions({
	workspacePath,
	repoPath,
	workspaceId,
	readOnly,
	selectedUnstagedFiles,
	stagedFiles,
	setStagedFiles,
	setSelectedUnstagedFiles,
	allFileHunks,
	diffLineSelection,
	setContextMenuPosition,
	invalidateCache,
	refresh,
	loadChangedFiles,
	refreshCommittedChanges,
	addToast,
}: UseFileActionsParams) {
	const [fileActionTarget, setFileActionTarget] = useState<string | null>(null);
	const [expandedContext, setExpandedContext] = useState<Map<string, string[]>>(
		new Map(),
	);
	const [commitPending, setCommitPending] = useState(false);
	const queryClient = useQueryClient();

	const handleDiscardAll = useCallback(async () => {
		if (readOnly) return;
		try {
			await jjRestoreAll(workspacePath);
			addToast({
				description: "All changes discarded",
				title: "Discarded",
				type: "success",
			});
			await invalidateCache();
			refresh();
		} catch (error) {
			addToast({
				description: error instanceof Error ? error.message : String(error),
				title: "Discard All Failed",
				type: "error",
			});
		}
	}, [workspacePath, readOnly, refresh, addToast, invalidateCache]);

	const handleDiscardFiles = useCallback(
		async (filePath: string) => {
			if (readOnly || !filePath) return;
			const filesToDiscard =
				selectedUnstagedFiles.has(filePath) && selectedUnstagedFiles.size > 0
					? Array.from(selectedUnstagedFiles)
					: [filePath];
			setFileActionTarget(filePath);
			try {
				await Promise.all(
					filesToDiscard.map((file) => jjRestoreFile(workspacePath, file)),
				);
				const count = filesToDiscard.length;
				addToast({
					description:
						count === 1
							? `${filesToDiscard[0]} discarded`
							: `${count} files discarded`,
					title: "Discarded",
					type: "success",
				});
				setSelectedUnstagedFiles(new Set());
				await invalidateCache();
				refresh();
			} catch (error) {
				addToast({
					description: error instanceof Error ? error.message : String(error),
					title: "Discard Failed",
					type: "error",
				});
			} finally {
				setFileActionTarget(null);
			}
		},
		[
			readOnly,
			selectedUnstagedFiles,
			refresh,
			addToast,
			invalidateCache,
			workspacePath,
			setSelectedUnstagedFiles,
		],
	);

	const handleCopyLineLocation = useCallback(async () => {
		try {
			if (!diffLineSelection || diffLineSelection.lines.length === 0) return;
			const { filePath } = diffLineSelection;
			const fileData = allFileHunks.get(filePath);
			if (!fileData) return;
			let minLineNum = Infinity;
			let maxLineNum = -Infinity;
			for (const line of diffLineSelection.lines) {
				const hunk = fileData.hunks[line.hunkIndex];
				if (!hunk) continue;
				const lineNumbers = computeHunkLineNumbers(hunk);
				const lineNum =
					lineNumbers[line.lineIndex]?.new ??
					lineNumbers[line.lineIndex]?.old ??
					line.lineIndex + 1;
				minLineNum = Math.min(minLineNum, lineNum);
				maxLineNum = Math.max(maxLineNum, lineNum);
			}
			const locationStr =
				minLineNum === maxLineNum
					? `${filePath}:${minLineNum}`
					: `${filePath}:${minLineNum}-${maxLineNum}`;
			await navigator.clipboard.writeText(locationStr);
			setContextMenuPosition(null);
			addToast({
				title: "Copied",
				description: "Line location copied to clipboard",
				type: "success",
			});
		} catch (error) {
			setContextMenuPosition(null);
			addToast({
				description: error instanceof Error ? error.message : String(error),
				title: "Failed to copy",
				type: "error",
			});
		}
	}, [diffLineSelection, allFileHunks, addToast, setContextMenuPosition]);

	const handleCopyLines = useCallback(async () => {
		try {
			const lineContents =
				diffLineSelection?.lines?.map((l) => l.content).join("\n") || "";
			if (!lineContents) {
				setContextMenuPosition(null);
				return;
			}
			await navigator.clipboard.writeText(lineContents);
			setContextMenuPosition(null);
			addToast({
				title: "Copied",
				description: "Lines copied to clipboard",
				type: "success",
			});
		} catch (error) {
			setContextMenuPosition(null);
			addToast({
				description: error instanceof Error ? error.message : String(error),
				title: "Failed to copy",
				type: "error",
			});
		}
	}, [diffLineSelection, addToast, setContextMenuPosition]);

	const handleCommit = useCallback(
		async (commitMsg: string) => {
			if (!commitMsg) {
				addToast({
					title: "Commit message",
					description: "Enter a commit message.",
					type: "error",
				});
				return;
			}
			if (commitMsg.length > 500) {
				addToast({
					title: "Commit message",
					description: "Please keep the message under 500 characters.",
					type: "error",
				});
				return;
			}
			setCommitPending(true);
			try {
				const stagedPaths = Array.from(stagedFiles);
				let result: string;
				if (stagedPaths.length > 0) {
					result = await jjSplit(workspacePath, commitMsg, stagedPaths);
					setStagedFiles(new Set());
				} else {
					result = await createCommit(
						repoPath!,
						workspaceId ?? null,
						commitMsg,
					);
				}
				await invalidateCache();
				addToast({
					title: "Commit created",
					description: result.trim() || "Commit successful",
					type: "success",
				});
				await Promise.all([
					loadChangedFiles(),
					refreshCommittedChanges(),
					// A commit changes the ahead count the header and sidebar render.
					queryClient.invalidateQueries({
						queryKey: ["workspace-status", repoPath, workspaceId ?? null],
					}),
					queryClient.invalidateQueries({
						queryKey: ["workspace-statuses", repoPath],
					}),
				]);
			} catch (error) {
				addToast({
					title: "Commit failed",
					description: error instanceof Error ? error.message : String(error),
					type: "error",
				});
			} finally {
				setCommitPending(false);
			}
		},
		[
			workspacePath,
			addToast,
			invalidateCache,
			stagedFiles,
			setStagedFiles,
			loadChangedFiles,
			refreshCommittedChanges,
			repoPath,
			workspaceId,
			queryClient,
		],
	);

	const handleExpandContext = useCallback(
		async (
			filePath: string,
			hunkIndex: number,
			direction: "before" | "after",
		) => {
			const hunk = allFileHunks.get(filePath)?.hunks[hunkIndex];
			if (!hunk) return;
			const key = `${filePath}:${hunkIndex}:${direction}`;
			const existing = expandedContext.get(key) || [];
			const LINES_TO_FETCH = 20;
			const { newStart, newCount } = parseHunkHeader(hunk.header);
			let startLine: number;
			let endLine: number;
			if (direction === "before") {
				const hunkStartLine = newStart;
				endLine = hunkStartLine - 1 - existing.length;
				startLine = Math.max(1, endLine - LINES_TO_FETCH + 1);
				if (startLine > endLine) return;
			} else {
				const hunkEndLine = newStart + newCount - 1;
				startLine = hunkEndLine + 1 + existing.length;
				endLine = startLine + LINES_TO_FETCH - 1;
			}
			try {
				const result = await getWorkspaceFileLines(
					repoPath ?? "",
					workspaceId ?? null,
					filePath,
					false,
					startLine,
					endLine,
				);
				if (result.lines.length > 0) {
					setExpandedContext((prev) => {
						const next = new Map(prev);
						const prevLines = prev.get(key) || [];
						next.set(
							key,
							direction === "before"
								? [...result.lines, ...prevLines]
								: [...prevLines, ...result.lines],
						);
						return next;
					});
				}
			} catch {
				/* context expansion non-critical */
			}
		},
		[repoPath, workspaceId, expandedContext, allFileHunks],
	);

	return {
		fileActionTarget,
		expandedContext,
		commitPending,
		handleDiscardAll,
		handleDiscardFiles,
		handleCopyLineLocation,
		handleCopyLines,
		handleCommit,
		handleExpandContext,
	};
}
