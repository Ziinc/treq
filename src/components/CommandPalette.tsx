import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent } from "./ui/dialog";
import { Input } from "./ui/input";
import { Worktree, Session } from "../lib/api";
import {
  Home,
  Settings,
  GitBranch,
  Terminal,
  ArrowRight,
} from "lucide-react";
import { cn } from "../lib/utils";

interface CommandItem {
  id: string;
  type: "action" | "worktree" | "session";
  label: string;
  description?: string;
  icon: React.ReactNode;
  onSelect: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  worktrees: Worktree[];
  sessions: Session[];
  onNavigateToDashboard: () => void;
  onNavigateToSettings: () => void;
  onOpenWorktreeSession: (worktree: Worktree) => void;
  onOpenSession: (session: Session, worktree?: Worktree) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onOpenChange,
  worktrees,
  sessions,
  onNavigateToDashboard,
  onNavigateToSettings,
  onOpenWorktreeSession,
  onOpenSession,
}) => {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Build command items
  const items = useMemo<CommandItem[]>(() => {
    const result: CommandItem[] = [];

    // Actions
    result.push({
      id: "dashboard",
      type: "action",
      label: "Go to Dashboard",
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

    // Worktrees
    for (const worktree of worktrees) {
      const worktreeSessions = sessions.filter(s => s.worktree_id === worktree.id);
      result.push({
        id: `worktree-${worktree.id}`,
        type: "worktree",
        label: worktree.branch_name,
        description: `${worktreeSessions.length} session${worktreeSessions.length !== 1 ? 's' : ''}`,
        icon: <GitBranch className="w-4 h-4" />,
        onSelect: () => {
          onOpenWorktreeSession(worktree);
          onOpenChange(false);
        },
      });
    }

    // Sessions
    for (const session of sessions) {
      const worktree = worktrees.find(w => w.id === session.worktree_id);
      result.push({
        id: `session-${session.id}`,
        type: "session",
        label: session.name,
        description: worktree ? worktree.branch_name : "Main repo",
        icon: <Terminal className="w-4 h-4" />,
        onSelect: () => {
          onOpenSession(session, worktree);
          onOpenChange(false);
        },
      });
    }

    return result;
  }, [worktrees, sessions, onNavigateToDashboard, onNavigateToSettings, onOpenWorktreeSession, onOpenSession, onOpenChange]);

  // Filter items based on query
  const filteredItems = useMemo(() => {
    if (!query.trim()) return items;
    const lowerQuery = query.toLowerCase();
    return items.filter(item =>
      item.label.toLowerCase().includes(lowerQuery) ||
      item.description?.toLowerCase().includes(lowerQuery)
    );
  }, [items, query]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Reset state when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filteredItems.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (filteredItems[selectedIndex]) {
          filteredItems[selectedIndex].onSelect();
        }
        break;
      case "Escape":
        e.preventDefault();
        onOpenChange(false);
        break;
    }
  }, [filteredItems, selectedIndex, onOpenChange]);

  const getTypeLabel = (type: CommandItem["type"]) => {
    switch (type) {
      case "action": return "Actions";
      case "worktree": return "Worktrees";
      case "session": return "Sessions";
    }
  };

  // Group items by type
  const groupedItems = useMemo(() => {
    const groups: { type: CommandItem["type"]; items: CommandItem[] }[] = [];
    let currentType: CommandItem["type"] | null = null;

    for (const item of filteredItems) {
      if (item.type !== currentType) {
        groups.push({ type: item.type, items: [item] });
        currentType = item.type;
      } else {
        groups[groups.length - 1].items.push(item);
      }
    }

    return groups;
  }, [filteredItems]);

  // Calculate flat index for an item
  const getFlatIndex = (groupIndex: number, itemIndex: number) => {
    let index = 0;
    for (let g = 0; g < groupIndex; g++) {
      index += groupedItems[g].items.length;
    }
    return index + itemIndex;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 w-[40vw] max-w-none overflow-hidden">
        <div className="flex items-center border-b border-border px-3">
          <ArrowRight className="w-4 h-4 text-muted-foreground mr-2" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search..."
            className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-12"
          />
        </div>

        <div ref={listRef} className="max-h-[300px] overflow-y-auto py-2">
          {filteredItems.length === 0 ? (
            <div className="px-4 py-8 text-center text-muted-foreground text-sm">
              No results found
            </div>
          ) : (
            groupedItems.map((group, groupIndex) => (
              <div key={group.type}>
                <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {getTypeLabel(group.type)}
                </div>
                {group.items.map((item, itemIndex) => {
                  const flatIndex = getFlatIndex(groupIndex, itemIndex);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={cn(
                        "w-full px-3 py-2 flex items-center gap-3 text-left transition-colors",
                        flatIndex === selectedIndex
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-muted"
                      )}
                      onClick={() => item.onSelect()}
                      onMouseEnter={() => setSelectedIndex(flatIndex)}
                    >
                      <span className="text-muted-foreground">{item.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-sm">{item.label}</div>
                        {item.description && (
                          <div className="truncate text-xs text-muted-foreground">
                            {item.description}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="border-t border-border px-3 py-2 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span><kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">↑↓</kbd> Navigate</span>
            <span><kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">↵</kbd> Select</span>
            <span><kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Esc</kbd> Close</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
