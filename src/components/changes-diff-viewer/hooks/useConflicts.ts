import { useMemo } from "react";
import { type ConflictRegion } from "../../../lib/api";
import type { ParsedFileChange } from "../../../lib/git-utils";
import type { FileHunksData } from "../types";

interface UseConflictsParams {
	files: ParsedFileChange[];
	allFileHunks: Map<string, FileHunksData>;
	showCommittedChanges: boolean;
	committedFiles: import("../../../lib/api").JjFileChange[];
	conflictedFilesHint?: string[];
}

const normalizeRegion = (
	filePath: string,
	region: ConflictRegion,
	index: number,
): ConflictRegion => {
	const conflictNumber =
		region.conflict_number && region.conflict_number > 0
			? region.conflict_number
			: index + 1;
	return {
		...region,
		file_path: filePath,
		conflict_number: conflictNumber,
		id: `${filePath}-conflict-${conflictNumber}`,
	};
};

export function useConflicts({
	files,
	allFileHunks,
	showCommittedChanges,
	committedFiles,
	conflictedFilesHint = [],
}: UseConflictsParams) {
	const actualConflictedFiles = useMemo(() => {
		const fileOrder: string[] = [];
		const seen = new Set<string>();
		for (const path of conflictedFilesHint) {
			if (!seen.has(path)) {
				seen.add(path);
				fileOrder.push(path);
			}
		}
		return fileOrder;
	}, [conflictedFilesHint]);

	const conflictRegionsByFile = useMemo(() => {
		const regionsByFile = new Map<string, ConflictRegion[]>();
		for (const filePath of actualConflictedFiles) {
			const fileHunksData = allFileHunks.get(filePath);
			const regions =
				fileHunksData?.hunks
					.flatMap((hunk) => hunk.conflict_regions ?? [])
					.map((region, idx) => normalizeRegion(filePath, region, idx)) ?? [];
			regionsByFile.set(filePath, regions);
		}
		return regionsByFile;
	}, [actualConflictedFiles, allFileHunks]);

	const conflictLineLookups = useMemo(() => {
		const map = new Map<string, Map<number, ConflictRegion>>();
		for (const [filePath, regions] of conflictRegionsByFile) {
			if (!regions || regions.length === 0) continue;
			const lineMap = new Map<number, ConflictRegion>();
			for (const region of regions) {
				for (let line = region.start_line; line <= region.end_line; line++) {
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
			if (regions && regions.length > 0) map.set(filePath, regions[0].id);
		}
		return map;
	}, [conflictRegionsByFile]);

	return {
		actualConflictedFiles,
		conflictRegionsByFile,
		conflictLineLookups,
		firstConflictRegionIdByFile,
	};
}
