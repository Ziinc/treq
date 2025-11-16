import { Terminal } from "./Terminal";
import { StagingDiffViewer } from "./StagingDiffViewer";
import { Button } from "./ui/button";
import { X } from "lucide-react";
import { Worktree } from "../lib/api";

interface WorktreeEditSessionProps {
  worktree: Worktree;
  onClose: () => void;
}

export const WorktreeEditSession: React.FC<WorktreeEditSessionProps> = ({
  worktree,
  onClose,
}) => {
  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="border-b p-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            Edit Session - {worktree.branch_name}
          </h2>
          <p className="text-sm text-muted-foreground">
            {worktree.worktree_path}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Split panel layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel - Terminal */}
        <div className="flex-1 min-w-0 border-r">
          <Terminal
            sessionId={`worktree-edit-${worktree.id}`}
            workingDir={worktree.worktree_path}
          />
        </div>

        {/* Right panel - Staging Diff Viewer */}
        <div className="flex-1 min-w-0">
          <StagingDiffViewer worktreePath={worktree.worktree_path} />
        </div>
      </div>
    </div>
  );
};


