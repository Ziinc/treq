import { useEffect, useMemo, useState } from "react";
import { type ConflictRegion, type JjDiffHunk, getSetting, parseConflictMarkers } from "../../../lib/api";
import type { ParsedFileChange } from "../../../lib/git-utils";
import type { FileHunksData } from "../types";

interface UseConflictsParams {
	files: ParsedFileChange[];
	allFileHunks: Map<string, FileHunksData>;
	showCommittedChanges: boolean;
	committedFiles: import("../../../lib/api").JjFileChange[];
}

export function useConflicts({ files, allFileHunks, showCommittedChanges, committedFiles }: UseConflictsParams) {
	const [actualConflictedFiles, setActualConflictedFiles] = useState<string[]>([]);
	const [conflictRegionsByFile, setConflictRegionsByFile] = useState<Map<string, ConflictRegion[]>>(new Map());
	const [conflictMarkerStyle, setConflictMarkerStyle] = useState<string>("git");

	useEffect(() => {
		getSetting("conflict_marker_style").then((style: string | null) => {
			if (style) setConflictMarkerStyle(style);
		});
	}, []);

	const filesWithMarkers = useMemo(() => {
		const result: { filePath: string; content: string }[] = [];
		const extractContent = (hunks: JjDiffHunk[]): string | null => {
			const lines: string[] = [];
			let hasConflictMarkers = false;
			for (const hunk of hunks) {
				if (!hunk || !hunk.lines) continue;
				for (const line of hunk.lines) {
					if (!line) continue;
					if (line.startsWith("+") || line.startsWith(" ")) {
						const content = line.substring(1);
						lines.push(content);
						if (content.includes("<<<<<<<")) hasConflictMarkers = true;
					}
				}
			}
			return hasConflictMarkers ? lines.join("\n") : null;
		};
		const allFiles = [
			...(files && Array.isArray(files) ? files : []),
			...(showCommittedChanges && committedFiles && Array.isArray(committedFiles) ? committedFiles : []),
		];
		for (const file of allFiles) {
			if (!file || !file.path) continue;
			const fileHunksData = allFileHunks.get(file.path);
			if (!fileHunksData || fileHunksData.isLoading || !fileHunksData.hunks) continue;
			const content = extractContent(fileHunksData.hunks);
			if (content) result.push({ content, filePath: file.path });
		}
		return result;
	}, [files, allFileHunks, showCommittedChanges, committedFiles]);

	useEffect(() => {
		if (filesWithMarkers.length === 0) {
			setActualConflictedFiles([]);
			setConflictRegionsByFile(new Map());
			return;
		}
		const expectedStyle: "jj" | "git" = conflictMarkerStyle === "git" ? "git" : "jj";
		let cancelled = false;
		const parseFile = ({ filePath, content }: { filePath: string; content: string }) =>
			parseConflictMarkers(content, filePath).then((allRegions) => {
				const filtered = allRegions.filter((r) => r.marker_style === expectedStyle);
				const regions = filtered.length > 0 ? filtered : allRegions.length > 0 ? allRegions : null;
				return { filePath, regions };
			});
		Promise.all(filesWithMarkers.map(parseFile)).then((results) => {
			if (cancelled) return;
			const conflicted: string[] = [];
			const regionsByFile = new Map<string, ConflictRegion[]>();
			for (const { filePath, regions } of results) {
				if (regions && !regionsByFile.has(filePath)) { conflicted.push(filePath); regionsByFile.set(filePath, regions); }
			}
			setActualConflictedFiles(conflicted);
			setConflictRegionsByFile(regionsByFile);
		});
		return () => { cancelled = true; };
	}, [filesWithMarkers, conflictMarkerStyle]);

	const conflictLineLookups = useMemo(() => {
		const map = new Map<string, Map<number, ConflictRegion>>();
		for (const [filePath, regions] of conflictRegionsByFile) {
			if (!regions || regions.length === 0) continue;
			const lineMap = new Map<number, ConflictRegion>();
			for (const region of regions) {
				for (let line = region.start_line; line <= region.end_line; line++) lineMap.set(line, region);
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
