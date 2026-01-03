import { useMemo } from "react";
import { Command } from "cmdk";
import { BranchSwitcher } from "./BranchSwitcher";
import { WorkspaceDeletion } from "./WorkspaceDeletion";
import { FilePicker } from "./FilePicker";
import { CmdkFooter } from "./ui/cmdk-footer";
import { Workspace, Session } from "../lib/api";
import {
  Home,
  Settings,
  GitBranch,
  FileSearch,
  Trash2,
  Plus,
  Terminal as TerminalIcon,
  Maximize2,
  ChevronsUpDown,
  Bot,
} from "lucide-react";

interface CommandItem {
  id: string;
  type: "action" | "workspace" | "session";
  label: string;
  description?: string;
  icon: React.ReactNode;
  onSelect: () => void;
}

interface CommandPaletteProps {
  // Command Palette
  showCommandPalette: boolean;
  onCommandPaletteChange: (open: boolean) => void;
  workspaces: Workspace[];
  sessions: Session[];
  onNavigateToDashboard: () => void;
  onNavigateToSettings: () => void;
  onOpenWorkspaceSession: (workspace: Workspace) => void;
  onOpenSession: (session: Session, workspace?: Workspace) => void;
  onOpenBranchSwitcher: () => void;
  onOpenFilePicker: () => void;
  onOpenWorkspaceDeletion: () => void;
  onCreateWorkspace: () => void;
  onToggleTerminal?: () => void;
  onMaximizeTerminal?: () => void;
  onCreateAgentTerminal?: () => void;
  onCreateShellTerminal?: () => void;
  hasSelectedWorkspace: boolean;

  // Branch Switcher
  showBranchSwitcher: boolean;
  onBranchSwitcherChange: (open: boolean) => void;
  onBranchChanged: () => void;

  // Workspace Deletion
  showWorkspaceDeletion: boolean;
  onWorkspaceDeletionChange: (open: boolean) => void;
  currentWorkspace: Workspace | null;
  onDeleteWorkspace: (workspace: Workspace) => void;

  // File Picker
  showFilePicker: boolean;
  onFilePickerChange: (open: boolean) => void;
  onFileSelected: (filePath: string) => void;
  selectedWorkspaceId: number | null;

