import React, { useCallback, useEffect, useRef, useState } from "react";
import type {
	DiffLinePointer,
	DiffLineSelection,
	FileHunksData,
	LineMouseDownPayload,
} from "../types";

interface UseLineSelectionParams {
	allFileHunks: Map<string, FileHunksData>;
	committedFileHunks?: Map<string, FileHunksData>;
	onClearFileSelections: () => void;
}

export function useLineSelection({
	allFileHunks,
	committedFileHunks,
	onClearFileSelections,
}: UseLineSelectionParams) {
	const [diffLineSelection, setDiffLineSelection] =
		useState<DiffLineSelection | null>(null);
	const [isSelecting, setIsSelecting] = useState(false);
	const [selectionAnchor, setSelectionAnchor] =
		useState<DiffLinePointer | null>(null);
	const [, setCurrentDragLine] = useState<DiffLinePointer | null>(null);
	const [contextMenuPosition, setContextMenuPosition] = useState<{
		x: number;
		y: number;
	} | null>(null);
	const isDraggingRef = useRef<boolean>(false);

	const clearSelection = useCallback(() => {
		setDiffLineSelection(null);
		setContextMenuPosition(null);
	}, []);

	const handleLineMouseDown = useCallback(
		({
			event,
			filePath,
			hunkIndex,
			lineIndex,
			lineContent,
			isStaged,
		}: LineMouseDownPayload) => {
			if (event.button !== 0) return;
			event.preventDefault();
			event.stopPropagation();
			isDraggingRef.current = false;
			setIsSelecting(true);
			setSelectionAnchor({ filePath, hunkIndex, lineIndex });
			setDiffLineSelection({
				filePath,
				lines: [{ hunkIndex, lineIndex, content: lineContent, isStaged }],
			});
			setCurrentDragLine({ filePath, hunkIndex, lineIndex });
			setContextMenuPosition(null);
		},
		[],
	);

	const handleLineMouseEnter = useCallback(
		({ filePath, hunkIndex, lineIndex }: DiffLinePointer) => {
			if (
				!isSelecting ||
				!selectionAnchor ||
				selectionAnchor.filePath !== filePath
			)
				return;
			const working = allFileHunks.get(filePath);
			const committed = committedFileHunks?.get(filePath);
			let fileData = working ?? committed;
			// When the same path appears in both sections, pick the map whose
			// anchor line matches the content captured on mouseDown.
			if (working && committed && diffLineSelection?.lines[0]) {
				const expected = diffLineSelection.lines[0].content;
				const workingLine =
					working.hunks[selectionAnchor.hunkIndex]?.lines[
						selectionAnchor.lineIndex
					];
				if (workingLine !== expected) {
					const committedLine =
						committed.hunks[selectionAnchor.hunkIndex]?.lines[
							selectionAnchor.lineIndex
						];
					if (committedLine === expected) fileData = committed;
				}
			}
			if (!fileData) return;
			const newLines: DiffLineSelection["lines"] = [];
			const minHunk = Math.min(selectionAnchor.hunkIndex, hunkIndex);
			const maxHunk = Math.max(selectionAnchor.hunkIndex, hunkIndex);
			for (let h = minHunk; h <= maxHunk; h++) {
				const hunk = fileData.hunks[h];
				if (!hunk) continue;
				const startLine =
					h === minHunk
						? selectionAnchor.hunkIndex === minHunk
							? selectionAnchor.lineIndex
							: 0
						: 0;
				const endLine =
					h === maxHunk
						? hunkIndex === maxHunk
							? lineIndex
							: hunk.lines.length - 1
						: hunk.lines.length - 1;
				const actualStart = Math.min(startLine, endLine);
				const actualEnd = Math.max(startLine, endLine);
				for (let l = actualStart; l <= actualEnd; l++) {
					const line = hunk.lines[l];
					if (line)
						newLines.push({
							hunkIndex: h,
							lineIndex: l,
							content: line,
							isStaged: false,
						});
				}
			}
			if (
				selectionAnchor.hunkIndex !== hunkIndex ||
				selectionAnchor.lineIndex !== lineIndex
			)
				isDraggingRef.current = true;
			setDiffLineSelection({ filePath, lines: newLines });
			setCurrentDragLine({ filePath, hunkIndex, lineIndex });
		},
		[
			isSelecting,
			selectionAnchor,
			allFileHunks,
			committedFileHunks,
			diffLineSelection,
		],
	);

	const handleLineMouseUp = useCallback(() => {
		setIsSelecting(false);
	}, []);

	const handleBackgroundClick = useCallback(
		(e: React.MouseEvent) => {
			const target = e.target as HTMLElement;
			if (target.closest(".group\\/row")) return;
			if (
				target.closest(
					"button, [role='button'], input, textarea, [role='checkbox'], [role='menuitem']",
				)
			)
				return;
			onClearFileSelections();
		},
		[onClearFileSelections],
	);

	const handleContextMenu = useCallback(
		(e: React.MouseEvent) => {
			if (diffLineSelection && diffLineSelection.lines.length > 0) {
				e.preventDefault();
				setContextMenuPosition({ x: e.clientX, y: e.clientY });
			}
		},
		[diffLineSelection],
	);

	const isLineSelected = useCallback(
		({ filePath, hunkIndex, lineIndex }: DiffLinePointer) => {
			if (!diffLineSelection || diffLineSelection.filePath !== filePath)
				return false;
			return diffLineSelection.lines.some(
				(l) => l.hunkIndex === hunkIndex && l.lineIndex === lineIndex,
			);
		},
		[diffLineSelection],
	);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				setContextMenuPosition(null);
				setDiffLineSelection(null);
				setCurrentDragLine(null);
			}
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, []);

	useEffect(() => {
		const handleClickOutside = () => {
			setContextMenuPosition(null);
		};
		if (contextMenuPosition) {
			document.addEventListener("click", handleClickOutside);
			return () => document.removeEventListener("click", handleClickOutside);
		}
	}, [contextMenuPosition]);

	useEffect(() => {
		const handleGlobalMouseUp = () => {
			if (isSelecting) setIsSelecting(false);
		};
		document.addEventListener("mouseup", handleGlobalMouseUp);
		return () => document.removeEventListener("mouseup", handleGlobalMouseUp);
	}, [isSelecting]);

	return {
		diffLineSelection,
		setDiffLineSelection,
		contextMenuPosition,
		setContextMenuPosition,
		clearSelection,
		handleLineMouseDown,
		handleLineMouseEnter,
		handleLineMouseUp,
		handleBackgroundClick,
		handleContextMenu,
		isLineSelected,
	};
}
