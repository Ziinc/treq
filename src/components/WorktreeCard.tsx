import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Button } from "./ui/button";
import { Worktree, GitStatus, BranchInfo, gitGetStatus, gitGetBranchInfo, calculateDirectorySize, shellLaunchApp } from "../lib/api";
import { formatBytes } from "../lib/utils";
import { GitBranch, FileText, Terminal as TerminalIcon, Trash2, FolderOpen, Code2, HardDrive, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

interface WorktreeCardProps {
  worktree: Worktree;
  onOpenTerminal: (worktree: Worktree) => void;
  onOpenDiff: (worktree: Worktree) => void;
  onOpenEditor: (worktree: Worktree) => void;
  onDelete: (worktree: Worktree) => void;
  availableEditors?: string[];
  preferredEditor?: string;
}

export const WorktreeCard: React.FC<WorktreeCardProps> = ({
  worktree,
  onOpenTerminal,
  onOpenDiff,
  onOpenEditor,
  onDelete,
  availableEditors = [],
  preferredEditor,
}) => {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [branchInfo, setBranchInfo] = useState<BranchInfo | null>(null);
  const [size, setSize] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchGitInfo = async () => {
      try {
        const [gitStatus, branchData, dirSize] = await Promise.all([
          gitGetStatus(worktree.worktree_path),
          gitGetBranchInfo(worktree.worktree_path),
          calculateDirectorySize(worktree.worktree_path),
        ]);
        setStatus(gitStatus);
        setBranchInfo(branchData);
        setSize(dirSize);
      } catch (err) {
        console.error("Failed to fetch git info:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchGitInfo();
    // Refresh every 30 seconds
    const interval = setInterval(fetchGitInfo, 30000);
    return () => clearInterval(interval);
  }, [worktree.worktree_path]);

  const totalChanges = status
    ? status.modified + status.added + status.deleted + status.untracked
    : 0;

  const handleLaunchEditor = async (editorName: string) => {
    try {
      await shellLaunchApp(editorName, worktree.worktree_path);
    } catch (error) {
      console.error("Failed to launch editor:", error);
    }
  };

  const getEditorDisplayName = (editor: string) => {
    switch (editor) {
      case "cursor": return "Cursor";
      case "code": return "VS Code";
      case "code-insiders": return "VS Code Insiders";
      default: return editor;
    }
  };

  // Determine the default editor (preferred or first available)
  const defaultEditor = preferredEditor && availableEditors.includes(preferredEditor)
    ? preferredEditor
    : availableEditors[0];

  const hasEditors = availableEditors.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitBranch className="w-5 h-5" />
          {worktree.branch_name}
        </CardTitle>
        <CardDescription className="truncate">
          {worktree.worktree_path}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading git info...</div>
        ) : (
          <div className="space-y-3">
            {branchInfo && (
              <div className="flex flex-wrap gap-2 text-xs">
                {branchInfo.ahead > 0 && (
                  <div className="px-2 py-1 bg-green-500/10 text-green-600 dark:text-green-400 rounded-md">
                    ↑ {branchInfo.ahead} ahead
                  </div>
                )}
                {branchInfo.behind > 0 && (
                  <div className="px-2 py-1 bg-orange-500/10 text-orange-600 dark:text-orange-400 rounded-md">
                    ↓ {branchInfo.behind} behind
                  </div>
                )}
                {branchInfo.ahead === 0 && branchInfo.behind === 0 && (
                  <div className="px-2 py-1 bg-muted text-muted-foreground rounded-md">
                    Up to date
                  </div>
                )}
              </div>
            )}

            {status && (
              <div className="flex flex-wrap gap-2 text-xs">
                {totalChanges > 0 ? (
                  <>
                    {status.modified > 0 && (
                      <div className="px-2 py-1 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 rounded-md">
                        {status.modified} modified
                      </div>
                    )}
                    {status.added > 0 && (
                      <div className="px-2 py-1 bg-green-500/10 text-green-600 dark:text-green-400 rounded-md">
                        {status.added} added
                      </div>
                    )}
                    {status.deleted > 0 && (
                      <div className="px-2 py-1 bg-red-500/10 text-red-600 dark:text-red-400 rounded-md">
                        {status.deleted} deleted
                      </div>
                    )}
                    {status.untracked > 0 && (
                      <div className="px-2 py-1 bg-gray-500/10 text-gray-600 dark:text-gray-400 rounded-md">
                        {status.untracked} untracked
                      </div>
                    )}
                  </>
                ) : (
                  <div className="px-2 py-1 bg-muted text-muted-foreground rounded-md">
                    No changes
                  </div>
                )}
              </div>
            )}

            {size !== null && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <HardDrive className="w-4 h-4" />
                <span>{formatBytes(size)}</span>
              </div>
            )}
          </div>
        )}
      </CardContent>

      <CardFooter className="flex gap-2 flex-wrap">
        {hasEditors && (
          <div className="flex">
            <Button
              size="sm"
              variant="outline"
              onClick={() => defaultEditor && handleLaunchEditor(defaultEditor)}
              className="rounded-r-none border-r-0"
            >
              <Code2 className="w-4 h-4 mr-2" />
              {defaultEditor ? getEditorDisplayName(defaultEditor) : "Editor"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-l-none px-2"
                >
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {availableEditors.map((editor) => (
                  <DropdownMenuItem
                    key={editor}
                    onClick={() => handleLaunchEditor(editor)}
                  >
                    <Code2 className="w-4 h-4 mr-2" />
                    {getEditorDisplayName(editor)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => onOpenTerminal(worktree)}
        >
          <TerminalIcon className="w-4 h-4 mr-2" />
          Terminal
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onOpenDiff(worktree)}
          disabled={totalChanges === 0}
        >
          <FileText className="w-4 h-4 mr-2" />
          Diff
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            // Open in file manager
            window.open(`file://${worktree.worktree_path}`);
          }}
        >
          <FolderOpen className="w-4 h-4 mr-2" />
          Open
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => onDelete(worktree)}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </CardFooter>
    </Card>
  );
};

