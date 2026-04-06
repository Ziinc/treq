import { useState, useMemo, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import type { ConflictRegion } from "../lib/api";

export interface ConflictComment {
	id: string;
	conflictId: string;
	filePath: string;
	conflictNumber: number;
	text: string;
	createdAt: string;
}

export interface UseConflictStateResult {
	actualConflictedFiles: string[];
	setActualConflictedFiles: (files: string[]) => void;

	conflictRegionsByFile: Map<string, ConflictRegion[]>;
	setConflictRegionsByFile: (regions: Map<string, ConflictRegion[]>) => void;

	/** Line-number → ConflictRegion lookup, one map per file path. */
	conflictLineLookups: Map<string, Map<number, ConflictRegion>>;

	/** First region id per file, used to auto-expand the initial conflict. */
	firstConflictRegionIdByFile: Map<string, string>;

	conflictComments: Map<string, ConflictComment>;
	setConflictComments: (comments: Map<string, ConflictComment>) => void;

	openConflictComments: Set<string>;

	editingConflictCommentId: string | null;

	saveConflictComment: (
		conflictId: string,
		filePath: string,
		conflictNumber: number,
		text: string,
	) => void;
	clearConflictComment: (conflictId: string) => void;
	startEditConflictComment: (conflictId: string) => void;
	cancelEditConflictComment: () => void;
	saveEditConflictComment: (conflictId: string, newText: string) => void;
	toggleConflictComment: (conflictId: string) => void;
	/** Remove a specific conflict from the open set (close its comment panel). */
	closeConflictComment: (conflictId: string) => void;
}

export function useConflictState(): UseConflictStateResult {
	const [actualConflictedFiles, setActualConflictedFiles] = useState<string[]>(
		[],
	);
	const [conflictRegionsByFile, setConflictRegionsByFile] = useState<
		Map<string, ConflictRegion[]>
	>(new Map());
	const [conflictComments, setConflictCommentsRaw] = useState<
		Map<string, ConflictComment>
	>(new Map());
	const [openConflictComments, setOpenConflictComments] = useState<Set<string>>(
		new Set(),
	);
	const [editingConflictCommentId, setEditingConflictCommentId] = useState<
		string | null
	>(null);

	const conflictLineLookups = useMemo(() => {
		const map = new Map<string, Map<number, ConflictRegion>>();
		for (const [filePath, regions] of conflictRegionsByFile) {
			if (!regions || regions.length === 0) continue;
			const lineMap = new Map<number, ConflictRegion>();
			for (const region of regions) {
				for (let line = region.startLine; line <= region.endLine; line++) {
					lineMap.set(line, region);
				}
			}
			map.set(filePath, lineMap);
		}
		return map;
	}, [conflictRegionsByFile]);

	const firstConflictRegionIdByFile = useMemo(() => {
		const map = new Map<string, string>();
		for (const [filePath, regions] of conflictRegionsByFile) {
			if (regions && regions.length > 0) {
				map.set(filePath, regions[0].id);
			}
		}
		return map;
	}, [conflictRegionsByFile]);

	const saveConflictComment = useCallback(
		(
			conflictId: string,
			filePath: string,
			conflictNumber: number,
			text: string,
		) => {
			if (!text.trim()) return;

			const comment: ConflictComment = {
				id: uuidv4(),
				conflictId,
				filePath,
				conflictNumber,
				text: text.trim(),
				createdAt: new Date().toISOString(),
			};

			setConflictCommentsRaw((prev) => {
				const next = new Map(prev);
				next.set(conflictId, comment);
				return next;
			});
		},
		[],
	);

	const clearConflictComment = useCallback((conflictId: string) => {
		setConflictCommentsRaw((prev) => {
			const next = new Map(prev);
			next.delete(conflictId);
			return next;
		});
	}, []);

	const startEditConflictComment = useCallback((conflictId: string) => {
		setEditingConflictCommentId(conflictId);
	}, []);

	const cancelEditConflictComment = useCallback(() => {
		setEditingConflictCommentId(null);
	}, []);

	const saveEditConflictComment = useCallback(
		(conflictId: string, newText: string) => {
			if (!newText.trim()) return;

			setConflictCommentsRaw((prev) => {
				const next = new Map(prev);
				const existing = prev.get(conflictId);
				if (existing) {
					next.set(conflictId, { ...existing, text: newText.trim() });
				}
				return next;
			});
			setEditingConflictCommentId(null);
		},
		[],
	);

	const toggleConflictComment = useCallback((conflictId: string) => {
		setOpenConflictComments((prev) => {
			const next = new Set(prev);
			if (next.has(conflictId)) {
				next.delete(conflictId);
			} else {
				next.add(conflictId);
			}
			return next;
		});
	}, []);

	const closeConflictComment = useCallback((conflictId: string) => {
		setOpenConflictComments((prev) => {
			const next = new Set(prev);
			next.delete(conflictId);
			return next;
		});
	}, []);

	return {
		actualConflictedFiles,
		setActualConflictedFiles,
		conflictRegionsByFile,
		setConflictRegionsByFile,
		conflictLineLookups,
		firstConflictRegionIdByFile,
		conflictComments,
		setConflictComments: setConflictCommentsRaw,
		openConflictComments,
		editingConflictCommentId,
		saveConflictComment,
		clearConflictComment,
		startEditConflictComment,
		cancelEditConflictComment,
		saveEditConflictComment,
		toggleConflictComment,
		closeConflictComment,
	};
}
