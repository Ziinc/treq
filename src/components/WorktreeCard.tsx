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
import { Worktree, GitStatus, BranchInfo, gitGetStatus, gitGetBranchInfo, calculateDirectorySize, openEditor, EditorType, getSetting } from "../lib/api";
import { formatBytes } from "../lib/utils";
import { GitBranch, FileText, Terminal as TerminalIcon, Trash2, FolderOpen, Code2, HardDrive, ChevronDown, Info, GitMerge } from "lucide-react";
import { useToast } from "./ui/toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/popover";

interface WorktreeCardProps {
  worktree: Worktree;
  onOpenPlanningTerminal: (worktree: Worktree) => void;
  onOpenExecutionTerminal: (worktree: Worktree) => void;
  onOpenDiff: (worktree: Worktree) => void;
  onDelete: (worktree: Worktree) => void;
  onMerge: (worktree: Worktree) => void;
}

export const WorktreeCard: React.FC<WorktreeCardProps> = ({
  worktree,
  onOpenPlanningTerminal,
  onOpenExecutionTerminal,
  onOpenDiff,
  onDelete,
  onMerge,
}) => {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [branchInfo, setBranchInfo] = useState<BranchInfo | null>(null);
  const [size, setSize] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [defaultEditorType, setDefaultEditorType] = useState<EditorType>("cursor");
  const { addToast } = useToast();

  // Parse metadata to get title/intent
  const getDisplayTitle = (): string => {
    if (worktree.metadata) {
      try {
        const metadata = JSON.parse(worktree.metadata);
        return metadata.initial_plan_title || metadata.intent || worktree.branch_name;
      } catch {
        return worktree.branch_name;
      }
    }
    return worktree.branch_name;
  };

  const hasMetadata = (): boolean => {
    if (!worktree.metadata) return false;
    try {
      const metadata = JSON.parse(worktree.metadata);
      return !!(metadata.initial_plan_title || metadata.intent);
    } catch {
      return false;
    }
  };

  const displayTitle = getDisplayTitle();

  // Load default editor from settings
  useEffect(() => {
    getSetting("default_editor").then((editor) => {
      if (editor && (editor === "vscode" || editor === "cursor" || editor === "zed")) {
        setDefaultEditorType(editor as EditorType);
      }
    });
  }, []);

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

  // Available editors with URL scheme support
  const editors: Array<{ type: EditorType; name: string }> = [
    { type: "vscode", name: "VS Code" },
    { type: "cursor", name: "Cursor" },
    { type: "zed", name: "Zed" },
  ];

  const defaultEditor = editors.find(e => e.type === defaultEditorType) || editors[1]; // Default to Cursor

  const handleLaunchEditor = async (editorType: EditorType) => {
    try {
      await openEditor(editorType, worktree.worktree_path);
    } catch (error) {
      console.error("Failed to launch editor:", error);
      const editorNames: Record<EditorType, string> = {
        vscode: "VS Code",
        cursor: "Cursor",
        zed: "Zed",
      };
      addToast({
        type: "error",
        title: `Failed to open ${editorNames[editorType]}`,
        description: `${editorNames[editorType]} may not be installed or the URL scheme is not available.`,
      });
    }
  };


  const canMerge = !!branchInfo && branchInfo.ahead > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="flex items-center gap-2 mb-1">
              {hasMetadata() ? (
                <FileText className="w-5 h-5 flex-shrink-0" />
              ) : (
                <GitBranch className="w-5 h-5 flex-shrink-0" />
              )}
              <span className="truncate">{displayTitle}</span>
            </CardTitle>
            {hasMetadata() && (
              <CardDescription className="text-xs flex items-center gap-1">
                <GitBranch className="w-3 h-3" />
                {worktree.branch_name}
              </CardDescription>
            )}
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                <Info className="w-4 h-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80">
              <div className="space-y-3">
                <div>
                  <h4 className="font-semibold text-sm mb-1">Worktree Details</h4>
                </div>
                <div className="space-y-2 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">Branch</div>
                    <div className="font-mono text-xs break-all">{worktree.branch_name}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">Path</div>
                    <div className="font-mono text-xs break-all">{worktree.worktree_path}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">Created</div>
                    <div className="text-xs">{new Date(worktree.created_at).toLocaleString()}</div>
                  </div>
                  {size !== null && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-0.5">Size</div>
                      <div className="text-xs flex items-center gap-1">
                        <HardDrive className="w-3 h-3" />
                        {formatBytes(size)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
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
          </div>
        )}
      </CardContent>

      <CardFooter className="flex gap-2 flex-wrap">
        <div className="flex">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleLaunchEditor(defaultEditor.type)}
            className="rounded-r-none border-r-0"
          >
            <Code2 className="w-4 h-4 mr-2" />
            Open in {defaultEditor.name}
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
              {editors.map((editor) => (
                <DropdownMenuItem
                  key={editor.type}
                  onClick={() => handleLaunchEditor(editor.type)}
                >
                  <Code2 className="w-4 h-4 mr-2" />
                  Open in {editor.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem
                onClick={() => window.open(`file://${worktree.worktree_path}`)}
              >
                <FolderOpen className="w-4 h-4 mr-2" />
                Open in File Manager
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onOpenPlanningTerminal(worktree)}
        >
          <TerminalIcon className="w-4 h-4 mr-2" />
          Planning Terminal
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onOpenExecutionTerminal(worktree)}
        >
          <TerminalIcon className="w-4 h-4 mr-2" />
          Execution Terminal
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
          onClick={() => onMerge(worktree)}
          disabled={!canMerge}
          className="bg-blue-600 text-white hover:bg-blue-500"
        >
          <GitMerge className="w-4 h-4 mr-2" />
          Merge
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
