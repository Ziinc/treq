import { Draggable } from "@hello-pangea/dnd";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import {
	Bot,
	Copy,
	FolderOpen,
	GitBranch,
	AlertTriangle,
	Layers2,
	Pencil,
	Terminal,
	Trash2,
} from "lucide-react";
import type { Workspace } from "../lib/api";
import type { FlattenedWorkspaceNode } from "../lib/workspace-tree";
import { cn, getFullWorkspacePath } from "../lib/utils";
import { getWorkspaceTitle as getWorkspaceTitleFromUtils } from "../lib/workspace-utils";
import { useEditorApps } from "../hooks/useEditorApps";
import { Button } from "./ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from "./ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

export const PathContextMenuItems: React.FC<{
	relativePath: string;
	fullPath: string;
	additionalItems?: React.ReactNode;
}> = ({ relativePath, fullPath, additionalItems }) => {
	const editorApps = useEditorApps();

	return (
		<>
			<ContextMenuItem
				onClick={() => navigator.clipboard.writeText(relativePath)}
			>
				<Copy className="w-4 h-4 mr-2" />
				Copy relative path
			</ContextMenuItem>
			<ContextMenuItem onClick={() => navigator.clipboard.writeText(fullPath)}>
				<Copy className="w-4 h-4 mr-2" />
				Copy full path
			</ContextMenuItem>
			<ContextMenuSub>
				<ContextMenuSubTrigger>
					<FolderOpen className="w-4 h-4 mr-2" />
					Open in...
				</ContextMenuSubTrigger>
				<ContextMenuSubContent>
					<ContextMenuItem onClick={() => revealItemInDir(fullPath)}>
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

interface WorkspaceSidebarItemProps {
	node: FlattenedWorkspaceNode;
	index: number;
	repoPath?: string;
	selectedWorkspaceId?: number | null;
	selectedWorkspaceIds?: Set<number>;
	onWorkspaceClick?: (workspace: Workspace) => void;
	onWorkspaceMultiSelect?: (
		workspace: Workspace | null,
		event: React.MouseEvent,
	) => void;
	onAddAfter?: (workspace: Workspace) => void;
	onStartAgent?: (workspace: Workspace) => void;
	onStartShell?: (workspace: Workspace) => void;
	onDeleteWorkspace?: (workspace: Workspace) => void;
	onRenameWorkspace: (workspace: Workspace) => void;
	onDoubleClick?: (workspace: Workspace, event: React.MouseEvent) => void;
}

export const WorkspaceSidebarItem: React.FC<WorkspaceSidebarItemProps> = ({
	node,
	index,
	repoPath,
	selectedWorkspaceId,
	selectedWorkspaceIds,
	onWorkspaceClick,
	onWorkspaceMultiSelect,
	onAddAfter,
	onStartAgent,
	onStartShell,
	onDeleteWorkspace,
	onRenameWorkspace,
	onDoubleClick,
}) => {
	const workspace = node.status.current;
	const isSelected =
		selectedWorkspaceIds?.has(workspace.id) ||
		selectedWorkspaceId === workspace.id;
	const indentStyle = {
		paddingLeft: `${16 + (node.depth - 1) * 6}px`,
	};
	const isConflicted = node.status.has_conflicts;
	const workspaceTitle = getWorkspaceTitleFromUtils(workspace);

	return (
		<div key={workspace.id}>
			<Draggable draggableId={String(workspace.id)} index={index}>
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
												"group/workspace relative flex items-center  tracking-wide pr-4 rounded-sm transition-colors cursor-pointer p-0.5",
												{
													"bg-primary/20": isSelected,
													"hover:bg-muted/50": !isSelected,
													"bg-primary/10": dragSnapshot.combineTargetFor,
													"opacity-50": dragSnapshot.isDragging,
													"text-destructive": isConflicted,
												},
											)}
											onClick={(e) =>
												onWorkspaceMultiSelect
													? onWorkspaceMultiSelect(workspace, e)
													: onWorkspaceClick?.(workspace)
											}
											onDoubleClick={(e) => onDoubleClick?.(workspace, e)}
										>
											<GitBranch
												className={`w-3 h-3 mr-1 shrink-0 -scale-y-100 ${
													isSelected ? "text-primary" : "text-muted-foreground"
												}`}
											/>
											<span
												className={`flex-1 min-w-0 truncate font-mono ${
													isSelected
														? "text-primary font-medium"
														: "text-muted-foreground"
												}`}
											>
												{workspaceTitle}
											</span>
											{isConflicted && (
												<AlertTriangle
													data-testid={`workspace-conflict-indicator-${workspace.id}`}
													className="w-3.5 h-3.5 text-destructive shrink-0 mr-1"
													aria-label="Conflicted workspace"
												/>
											)}
											<div className="flex items-center gap-1 shrink-0 mr-1">
												<span
													className={cn(
														"group-hover/workspace:opacity-100 transition-opacity",
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
																aria-label="Start agent"
																onClick={(e) => {
																	e.stopPropagation();
																	onStartAgent?.(workspace);
																}}
															>
																<Bot className="w-4 h-4" />
															</Button>
														</TooltipTrigger>
														<TooltipContent side="bottom">
															Start agent
														</TooltipContent>
													</Tooltip>
													<Tooltip>
														<TooltipTrigger asChild>
															<Button
																size="icon-xs"
																variant="ghost"
																className="text-foreground"
																aria-label="Open shell"
																onClick={(e) => {
																	e.stopPropagation();
																	onStartShell?.(workspace);
																}}
															>
																<Terminal className="w-4 h-4" />
															</Button>
														</TooltipTrigger>
														<TooltipContent side="bottom">
															Open shell
														</TooltipContent>
													</Tooltip>
												</span>
												<span
													className={cn(
														"group-hover/workspace:opacity-100 transition-opacity",
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
											</div>
										</div>
									</TooltipTrigger>
								</ContextMenuTrigger>
								{!dragSnapshot.isDragging && (
									<TooltipContent side="right" className="font-mono">
										<div className="flex items-center gap-1.5">
											<GitBranch className="w-3 h-3" />
											<span>{workspaceTitle}</span>
										</div>
										{isConflicted && (
											<div className="font-sans mt-1 text-destructive">
												Conflicts detected
											</div>
										)}
									</TooltipContent>
								)}
							</Tooltip>
							<ContextMenuContent>
								<ContextMenuItem
									onClick={() => navigator.clipboard.writeText(workspaceTitle)}
								>
									<GitBranch className="w-4 h-4 mr-2" />
									Copy branch name
								</ContextMenuItem>
								<ContextMenuItem onClick={() => onRenameWorkspace(workspace)}>
									<Pencil className="w-4 h-4 mr-2" />
									Rename Workspace
								</ContextMenuItem>
								<ContextMenuSeparator />
								<PathContextMenuItems
									relativePath={
										workspace.workspace_path.startsWith("/")
											? repoPath &&
												workspace.workspace_path.startsWith(repoPath)
												? workspace.workspace_path.slice(repoPath.length + 1)
												: workspace.workspace_path
											: `.treq/workspaces/${workspace.workspace_path}`
									}
									fullPath={getFullWorkspacePath(workspace)}
									additionalItems={
										<>
											<ContextMenuSeparator />
											<ContextMenuItem
												className="text-destructive focus:text-destructive"
												onClick={() => onDeleteWorkspace?.(workspace)}
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
};
