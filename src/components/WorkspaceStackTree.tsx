import { useQuery } from "@tanstack/react-query";
import { GitBranch, CornerLeftUp, AlertTriangle } from "lucide-react";
import { type Workspace, getWorkspaceStatus } from "../lib/api";
import { getWorkspaceTitle } from "../lib/workspace-utils";
import { cn } from "../lib/utils";

interface WorkspaceStackTreeProps {
  workspacePath: string;
  currentWorkspaceId: number;
  onNavigateToWorkspace: (workspace: Workspace) => void;
}

export function WorkspaceStackTree({
  workspacePath,
  currentWorkspaceId,
  onNavigateToWorkspace,
}: WorkspaceStackTreeProps) {
  const { data: status } = useQuery({
    queryKey: ["workspace-status", workspacePath],
    queryFn: () => getWorkspaceStatus(workspacePath),
    staleTime: 30_000,
  });

  if (!status || status.dag_nodes.length <= 1) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1 px-1 bg-muted/30 rounded px-2 py-1">
      {status.dag_nodes.map((node) => {
        const isCurrent = node.status.current.id === currentWorkspaceId;
        const isConflicted = status.conflicted_workspace_ids.includes(
          node.status.current.id
        );

        return (
          <button
            key={node.status.current.id}
            onClick={() => {
              if (!isCurrent) {
                onNavigateToWorkspace(node.status.current);
              }
            }}
            className={cn(
              "flex items-center text-xs font-mono rounded px-1.5 py-0.5 transition-colors",
              isCurrent
                ? "bg-primary/15 text-primary font-medium"
                : "text-muted-foreground hover:bg-muted/50 cursor-pointer"
            )}
            style={{ marginLeft: node.depth * 12 }}
            disabled={isCurrent}
          >
            {node.depth === 0 ? (
              <GitBranch className="w-3 h-3 mr-1 shrink-0" />
            ) : (
              <CornerLeftUp className="w-3 h-3 mr-1 shrink-0" />
            )}
            <span className="truncate max-w-[120px]">
              {getWorkspaceTitle(node.status.current)}
            </span>
            {isConflicted && (
              <AlertTriangle className="w-3 h-3 ml-1 text-destructive shrink-0" />
            )}
          </button>
        );
      })}
    </div>
  );
}
