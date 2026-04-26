import React, { useCallback, useEffect, useRef, useState } from "react";
import type { DiffLineSelection, FileHunksData } from "../types";

interface UseLineSelectionParams {
	allFileHunks: Map<string, FileHunksData>;
	onClearFileSelections: () => void;
}

export function useLineSelection({
	allFileHunks,
	onClearFileSelections,
}: UseLineSelectionParams) {
	const [diffLineSelection, setDiffLineSelection] =
		useState<DiffLineSelection | null>(null);
	const [isSelecting, setIsSelecting] = useState(false);
	const [selectionAnchor, setSelectionAnchor] = useState<{
		filePath: string;
		hunkIndex: number;
		lineIndex: number;
	} | null>(null);
	const [, setCurrentDragLine] = useState<{
		filePath: string;
		hunkIndex: number;
		lineIndex: number;
	} | null>(null);
	const [contextMenuPosition, setContextMenuPosition] = useState<{
		x: number;
		y: number;
	} | null>(null);
	const isDraggingRef = useRef<boolean>(false);

	const clearSelection = useCallback(() => {
		setDiffLineSelection(null);
		setContextMenuPosition(null);
	}, []);

	// eslint-disable-next-line max-params
	const handleLineMouseDown = useCallback(
		(
			e: React.MouseEvent,
			filePath: string,
			hunkIndex: number,
			lineIndex: number,
			lineContent: string,
			isStaged: boolean,
		) => {
			if (e.button !== 0) return;
			e.preventDefault();
			e.stopPropagation();
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
		(filePath: string, hunkIndex: number, lineIndex: number) => {
			if (
				!isSelecting ||
				!selectionAnchor ||
				selectionAnchor.filePath !== filePath
			)
				return;
			const fileData = allFileHunks.get(filePath);
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
		[isSelecting, selectionAnchor, allFileHunks],
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
		(filePath: string, hunkIndex: number, lineIndex: number) => {
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
