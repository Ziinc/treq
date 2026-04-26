import { type Dispatch, type SetStateAction, useEffect, useRef } from "react";
import {
	type BranchStatus,
	type JjDiffHunk,
	type JjFileChange,
	type Workspace,
	type WorkspaceStatus,
	checkBranchExists,
	getRepoSetting,
	getWorkspaceChangedFiles,
	getWorkspaceFileHunks,
	getWorkspaceStatus,
	getWorkspaces,
	jjGitFetchBackground,
	listRepoBranches,
} from "../lib/api";
import type { BranchListItem } from "../components/TargetBranchSelector";
import { applyBranchNamePattern } from "../lib/utils";
import type { WorkspaceDialogDefaults } from "../components/UnifiedWorkspaceDialog";

type HunkMap = Map<string, { hunks: JjDiffHunk[]; isLoading: boolean }>;

export interface UseWorkspaceDialogEffectsParams {
	open: boolean;
	repoPath: string;
	defaults: WorkspaceDialogDefaults;
	sourceWorkspace: Workspace | null;
	isHomeRepo: boolean;
	intent: string;
	branchName: string;
	branchPattern: string;
	isEditingBranch: boolean;
	moveToExisting: boolean;
	isStackOnRoot: boolean;
	position: "before" | "after";
	fileHunksMap: HunkMap;
	setIntent: (v: string) => void;
	setBranchName: (v: string) => void;
	setBranchPattern: (v: string) => void;
	setIsEditingBranch: (v: boolean) => void;
	setLoading: (v: boolean) => void;
	setError: (v: string) => void;
	setBranchStatusData: (v: BranchStatus | null) => void;
	setIsCheckingBranch: (v: boolean) => void;
	setTargetBranch: (v: string | null) => void;
	setAvailableBranches: (v: BranchListItem[]) => void;
	setBranchesLoading: (v: boolean) => void;
	setPosition: (v: "before" | "after") => void;
	setActiveRightTab: (v: "commits" | "changes") => void;
	setChangedFiles: (v: JjFileChange[]) => void;
	setFileHunksMap: Dispatch<SetStateAction<HunkMap>>;
	setExpandedFiles: Dispatch<SetStateAction<Set<string>>>;
	setSelectedHunks: Dispatch<SetStateAction<Set<string>>>;
	setWorkspaceStatus: (v: WorkspaceStatus | null) => void;
	setSelectedCommits: Dispatch<SetStateAction<Set<string>>>;
	setDataLoading: (v: boolean) => void;
	setAllWorkspaces: (v: Workspace[]) => void;
	setMoveToExisting: (v: boolean) => void;
	setTargetWorkspaceId: (v: number | null) => void;
}

