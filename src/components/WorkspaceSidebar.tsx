import { useQuery } from "@tanstack/react-query";
import { useCallback, memo, useMemo, useState } from "react";
import { Workspace, listWorkspaceStatuses } from "../lib/api";
import {
	buildWorkspaceTree,
	flattenWorkspaceTree,
	getEntireStack,
	getDescendants,
} from "../lib/workspace-tree";
import {
	DragDropContext,
	Droppable,
	Draggable,
	type DropResult,
} from "@hello-pangea/dnd";
import {
	Settings,
	Home,
	Search,
	GitBranch,
	Trash2,
	Copy,
	FolderOpen,
	CornerLeftUp,
	Pencil,
	Layers2,
} from "lucide-react";
import { Button } from "./ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "./ui/tooltip";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
	ContextMenuSub,
	ContextMenuSubTrigger,
	ContextMenuSubContent,
	ContextMenuSeparator,
} from "./ui/context-menu";
import { getWorkspaceTitle as getWorkspaceTitleFromUtils } from "../lib/workspace-utils";
import { cn, getFullWorkspacePath } from "../lib/utils";
import { RenameWorkspaceDialog } from "./RenameWorkspaceDialog";
import { revealItemInDir, openUrl } from "@tauri-apps/plugin-opener";
import { useEditorApps } from "../hooks/useEditorApps";
interface WorkspaceSidebarProps {
	repoPath?: string;
	currentBranch?: string | null;
	selectedWorkspaceId?: number | null;
	selectedWorkspaceIds?: Set<number>;
	onWorkspaceClick?: (workspace: Workspace) => void;
	onWorkspaceMultiSelect?: (
		workspace: Workspace | null,
		event: React.MouseEvent,
	) => void;
	onBulkDelete?: () => void;
	onDeleteWorkspace?: (workspace: Workspace) => void;
	openSettings?: (tab?: string) => void;
	navigateToDashboard?: () => void;
	onOpenCommandPalette?: () => void;
	onOpenBranchSwitcher?: () => void;
	currentPage?: string;
	onAddBefore?: (workspace: Workspace) => void;
	onAddAfter?: (workspace: Workspace) => void;
	onMoveWorkspace?: (workspace: Workspace, targetBranch: string | null) => void;
	onSelectStack?: (workspaceIds: Set<number>) => void;
}

// Shared context menu items for both home repo and workspaces
const PathContextMenuItems: React.FC<{
	relativePath: string;
	fullPath: string;
	additionalItems?: React.ReactNode;
}> = ({ relativePath, fullPath, additionalItems }) => {
	const editorApps = useEditorApps();

	return (
		<>
			<ContextMenuItem
				onClick={() => {
					navigator.clipboard.writeText(relativePath);
				}}
			>
				<Copy className="w-4 h-4 mr-2" />
				Copy relative path
			</ContextMenuItem>
			<ContextMenuItem
				onClick={() => {
					navigator.clipboard.writeText(fullPath);
				}}
			>
				<Copy className="w-4 h-4 mr-2" />
				Copy full path
			</ContextMenuItem>
			<ContextMenuSub>
				<ContextMenuSubTrigger>
					<FolderOpen className="w-4 h-4 mr-2" />
					Open in...
				</ContextMenuSubTrigger>
				<ContextMenuSubContent>
					<ContextMenuItem
						onClick={() => {
							revealItemInDir(fullPath);
						}}
					>
						<FolderOpen className="w-4 h-4 mr-2" />
						Open in Finder
					</ContextMenuItem>

					{editorApps.cursor && (
						<ContextMenuItem
							onClick={async () => {
								try {
									await openUrl(`cursor://file/${fullPath}`);
								} catch (err) {
									console.error("Failed to open in Cursor:", err);
								}
							}}
						>
							Open in Cursor
						</ContextMenuItem>
					)}

					{editorApps.vscode && (
						<ContextMenuItem
							onClick={async () => {
								try {
									await openUrl(`vscode://file/${fullPath}`);
								} catch (err) {
									console.error("Failed to open in VSCode:", err);
								}
							}}
						>
							Open in VSCode
						</ContextMenuItem>
					)}

					{editorApps.zed && (
						<ContextMenuItem
							onClick={async () => {
								try {
									await openUrl(`zed://file/${fullPath}`);
								} catch (err) {
									console.error("Failed to open in Zed:", err);
								}
							}}
						>
							Open in Zed
						</ContextMenuItem>
					)}
				</ContextMenuSubContent>
			</ContextMenuSub>
			{additionalItems}
		</>
	);
};

