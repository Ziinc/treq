import React, { useCallback, useState } from "react";
import type { ParsedFileChange } from "../../../lib/git-utils";
import { useKeyboardShortcut } from "../../../hooks/useKeyboard";

interface UseFileStagingParams {
	files: ParsedFileChange[];
	diffContainerRef: React.RefObject<HTMLDivElement>;
}

export function useFileStaging({
	files,
	diffContainerRef,
}: UseFileStagingParams) {
	const [stagedFiles, setStagedFiles] = useState<Set<string>>(new Set());
	const [selectedUnstagedFiles, setSelectedUnstagedFiles] = useState<
		Set<string>
	>(new Set());
	const [lastSelectedFileIndex, setLastSelectedFileIndex] = useState<
		number | null
	>(null);
	const [selectedStagedFiles, setSelectedStagedFiles] = useState<Set<string>>(
		new Set(),
	);
	const [lastSelectedStagedIndex, setLastSelectedStagedIndex] = useState<
		number | null
	>(null);
	const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());
	const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
		new Set(),
	);
	const [expandedLargeDiffs, setExpandedLargeDiffs] = useState<Set<string>>(
		new Set(),
	);
	const [largeChangesetExpanded, setLargeChangesetExpanded] = useState(false);

	const unstagedFiles = files.filter((f) => !stagedFiles.has(f.path));
	const stagedFilesList = files.filter((f) => stagedFiles.has(f.path));

	const scrollToFileIfNeeded = useCallback(
		(filePath: string) => {
			if (!filePath) return;
			setLargeChangesetExpanded(true);
			setCollapsedFiles((prev) => {
				const next = new Set(prev);
				next.delete(filePath);
				return next;
			});
			setExpandedLargeDiffs((prev) => {
				const next = new Set(prev);
				next.add(filePath);
				return next;
			});
			setTimeout(() => {
				const container = diffContainerRef.current;
				if (!container) return;
				const fileId = `file-section-${filePath.replace(/[^a-zA-Z0-9]/g, "-")}`;
				const fileElement = document.getElementById(fileId);
				if (fileElement)
					fileElement.scrollIntoView({ behavior: "smooth", block: "start" });
			}, 50);
		},
		[diffContainerRef],
	);

	const handleFileSelect = useCallback(
		(path: string, event: React.MouseEvent) => {
			const fileIndex = files.findIndex((f) => f.path === path);
			if (fileIndex === -1) return;
			const isMetaKey = event.metaKey || event.ctrlKey;
			const isShiftKey = event.shiftKey;
			setSelectedUnstagedFiles((prev) => {
				const next = new Set(prev);
				if (isShiftKey && lastSelectedFileIndex !== null) {
					next.clear();
					const start = Math.min(lastSelectedFileIndex, fileIndex);
					const end = Math.max(lastSelectedFileIndex, fileIndex);
					for (let i = start; i <= end; i++) next.add(files[i].path);
				} else if (isMetaKey) {
					if (next.has(path)) next.delete(path);
					else next.add(path);
				} else {
					if (next.size === 1 && next.has(path)) return prev;
					next.clear();
					next.add(path);
				}
				return next;
			});
			setLastSelectedFileIndex(fileIndex);
			scrollToFileIfNeeded(path);
		},
		[lastSelectedFileIndex, files, scrollToFileIfNeeded],
	);

	const handleStageFiles = useCallback((paths: string[]) => {
		setStagedFiles((prev) => {
			const next = new Set(prev);
			paths.forEach((p) => next.add(p));
			return next;
		});
		setSelectedUnstagedFiles(new Set());
	}, []);

	const handleStageFile = useCallback(
		(path: string) => {
			if (selectedUnstagedFiles.size > 1 && selectedUnstagedFiles.has(path)) {
				handleStageFiles(Array.from(selectedUnstagedFiles));
			} else {
				handleStageFiles([path]);
			}
		},
		[selectedUnstagedFiles, handleStageFiles],
	);

	const handleUnstageFile = useCallback((path: string) => {
		setStagedFiles((prev) => {
			const next = new Set(prev);
			next.delete(path);
			return next;
		});
		setSelectedStagedFiles(new Set());
	}, []);

	const handleUnstageAllFiles = useCallback(() => {
		setStagedFiles(new Set());
		setSelectedStagedFiles(new Set());
	}, []);

	const handleStagedFileSelect = useCallback(
		(path: string, event: React.MouseEvent) => {
			const stagedFilesArray = files.filter((f) => stagedFiles.has(f.path));
			const fileIndex = stagedFilesArray.findIndex((f) => f.path === path);
			if (fileIndex === -1) return;
			const isMetaKey = event.metaKey || event.ctrlKey;
			const isShiftKey = event.shiftKey;
			setSelectedStagedFiles((prev) => {
				const next = new Set(prev);
				if (isShiftKey && lastSelectedStagedIndex !== null) {
					next.clear();
					const start = Math.min(lastSelectedStagedIndex, fileIndex);
					const end = Math.max(lastSelectedStagedIndex, fileIndex);
					for (let i = start; i <= end; i++) next.add(stagedFilesArray[i].path);
				} else if (isMetaKey) {
					if (next.has(path)) next.delete(path);
					else next.add(path);
				} else {
					if (next.size === 1 && next.has(path)) return prev;
					next.clear();
					next.add(path);
				}
				return next;
			});
			setLastSelectedStagedIndex(fileIndex);
		},
		[stagedFiles, files, lastSelectedStagedIndex],
	);

	const toggleFileCollapse = useCallback((filePath: string) => {
		setCollapsedFiles((prev) => {
			const next = new Set(prev);
			if (next.has(filePath)) next.delete(filePath);
			else next.add(filePath);
			return next;
		});
	}, []);

	const toggleLargeDiff = useCallback((filePath: string) => {
		setExpandedLargeDiffs((prev) => {
			const next = new Set(prev);
			if (next.has(filePath)) next.delete(filePath);
			else next.add(filePath);
			return next;
		});
	}, []);

	const toggleSectionCollapse = useCallback((sectionId: string) => {
		setCollapsedSections((prev) => {
			const next = new Set(prev);
			if (next.has(sectionId)) next.delete(sectionId);
			else next.add(sectionId);
			return next;
		});
	}, []);

	const handleStageAllFiles = useCallback(() => {
		const unstagedPaths = unstagedFiles.map((f) => f.path);
		if (unstagedPaths.length === 0) return;
		setStagedFiles((prev) => {
			const next = new Set(prev);
			unstagedPaths.forEach((path) => next.add(path));
			return next;
		});
		setSelectedUnstagedFiles(new Set());
		setLastSelectedFileIndex(null);
	}, [unstagedFiles]);

	const handleSelectAllUnstaged = useCallback(() => {
		setSelectedUnstagedFiles((prev) => {
			if (prev.size === unstagedFiles.length && unstagedFiles.length > 0)
				return new Set();
			return new Set(unstagedFiles.map((f) => f.path));
		});
		if (unstagedFiles.length > 0)
			setLastSelectedFileIndex(
				files.findIndex(
					(f) => f.path === unstagedFiles[unstagedFiles.length - 1].path,
				),
			);
	}, [unstagedFiles, files]);

	const handleSelectAllStaged = useCallback(() => {
		setSelectedStagedFiles((prev) => {
			if (prev.size === stagedFilesList.length && stagedFilesList.length > 0)
				return new Set();
			return new Set(stagedFilesList.map((f) => f.path));
		});
		if (stagedFilesList.length > 0)
			setLastSelectedStagedIndex(stagedFilesList.length - 1);
	}, [files, stagedFilesList]);

	useKeyboardShortcut(
		"a",
		true,
		() => {
			if (selectedStagedFiles.size > 0) {
				setSelectedStagedFiles(new Set(stagedFilesList.map((f) => f.path)));
				if (stagedFilesList.length > 0)
					setLastSelectedStagedIndex(stagedFilesList.length - 1);
			} else {
				setSelectedUnstagedFiles(new Set(unstagedFiles.map((f) => f.path)));
				if (unstagedFiles.length > 0)
					setLastSelectedFileIndex(
						files.findIndex(
							(f) => f.path === unstagedFiles[unstagedFiles.length - 1].path,
						),
					);
			}
		},
		[selectedStagedFiles, stagedFilesList, unstagedFiles, files],
	);

	return {
		stagedFiles,
		setStagedFiles,
		selectedUnstagedFiles,
		setSelectedUnstagedFiles,
		lastSelectedFileIndex,
		setLastSelectedFileIndex,
		selectedStagedFiles,
		setSelectedStagedFiles,
		lastSelectedStagedIndex,
		setLastSelectedStagedIndex,
		collapsedFiles,
		setCollapsedFiles,
		collapsedSections,
		expandedLargeDiffs,
		setExpandedLargeDiffs,
		largeChangesetExpanded,
		setLargeChangesetExpanded,
		unstagedFiles,
		stagedFilesList,
		scrollToFileIfNeeded,
		handleFileSelect,
		handleStageFiles,
		handleStageFile,
		handleUnstageFile,
		handleUnstageAllFiles,
		handleStagedFileSelect,
		toggleFileCollapse,
		toggleLargeDiff,
		toggleSectionCollapse,
		handleStageAllFiles,
		handleSelectAllUnstaged,
		handleSelectAllStaged,
	};
}