export function useWorkspaceDialogEffects(
	params: UseWorkspaceDialogEffectsParams,
) {
	const {
		open,
		repoPath,
		defaults,
		sourceWorkspace,
		isHomeRepo,
		intent,
		branchName,
		branchPattern,
		isEditingBranch,
		moveToExisting,
		isStackOnRoot,
		position,
		fileHunksMap,
		setIntent,
		setBranchName,
		setBranchPattern,
		setIsEditingBranch,
		setLoading,
		setError,
		setBranchStatusData,
		setIsCheckingBranch,
		setTargetBranch,
		setAvailableBranches,
		setBranchesLoading,
		setPosition,
		setActiveRightTab,
		setChangedFiles,
		setFileHunksMap,
		setExpandedFiles,
		setSelectedHunks,
		setWorkspaceStatus,
		setSelectedCommits,
		setDataLoading,
		setAllWorkspaces,
		setMoveToExisting,
		setTargetWorkspaceId,
	} = params;

	const checkBranchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

	useEffect(() => {
		if (!open) return;

		setError("");
		setBranchStatusData(null);
		setIsEditingBranch(false);
		setLoading(false);
		setMoveToExisting(false);
		setTargetWorkspaceId(null);

		if (defaults.activeTab) {
			setActiveRightTab(defaults.activeTab);
		} else {
			setActiveRightTab("commits");
		}

		const initIntent = defaults.intent ?? "";
		setIntent(initIntent);

		if (defaults.branchName) {
			setBranchName(defaults.branchName);
			setIsEditingBranch(true);
		} else {
			setBranchName("");
			setIsEditingBranch(false);
		}

		setTargetBranch(defaults.targetBranch ?? null);
		setSelectedHunks(new Set());
		setFileHunksMap(new Map());
		setExpandedFiles(new Set());
		setSelectedCommits(new Set(defaults.preSelectedCommits ?? []));

		if (sourceWorkspace) {
			setDataLoading(true);
			Promise.all([
				getWorkspaceStatus(repoPath, sourceWorkspace.id),
				getWorkspaceChangedFiles(repoPath, sourceWorkspace.id),
				getWorkspaces(repoPath),
			])
				.then(([status, files, workspaceList]) => {
					setWorkspaceStatus(status);
					setChangedFiles(files);
					setAllWorkspaces(workspaceList);
					const others = workspaceList.filter(
						(w) => w.id !== sourceWorkspace.id,
					);
					if (others.length > 0) setTargetWorkspaceId(others[0].id);
				})
				.catch((err) => {
					console.error("Failed to load workspace data:", err);
					setWorkspaceStatus(null);
					setChangedFiles([]);
				})
				.finally(() => setDataLoading(false));
		} else if (isHomeRepo) {
			setDataLoading(true);
			Promise.all([
				getWorkspaceChangedFiles(repoPath, null),
				getWorkspaces(repoPath),
			])
				.then(([files, workspaceList]) => {
					setChangedFiles(files);
					setAllWorkspaces(workspaceList);
				})
				.catch(() => setChangedFiles([]))
				.finally(() => setDataLoading(false));

			setBranchesLoading(true);
			jjGitFetchBackground(repoPath).catch(() => {});
			listRepoBranches(repoPath)
				.then((branches) => {
					setAvailableBranches(
						branches.map((b) => ({
							name: b.name,
							fullName: b.name,
							isCurrent: b.is_current,
						})),
					);
				})
				.catch(() => setAvailableBranches([]))
				.finally(() => setBranchesLoading(false));
		} else {
			setChangedFiles([]);
			setWorkspaceStatus(null);
			getWorkspaces(repoPath)
				.then(setAllWorkspaces)
				.catch(() => setAllWorkspaces([]));

			if (!defaults.targetBranch) {
				setBranchesLoading(true);
				jjGitFetchBackground(repoPath).catch(() => {});
				listRepoBranches(repoPath)
					.then((branches) => {
						setAvailableBranches(
							branches.map((b) => ({
								name: b.name,
								fullName: b.name,
								isCurrent: b.is_current,
							})),
						);
					})
					.catch(() => setAvailableBranches([]))
					.finally(() => setBranchesLoading(false));
			}
		}
	}, [open]);

	useEffect(() => {
		if (open && repoPath) {
			getRepoSetting(repoPath, "branch_name_pattern")
				.then((pattern) => setBranchPattern(pattern || "treq/{name}"))
				.catch(() => setBranchPattern("treq/{name}"));
		}
	}, [open, repoPath]);

	useEffect(() => {
		if (!isEditingBranch && intent.trim()) {
			setBranchName(applyBranchNamePattern(branchPattern, intent));
		} else if (!isEditingBranch && !intent.trim()) {
			setBranchName("");
		}
	}, [intent, branchPattern, isEditingBranch]);

	useEffect(() => {
		if (checkBranchTimeoutRef.current)
			clearTimeout(checkBranchTimeoutRef.current);
		if (!branchName.trim()) {
			setBranchStatusData(null);
			setIsCheckingBranch(false);
			return;
		}
		if (moveToExisting) return;
		setIsCheckingBranch(true);
		checkBranchTimeoutRef.current = setTimeout(async () => {
			try {
				const status = await checkBranchExists(repoPath, branchName);
				setBranchStatusData(status);
			} catch {
				setBranchStatusData({ local_exists: false, remote_exists: false });
			} finally {
				setIsCheckingBranch(false);
			}
		}, 500);
		return () => {
			if (checkBranchTimeoutRef.current)
				clearTimeout(checkBranchTimeoutRef.current);
		};
	}, [branchName, repoPath, moveToExisting]);

	useEffect(() => {
		if (isStackOnRoot && position !== "after") setPosition("after");
	}, [isStackOnRoot, position]);

	useEffect(() => {
		for (const [filePath, data] of fileHunksMap) {
			if (data.isLoading && data.hunks.length === 0) {
				getWorkspaceFileHunks(repoPath, sourceWorkspace?.id ?? null, filePath)
					.then((hunks) =>
						setFileHunksMap((prev) =>
							new Map(prev).set(filePath, { hunks, isLoading: false }),
						),
					)
					.catch(() =>
						setFileHunksMap((prev) =>
							new Map(prev).set(filePath, { hunks: [], isLoading: false }),
						),
					);
			}
		}
	}, [fileHunksMap]);
}