  // Common
  repoPath: string;
  workspaceChangeCounts?: Map<number, number>;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  showCommandPalette,
  onCommandPaletteChange,
  workspaces,
  sessions,
  onNavigateToDashboard,
  onNavigateToSettings,
  onOpenWorkspaceSession,
  onOpenSession,
  onOpenBranchSwitcher,
  onOpenFilePicker,
  onOpenWorkspaceDeletion,
  onCreateWorkspace,
  onToggleTerminal,
  onMaximizeTerminal,
  onCreateAgentTerminal,
  onCreateShellTerminal,
  hasSelectedWorkspace,
  showBranchSwitcher,
  onBranchSwitcherChange,
  onBranchChanged,
  showWorkspaceDeletion,
  onWorkspaceDeletionChange,
  currentWorkspace,
  onDeleteWorkspace,
  showFilePicker,
  onFilePickerChange,
  onFileSelected,
  selectedWorkspaceId,
  repoPath,
  workspaceChangeCounts,
}) => {
  // Build command items
  const items = useMemo<CommandItem[]>(() => {
    const result: CommandItem[] = [];

    result.push({
      id: "dashboard",
      type: "action",
      label: "Go to Home",
      icon: <Home className="w-4 h-4" />,
      onSelect: onNavigateToDashboard,
    });

    result.push({
      id: "settings",
      type: "action",
      label: "Go to Settings",
      icon: <Settings className="w-4 h-4" />,
      onSelect: onNavigateToSettings,
    });

    if (repoPath && onOpenBranchSwitcher) {
      result.push({
        id: "switch-branch",
        type: "action",
        label: "Switch Branch",
        description: "Checkout a different branch in main tree",
        icon: <GitBranch className="w-4 h-4" />,
        onSelect: onOpenBranchSwitcher,
      });
    }

    if (repoPath && onOpenFilePicker) {
      result.push({
        id: "search-files",
        type: "action",
        label: "Search Files",
        description: "Jump to a file in the repository",
        icon: <FileSearch className="w-4 h-4" />,
        onSelect: onOpenFilePicker,
      });
    }

    if (repoPath && onCreateWorkspace) {
      result.push({
        id: "create-workspace",
        type: "action",
        label: "Create Workspace",
        description: "Create a new workspace",
        icon: <Plus className="w-4 h-4" />,
        onSelect: onCreateWorkspace,
      });
    }

    if (repoPath && onOpenWorkspaceDeletion) {
      result.push({
        id: "delete-workspace",
        type: "action",
        label: "Delete Workspace",
        description: "Delete a workspace",
        icon: <Trash2 className="w-4 h-4" />,
        onSelect: onOpenWorkspaceDeletion,
      });
    }

    if (hasSelectedWorkspace) {
      if (onToggleTerminal) {
        result.push({
          id: "toggle-terminal",
          type: "action",
          label: "Toggle Terminal",
          description: "Show or hide the terminal pane",
          icon: <ChevronsUpDown className="w-4 h-4" />,
          onSelect: onToggleTerminal,
        });
      }

      if (onMaximizeTerminal) {
        result.push({
          id: "maximize-terminal",
          type: "action",
          label: "Maximize Terminal",
          description: "Toggle maximize/restore terminal pane",
          icon: <Maximize2 className="w-4 h-4" />,
          onSelect: onMaximizeTerminal,
        });
      }

      if (onCreateAgentTerminal) {
        result.push({
          id: "new-agent-terminal",
          type: "action",
          label: "New Agent Terminal",
          description: "Create a new Claude agent session",
          icon: <Bot className="w-4 h-4" />,
          onSelect: onCreateAgentTerminal,
        });
      }

      if (onCreateShellTerminal) {
        result.push({
          id: "new-shell-terminal",
          type: "action",
          label: "New Shell Terminal",
          description: "Create a new shell session",
          icon: <TerminalIcon className="w-4 h-4" />,
          onSelect: onCreateShellTerminal,
        });
      }
    }

    for (const workspace of workspaces) {
      const workspaceSessions = sessions.filter(
        (s) => s.workspace_id === workspace.id
      );
      const agentCount = workspaceSessions.length;
      const changeCount = workspaceChangeCounts?.get(workspace.id) ?? 0;

      const parts: string[] = [];
      parts.push(`${agentCount} agent${agentCount !== 1 ? "s" : ""}`);
      parts.push(`0 shells`);
      parts.push(`${changeCount} change${changeCount !== 1 ? "s" : ""}`);

      result.push({
        id: `workspace-${workspace.id}`,
        type: "workspace",
        label: workspace.branch_name,
        description: parts.join(", "),
        icon: <GitBranch className="w-4 h-4" />,
        onSelect: () => onOpenWorkspaceSession(workspace),
      });
    }

    // Wrap all onSelect handlers to close the dialog after execution
    return result.map((item) => ({
      ...item,
      onSelect: () => {
        item.onSelect();
        onCommandPaletteChange(false);
      },
    }));
  }, [
    workspaces,
    sessions,
    onNavigateToDashboard,
    onNavigateToSettings,
    onOpenWorkspaceSession,
    onOpenSession,
    onOpenBranchSwitcher,
    onOpenFilePicker,
    onOpenWorkspaceDeletion,
    onCreateWorkspace,
    onToggleTerminal,
    onMaximizeTerminal,
    onCreateAgentTerminal,
    onCreateShellTerminal,
    repoPath,
    workspaceChangeCounts,
    hasSelectedWorkspace,
    onCommandPaletteChange,
  ]);

  // Render a command item
  const renderItem = (item: CommandItem) => (
    <Command.Item
      key={item.id}
      value={item.label}
      onSelect={item.onSelect}
      className="px-3 py-1.5 mx-2 rounded-md flex items-center gap-3 cursor-pointer text-foreground aria-selected:bg-accent/50 aria-selected:text-foreground data-[disabled]:opacity-50 data-[disabled]:pointer-events-none hover:bg-accent/30 transition-colors"
    >
      <span className="text-muted-foreground">{item.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="truncate text-sm font-medium">{item.label}</div>
        {item.description && (
          <div className="truncate text-sm text-muted-foreground">
            {item.description}
          </div>
        )}
      </div>
    </Command.Item>
  );

  return (
    <>
      {/* Command Palette */}
      <Command.Dialog
        open={showCommandPalette}
        onOpenChange={onCommandPaletteChange}
        label="Command Menu"
        className="[&_[cmdk-root]]:bg-background [&_[cmdk-root]]:text-foreground"
      >
        <div className="bg-background text-foreground rounded-xl border border-border shadow-2xl w-[40vw] max-w-none overflow-hidden">
          <div className="flex items-center border-b border-border px-3 bg-background">
            <Command.Input
              placeholder="Type a command or search..."
              className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-12 flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground text-foreground"
            />
          </div>

          <Command.List className="max-h-[300px] overflow-y-auto py-2">
            <Command.Empty>
              <div className="px-4 py-8 text-center text-muted-foreground text-sm">
                No results found
              </div>
            </Command.Empty>

            {items.map(renderItem)}
          </Command.List>

          <CmdkFooter />
        </div>
      </Command.Dialog>

      {/* Other Modals */}
      {repoPath && (
        <>
          <BranchSwitcher
            open={showBranchSwitcher}
            onOpenChange={onBranchSwitcherChange}
            repoPath={repoPath}
            onBranchChanged={onBranchChanged}
          />

          <WorkspaceDeletion
            open={showWorkspaceDeletion}
            onOpenChange={onWorkspaceDeletionChange}
            workspaces={workspaces}
            repoPath={repoPath}
            currentWorkspace={currentWorkspace}
            onDeleteWorkspace={onDeleteWorkspace}
          />

          <FilePicker
            open={showFilePicker}
            onOpenChange={onFilePickerChange}
            repoPath={repoPath}
            workspaceId={selectedWorkspaceId}
            onFileSelect={onFileSelected}
          />
        </>
      )}
    </>
  );
};
