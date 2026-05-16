/* eslint-disable max-lines */

import {
	Suspense,
	lazy,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { ask } from "@tauri-apps/plugin-dialog";
import {
	UnifiedWorkspaceDialog,
	type WorkspaceDialogDefaults,
} from "./UnifiedWorkspaceDialog";
import { CommandPalette } from "./CommandPalette";
import { WorkspacePicker } from "./WorkspacePicker";
import { WorkspaceSidebar } from "./WorkspaceSidebar";
import { ErrorBoundary } from "./ErrorBoundary";
import {
	WorkspaceTerminalPane,
	type WorkspaceTerminalPaneHandle,
} from "./WorkspaceTerminalPane";
import type { ClaudeSessionData } from "./terminal/types";

// Lazy imports
const ShowWorkspace = lazy(() =>
	import("./ShowWorkspace").then((m) => ({ default: m.ShowWorkspace })),
);
import { SettingsPage } from "./SettingsPage";
import { MergePreviewPage } from "./MergePreviewPage";
import { useToast } from "./ui/toast";
import { useKeyboardShortcut } from "../hooks/useKeyboard";
import { useWorkspaceHierarchy } from "../hooks/useWorkspaceHierarchy";
import {
	Workspace,
	createSession,
	deleteWorkspace,
	getRepoBranch,
	getRepoSetting,
	getSessions,
	getSetting,
	getWorkspaces,
	initRepo,
	listRepoBranches,
	selectFolder,
	setSessionModel,
	setSetting,
	setWindowRepoPath,
	updateSessionAccess,
} from "../lib/api";
import { Loader2 } from "lucide-react";
import { getFullWorkspacePath } from "../lib/utils";
import { Onboarding } from "./Onboarding";
import type { BranchListItem } from "./TargetBranchSelector";

// Loading spinner component for Suspense fallback
const LoadingSpinner = () => (
	<div className="flex items-center justify-center h-full w-full">
		<Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
	</div>
);

type ViewMode = "session" | "show-workspace" | "settings" | "merge-preview";

type SessionOpenOptions = {
	initialPrompt?: string;
	promptLabel?: string;
	forceNew?: boolean;
	sessionName?: string;
	selectedFilePath?: string;
};

interface DashboardProps {
	initialViewMode?: ViewMode;
}
export const Dashboard: React.FC<DashboardProps> = ({
	initialViewMode = "show-workspace",
}) => {
	const [repoPath, setRepoPath] = useState(() => {
		const urlParams = new URLSearchParams(window.location.search);
		return urlParams.get("repo") || "";
	});
	const [currentBranch, setCurrentBranch] = useState<string | null>(null);
	const [unifiedDialogDefaults, setUnifiedDialogDefaults] =
		useState<WorkspaceDialogDefaults | null>(null);
	const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
	const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(
		null,
	);
	const [mergeWorkspace, setMergeWorkspace] = useState<Workspace | null>(null);
	const [showCommandPalette, setShowCommandPalette] = useState(false);
	const [showBranchSwitcher, setShowBranchSwitcher] = useState(false);
	const [showFilePicker, setShowFilePicker] = useState(false);
	const [showWorkspacePicker, setShowWorkspacePicker] = useState(false);
	const [showWorkspaceDeletion, setShowWorkspaceDeletion] = useState(false);
	const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
	const [pendingSessionData, setPendingSessionData] = useState<
		Map<
			number,
			{ pendingPrompt?: string; permissionMode?: "plan" | "acceptEdits" }
		>
	>(new Map());
	const [sessionSelectedFile, setSessionSelectedFile] = useState<string | null>(
		null,
	);
	const [selectedWorkspaceIds, setSelectedWorkspaceIds] = useState<Set<number>>(
		new Set(),
	);
	const [lastSelectedWorkspaceIndex, setLastSelectedWorkspaceIndex] = useState<
		number | null
	>(null);
	const [, setShowWorkspaceActiveTab] = useState("overview");

	const terminalPaneRef = useRef<WorkspaceTerminalPaneHandle>(null);

	const queryClient = useQueryClient();
	const { addToast } = useToast();
	const handleReturnToDashboard = useCallback(() => {
		// Navigate to main repo ShowWorkspace > Code
		setSelectedWorkspace(null);
		setActiveSessionId(null);
	}, []);

	const openSettings = useCallback((tab?: string) => {
		void tab;
		setViewMode("settings");
	}, []);

	const handleOpenMergePreview = useCallback(() => {
		if (selectedWorkspace) {
			setMergeWorkspace(selectedWorkspace);
			setViewMode("merge-preview");
		}
	}, [selectedWorkspace]);

	const handleCreateStackedWorkspace = useCallback(() => {
		if (!repoPath) return;

		if (selectedWorkspace) {
			setUnifiedDialogDefaults({
				targetBranch: selectedWorkspace.branch_name,
				sourceWorkspace: selectedWorkspace,
			});
		} else if (currentBranch) {
			setUnifiedDialogDefaults({
				targetBranch: currentBranch,
				sourceWorkspace: null,
			});
		} else {
			addToast({
				title: "Cannot create stacked workspace",
				description: "No parent branch available",
				type: "error",
			});
		}
	}, [repoPath, selectedWorkspace, currentBranch, addToast]);

	// Keyboard shortcuts
	useKeyboardShortcut("n", true, () => {
		setUnifiedDialogDefaults({});
	});

	useKeyboardShortcut(
		"n",
		true,
		() => {
			handleCreateStackedWorkspace();
		},
		[selectedWorkspace, currentBranch],
		{ shift: true },
	);

	useKeyboardShortcut("k", true, () => {
		setShowCommandPalette(true);
	});

	useKeyboardShortcut("p", true, () => {
		setShowFilePicker(true);
	});

	useKeyboardShortcut("Escape", false, () => {
		if (unifiedDialogDefaults) setUnifiedDialogDefaults(null);
		if (showCommandPalette) setShowCommandPalette(false);
		if (showFilePicker) setShowFilePicker(false);
	});

	// Initialize repo from URL param (set by backend on startup, or by "Open in New Window")
	useEffect(() => {
		const loadInitialRepo = async () => {
			if (repoPath) {
				try {
					await initRepo(repoPath);
				} catch (e) {
					console.error("Failed to init repo:", e);
				}
				await setWindowRepoPath(repoPath);
			}
		};

		const loadAppFontSize = async () => {
			// Load and apply font size to html element (sets base for rem units)
			const savedSize = await getSetting("terminal_font_size");
			if (savedSize) {
				const parsed = parseInt(savedSize, 10);
				if (!isNaN(parsed) && parsed >= 8 && parsed <= 32) {
					document.documentElement.style.fontSize = `${parsed}px`;
				}
			} else {
				// Default to 12px if no setting exists
				document.documentElement.style.fontSize = "12px";
			}
		};

		loadInitialRepo();
		loadAppFontSize();
	}, []);

	useEffect(() => {
		if (!repoPath) {
			setCurrentBranch(null);
		}
	}, [repoPath]);

	const { data: repoBranch } = useQuery({
		queryKey: ["repo-branch", repoPath],
		queryFn: () => getRepoBranch(repoPath),
		enabled: !!repoPath,
	});

	useEffect(() => {
		if (!repoPath) return;
		if (!repoBranch?.current_branch) return;
		setCurrentBranch(repoBranch.current_branch);
	}, [repoPath, repoBranch?.current_branch]);

	const {
		data: availableBranches = [],
		isFetching: branchesLoading,
		refetch: loadAvailableBranches,
	} = useQuery<BranchListItem[]>({
		queryKey: ["repo-branches", repoPath],
		enabled: false,
		staleTime: 5 * 60 * 1000,
		queryFn: async () => {
			const jjBranches = await listRepoBranches(repoPath);
			return jjBranches.map((branch) => ({
				name: branch.name,
				fullName: branch.name,
				isCurrent: branch.is_current,
			}));
		},
	});

	const handleLoadAvailableBranches = useCallback(() => {
		if (!repoPath) return;
		void loadAvailableBranches();
	}, [repoPath, loadAvailableBranches]);

	// Manage file watcher lifecycle for selected workspace
	// useEffect(() => {
	// 	if (viewMode !== "show-workspace") return;
	// 	if (showWorkspaceActiveTab !== "changes") return;
	// 	if (!selectedWorkspace) return;

	// 	const workspaceId = selectedWorkspace.id;
	// 	const workspacePath = getFullWorkspacePath(selectedWorkspace);

	// 	// startFileWatcher(workspaceId, workspacePath).catch((err) => {
	// 	// 	console.error("Failed to start file watcher:", err);
	// 	// });

	// 	// // Stop watching when workspace changes or component unmounts
	// 	// return () => {
	// 	// 	stopFileWatcher(workspaceId, workspacePath).catch((err) => {
	// 	// 		console.error("Failed to stop file watcher:", err);
	// 	// 	});
	// 	// };
	// }, [
	// 	viewMode,
	// 	showWorkspaceActiveTab,
	// 	selectedWorkspace?.id,
	// 	selectedWorkspace?.repo_path,
	// 	selectedWorkspace?.workspace_path,
	// ]);

	const { data: sessions = [] } = useQuery({
		queryKey: ["sessions", repoPath],
		queryFn: () => getSessions(repoPath),
		refetchInterval: 30000,
		enabled: !!repoPath,
	});

	const { data: workspaces = [] } = useQuery({
		queryKey: ["workspaces", repoPath],
		queryFn: () => getWorkspaces(repoPath),
		refetchInterval: 10000,
		enabled: !!repoPath,
	});

	// Note: Git cache preloader removed since we're using JJ now

	const deleteWorkspaceMutation = useMutation({
		mutationFn: async (workspace: Workspace) => {
			await deleteWorkspace(workspace.repo_path, workspace.id);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["workspaces", repoPath] });
			queryClient.invalidateQueries({
				queryKey: ["workspace-statuses", repoPath],
			});
			handleReturnToDashboard(); // Navigate to dashboard & clear selected workspace
			addToast({
				title: "Workspace Deleted",
				description: "Workspace has been removed successfully",
				type: "success",
			});
		},
		onError: (error) => {
			addToast({
				title: "Delete Failed",
				description: error instanceof Error ? error.message : String(error),
				type: "error",
			});
		},
	});

	const handleOpenRepository = useCallback(async () => {
		const selected = await selectFolder();
		if (!selected) return;

		try {
			await initRepo(selected);
		} catch (error) {
			addToast({
				title: "Failed to open repository",
				description: error instanceof Error ? error.message : String(error),
				type: "error",
			});
			return;
		}

		await setSetting("last_opened_repo_path", selected);
		await setWindowRepoPath(selected);
		setRepoPath(selected);
		setSelectedWorkspace(null);
		setActiveSessionId(null);
		setSessionSelectedFile(null);
		queryClient.invalidateQueries({ queryKey: ["workspaces"] });
		queryClient.invalidateQueries({ queryKey: ["workspace-statuses"] });
		queryClient.invalidateQueries({ queryKey: ["sessions"] });
		queryClient.invalidateQueries({ queryKey: ["repo-status"] });
		queryClient.invalidateQueries({ queryKey: ["repo-branch"] });

		addToast({
			title: "Repository Opened",
			description: `Now viewing ${selected.split("/").pop() || selected}`,
			type: "success",
		});
	}, [addToast, queryClient]);

	// Consolidate all Tauri event listeners
	useEffect(() => {
		const listeners = [
			// Git config init error handler
			// listen<{ repo_path: string; error: string }>(
			//   "git-config-init-error",
			//   (event) => {
			//     const { repo_path, error } = event.payload;
			//     if (repoPath && repo_path === repoPath) {
			//       addToast({
			//         title: "Git configuration warning",
			//         description: `Could not configure automatic remote tracking: ${error}`,
			//         type: "warning",
			//       });
			//     }
			//   }
			// ),
			// Navigate to settings
			listen("navigate-to-settings", () => {
				setViewMode("settings");
			}),
			// Menu open repository
			listen("menu-open-repository", () => handleOpenRepository()),
			// Menu factory reset
			listen("menu-factory-reset", async () => {
				const confirmed = await ask(
					"Clear the saved repository path and return to the start screen?",
					{
						title: "Factory Reset",
						kind: "warning",
					},
				);
				if (!confirmed) return;

				await setSetting("last_opened_repo_path", "");
				await setWindowRepoPath("");
				setRepoPath("");
				setSelectedWorkspace(null);
				setActiveSessionId(null);
				setSessionSelectedFile(null);
				queryClient.clear();

				addToast({
					title: "Factory Reset Complete",
					description: "Repository path cleared.",
					type: "success",
				});
			}),
			// Menu open in new window
			listen("menu-open-in-new-window", async () => {
				const selected = await selectFolder();
				if (!selected) return;

				try {
					await initRepo(selected);
				} catch {
					addToast({
						title: "Not a Git Repository",
						description:
							"Please select a folder that contains a git repository.",
						type: "error",
					});
					return;
				}

				const windowLabel = `treq-${Date.now()}`;
				const newRepoName =
					selected.split("/").pop() || selected.split("\\").pop() || selected;

				new WebviewWindow(windowLabel, {
					url: `index.html?repo=${encodeURIComponent(selected)}`,
					title: `Treq - ${newRepoName}`,
					width: 1400,
					height: 900,
				});
			}),
		];

		return () => {
			Promise.all(listeners).then((unlistenFns) => {
				unlistenFns.forEach((fn) => fn());
			});
		};
	}, [
		repoPath,
		addToast,
		queryClient,
		deleteWorkspaceMutation,
		handleOpenRepository,
	]);

	// Note: Git merge functionality removed - using JJ now

	// Helper to create or get session
	const getOrCreateSession = useCallback(
		async (
			workspaceId: number | null,
			options?: {
				workspaceBranchName?: string;
				forceNew?: boolean;
				name?: string;
			},
		): Promise<number> => {
			const sessions = await getSessions(repoPath);
			if (!options?.forceNew) {
				const existing = sessions.find((s) => s.workspace_id === workspaceId);
				if (existing) {
					await updateSessionAccess(repoPath, existing.id);
					return existing.id;
				}
			}

			const scopedSessions = sessions.filter(
				(s) => s.workspace_id === workspaceId,
			);
			const index = scopedSessions.length + 1;
			let name = options?.name;
			if (!name) {
				name = `Claude ${index}`;
			}

			const sessionId = await createSession(repoPath, workspaceId, name);

			// Apply default model from settings (repo-level overrides application-level)
			try {
				const repoDefaultModel = await getRepoSetting(
					repoPath,
					"default_model",
				);
				const appDefaultModel = await getSetting("default_model");
				const defaultModel = repoDefaultModel || appDefaultModel;

				if (defaultModel) {
					await setSessionModel(repoPath, sessionId, defaultModel);
				}
			} catch (error) {
				console.warn("Failed to set default model for session:", error);
			}

			queryClient.invalidateQueries({ queryKey: ["sessions"] });
			return sessionId;
		},
		[queryClient, workspaces, repoPath],
	);

	const handleOpenSession = useCallback(
		async (workspace: Workspace | null, options?: SessionOpenOptions) => {
			setSelectedWorkspace(workspace);
			setSessionSelectedFile(options?.selectedFilePath ?? null);
		},
		[getOrCreateSession],
	);

	// Navigate to workspace without creating an agent session
	const handleSelectWorkspace = useCallback((workspace: Workspace | null) => {
		setSelectedWorkspace(workspace);
		setViewMode("show-workspace");
	}, []);

	const { moveWorkspace } = useWorkspaceHierarchy({
		repoPath,
		workspaces,
		defaultBranch: currentBranch || "main",
	});

	const handleAddAfter = useCallback((workspace: Workspace) => {
		setUnifiedDialogDefaults({
			targetBranch: workspace.branch_name,
			sourceWorkspace: workspace,
		});
	}, []);

	const handleAddBefore = useCallback((workspace: Workspace) => {
		setUnifiedDialogDefaults({
			targetBranch: workspace.branch_name,
			sourceWorkspace: workspace,
		});
	}, []);

	const handleMoveWorkspace = useCallback(
		async (workspace: Workspace, targetBranch: string | null) => {
			try {
				await moveWorkspace(workspace, targetBranch);
			} catch (error) {
				addToast({
					title: "Failed to move workspace",
					description: error instanceof Error ? error.message : String(error),
					type: "error",
				});
			}
		},
		[moveWorkspace, addToast],
	);

	const handleSelectStack = useCallback((workspaceIds: Set<number>) => {
		setSelectedWorkspaceIds(workspaceIds);
	}, []);

	const handleCreateSessionFromSidebar = useCallback(
		async (workspaceId: number | null) => {
			const workspace = workspaceId
				? (workspaces.find((w) => w.id === workspaceId) ?? null)
				: null;
			const sessionId = await getOrCreateSession(workspaceId, {
				forceNew: true,
			});
			queryClient.invalidateQueries({ queryKey: ["sessions"] });
			setActiveSessionId(sessionId);
			setSelectedWorkspace(workspace);
		},
		[getOrCreateSession, workspaces, repoPath, queryClient],
	);

	const handleWorkspaceMultiSelect = useCallback(
		(workspace: Workspace | null, event: React.MouseEvent) => {
			// Handle clicking away to clear selection
			if (workspace === null) {
				setSelectedWorkspaceIds(new Set());
				setLastSelectedWorkspaceIndex(null);
				return;
			}

			const workspaceIndex = workspaces.findIndex((w) => w.id === workspace.id);
			if (workspaceIndex === -1) return;

			const isMetaKey = event.metaKey || event.ctrlKey;
			const isShiftKey = event.shiftKey;

			if (isShiftKey && lastSelectedWorkspaceIndex !== null) {
				// Range selection
				const start = Math.min(lastSelectedWorkspaceIndex, workspaceIndex);
				const end = Math.max(lastSelectedWorkspaceIndex, workspaceIndex);
				const newSelection = new Set<number>();
				for (let i = start; i <= end; i++) {
					newSelection.add(workspaces[i].id);
				}
				setSelectedWorkspaceIds(newSelection);
			} else if (isMetaKey) {
				// Toggle selection
				setSelectedWorkspaceIds((prev) => {
					const next = new Set(prev);
					if (next.has(workspace.id)) {
						next.delete(workspace.id);
					} else {
						next.add(workspace.id);
					}
					return next;
				});
				setLastSelectedWorkspaceIndex(workspaceIndex);
			} else {
				// Regular click - clear multi-select, navigate to workspace
				setSelectedWorkspaceIds(new Set());
				setLastSelectedWorkspaceIndex(workspaceIndex);
				handleSelectWorkspace(workspace);
			}
		},
		[workspaces, lastSelectedWorkspaceIndex, handleSelectWorkspace],
	);

	const handleBulkDelete = async () => {
		const count = selectedWorkspaceIds.size;
		const confirmed = await ask(
			`Delete ${count} workspace${count > 1 ? "s" : ""}?`,
			{ title: "Delete Workspaces", kind: "warning" },
		);
		if (confirmed) {
			const workspacesToDelete = workspaces.filter((w) =>
				selectedWorkspaceIds.has(w.id),
			);
			try {
				// Delete all workspaces without triggering individual onSuccess callbacks
				await Promise.all(
					workspacesToDelete.map((workspace) =>
						deleteWorkspace(workspace.repo_path, workspace.id),
					),
				);
				// Show single toast and refresh after all deletions
				queryClient.invalidateQueries({ queryKey: ["workspaces", repoPath] });
				queryClient.invalidateQueries({
					queryKey: ["workspace-statuses", repoPath],
				});
				handleReturnToDashboard();
				addToast({
					title: `${count} Workspace${count > 1 ? "s" : ""} Deleted`,
					description: `Successfully removed ${count} workspace${
						count > 1 ? "s" : ""
					}`,
					type: "success",
				});
			} catch (error) {
				addToast({
					title: "Delete Failed",
					description: error instanceof Error ? error.message : String(error),
					type: "error",
				});
			}
			setSelectedWorkspaceIds(new Set());
		}
	};

	const handleDelete = async (workspace: Workspace) => {
		const confirmed = await ask(`Delete workspace ${workspace.branch_name}?`, {
			title: "Delete Workspace",
			kind: "warning",
		});
		if (confirmed) {
			deleteWorkspaceMutation.mutate(workspace);
		}
	};

	// Handle branch change after switching
	const handleBranchChanged = useCallback(
		(branchName?: string) => {
			if (branchName) {
				setCurrentBranch(branchName);
			}
			void queryClient.invalidateQueries({
				queryKey: ["repo-status", repoPath],
			});
			void queryClient.invalidateQueries({
				queryKey: ["repo-branch", repoPath],
			});
			// Refresh workspace data
			queryClient.invalidateQueries({ queryKey: ["workspaces", repoPath] });
			queryClient.invalidateQueries({
				queryKey: ["workspace-statuses", repoPath],
			});
		},
		[repoPath, queryClient],
	);

	const isSessionView = viewMode === "session" || viewMode === "show-workspace";
	const showSidebar = true;

	// Build Claude sessions data for the terminal pane
	const claudeSessionsForPane = useMemo((): ClaudeSessionData[] => {
		const workspaceMap = new Map(workspaces.map((ws) => [ws.id, ws]));

		return sessions.map((session) => {
			const sessionWorkspace = session.workspace_id
				? (workspaceMap.get(session.workspace_id) ?? null)
				: null;
			const pending = pendingSessionData.get(session.id);
			return {
				sessionId: session.id,
				sessionName: session.name,
				ptySessionId: `session-${session.id}`,
				workspacePath: sessionWorkspace
					? getFullWorkspacePath(sessionWorkspace)
					: null,
				repoPath: sessionWorkspace?.repo_path ?? repoPath,
				workspaceName: sessionWorkspace?.branch_name ?? null,
				...(pending && {
					pendingPrompt: pending.pendingPrompt,
					permissionMode: pending.permissionMode,
				}),
			};
		});
	}, [sessions, workspaces, repoPath, pendingSessionData]);

	const mainContentStyle = useMemo(
		() => ({ width: showSidebar ? "calc(100vw - 240px)" : "100%" }),
		[showSidebar],
	);
	const sessionLayerStyle = useMemo<React.CSSProperties>(
		() => ({
			visibility: isSessionView ? "visible" : "hidden",
			zIndex: isSessionView ? 10 : 0,
			pointerEvents: isSessionView ? "auto" : "none",
		}),
		[isSessionView],
	);

	return !repoPath ? (
		<Onboarding onOpenRepo={handleOpenRepository} />
	) : (
		<div className="flex h-screen bg-background">
			<WorkspaceSidebar
				repoPath={repoPath}
				currentBranch={currentBranch}
				selectedWorkspaceId={selectedWorkspace?.id ?? null}
				selectedWorkspaceIds={selectedWorkspaceIds}
				onWorkspaceClick={(workspace) => handleSelectWorkspace(workspace)}
				onWorkspaceMultiSelect={handleWorkspaceMultiSelect}
				onBulkDelete={handleBulkDelete}
				onDeleteWorkspace={handleDelete}
				openSettings={openSettings}
				navigateToDashboard={handleReturnToDashboard}
				onOpenCommandPalette={() => setShowCommandPalette(true)}
				onOpenBranchSwitcher={() => setShowBranchSwitcher(true)}
				onAddBefore={handleAddBefore}
				onAddAfter={handleAddAfter}
				onMoveWorkspace={handleMoveWorkspace}
				onSelectStack={handleSelectStack}
				onStartAgent={(workspace) => handleCreateSessionFromSidebar(workspace.id)}
				currentPage={
					viewMode === "settings"
						? "settings"
						: viewMode === "session" || viewMode === "show-workspace"
							? "session"
							: undefined
				}
			/>

			<div className="flex-1 relative" style={mainContentStyle}>
				{/* Sessions Layer - ALWAYS RENDERED ONCE */}
				<div
					className="absolute inset-0 flex flex-col workspace-terminal-container overflow-hidden"
					style={sessionLayerStyle}
				>
					{/* Show workspace views take up remaining space */}
					{repoPath && (
						<div className="flex-1 min-h-0 overflow-hidden relative">
							<ErrorBoundary
								fallbackTitle="Workspace error"
								resetKeys={[selectedWorkspace?.id]}
								onReset={handleReturnToDashboard}
							>
								<Suspense fallback={<LoadingSpinner />}>
									<ShowWorkspace
										repositoryPath={repoPath}
										workspace={selectedWorkspace}
										onActiveTabChange={setShowWorkspaceActiveTab}
										mainRepoBranch={currentBranch}
										initialSelectedFile={sessionSelectedFile}
										availableBranches={availableBranches}
										branchesLoading={branchesLoading}
										onLoadAvailableBranches={handleLoadAvailableBranches}
										onDeleteWorkspace={handleDelete}
										onOpenFilePicker={() => setShowFilePicker(true)}
										onOpenMergePreview={handleOpenMergePreview}
										onOpenBranchSwitcher={() => setShowBranchSwitcher(true)}
										onCreateStackedWorkspace={handleCreateStackedWorkspace}
										onMoveCommitToNewWorkspace={(commit, workspace) => {
											const firstLine =
												commit.description.split("\n")[0] || undefined;
											setUnifiedDialogDefaults({
												targetBranch: workspace?.branch_name,
												sourceWorkspace: workspace ?? null,
												preSelectedCommits: [commit.change_id],
												intent: firstLine,
												activeTab: "commits",
											});
										}}
										onMoveCommitToExistingWorkspace={(commit, workspace) => {
											setUnifiedDialogDefaults({
												targetBranch: workspace?.branch_name,
												sourceWorkspace: workspace ?? null,
												preSelectedCommits: [commit.change_id],
												activeTab: "commits",
											});
											// Note: dialog will open in "move to existing" mode via defaults
										}}
										onMoveFilesToNewWorkspace={(files, workspace) => {
											setUnifiedDialogDefaults({
												targetBranch: workspace?.branch_name,
												sourceWorkspace: workspace ?? null,
												preSelectedFiles: files,
												activeTab: "changes",
											});
										}}
										queryClient={queryClient}
										onSessionCreated={(sessionData) => {
											queryClient.invalidateQueries({
												queryKey: ["sessions"],
											});
											setActiveSessionId(sessionData.sessionId);
											if (
												sessionData.pendingPrompt ||
												sessionData.permissionMode
											) {
												setPendingSessionData((prev) => {
													const next = new Map(prev);
													next.set(sessionData.sessionId, {
														pendingPrompt: sessionData.pendingPrompt,
														permissionMode: sessionData.permissionMode,
													});
													return next;
												});
											}
										}}
									/>
								</Suspense>
							</ErrorBoundary>
						</div>
					)}
					{/* Shared workspace terminal pane - always rendered to preserve state */}
					<WorkspaceTerminalPane
						ref={terminalPaneRef}
						key={repoPath}
						workingDirectory={
							selectedWorkspace
								? getFullWorkspacePath(selectedWorkspace)
								: repoPath
						}
						currentBranch={currentBranch}
						claudeSessions={claudeSessionsForPane}
						activeClaudeSessionId={isSessionView ? activeSessionId : null}
						onActiveSessionChange={(sessionId) => {
							if (sessionId === null) {
								setActiveSessionId(null);
								return;
							}
							setActiveSessionId(sessionId);
							// Find the session to determine view mode
							const session = sessions.find((s) => s.id === sessionId);
							if (session) {
								setViewMode(
									session.workspace_id ? "show-workspace" : "session",
								);
								if (session.workspace_id) {
									const ws = workspaces.find(
										(w) => w.id === session.workspace_id,
									);
									if (ws) setSelectedWorkspace(ws);
								}
							}
						}}
						onCloseSession={(sessionId) => {
							if (activeSessionId === sessionId) {
								setActiveSessionId(null);
							}
						}}
						onCreateNewSession={(activeWorkspacePath) => {
							if (activeWorkspacePath) {
								const ws = workspaces.find(
									(w) => getFullWorkspacePath(w) === activeWorkspacePath,
								);
								handleCreateSessionFromSidebar(ws?.id ?? null);
							} else {
								handleCreateSessionFromSidebar(selectedWorkspace?.id ?? null);
							}
						}}
						onNavigateToWorkspace={(workspaceKey, isMainRepo) => {
							if (isMainRepo) {
								handleSelectWorkspace(null);
							} else {
								const ws = workspaces.find(
									(w) => w.workspace_path === workspaceKey,
								);
								if (ws) {
									handleSelectWorkspace(ws);
								}
							}
						}}
					/>
				</div>

				{/* Content Layer - Dashboard, Settings, Merge-Review, Workspace-Edit */}
				<div
					className="absolute inset-0 overflow-auto"
					style={{
						visibility: !isSessionView ? "visible" : "hidden",
						zIndex: !isSessionView ? 10 : 0,
						pointerEvents: !isSessionView ? "auto" : "none",
					}}
				>
					{/* Settings View */}
					{viewMode === "settings" && (
						<SettingsPage
							repoPath={repoPath}
							onClose={handleReturnToDashboard}
							currentBranch={currentBranch}
						/>
					)}

					{/* Merge Preview View */}
					{viewMode === "merge-preview" && mergeWorkspace && (
						<MergePreviewPage
							workspace={mergeWorkspace}
							repoPath={repoPath}
							onCancel={() => {
								setMergeWorkspace(null);
								setViewMode("show-workspace");
							}}
							onMergeComplete={async () => {
								// Automatic workspace deletion on merge temporarily disabled
								// Delete workspace after successful merge
								// try {
								//   await deleteWorkspace(
								//     mergeWorkspace.repo_path,
								//     mergeWorkspace.workspace_path,
								//     mergeWorkspace.id
								//   );
								//   // Invalidate workspace queries
								//   queryClient.invalidateQueries({ queryKey: ["workspaces"] });
								// } catch (error) {
								//   addToast({
								//     title: "Merge succeeded but workspace deletion failed",
								//     description: "Please manually delete the workspace from the sidebar",
								//     type: "warning",
								//   });
								// } finally {
								setMergeWorkspace(null);
								setViewMode("show-workspace");
								handleReturnToDashboard();
								void queryClient.invalidateQueries({
									queryKey: ["repo-status", repoPath],
								});
								void queryClient.invalidateQueries({
									queryKey: ["repo-branch", repoPath],
								});
								void queryClient.invalidateQueries({
									queryKey: ["workspaces", repoPath],
								});
								void queryClient.invalidateQueries({
									queryKey: ["workspace-statuses", repoPath],
								});
								// }
							}}
						/>
					)}
				</div>
			</div>

			{/* Global Dialogs */}
			{/* Note: MergeDialog removed - git-specific feature */}

			<UnifiedWorkspaceDialog
				open={unifiedDialogDefaults !== null}
				onOpenChange={(open) => {
					if (!open) setUnifiedDialogDefaults(null);
				}}
				repoPath={repoPath}
				defaults={unifiedDialogDefaults ?? {}}
				onSuccess={async (workspaceId) => {
					await queryClient.invalidateQueries({
						queryKey: ["workspaces", repoPath],
					});
					queryClient.invalidateQueries({
						queryKey: ["workspace-statuses", repoPath],
					});
					const updatedWorkspaces = await queryClient.fetchQuery({
						queryKey: ["workspaces", repoPath],
						queryFn: () => getWorkspaces(repoPath),
					});
					const newWorkspace = updatedWorkspaces.find(
						(w) => w.id === workspaceId,
					);
					if (newWorkspace) {
						handleOpenSession(newWorkspace);
					}
				}}
			/>

			<CommandPalette
				showCommandPalette={showCommandPalette}
				onCommandPaletteChange={setShowCommandPalette}
				workspaces={workspaces}
				sessions={sessions}
				onNavigateToDashboard={handleReturnToDashboard}
				onNavigateToSettings={() => setViewMode("settings")}
				onOpenWorkspaceSession={handleOpenSession}
				onOpenBranchSwitcher={() => setShowBranchSwitcher(true)}
				onOpenFilePicker={() => setShowFilePicker(true)}
				onOpenWorkspacePicker={() => setShowWorkspacePicker(true)}
				onOpenWorkspaceDeletion={() => setShowWorkspaceDeletion(true)}
				onCreateWorkspace={() => setUnifiedDialogDefaults({})}
				onToggleTerminal={() => terminalPaneRef.current?.toggleCollapse()}
				onMaximizeTerminal={() => terminalPaneRef.current?.toggleMaximize()}
				onCreateAgentTerminal={() =>
					terminalPaneRef.current?.createAgentSession()
				}
				onCreateShellTerminal={() =>
					terminalPaneRef.current?.createShellSession()
				}
				hasSelectedWorkspace={!!selectedWorkspace}
				showBranchSwitcher={showBranchSwitcher}
				onBranchSwitcherChange={setShowBranchSwitcher}
				onBranchChanged={handleBranchChanged}
				showWorkspaceDeletion={showWorkspaceDeletion}
				onWorkspaceDeletionChange={setShowWorkspaceDeletion}
				currentWorkspace={selectedWorkspace}
				onDeleteWorkspace={handleDelete}
				showFilePicker={showFilePicker}
				onFilePickerChange={setShowFilePicker}
				onFileSelected={(filePath) => setSessionSelectedFile(filePath)}
				selectedWorkspaceId={selectedWorkspace?.id ?? null}
				repoPath={repoPath}
				workspaceChangeCounts={undefined}
			/>

			<WorkspacePicker
				open={showWorkspacePicker}
				onOpenChange={setShowWorkspacePicker}
				workspaces={workspaces}
				sessions={sessions}
				workspaceChangeCounts={undefined}
				onSelect={handleOpenSession}
			/>
		</div>
	);
};