export const WorkspaceSidebar: React.FC<WorkspaceSidebarProps> = memo(
	({
		repoPath,
		currentBranch,
		selectedWorkspaceId,
		selectedWorkspaceIds,
		onWorkspaceClick,
		onWorkspaceMultiSelect,
		onBulkDelete,
		onDeleteWorkspace,
		openSettings,
		navigateToDashboard: _navigateToDashboard,
		onOpenCommandPalette,
		onOpenBranchSwitcher,
		currentPage,
		onAddBefore: _onAddBefore,
		onAddAfter,
		onMoveWorkspace,
		onSelectStack,
	}) => {
		const { data: workspaceStatuses = [] } = useQuery({
			queryKey: ["workspace-statuses", repoPath],
			queryFn: () => listWorkspaceStatuses(repoPath || ""),
			enabled: !!repoPath,
		});

		const statuses = workspaceStatuses ?? [];
		const workspaces = useMemo(
			() => statuses.map((s) => s.current),
			[statuses],
		);

		const [renameTarget, setRenameTarget] = useState<Workspace | null>(null);

		// Build hierarchical tree and flatten for rendering
		const flattenedNodes = useMemo(() => {
			const tree = buildWorkspaceTree(statuses);
			return flattenWorkspaceTree(tree);
		}, [statuses]);

		const getWorkspaceTitle = useCallback((workspace: Workspace) => {
			return getWorkspaceTitleFromUtils(workspace);
		}, []);

		const handleContainerClick = useCallback(
			(e: React.MouseEvent) => {
				// Clear selection when clicking on the container background (not on workspace items)
				if (
					e.target === e.currentTarget &&
					selectedWorkspaceIds &&
					selectedWorkspaceIds.size > 0
				) {
					// Create a fake workspace click event to trigger the clear logic
					// We'll pass null to signal clearing selection
					if (onWorkspaceMultiSelect) {
						onWorkspaceMultiSelect(
							null as Parameters<NonNullable<typeof onWorkspaceMultiSelect>>[0],
							e,
						);
					}
				}
			},
			[selectedWorkspaceIds, onWorkspaceMultiSelect],
		);

		const handleDoubleClick = useCallback(
			(workspace: Workspace, e: React.MouseEvent) => {
				if (!onSelectStack) return;
				e.stopPropagation();

				if (e.shiftKey) {
					// Shift+double-click: select workspace + descendants
					const descendants = getDescendants(workspaces, workspace.branch_name);
					const ids = new Set([workspace.id, ...descendants.map((w) => w.id)]);
					onSelectStack(ids);
				} else {
					// Double-click: select entire stack
					const stack = getEntireStack(workspaces, workspace.branch_name);
					const ids = new Set(stack.map((w) => w.id));
					onSelectStack(ids);
				}
			},
			[workspaces, onSelectStack],
		);

		const handleDragEnd = useCallback(
			(result: DropResult) => {
				if (!onMoveWorkspace) return;

				const draggedId = parseInt(result.draggableId, 10);
				const draggedWorkspace = workspaces.find((w) => w.id === draggedId);
				if (!draggedWorkspace) return;

				if (result.combine) {
					// Dropped onto another workspace → set target to that workspace's branch
					const targetWorkspace = workspaces.find(
						(w) => String(w.id) === result.combine!.draggableId,
					);
					if (targetWorkspace && targetWorkspace.id !== draggedWorkspace.id) {
						onMoveWorkspace(draggedWorkspace, targetWorkspace.branch_name);
					}
				} else if (result.destination) {
					// Dropped on root area (not on any item) → detach from stack
					onMoveWorkspace(draggedWorkspace, null);
				}
			},
			[workspaces, onMoveWorkspace],
		);

		const repoName = repoPath
			? repoPath.split("/").filter(Boolean).pop() || "Repository"
			: "Repository";

		return (
			<TooltipProvider delayDuration={200} skipDelayDuration={100}>
				<div className="group/sidebar w-[240px] bg-sidebar border-r border-border flex flex-col h-screen">
					{/* Repository selector / Command palette trigger */}
					<div className="flex items-center gap-2 mx-2 mt-2">
						<button
							onClick={onOpenCommandPalette}
							className="flex items-center gap-2 flex-1 px-3 py-1.5 rounded-lg border border-border bg-muted/50 hover:bg-muted text-muted-foreground transition-colors"
						>
							<Search className="w-4 h-4 shrink-0" />
							<span className="flex-1 text-left truncate">{repoName}</span>
							<span className="text-[10px] text-muted-foreground/60 shrink-0">
								⌘K
							</span>
						</button>
						{openSettings && (
							<Tooltip>
								<TooltipTrigger asChild>
									<button
										type="button"
										onClick={() => openSettings("application")}
										className={`h-9 w-9 rounded-lg hover:bg-muted flex items-center justify-center transition-colors border border-border ${
											currentPage === "settings"
												? "bg-primary/20"
												: "bg-muted/50"
										}`}
										aria-label="Settings"
									>
										<Settings
											className={`w-4 h-4 ${
												currentPage === "settings"
													? "text-primary"
													: "text-muted-foreground"
											}`}
										/>
									</button>
								</TooltipTrigger>
								<TooltipContent side="bottom">Settings</TooltipContent>
							</Tooltip>
						)}
					</div>

					<div
						className="pl-1 pr-2 py-2 space-y-1 min-h-[120px] flex-1 overflow-y-auto select-none"
						onClick={handleContainerClick}
					>
						{/* Main repository section */}
						<ContextMenu>
							<Tooltip>
								<ContextMenuTrigger asChild>
									<TooltipTrigger asChild>
										<div
											className={`relative flex items-center text-sm tracking-wide px-2 py-1 rounded-md transition-colors cursor-pointer ${
												selectedWorkspaceId === null
													? "bg-primary/20"
													: "hover:bg-muted/50"
											}`}
											onClick={() =>
												onWorkspaceClick?.(undefined as unknown as Workspace)
											}
										>
											<Home
												className={`w-3 h-3 mr-1 shrink-0 ${
													selectedWorkspaceId === null
														? "text-primary"
														: "text-muted-foreground"
												}`}
											/>
											<span
												className={`flex-1 min-w-0 truncate font-mono ${
													selectedWorkspaceId === null
														? "text-primary font-medium"
														: "text-muted-foreground"
												}`}
												title={currentBranch || "Unknown"}
											>
												{currentBranch || "unknown"}
											</span>
										</div>
									</TooltipTrigger>
								</ContextMenuTrigger>
								<TooltipContent side="right" className="font-mono">
									<div className="flex items-center gap-1.5">
										<GitBranch className="w-3 h-3" />
										<span>{currentBranch || "Unknown"}</span>
									</div>
								</TooltipContent>
							</Tooltip>
							<ContextMenuContent>
								{onOpenBranchSwitcher && (
									<>
										<ContextMenuItem onClick={onOpenBranchSwitcher}>
											<GitBranch className="w-4 h-4 mr-2" />
											Switch Branch...
										</ContextMenuItem>
										<ContextMenuSeparator />
									</>
								)}
								<PathContextMenuItems
									relativePath="."
									fullPath={repoPath || ""}
								/>
							</ContextMenuContent>
						</ContextMenu>

						{/* Divider */}
						{workspaces.length > 0 && (
							<div className="my-2 border-t border-border" />
						)}

						{/* Workspaces section */}
						<DragDropContext onDragEnd={handleDragEnd}>
							<Droppable droppableId="sidebar-root" isCombineEnabled>
								{(droppableProvided) => (
									<div
										className="space-y-1"
										ref={droppableProvided.innerRef}
										{...droppableProvided.droppableProps}
									>
										<h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest px-2 py-1">
											Workspaces
										</h4>
										{flattenedNodes.map((node, index) => {
											const workspace = node.status.current;
											const isSelected =
												selectedWorkspaceIds?.has(workspace.id) ||
												selectedWorkspaceId === workspace.id;
											const indentStyle = {
												paddingLeft: `${16 + (node.depth - 1) * 6}px`,
											};
											const wsCommitsAhead = node.status.commits_ahead;
											const isConflicted = node.status.has_conflicts;
											const isChanged = node.status.has_changes;

											return (
												<div key={workspace.id}>
													<Draggable
														draggableId={String(workspace.id)}
														index={index}
													>
														{(dragProvided, dragSnapshot) => (
															<div
																ref={dragProvided.innerRef}
																{...dragProvided.draggableProps}
																{...dragProvided.dragHandleProps}
															>
																<ContextMenu>
																	<Tooltip>
																		<ContextMenuTrigger asChild>
																			<TooltipTrigger asChild>
																				<div
																					style={indentStyle}
																					className={cn(
																						"group/workspace relative flex items-center text-sm tracking-wide pr-4 rounded-sm transition-colors cursor-pointer py-1",
																						{
																							"bg-primary/20": isSelected,
																							"hover:bg-muted/50": !isSelected,
																							"bg-primary/10":
																								dragSnapshot.combineTargetFor,
																							"opacity-50":
																								dragSnapshot.isDragging,
																							"font-bold": wsCommitsAhead > 0,
																							"text-destructive":
																								isConflicted && !isChanged,
																							"text-slate-400":
																								isChanged && !isConflicted,
																						},
																					)}
																					onClick={(e) =>
																						onWorkspaceMultiSelect
																							? onWorkspaceMultiSelect(
																									workspace,
																									e,
																								)
																							: onWorkspaceClick?.(workspace)
																					}
																					onDoubleClick={(e) =>
																						handleDoubleClick(workspace, e)
																					}
																				>
																					{node.depth === 0 ? (
																						<GitBranch
																							className={`w-3 h-3 mr-1 shrink-0 ${
																								isSelected
																									? "text-primary"
																									: "text-muted-foreground"
																							}`}
																						/>
																					) : (
																						<CornerLeftUp
																							className={`w-3 h-3 mr-1 shrink-0 ${
																								isSelected
																									? "text-primary"
																									: "text-muted-foreground"
																							}`}
																						/>
																					)}
																					<span
																						className={`flex-1 min-w-0 truncate font-mono ${
																							isSelected
																								? "text-primary font-medium"
																								: "text-muted-foreground"
																						} `}
																					>
																						{getWorkspaceTitle(workspace)}
																					</span>
																					{/* Hover action buttons */}
																					<div className="flex items-center gap-1 shrink-0 -mr-3">
																						<span
																							className={cn(
																								" group-hover/workspace:opacity-100 transition-opacity",
																								{
																									"opacity-100": isSelected,
																									"opacity-0": !isSelected,
																								},
																							)}
																						>
																							<Tooltip>
																								<TooltipTrigger asChild>
																									<Button
																										size="icon-xs"
																										variant="ghost"
																										className="text-foreground"
																										aria-label="Stack a workspace"
																										onClick={(e) => {
																											e.stopPropagation();
																											onAddAfter?.(workspace);
																										}}
																									>
																										<Layers2 className="w-4 h-4" />
																									</Button>
																								</TooltipTrigger>
																								<TooltipContent side="bottom">
																									Stack workspace
																								</TooltipContent>
																							</Tooltip>
																						</span>
																						{wsCommitsAhead > 0 && (
																							<span className="opacity-100 shrink-0 inline-flex items-center justify-center w-4 h-4 rounded text-xs font-medium leading-none bg-slate-400 text-primary-foreground mr-1">
																								{wsCommitsAhead}
																							</span>
																						)}
																					</div>
																				</div>
																			</TooltipTrigger>
																		</ContextMenuTrigger>
																		{!dragSnapshot.isDragging && (
																			<TooltipContent
																				side="right"
																				className="font-mono"
																			>
																				<div className="flex items-center gap-1.5">
																					<GitBranch className="w-3 h-3" />
																					<span>
																						{getWorkspaceTitle(workspace)}
																					</span>
																				</div>
																				<div className="font-sans mt-1">
																					{wsCommitsAhead > 1 && (
																						<span>
																							{wsCommitsAhead} commits ahead of
																							target branch
																						</span>
																					)}
																					{wsCommitsAhead === 1 && (
																						<span>
																							{wsCommitsAhead} commit ahead of
																							target branch
																						</span>
																					)}
																				</div>
																			</TooltipContent>
																		)}
																	</Tooltip>
																	<ContextMenuContent>
																		<ContextMenuItem
																			onClick={() => {
																				navigator.clipboard.writeText(
																					getWorkspaceTitle(workspace),
																				);
																			}}
																		>
																			<GitBranch className="w-4 h-4 mr-2" />
																			Copy branch name
																		</ContextMenuItem>
																		<ContextMenuItem
																			onClick={() => setRenameTarget(workspace)}
																		>
																			<Pencil className="w-4 h-4 mr-2" />
																			Rename Workspace
																		</ContextMenuItem>
																		<ContextMenuSeparator />
																		<PathContextMenuItems
																			relativePath={
																				workspace.workspace_path.startsWith("/")
																					? repoPath &&
																						workspace.workspace_path.startsWith(
																							repoPath,
																						)
																						? workspace.workspace_path.slice(
																								repoPath.length + 1,
																							)
																						: workspace.workspace_path
																					: `.treq/workspaces/${workspace.workspace_path}`
																			}
																			fullPath={getFullWorkspacePath(workspace)}
																			additionalItems={
																				<>
																					<ContextMenuSeparator />
																					<ContextMenuItem
																						className="text-destructive focus:text-destructive"
																						onClick={() =>
																							onDeleteWorkspace?.(workspace)
																						}
																					>
																						<Trash2 className="w-4 h-4 mr-2" />
																						Delete Workspace
																					</ContextMenuItem>
																				</>
																			}
																		/>
																	</ContextMenuContent>
																</ContextMenu>
																{dragSnapshot.combineTargetFor && (
																	<div className="relative h-0">
																		<div className="absolute left-0 right-0 top-0 h-[2px] bg-primary rounded-full" />
																	</div>
																)}
															</div>
														)}
													</Draggable>
												</div>
											);
										})}
										{droppableProvided.placeholder}

										{/* Show delete button when workspaces are selected, otherwise show create buttons */}
										{selectedWorkspaceIds && selectedWorkspaceIds.size > 0 && (
											<button
												type="button"
												onClick={onBulkDelete}
												className="flex items-center justify-center gap-1 w-full px-2 py-1.5 text-destructive hover:bg-destructive/10 rounded-md transition-colors"
											>
												<Trash2 className="w-3 h-3" />
												<span>
													Delete {selectedWorkspaceIds.size} workspace
													{selectedWorkspaceIds.size > 1 ? "s" : ""}
												</span>
											</button>
										)}
									</div>
								)}
							</Droppable>
						</DragDropContext>
					</div>
				</div>
				{renameTarget && repoPath && (
					<RenameWorkspaceDialog
						open={!!renameTarget}
						onOpenChange={(open) => {
							if (!open) setRenameTarget(null);
						}}
						repoPath={repoPath}
						workspace={renameTarget}
						onSuccess={() => setRenameTarget(null)}
					/>
				)}
			</TooltipProvider>
		);
	},
);
