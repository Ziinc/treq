import { useMemo } from "react";
import { Command } from "cmdk";
import { Workspace, Session } from "../lib/api";
import {
  Home,
  Settings,
  GitBranch,
  FileSearch,
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
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaces: Workspace[];
  sessions: Session[];
  onNavigateToDashboard: () => void;
  onNavigateToSettings: () => void;
  onOpenWorkspaceSession: (workspace: Workspace) => void;
  onOpenSession: (session: Session, workspace?: Workspace) => void;
  onOpenBranchSwitcher?: () => void;
  onOpenFilePicker?: () => void;
  repoPath?: string;
  workspaceChangeCounts?: Map<number, number>;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onOpenChange,
  workspaces,
  sessions,
  onNavigateToDashboard,
  onNavigateToSettings,
  onOpenWorkspaceSession,
  onOpenSession,
  onOpenBranchSwitcher,
  onOpenFilePicker,
  repoPath,
  workspaceChangeCounts,
}) => {
  // Build command items
  const items = useMemo<CommandItem[]>(() => {
    const result: CommandItem[] = [];

    // Actions
    result.push({
      id: "dashboard",
      type: "action",
      label: "Go to Home",
      icon: <Home className="w-4 h-4" />,
      onSelect: () => {
        onNavigateToDashboard();
        onOpenChange(false);
      },
    });

    result.push({
      id: "settings",
      type: "action",
      label: "Go to Settings",
      icon: <Settings className="w-4 h-4" />,
      onSelect: () => {
        onNavigateToSettings();
        onOpenChange(false);
      },
    });

    // Add Switch Branch action if we have a repo path
    if (repoPath && onOpenBranchSwitcher) {
      result.push({
        id: "switch-branch",
        type: "action",
        label: "Switch Branch",
        description: "Checkout a different branch in main tree",
        icon: <GitBranch className="w-4 h-4" />,
        onSelect: () => {
          onOpenBranchSwitcher();
          onOpenChange(false);
        },
      });
    }

    // Add Search Files action if we have a repo path
    if (repoPath && onOpenFilePicker) {
      result.push({
        id: "search-files",
        type: "action",
        label: "Search Files",
        description: "Jump to a file in the repository",
        icon: <FileSearch className="w-4 h-4" />,
        onSelect: () => {
          onOpenFilePicker();
          onOpenChange(false);
        },
      });
    }

    // Workspaces
    for (const workspace of workspaces) {
      const workspaceSessions = sessions.filter(s => s.workspace_id === workspace.id);
      const agentCount = workspaceSessions.length;
      const changeCount = workspaceChangeCounts?.get(workspace.id) ?? 0;

      // Build description: "N agents, N shells, N changes"
      const parts: string[] = [];
      parts.push(`${agentCount} agent${agentCount !== 1 ? 's' : ''}`);
      // Note: shells are not tracked in database, so we show 0 for now
      parts.push(`0 shells`);
      parts.push(`${changeCount} change${changeCount !== 1 ? 's' : ''}`);

      result.push({
        id: `workspace-${workspace.id}`,
        type: "workspace",
        label: workspace.branch_name,
        description: parts.join(', '),
        icon: <GitBranch className="w-4 h-4" />,
        onSelect: () => {
          onOpenWorkspaceSession(workspace);
          onOpenChange(false);
        },
      });
    }

    return result;
  }, [workspaces, sessions, onNavigateToDashboard, onNavigateToSettings, onOpenWorkspaceSession, onOpenSession, onOpenBranchSwitcher, onOpenFilePicker, onOpenChange, repoPath, workspaceChangeCounts]);

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
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command Menu"
      className="[&_[cmdk-root]]:bg-background [&_[cmdk-root]]:text-foreground"
    >
      <div className="bg-background text-foreground rounded-xl border border-border shadow-2xl w-[40vw] max-w-none overflow-hidden">
        {/* Search Input */}
        <div className="flex items-center border-b border-border px-3 bg-background">
          <Command.Input
            placeholder="Type a command or search..."
            className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-12 flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground text-foreground"
          />
        </div>

        {/* Results List */}
        <Command.List className="max-h-[300px] overflow-y-auto py-2">
          <Command.Empty>
            <div className="px-4 py-8 text-center text-muted-foreground text-sm">
              No results found
            </div>
          </Command.Empty>

          {/* Flat list of all items */}
          {items.map(renderItem)}
        </Command.List>

        {/* Footer with keyboard hints */}
        <div className="border-t border-border px-3 py-2 flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-3">
            <span><kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">↑↓</kbd> Navigate</span>
            <span><kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">↵</kbd> Select</span>
            <span><kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Esc</kbd> Close</span>
          </div>
        </div>
      </div>
    </Command.Dialog>
  );
};
