import { useState } from "react";
import { useDebounce } from "./useDebounce";

export interface DiffViewerState {
	// File collapse/expand
	collapsedFiles: Set<string>;
	collapseFile: (filePath: string) => void;
	expandFile: (filePath: string) => void;
	toggleFileCollapse: (filePath: string) => void;

	// Large-diff expand
	expandedLargeDiffs: Set<string>;
	toggleLargeDiff: (filePath: string) => void;

	// Section collapse (e.g. "staged", "unstaged")
	collapsedSections: Set<string>;
	toggleSection: (sectionKey: string) => void;

	// Search
	isSearchOpen: boolean;
	searchQuery: string;
	debouncedSearchQuery: string;
	currentMatchIndex: number;
	searchFocusTrigger: number;
	openSearch: () => void;
	closeSearch: () => void;
	setSearchQuery: (query: string) => void;
	goToNextMatch: (totalMatches: number) => void;
	goToPrevMatch: (totalMatches: number) => void;
	/** Set match index explicitly (for callers that pre-compute it). */
	setCurrentMatchIndex: (idx: number) => void;
	/** Increment focus trigger to re-focus the search input programmatically. */
	triggerSearchFocus: () => void;
}

export function useDiffViewerState(): DiffViewerState {
	const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(
		new Set(),
	);
	const [expandedLargeDiffs, setExpandedLargeDiffs] = useState<Set<string>>(
		new Set(),
	);
	const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
		new Set(),
	);

	// Search state
	const [isSearchOpen, setIsSearchOpen] = useState(false);
	const [searchQuery, setSearchQueryRaw] = useState("");
	const debouncedSearchQuery = useDebounce(searchQuery, 150);
	const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
	const [searchFocusTrigger, setSearchFocusTrigger] = useState(0);

	return {
		// Collapse / expand
		collapsedFiles,
		collapseFile: (filePath) =>
			setCollapsedFiles((prev) => new Set(prev).add(filePath)),
		expandFile: (filePath) =>
			setCollapsedFiles((prev) => {
				const next = new Set(prev);
				next.delete(filePath);
				return next;
			}),
		toggleFileCollapse: (filePath) =>
			setCollapsedFiles((prev) => {
				const next = new Set(prev);
				if (next.has(filePath)) {
					next.delete(filePath);
				} else {
					next.add(filePath);
				}
				return next;
			}),

		// Large diffs
		expandedLargeDiffs,
		toggleLargeDiff: (filePath) =>
			setExpandedLargeDiffs((prev) => {
				const next = new Set(prev);
				if (next.has(filePath)) {
					next.delete(filePath);
				} else {
					next.add(filePath);
				}
				return next;
			}),

		// Sections
		collapsedSections,
		toggleSection: (key) =>
			setCollapsedSections((prev) => {
				const next = new Set(prev);
				if (next.has(key)) {
					next.delete(key);
				} else {
					next.add(key);
				}
				return next;
			}),

		// Search
		isSearchOpen,
		searchQuery,
		debouncedSearchQuery,
		currentMatchIndex,
		searchFocusTrigger,
		openSearch: () => {
			setIsSearchOpen(true);
			setSearchFocusTrigger((n) => n + 1);
		},
		closeSearch: () => {
			setIsSearchOpen(false);
			setSearchQueryRaw("");
			setCurrentMatchIndex(0);
		},
		setSearchQuery: (query) => {
			setSearchQueryRaw(query);
			setCurrentMatchIndex(0);
		},
		goToNextMatch: (total) =>
			setCurrentMatchIndex((prev) => (prev + 1) % total),
		goToPrevMatch: (total) =>
			setCurrentMatchIndex((prev) => (prev - 1 + total) % total),
		setCurrentMatchIndex,
		triggerSearchFocus: () => setSearchFocusTrigger((n) => n + 1),
	};
}
