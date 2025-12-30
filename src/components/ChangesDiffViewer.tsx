import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  Fragment,
  forwardRef,
  useImperativeHandle,
} from "react";
import { type KeyboardEvent as ReactKeyboardEvent } from "react";
import { openPath } from "@tauri-apps/plugin-opener";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { v4 as uuidv4 } from "uuid";
import {
  jjGetChangedFiles,
  jjGetFileHunks,
  jjRestoreFile,
  jjRestoreAll,
  jjCommit,
  jjSplit,
  getDiffCache,
  markFileViewed,
  unmarkFileViewed,
  readFile,
  loadPendingReview,
  clearPendingReview,
  type JjDiffHunk,
} from "../lib/api";
import { useCachedWorkspaceChanges } from "../hooks/useCachedWorkspaceChanges";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { useToast } from "./ui/toast";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "./ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import {
  AlertTriangle,
  FileText,
  Loader2,
  Plus,
  ChevronDown,
  ChevronRight,
  MoreVertical,
  CheckCircle2,
  MessageSquare,
  Send,
  X,
  Copy,
  Check,
  Square,
  RefreshCw,
  Pencil,
} from "lucide-react";
import { cn, getFileName } from "../lib/utils";
import { getLanguageFromPath, highlightCode } from "../lib/syntax-highlight";
import {
  parseJjChangedFiles,
  isBinaryFile,
  type ParsedFileChange,
} from "../lib/git-utils";
import { useDiffSettings } from "../hooks/useDiffSettings";
import { ChangesSection } from "./ChangesSection";
import { ConflictsSection } from "./ConflictsSection";
import { MoveToWorkspaceDialog } from "./MoveToWorkspaceDialog";

interface ChangesDiffViewerProps {
  workspacePath: string;
  repoPath?: string;
  workspaceId?: number;
  readOnly?: boolean;
  onStagedFilesChange?: (files: string[]) => void;
  onRefreshingChange?: (isRefreshing: boolean) => void;
  initialSelectedFile: string | null;
  onReviewSubmitted?: () => void;
  onCreateAgentWithReview?: (
    reviewMarkdown: string,
    mode: "plan" | "acceptEdits"
  ) => Promise<void>;
  conflictedFiles?: string[];
}

export interface ChangesDiffViewerHandle {
  focusCommitInput: () => void;
  refresh: () => void;
}

interface LineComment {
  id: string;
  filePath: string;
  hunkId: string;
  startLine: number; // actual file line number (1-indexed)
  endLine: number; // actual file line number (1-indexed)
  lineContent: string[];
  text: string;
  createdAt: string;
}

// Extended line selection for staging (supports multi-hunk)
interface DiffLineSelection {
  filePath: string;
  lines: Array<{
    hunkIndex: number;
    lineIndex: number;
    content: string;
    isStaged: boolean;
  }>;
}

interface FileHunksData {
  filePath: string;
  hunks: JjDiffHunk[];
  isLoading: boolean;
  error?: string;
}

// Helper to get line type styling (background only, text color handled by syntax highlighting)
const getLineTypeClass = (line: string): string => {
  if (line.startsWith("+")) return "bg-emerald-500/20";
  if (line.startsWith("-")) return "bg-red-500/20";
  return "";
};

const getLinePrefix = (line: string): string => {
  if (line.startsWith("+")) return "+";
  if (line.startsWith("-")) return "-";
  return " ";
};

const hunksEqual = (
  a?: JjDiffHunk[] | null,
  b?: JjDiffHunk[] | null
): boolean => {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  return JSON.stringify(a) === JSON.stringify(b);
};

const filesEqual = (a: ParsedFileChange[], b: ParsedFileChange[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].path !== b[i].path ||
      a[i].stagedStatus !== b[i].stagedStatus ||
      a[i].workspaceStatus !== b[i].workspaceStatus ||
      a[i].isUntracked !== b[i].isUntracked
    ) {
      return false;
    }
  }
  return true;
};

const parseCachedHunks = (raw: string): JjDiffHunk[] | null => {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed as JjDiffHunk[];
    }
  } catch {
    // Silently ignore parse failures
  }
  return null;
};

// Parse hunk header to extract starting line numbers and counts
const parseHunkHeader = (
  header: string
): {
  oldStart: number;
  newStart: number;
  oldCount: number;
  newCount: number;
} => {
  const match = header.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
  if (!match) {
    return { oldStart: 1, newStart: 1, oldCount: 1, newCount: 1 };
  }
  return {
    oldStart: parseInt(match[1], 10),
    oldCount: match[2] ? parseInt(match[2], 10) : 1,
    newStart: parseInt(match[3], 10),
    newCount: match[4] ? parseInt(match[4], 10) : 1,
  };
};

// Compute actual line numbers for each line in a hunk
const computeHunkLineNumbers = (
  hunk: JjDiffHunk
): Array<{ old?: number; new?: number }> => {
  const { oldStart, newStart } = parseHunkHeader(hunk.header);
  let oldLine = oldStart;
  let newLine = newStart;

  return hunk.lines.map((line) => {
    if (line.startsWith("+")) {
      return { new: newLine++ };
    } else if (line.startsWith("-")) {
      return { old: oldLine++ };
    } else {
      // Context line - both increment
      return { old: oldLine++, new: newLine++ };
    }
  });
};

// Compute a simple hash of file hunks for change detection
const computeHunksHash = (hunks: JjDiffHunk[]): string => {
  // Create a string from all hunk content and hash it
  const content = hunks.map((h) => h.header + h.lines.join("")).join("|");
  // Simple hash function (djb2)
  let hash = 5381;
  for (let i = 0; i < content.length; i++) {
    hash = (hash << 5) + hash + content.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(16);
};

// Isolated comment input component to prevent parent re-renders during typing
interface CommentInputProps {
  onSubmit: (text: string) => void;
  onCancel: () => void;
  filePath?: string;
  startLine?: number;
  endLine?: number;
}

const CommentInput: React.FC<CommentInputProps> = memo(
  ({ onSubmit, onCancel, filePath, startLine, endLine }) => {
    const [text, setText] = useState("");

    const handleSubmit = useCallback(() => {
      if (text.trim()) {
        onSubmit(text.trim());
      }
    }, [text, onSubmit]);

    const handleKeyDown = useCallback(
      (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
        // Stop propagation for standard text editing shortcuts
        if (e.metaKey || e.ctrlKey) {
          const key = e.key.toLowerCase();
          if (["a", "c", "x", "v", "z", "y"].includes(key)) {
            e.stopPropagation();
            return; // Let browser handle natively
          }
        }

        if (e.key === "Escape") {
          onCancel();
        } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          handleSubmit();
        }
      },
      [onCancel, handleSubmit]
    );

    const lineLabel =
      startLine && endLine
        ? startLine === endLine
          ? `L${startLine}`
          : `L${startLine}-${endLine}`
        : null;

    return (
      <div className="bg-muted/60 border-y border-border/40 px-4 py-3 font-sans text-base">
        {filePath && lineLabel && (
          <div className="mb-2 text-md text-muted-foreground">
            {filePath}:{lineLabel}
          </div>
        )}
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a comment..."
          className="mb-2 font-sans"
          autoFocus
          onKeyDown={handleKeyDown}
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!text.trim()}>
            Add Comment
          </Button>
        </div>
      </div>
    );
  }
);
CommentInput.displayName = "CommentInput";

interface CommentEditInputProps {
  initialText: string;
  onSave: (text: string) => void;
  onCancel: () => void;
  onDiscard: () => void;
}

const CommentEditInput: React.FC<CommentEditInputProps> = memo(
  ({ initialText, onSave, onCancel, onDiscard }) => {
    const [text, setText] = useState(initialText);

    const handleSave = useCallback(() => {
      if (text.trim()) {
        onSave(text.trim());
      }
    }, [text, onSave]);

    const handleKeyDown = useCallback(
      (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
        if (e.metaKey || e.ctrlKey) {
          const key = e.key.toLowerCase();
          if (["a", "c", "x", "v", "z", "y"].includes(key)) {
            e.stopPropagation();
            return;
          }
        }

        if (e.key === "Escape") {
          onCancel();
        } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          handleSave();
        }
      },
      [onCancel, handleSave]
    );

    return (
      <div className="space-y-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="font-sans text-sm"
          autoFocus
          onKeyDown={handleKeyDown}
        />
        <div className="flex justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onDiscard}
            className="text-destructive hover:text-destructive hover:bg-destructive/10 font-sans"
          >
            Discard
          </Button>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              className="font-sans"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!text.trim()}
              className="font-sans"
            >
              Save
            </Button>
          </div>
        </div>
      </div>
    );
  }
);
CommentEditInput.displayName = "CommentEditInput";

// Isolated commit input component to prevent parent re-renders during typing
interface CommitInputHandle {
  focus: () => void;
}

interface CommitInputProps {
  onCommit: (message: string) => void;
  disabled: boolean;
  pending: boolean;
  selectedFileCount?: number;
  totalFileCount?: number;
}

const CommitInput = memo(
  forwardRef<CommitInputHandle, CommitInputProps>(
    (
      {
        onCommit,
        disabled,
        pending,
        selectedFileCount = 0,
        totalFileCount = 0,
      },
      ref
    ) => {
      const [message, setMessage] = useState("");
      const textareaRef = useRef<HTMLTextAreaElement>(null);

      // Expose focus method via ref
      useImperativeHandle(
        ref,
        () => ({
          focus: () => {
            requestAnimationFrame(() => {
              if (textareaRef.current) {
                textareaRef.current.focus();
                // Select all text for easy overwriting
                textareaRef.current.select();
              }
            });
          },
        }),
        []
      );

      const handleKeyDown = useCallback(
        (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            onCommit(message.trim());
            setMessage("");
          }
        },
        [message, onCommit]
      );

      const handleCommit = useCallback(() => {
        onCommit(message.trim());
        setMessage("");
      }, [message, onCommit]);

      return (
        <div className="px-4 py-3 border-b border-border space-y-2">
          <Textarea
            ref={textareaRef}
            placeholder="Message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled || pending}
            className="resize-none overflow-hidden"
            style={{ minHeight: "24px" }}
          />
          <Button
            className="w-full text-sm !h-auto py-1.5"
            disabled={disabled}
            onClick={handleCommit}
            size="sm"
          >
            {pending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : selectedFileCount > 0 && selectedFileCount < totalFileCount ? (
              `Commit ${selectedFileCount} file${
                selectedFileCount !== 1 ? "s" : ""
              }`
            ) : (
              "Commit"
            )}
          </Button>
        </div>
      );
    }
  )
);
CommitInput.displayName = "CommitInput";

// Memoized syntax-highlighted line content
interface HighlightedLineProps {
  content: string;
  language: string | null;
}

const HighlightedLine: React.FC<HighlightedLineProps> = memo(
  ({ content, language }) => {
    const html = useMemo(
      () => highlightCode(content, language),
      [content, language]
    );
    return <span dangerouslySetInnerHTML={{ __html: html }} />;
  }
);
HighlightedLine.displayName = "HighlightedLine";

// FileRow component (extracted for performance)
interface FileRowComponentProps {
  file: ParsedFileChange;
  allFileHunks: Map<string, FileHunksData>;
  collapsedFiles: Set<string>;
  viewedFiles: Map<string, { viewedAt: string; contentHash: string }>;
  expandedLargeDiffs: Set<string>;
  diffFontSize: number;
  readOnly: boolean;
  fileActionTarget: string | null;
  selectedUnstagedFiles: Set<string>;
  workspacePath: string;
  toggleFileCollapse: (filePath: string) => void;
  toggleLargeDiff: (filePath: string) => void;
  handleMarkFileViewed: (filePath: string) => void;
  handleUnmarkFileViewed: (filePath: string) => void;
  handleDiscardFiles: (filePath: string) => void;
  handleContextMenu: (e: React.MouseEvent) => void;
  renderHunkLines: (
    hunk: JjDiffHunk,
    hunkIndex: number,
    filePath: string
  ) => JSX.Element;
  addToast: ReturnType<typeof useToast>["addToast"];
  getOutdatedCommentsForFile: (filePath: string) => LineComment[];
  deleteComment: (commentId: string) => void;
}

const FileRowComponent: React.FC<FileRowComponentProps> = memo((props) => {
  const {
    file,
    allFileHunks,
    collapsedFiles,
    viewedFiles,
    expandedLargeDiffs,
    diffFontSize: _diffFontSize,
    readOnly,
    fileActionTarget,
    selectedUnstagedFiles,
    workspacePath,
    toggleFileCollapse,
    toggleLargeDiff,
    handleMarkFileViewed,
    handleUnmarkFileViewed,
    handleDiscardFiles,
    handleContextMenu,
    renderHunkLines,
    addToast,
    getOutdatedCommentsForFile,
    deleteComment,
  } = props;

  const filePath = file.path;
  const fileData = allFileHunks.get(filePath);
  if (!fileData) return <div />;

  const isCollapsed = isBinaryFile(filePath)
    ? true
    : collapsedFiles.has(filePath);
  const isViewed = viewedFiles.has(filePath);
  const fileId = `file-section-${filePath.replace(/[^a-zA-Z0-9]/g, "-")}`;

  // Compute line stats from hunks
  let additions = 0;
  let deletions = 0;
  if (!fileData.isLoading && fileData.hunks) {
    for (const hunk of fileData.hunks) {
      for (const line of hunk.lines) {
        if (line.startsWith("+")) additions++;
        else if (line.startsWith("-")) deletions++;
      }
    }
  }

  const outdatedComments = getOutdatedCommentsForFile(filePath);

  return (
    <div
      key={filePath}
      id={fileId}
      data-file-path={filePath}
      className="border border-border rounded-lg overflow-hidden"
    >
      {/* File Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-[16px] py-[8px] bg-muted border-b border-border">
        <div className="flex items-center gap-[8px] flex-1 min-w-0">
          <button
            role="button"
            aria-label={isCollapsed ? "Expand file diff" : "Collapse file diff"}
            className="p-0 border-0 bg-transparent cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              toggleFileCollapse(filePath);
            }}
          >
            {isCollapsed ? (
              <ChevronRight className="w-3 h-3 flex-shrink-0" />
            ) : (
              <ChevronDown className="w-3 h-3 flex-shrink-0" />
            )}
          </button>
          <div className="min-w-0 flex-1 flex items-center gap-[6px]">
            <span className="text-sm text-muted-foreground truncate font-mono">
              {filePath.replace(/\/+$/, "")}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(filePath);
                addToast({
                  title: "Copied",
                  description: "File path copied to clipboard",
                  type: "success",
                });
              }}
              className="text-muted-foreground hover:text-foreground flex-shrink-0"
              title="Copy file path"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-[8px]">
          {/* Viewed checkbox */}
          <button
            role="checkbox"
            aria-checked={isViewed}
            aria-label="Viewed"
            onClick={(e) => {
              e.stopPropagation();
              if (isViewed) {
                handleUnmarkFileViewed(filePath);
              } else {
                handleMarkFileViewed(filePath);
              }
            }}
            className={cn(
              "flex items-center gap-[4px] px-[8px] py-[2px] rounded text-sm transition-colors",
              isViewed
                ? "bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/35"
                : "bg-muted hover:bg-accent text-muted-foreground hover:text-foreground"
            )}
            title={isViewed ? "Mark as not viewed" : "Mark as viewed"}
          >
            {isViewed ? (
              <Check className="w-3 h-3" />
            ) : (
              <Square className="w-3 h-3" />
            )}
            <span>Viewed</span>
          </button>
          {isBinaryFile(filePath) && (
            <span className="text-sm px-[8px] py-[2px] rounded bg-zinc-500/25 text-zinc-700 dark:text-zinc-300">
              Binary
            </span>
          )}
          {(additions > 0 || deletions > 0) && (
            <span className="text-sm font-mono flex items-center gap-[4px]">
              <span className="text-emerald-700 dark:text-emerald-300">
                +{additions}
              </span>
              <span className="text-red-700 dark:text-red-300">
                -{deletions}
              </span>
            </span>
          )}
          {!readOnly && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <button className="p-[4px] rounded hover:bg-accent">
                  <MoreVertical className="w-3 h-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={4}>
                {(file.workspaceStatus || file.stagedStatus) && (
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      handleDiscardFiles(filePath);
                    }}
                    disabled={fileActionTarget === filePath}
                    className="text-red-700 dark:text-red-300 focus:text-red-700 dark:focus:text-red-300"
                  >
                    {selectedUnstagedFiles.has(filePath) &&
                    selectedUnstagedFiles.size > 1
                      ? `Discard ${selectedUnstagedFiles.size} files`
                      : "Discard file"}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={async (e) => {
                    e.preventDefault();
                    try {
                      await openPath(`${workspacePath}/${filePath}`);
                    } catch (err) {
                      const msg =
                        err instanceof Error ? err.message : String(err);
                      addToast({
                        title: "Open Failed",
                        description: msg,
                        type: "error",
                      });
                    }
                  }}
                >
                  Edit file
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* File Hunks - consolidated view without per-hunk collapsible */}
      {!isCollapsed && (
        <div
          className="bg-background font-mono text-sm"
          onContextMenu={handleContextMenu}
        >
          {isBinaryFile(filePath) ? (
            <div className="flex items-center justify-center py-[32px] text-muted-foreground">
              <FileText className="w-5 h-5 mr-[8px] opacity-50" />
              <span>Binary file - no diff available</span>
            </div>
          ) : fileData.isLoading ? (
            <div className="flex items-center justify-center py-[32px] text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-[8px]" />
              Loading diff...
            </div>
          ) : fileData.error ? (
            <div className="text-sm text-destructive px-[12px] py-[8px]">
              {fileData.error}
            </div>
          ) : fileData.hunks.length === 0 ? (
            <div className="text-sm text-muted-foreground px-[12px] py-[24px] text-center">
              No diff hunks available
            </div>
          ) : additions + deletions > 250 &&
            !expandedLargeDiffs.has(filePath) ? (
            <div className="flex items-center justify-center gap-[12px] h-20 text-muted-foreground">
              <FileText className="w-5 h-5 opacity-50" />
              <span className="text-sm">
                Large diff ({additions + deletions} lines)
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleLargeDiff(filePath)}
              >
                View changes
              </Button>
            </div>
          ) : (
            <>
              {outdatedComments.length > 0 && (
                <div className="border-b border-amber-500/40 bg-amber-500/5 px-4 py-3 space-y-3">
                  {outdatedComments.map((comment) => (
                    <div
                      key={comment.id}
                      className="bg-background rounded-md p-3 border border-amber-500/30"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/25 text-amber-700 dark:text-amber-300 text-[10px] font-medium">
                            Outdated
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Line{" "}
                            {comment.startLine === comment.endLine
                              ? comment.startLine
                              : `${comment.startLine}-${comment.endLine}`}
                          </span>
                        </div>
                        <button
                          onClick={() => deleteComment(comment.id)}
                          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                          title="Delete"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      {comment.lineContent.length > 0 && (
                        <pre className="bg-muted/60 rounded px-2 py-1 text-xs mb-2 whitespace-pre-wrap overflow-auto font-mono">
                          {comment.lineContent.join("\n")}
                        </pre>
                      )}
                      <p className="text-sm font-sans">{comment.text}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Render all hunks */}
              {fileData.hunks.map((hunk, hunkIndex) =>
                renderHunkLines(hunk, hunkIndex, filePath)
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
});
FileRowComponent.displayName = "FileRowComponent";

export const ChangesDiffViewer = memo(
  forwardRef<ChangesDiffViewerHandle, ChangesDiffViewerProps>(
    (
      {
        workspacePath,
        repoPath,
        workspaceId,
        readOnly = false,
        onStagedFilesChange,
        onRefreshingChange,
        initialSelectedFile,
        onReviewSubmitted,
        onCreateAgentWithReview,
        conflictedFiles = [],
      },
      ref
    ) => {
      const { addToast } = useToast();
      const { fontSize: diffFontSize } = useDiffSettings();

      // Use cached changes hook for workspaces
      const cachedChanges = useCachedWorkspaceChanges(workspacePath, {
        enabled: true,
        repoPath: workspacePath,
        workspaceId: null,
      });

      const [files, setFiles] = useState<ParsedFileChange[]>([]);
      const [allFileHunks, setAllFileHunks] = useState<
        Map<string, FileHunksData>
      >(new Map());
      const [loadingAllHunks, setLoadingAllHunks] = useState(false);
      const [initialLoading, setInitialLoading] = useState(true);
      const [_refreshing, setRefreshing] = useState(false);
      const [fileActionTarget, setFileActionTarget] = useState<string | null>(
        null
      );
      const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(
        new Set()
      );
      const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
        new Set()
      );
      const [expandedLargeDiffs, setExpandedLargeDiffs] = useState<Set<string>>(
        new Set()
      );
      const [largeChangesetExpanded, setLargeChangesetExpanded] =
        useState(false);

      // Line selection state for staging
      const [diffLineSelection, setDiffLineSelection] =
        useState<DiffLineSelection | null>(null);
      const [isSelecting, setIsSelecting] = useState(false);
      const [selectionAnchor, setSelectionAnchor] = useState<{
        filePath: string;
        hunkIndex: number;
        lineIndex: number;
      } | null>(null);
      const [currentDragLine, setCurrentDragLine] = useState<{
        filePath: string;
        hunkIndex: number;
        lineIndex: number;
      } | null>(null);
      const [contextMenuPosition, setContextMenuPosition] = useState<{
        x: number;
        y: number;
      } | null>(null);
      const [commitPending, setCommitPending] = useState(false);
      const commitInputRef = useRef<CommitInputHandle>(null);
      const prevFilePathsRef = useRef<string[]>([]);
      const diffContainerRef = useRef<HTMLDivElement>(null);
      const isReloadingRef = useRef<boolean>(false);
      const isDraggingRef = useRef<boolean>(false);

      // Active file tracking (for sidebar highlighting)
      const [activeFilePath, setActiveFilePath] = useState<string | null>(null);

      // Conflict resolution state
      const [conflictEditorOpen, setConflictEditorOpen] = useState(false);
      const [conflictFileContent, setConflictFileContent] =
        useState<string>("");
      const [conflictFilePath, setConflictFilePath] = useState<string | null>(
        null
      );
      const [loadingConflictFile, setLoadingConflictFile] = useState(false);
      const [resolvingConflict, setResolvingConflict] = useState(false);

      // Review/comment state
      const [comments, setComments] = useState<LineComment[]>([]);
      const [showCommentInput, setShowCommentInput] = useState(false);
      const [reviewPopoverOpen, setReviewPopoverOpen] = useState(false);
      const [finalReviewComment, setFinalReviewComment] = useState("");
      const [showCancelDialog, setShowCancelDialog] = useState(false);
      const [copiedReview, setCopiedReview] = useState(false);
      const [hasUserAddedComments, setHasUserAddedComments] = useState(false);
      const [editingCommentId, setEditingCommentId] = useState<string | null>(
        null
      );

      // Track if user is in review mode (actively reviewing, not just viewing persisted comments)
      const isInReviewMode = useMemo(() => {
        return (
          hasUserAddedComments ||
          showCommentInput ||
          reviewPopoverOpen ||
          finalReviewComment.trim().length > 0
        );
      }, [
        hasUserAddedComments,
        showCommentInput,
        reviewPopoverOpen,
        finalReviewComment,
      ]);

      // Track stale files that changed while user is in review mode
      const [staleFiles, setStaleFiles] = useState<Set<string>>(new Set());
      const [pendingFilesData, setPendingFilesData] = useState<
        ParsedFileChange[] | null
      >(null);
      const [pendingHunksData, setPendingHunksData] = useState<Map<
        string,
        FileHunksData
      > | null>(null);
      const [sendingReview, setSendingReview] = useState(false);
      // Pending comment data (used for both single and multi-line)
      const [pendingComment, setPendingComment] = useState<{
        filePath: string;
        hunkId: string;
        displayAtLineIndex: number; // Where to show the inline input
        startLine: number; // Actual file line number (1-indexed)
        endLine: number; // Actual file line number (1-indexed)
        lineContent: string[];
      } | null>(null);

      // Viewed files state - maps file path to { viewed_at, content_hash }
      const [viewedFiles, setViewedFiles] = useState<
        Map<string, { viewedAt: string; contentHash: string }>
      >(new Map());

      // File selection state for moving to workspace
      const [selectedUnstagedFiles, setSelectedUnstagedFiles] = useState<
        Set<string>
      >(new Set());
      const [lastSelectedFileIndex, setLastSelectedFileIndex] = useState<
        number | null
      >(null);
      const [moveDialogOpen, setMoveDialogOpen] = useState(false);

      const applyChangedFiles = useCallback(
        (parsed: ParsedFileChange[], forceApply = false) => {
          // If in review mode and not forcing, store as pending and mark stale files
          if (isInReviewMode && !forceApply) {
            setFiles((prev) => {
              if (filesEqual(prev, parsed)) return prev; // No changes, no need to mark stale

              // Find which files changed
              const prevPaths = new Set(prev.map((f) => f.path));
              const newPaths = new Set(parsed.map((f) => f.path));
              const changedFiles = new Set<string>();

              // Files that were added or removed
              for (const p of newPaths) {
                if (!prevPaths.has(p)) changedFiles.add(p);
              }
              for (const p of prevPaths) {
                if (!newPaths.has(p)) changedFiles.add(p);
              }

              // Files with changed status
              for (const newFile of parsed) {
                const oldFile = prev.find((f) => f.path === newFile.path);
                if (
                  oldFile &&
                  (oldFile.stagedStatus !== newFile.stagedStatus ||
                    oldFile.workspaceStatus !== newFile.workspaceStatus)
                ) {
                  changedFiles.add(newFile.path);
                }
              }

              if (changedFiles.size > 0) {
                setStaleFiles((prevStale) => {
                  const next = new Set(prevStale);
                  changedFiles.forEach((f) => next.add(f));
                  return next;
                });
                setPendingFilesData(parsed);
              }

              return prev; // Don't update files during review mode
            });
            return;
          }

          setFiles((prev) => {
            if (filesEqual(prev, parsed)) return prev; // Skip if unchanged
            return parsed;
          });

          // Clear stale state when applying
          setStaleFiles(new Set());
          setPendingFilesData(null);
          setPendingHunksData(null);

          // Handle initial file selection
          if (
            initialSelectedFile &&
            parsed.some((file) => file.path === initialSelectedFile)
          ) {
            setSelectedUnstagedFiles(new Set([initialSelectedFile]));
          }

          if (onStagedFilesChange) {
            const staged = parsed
              .filter((file) => file.stagedStatus && file.stagedStatus !== " ")
              .map((file) => file.path);
            onStagedFilesChange(Array.from(new Set(staged)));
          }
        },
        [initialSelectedFile, onStagedFilesChange, isInReviewMode]
      );

      const invalidateCache = useCallback(async () => {
        await cachedChanges.refresh();
      }, [cachedChanges]);

      const loadChangedFiles = useCallback(async () => {
        // Caching removed - getDiffCache/setDiffCache no longer available

        setRefreshing(true);
        onRefreshingChange?.(true);
        try {
          const jjFiles = await jjGetChangedFiles(workspacePath);
          const parsed = parseJjChangedFiles(jjFiles);
          applyChangedFiles(parsed);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          addToast({ title: "JJ Error", description: message, type: "error" });
        } finally {
          setInitialLoading(false);
          setRefreshing(false);
          onRefreshingChange?.(false);
        }
      }, [workspacePath, applyChangedFiles, addToast, onRefreshingChange]);

      useEffect(() => {
        loadChangedFiles();
      }, [workspacePath]);

      // Expose focusCommitInput and refresh methods via ref
      useImperativeHandle(
        ref,
        () => ({
          focusCommitInput: () => {
            commitInputRef.current?.focus();
          },
          refresh: () => {
            loadChangedFiles();
          },
        }),
        [loadChangedFiles]
      );

      // Refresh changed files when window regains focus
      useEffect(() => {
        const unlistenFocus = getCurrentWindow().onFocusChanged(
          ({ payload: focused }) => {
            if (focused) {
              loadChangedFiles();
            }
          }
        );

        return () => {
          unlistenFocus.then((fn) => fn());
        };
      }, []);

      // Listen for workspace file changes
      useEffect(() => {
        if (!workspaceId) return;

        const unlisten = listen<{
          workspace_id: number;
          changed_paths: string[];
        }>("workspace-files-changed", (event) => {
          if (event.payload.workspace_id === workspaceId) {
            loadChangedFiles();
          }
        });

        return () => {
          unlisten.then((fn) => fn());
        };
      }, [workspaceId, loadChangedFiles]);

      // Load pending review comments on mount
      useEffect(() => {
        const loadComments = async () => {
          if (repoPath && workspaceId !== undefined) {
            try {
              const loadedComments = await loadPendingReview(
                repoPath,
                workspaceId
              );
              if (loadedComments.length > 0) {
                setComments(loadedComments);
              }
            } catch (error) {
              console.error("Failed to load pending review:", error);
            }
          }
        };
        loadComments();
      }, [repoPath, workspaceId]);

      // Clear stale viewed files when files change (file no longer in changed list = remove from viewed)
      // Also clear when content hash doesn't match (file was modified since being marked as viewed)
      useEffect(() => {
        if (files.length === 0) return;

        const currentFilePaths = new Set(files.map((f) => f.path));
        const staleFiles: string[] = [];

        setViewedFiles((prev) => {
          let hasChanges = false;
          const next = new Map(prev);

          for (const [filePath, viewData] of prev.entries()) {
            // Remove if file is no longer in changed list
            if (!currentFilePaths.has(filePath)) {
              next.delete(filePath);
              hasChanges = true;
              continue;
            }

            // Check if content hash has changed
            const fileData = allFileHunks.get(filePath);
            if (fileData && !fileData.isLoading && fileData.hunks.length > 0) {
              const currentHash = computeHunksHash(fileData.hunks);
              if (
                viewData.contentHash &&
                currentHash !== viewData.contentHash
              ) {
                // File content changed since marked as viewed - clear viewed state
                next.delete(filePath);
                staleFiles.push(filePath);
                hasChanges = true;
              }
            }
          }

          return hasChanges ? next : prev;
        });

        // Remove stale entries from database
        for (const filePath of staleFiles) {
          unmarkFileViewed(workspacePath, filePath).catch(() => {
            // Silently ignore unmark failures
          });
        }
      }, [files, allFileHunks, workspacePath]);

      // Note: We no longer auto-close comment input when file changes.
      // Instead, stale files are tracked and the user is shown a reload banner.
      // The comment input hash tracking is kept for potential future use.

      const handleMarkFileViewed = useCallback(
        async (filePath: string) => {
          // Compute hash from current hunks
          const fileData = allFileHunks.get(filePath);
          const contentHash = fileData?.hunks
            ? computeHunksHash(fileData.hunks)
            : "";

          try {
            await markFileViewed(workspacePath, filePath, contentHash);
            const now = new Date().toISOString();
            setViewedFiles((prev) =>
              new Map(prev).set(filePath, { viewedAt: now, contentHash })
            );
            // Collapse the file
            setCollapsedFiles((prev) => new Set(prev).add(filePath));
          } catch {
            // Silently ignore mark failures
          }
        },
        [workspacePath, allFileHunks]
      );

      const handleUnmarkFileViewed = useCallback(
        async (filePath: string) => {
          try {
            await unmarkFileViewed(workspacePath, filePath);
            setViewedFiles((prev) => {
              const next = new Map(prev);
              next.delete(filePath);
              return next;
            });
            // Expand the file
            setCollapsedFiles((prev) => {
              const next = new Set(prev);
              next.delete(filePath);
              return next;
            });
          } catch {
            // Silently ignore unmark failures
          }
        },
        [workspacePath]
      );

      const loadAllFileHunks = useCallback(
        async (filesToLoad: ParsedFileChange[], forceApply = false) => {
          if (filesToLoad.length === 0) {
            if (!isInReviewMode || forceApply) {
              setAllFileHunks((prev) => (prev.size === 0 ? prev : new Map()));
            }
            setLoadingAllHunks(false);
            return;
          }
          setLoadingAllHunks(true);

          const cachedHunks = new Map<string, JjDiffHunk[]>();
          const hunksMap = new Map<string, FileHunksData>();

          // Load cached data first
          await Promise.all(
            filesToLoad.map(async (file) => {
              try {
                const cache = await getDiffCache(
                  workspacePath,
                  "file_hunks",
                  file.path
                );
                if (cache?.data) {
                  const hunks = parseCachedHunks(cache.data);
                  if (hunks) {
                    cachedHunks.set(file.path, hunks);
                    hunksMap.set(file.path, {
                      filePath: file.path,
                      hunks,
                      isLoading: false,
                    });
                  }
                }
              } catch {
                // Silently ignore cache read failures
              }
            })
          );

          // Set loading state only for uncached files
          filesToLoad.forEach((file) => {
            if (!hunksMap.has(file.path)) {
              hunksMap.set(file.path, {
                filePath: file.path,
                hunks: [],
                isLoading: true,
              });
            }
          });

          // Update with cached data (only if needed and not in review mode)
          if (cachedHunks.size > 0 && (!isInReviewMode || forceApply)) {
            setAllFileHunks((prev) => {
              let needsUpdate = prev.size !== hunksMap.size;
              if (!needsUpdate) {
                for (const [path, data] of hunksMap) {
                  const existing = prev.get(path);
                  if (
                    !existing ||
                    existing.isLoading !== data.isLoading ||
                    !hunksEqual(existing.hunks, data.hunks)
                  ) {
                    needsUpdate = true;
                    break;
                  }
                }
              }
              return needsUpdate ? new Map(hunksMap) : prev;
            });
          }

          // Fetch fresh data
          try {
            const results = await Promise.all(
              filesToLoad.map(async (file) => {
                try {
                  const hunks = await jjGetFileHunks(workspacePath, file.path);
                  return {
                    filePath: file.path,
                    hunks,
                    error: null as string | null,
                  };
                } catch (error) {
                  const message =
                    error instanceof Error ? error.message : String(error);
                  return {
                    filePath: file.path,
                    hunks: [] as JjDiffHunk[],
                    error: message,
                  };
                }
              })
            );

            // If in review mode and not forcing and not reloading, check for changes and store as pending
            if (isInReviewMode && !forceApply && !isReloadingRef.current) {
              const newHunksMap = new Map<string, FileHunksData>();
              const changedFiles = new Set<string>();

              for (const result of results) {
                const existing = allFileHunks.get(result.filePath);
                const newData: FileHunksData = result.error
                  ? {
                      filePath: result.filePath,
                      hunks: [],
                      isLoading: false,
                      error: result.error,
                    }
                  : {
                      filePath: result.filePath,
                      hunks: result.hunks,
                      isLoading: false,
                    };

                newHunksMap.set(result.filePath, newData);

                // Check if hunks changed
                if (!existing || !hunksEqual(existing.hunks, result.hunks)) {
                  changedFiles.add(result.filePath);
                }
              }

              if (changedFiles.size > 0) {
                setStaleFiles((prev) => {
                  const next = new Set(prev);
                  changedFiles.forEach((f) => next.add(f));
                  return next;
                });
                setPendingHunksData(newHunksMap);
              }

              setLoadingAllHunks(false);
              return;
            }

            // Incremental update - only change what's different
            setAllFileHunks((prev) => {
              let hasChanges = false;
              const next = new Map(prev);

              for (const result of results) {
                const existing = prev.get(result.filePath);

                if (result.error) {
                  if (!existing || existing.error !== result.error) {
                    hasChanges = true;
                    next.set(result.filePath, {
                      filePath: result.filePath,
                      hunks: [],
                      isLoading: false,
                      error: result.error,
                    });
                  }
                  continue;
                }

                if (
                  !existing ||
                  existing.isLoading ||
                  !hunksEqual(existing.hunks, result.hunks)
                ) {
                  hasChanges = true;
                  next.set(result.filePath, {
                    filePath: result.filePath,
                    hunks: result.hunks,
                    isLoading: false,
                  });
                }
              }

              return hasChanges ? next : prev;
            });
          } finally {
            setLoadingAllHunks(false);
          }
        },
        [workspacePath, isInReviewMode, allFileHunks]
      );

      useEffect(() => {
        const currentPaths = files.map((f) => f.path);
        const pathsChanged =
          currentPaths.length !== prevFilePathsRef.current.length ||
          currentPaths.some((p, i) => p !== prevFilePathsRef.current[i]);

        // Only load hunks for JJ workspaces;
        if (files.length > 0 && pathsChanged) {
          prevFilePathsRef.current = currentPaths;
          loadAllFileHunks(files);
          // Reset large changeset expanded state when files change
          setLargeChangesetExpanded(false);
        } else if (files.length === 0 && prevFilePathsRef.current.length > 0) {
          prevFilePathsRef.current = [];
          setAllFileHunks(new Map());
          setLargeChangesetExpanded(false);
        }
      }, [files, loadAllFileHunks]);

      const refresh = useCallback(() => {
        cachedChanges.refresh();
      }, [cachedChanges]);

      // Reload with pending data, preserving comments and moving orphaned ones to general comment
      const handleReloadWithPendingChanges = useCallback(() => {
        // Set flag to bypass review mode check during reload
        isReloadingRef.current = true;

        // If we have pending data, apply it now
        if (pendingFilesData) {
          // Find orphaned comments (comments on files/hunks that no longer exist or changed)
          const orphanedComments: LineComment[] = [];
          const validComments: LineComment[] = [];

          for (const comment of comments) {
            const newFileData = pendingHunksData?.get(comment.filePath);
            const fileStillExists = pendingFilesData.some(
              (f) => f.path === comment.filePath
            );

            if (!fileStillExists || !newFileData) {
              // File was removed or has no hunks data - comment is orphaned
              orphanedComments.push(comment);
              continue;
            }

            // Check if the hunk still exists
            const hunkStillExists = newFileData.hunks.some(
              (h) => h.id === comment.hunkId
            );
            if (!hunkStillExists) {
              // Hunk was removed - comment is orphaned
              orphanedComments.push(comment);
              continue;
            }

            // Comment is still valid
            validComments.push(comment);
          }

          // If there are orphaned comments, add them to the final review comment
          if (orphanedComments.length > 0) {
            const orphanedText = orphanedComments
              .map((c) => {
                const lineRef =
                  c.startLine === c.endLine
                    ? `${c.filePath}:${c.startLine}`
                    : `${c.filePath}:${c.startLine}-${c.endLine}`;
                const codeBlock =
                  c.lineContent.length > 0
                    ? `\n\`\`\`\n${c.lineContent.join("\n")}\n\`\`\`\n`
                    : "";
                return `**${lineRef}** (outdated)${codeBlock}${c.text}`;
              })
              .join("\n\n");

            setFinalReviewComment((prev) => {
              if (prev.trim()) {
                return `${prev}\n\n---\n**Outdated comments:**\n\n${orphanedText}`;
              }
              return `**Outdated comments:**\n\n${orphanedText}`;
            });

            addToast({
              title: "Comments moved",
              description: `${orphanedComments.length} comment${
                orphanedComments.length > 1 ? "s" : ""
              } moved to summary (lines changed)`,
              type: "info",
            });
          }

          // Update comments to only valid ones
          setComments(validComments);

          // Apply the pending files data
          applyChangedFiles(pendingFilesData, true);
        }

        // Apply pending hunks data
        if (pendingHunksData) {
          setAllFileHunks(pendingHunksData);
          setPendingHunksData(null);
        }

        // Clear stale state
        setStaleFiles(new Set());
        setPendingFilesData(null);

        // Reset reload flag after a small delay to allow useEffect to complete
        setTimeout(() => {
          isReloadingRef.current = false;
        }, 100);
      }, [
        pendingFilesData,
        pendingHunksData,
        comments,
        applyChangedFiles,
        addToast,
      ]);

      const handleDiscardAll = useCallback(async () => {
        if (readOnly) return;
        try {
          await jjRestoreAll(workspacePath);
          addToast({
            title: "Discarded",
            description: "All changes discarded",
            type: "success",
          });
          await invalidateCache();
          refresh();
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          addToast({
            title: "Discard All Failed",
            description: message,
            type: "error",
          });
        }
      }, [workspacePath, readOnly, refresh, addToast, invalidateCache]);

      const handleDiscardFiles = useCallback(
        async (filePath: string) => {
          if (readOnly || !filePath) {
            return;
          }

          // If there are selected files and the clicked file is one of them, discard all selected files
          // Otherwise, discard just the clicked file
          const filesToDiscard =
            selectedUnstagedFiles.has(filePath) &&
            selectedUnstagedFiles.size > 0
              ? Array.from(selectedUnstagedFiles)
              : [filePath];

          setFileActionTarget(filePath);
          try {
            // Call jjRestoreFile for each file
            await Promise.all(
              filesToDiscard.map((file) => jjRestoreFile(workspacePath, file))
            );
            const count = filesToDiscard.length;
            const description =
              count === 1
                ? `${filesToDiscard[0]} discarded`
                : `${count} files discarded`;
            addToast({ title: "Discarded", description, type: "success" });

            // Clear selection after discarding
            setSelectedUnstagedFiles(new Set());

            await invalidateCache();
            refresh();
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            addToast({
              title: "Discard Failed",
              description: message,
              type: "error",
            });
          } finally {
            setFileActionTarget(null);
          }
        },
        [readOnly, selectedUnstagedFiles, refresh, addToast, invalidateCache]
      );

      // Scroll to file in the diff container
      const scrollToFileIfNeeded = useCallback(
        (fileIndex: number) => {
          const file = files[fileIndex];
          if (!file) return;

          const filePath = file.path;

          // Expand large changeset if it's collapsed
          setLargeChangesetExpanded(true);

          // Expand the file first
          setCollapsedFiles((prev) => {
            const next = new Set(prev);
            next.delete(filePath);
            return next;
          });

          // Also expand large diff for this file
          setExpandedLargeDiffs((prev) => {
            const next = new Set(prev);
            next.add(filePath);
            return next;
          });

          // Use setTimeout to wait for React to re-render after expanding
          setTimeout(() => {
            const container = diffContainerRef.current;
            if (!container) return;

            const fileId = `file-section-${filePath.replace(
              /[^a-zA-Z0-9]/g,
              "-"
            )}`;
            const fileElement = document.getElementById(fileId);
            if (fileElement) {
              fileElement.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
            }
          }, 50);
        },
        [files]
      );

      // File selection handler - VSCode-style click selection
      const handleFileSelect = useCallback(
        (path: string, event: React.MouseEvent) => {
          const fileIndex = files.findIndex((f) => f.path === path);
          if (fileIndex === -1) return;

          const isMetaKey = event.metaKey || event.ctrlKey;
          const isShiftKey = event.shiftKey;

          setSelectedUnstagedFiles((prev) => {
            const next = new Set(prev);

            if (isShiftKey && lastSelectedFileIndex !== null) {
              // Range selection - clear others and select range
              next.clear();
              const start = Math.min(lastSelectedFileIndex, fileIndex);
              const end = Math.max(lastSelectedFileIndex, fileIndex);
              for (let i = start; i <= end; i++) {
                next.add(files[i].path);
              }
            } else if (isMetaKey) {
              // Cmd/Ctrl+click - toggle individual file
              if (next.has(path)) {
                next.delete(path);
              } else {
                next.add(path);
              }
            } else {
              // Single click - select only this file (unless already sole selection)
              if (next.size === 1 && next.has(path)) {
                // Already sole selection - keep it
                return prev;
              }
              next.clear();
              next.add(path);
            }
            return next;
          });

          setLastSelectedFileIndex(fileIndex);

          // Smart scroll to file
          scrollToFileIfNeeded(fileIndex);
        },
        [lastSelectedFileIndex, files, scrollToFileIfNeeded]
      );

      // Handler for when files are successfully moved to workspace
      const handleMoveToWorkspaceSuccess = useCallback(
        (_workspaceInfo: {
          id: number;
          workspacePath: string;
          branchName: string;
          metadata: string;
        }) => {
          setMoveDialogOpen(false);
          setSelectedUnstagedFiles(new Set());
          setLastSelectedFileIndex(null);
          refresh();
          // Note: Navigation to the new workspace session is handled by the parent component
          // when StagingDiffViewer is used within Dashboard. Here we just refresh.
        },
        [refresh]
      );

      const toggleFileCollapse = useCallback((filePath: string) => {
        setCollapsedFiles((prev) => {
          const next = new Set(prev);
          if (next.has(filePath)) {
            next.delete(filePath);
          } else {
            next.add(filePath);
          }
          return next;
        });
      }, []);

      const toggleLargeDiff = useCallback((filePath: string) => {
        setExpandedLargeDiffs((prev) => {
          const next = new Set(prev);
          if (next.has(filePath)) {
            next.delete(filePath);
          } else {
            next.add(filePath);
          }
          return next;
        });
      }, []);

      // Line selection handlers for staging and comments
      const handleLineMouseDown = useCallback(
        (
          e: React.MouseEvent,
          filePath: string,
          hunkIndex: number,
          lineIndex: number,
          lineContent: string,
          isStaged: boolean
        ) => {
          if (e.button !== 0) {
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          isDraggingRef.current = false; // Reset drag flag on new selection
          setIsSelecting(true);
          setSelectionAnchor({ filePath, hunkIndex, lineIndex });
          setDiffLineSelection({
            filePath,
            lines: [{ hunkIndex, lineIndex, content: lineContent, isStaged }],
          });
          setCurrentDragLine({ filePath, hunkIndex, lineIndex });
          setContextMenuPosition(null);
        },
        []
      );

      const handleLineMouseEnter = useCallback(
        (filePath: string, hunkIndex: number, lineIndex: number) => {
          if (
            !isSelecting ||
            !selectionAnchor ||
            selectionAnchor.filePath !== filePath
          ) {
            return;
          }

          const fileData = allFileHunks.get(filePath);
          if (!fileData) return;

          const newLines: DiffLineSelection["lines"] = [];
          const minHunk = Math.min(selectionAnchor.hunkIndex, hunkIndex);
          const maxHunk = Math.max(selectionAnchor.hunkIndex, hunkIndex);

          for (let h = minHunk; h <= maxHunk; h++) {
            const hunk = fileData.hunks[h];
            if (!hunk) continue;

            const startLine =
              h === minHunk
                ? selectionAnchor.hunkIndex === minHunk
                  ? selectionAnchor.lineIndex
                  : 0
                : 0;
            const endLine =
              h === maxHunk
                ? hunkIndex === maxHunk
                  ? lineIndex
                  : hunk.lines.length - 1
                : hunk.lines.length - 1;

            const actualStart = Math.min(startLine, endLine);
            const actualEnd = Math.max(startLine, endLine);

            for (let l = actualStart; l <= actualEnd; l++) {
              const line = hunk.lines[l];
              if (line) {
                newLines.push({
                  hunkIndex: h,
                  lineIndex: l,
                  content: line,
                  isStaged: false, // JJ has no staging
                });
              }
            }
          }

          // Mark as dragging if we've moved to a different line
          if (
            selectionAnchor.hunkIndex !== hunkIndex ||
            selectionAnchor.lineIndex !== lineIndex
          ) {
            isDraggingRef.current = true;
          }

          setDiffLineSelection({ filePath, lines: newLines });
          setCurrentDragLine({ filePath, hunkIndex, lineIndex });
        },
        [isSelecting, selectionAnchor, allFileHunks]
      );

      const handleLineMouseUp = useCallback(() => {
        setIsSelecting(false);
        // Don't clear currentDragLine - keep it to remember where selection ended
      }, []);

      const handleBackgroundClick = useCallback((e: React.MouseEvent) => {
        // Don't clear selection if clicking on interactive elements
        const target = e.target as HTMLElement;

        // Check if clicked on a file row in sidebar (has group/row class)
        if (target.closest(".group\\/row")) {
          return;
        }

        // Check if clicked on a button or interactive element
        if (
          target.closest(
            "button, [role='button'], input, textarea, [role='checkbox'], [role='menuitem']"
          )
        ) {
          return;
        }

        // Clear file selection
        setSelectedUnstagedFiles(new Set());
      }, []);

      const handleContextMenu = useCallback(
        (e: React.MouseEvent) => {
          if (diffLineSelection && diffLineSelection.lines.length > 0) {
            e.preventDefault();
            setContextMenuPosition({ x: e.clientX, y: e.clientY });
          }
        },
        [diffLineSelection]
      );

      const isLineSelected = useCallback(
        (filePath: string, hunkIndex: number, lineIndex: number) => {
          if (!diffLineSelection || diffLineSelection.filePath !== filePath) {
            return false;
          }
          return diffLineSelection.lines.some(
            (l) => l.hunkIndex === hunkIndex && l.lineIndex === lineIndex
          );
        },
        [diffLineSelection]
      );

      useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
          if (e.key === "Escape") {
            setContextMenuPosition(null);
            setDiffLineSelection(null);
            setCurrentDragLine(null);
          }
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
      }, []);

      useEffect(() => {
        const handleClickOutside = () => {
          setContextMenuPosition(null);
        };
        if (contextMenuPosition) {
          document.addEventListener("click", handleClickOutside);
          return () =>
            document.removeEventListener("click", handleClickOutside);
        }
      }, [contextMenuPosition]);

      useEffect(() => {
        const handleGlobalMouseUp = () => {
          if (isSelecting) {
            setIsSelecting(false);
          }
        };
        document.addEventListener("mouseup", handleGlobalMouseUp);
        return () =>
          document.removeEventListener("mouseup", handleGlobalMouseUp);
      }, [isSelecting]);

      // Comment management
      const addComment = useCallback(
        (text: string) => {
          if (!text.trim() || !pendingComment) return;

          const newComment: LineComment = {
            id: uuidv4(),
            filePath: pendingComment.filePath,
            hunkId: pendingComment.hunkId,
            startLine: pendingComment.startLine,
            endLine: pendingComment.endLine,
            lineContent: pendingComment.lineContent,
            text: text.trim(),
            createdAt: new Date().toISOString(),
          };

          setComments((prev) => [...prev, newComment]);
          setHasUserAddedComments(true);
          setShowCommentInput(false);
          setPendingComment(null);
          setDiffLineSelection(null);
          setContextMenuPosition(null);
        },
        [pendingComment]
      );

      // Handle adding comment from multi-line diff selection (context menu)
      const handleAddCommentFromSelection = useCallback(() => {
        if (!diffLineSelection || diffLineSelection.lines.length === 0) return;

        const filePath = diffLineSelection.filePath;
        const fileData = allFileHunks.get(filePath);
        if (!fileData) return;

        // Collect all selected line contents and find position info
        const lineContents: string[] = [];
        let minLineNum = Infinity;
        let maxLineNum = -Infinity;
        let lastHunkId = "";
        let lastLineIndex = 0;

        for (const line of diffLineSelection.lines) {
          const hunk = fileData.hunks[line.hunkIndex];
          if (!hunk) continue;

          const lineNumbers = computeHunkLineNumbers(hunk);
          const lineNum =
            lineNumbers[line.lineIndex]?.new ??
            lineNumbers[line.lineIndex]?.old ??
            line.lineIndex + 1;

          minLineNum = Math.min(minLineNum, lineNum);
          maxLineNum = Math.max(maxLineNum, lineNum);
          lineContents.push(line.content);
          lastHunkId = hunk.id;
          lastLineIndex = line.lineIndex;
        }

        // Set pending comment data with position for inline display
        setPendingComment({
          filePath,
          hunkId: lastHunkId,
          displayAtLineIndex: lastLineIndex,
          startLine: minLineNum,
          endLine: maxLineNum,
          lineContent: lineContents,
        });
        setShowCommentInput(true);
        setContextMenuPosition(null);
      }, [diffLineSelection, allFileHunks]);

      const cancelComment = useCallback(() => {
        setShowCommentInput(false);
        setPendingComment(null);
      }, []);

      const deleteComment = useCallback((commentId: string) => {
        setComments((prev) => prev.filter((c) => c.id !== commentId));
      }, []);

      const startEditComment = useCallback((commentId: string) => {
        setEditingCommentId(commentId);
      }, []);

      const cancelEditComment = useCallback(() => {
        setEditingCommentId(null);
      }, []);

      const saveEditComment = useCallback(
        (commentId: string, newText: string) => {
          if (!newText.trim()) return;

          setComments((prev) =>
            prev.map((comment) =>
              comment.id === commentId
                ? { ...comment, text: newText.trim() }
                : comment
            )
          );
          setEditingCommentId(null);
        },
        []
      );

      // Copy line location to clipboard
      const handleCopyLineLocation = useCallback(async () => {
        try {
          if (!diffLineSelection || diffLineSelection.lines.length === 0)
            return;

          const filePath = diffLineSelection.filePath;
          const fileData = allFileHunks.get(filePath);
          if (!fileData) return;

          // Compute actual line numbers for selected lines
          let minLineNum = Infinity;
          let maxLineNum = -Infinity;

          for (const line of diffLineSelection.lines) {
            const hunk = fileData.hunks[line.hunkIndex];
            if (!hunk) continue;
            const lineNumbers = computeHunkLineNumbers(hunk);
            const lineNum =
              lineNumbers[line.lineIndex]?.new ??
              lineNumbers[line.lineIndex]?.old ??
              line.lineIndex + 1;
            minLineNum = Math.min(minLineNum, lineNum);
            maxLineNum = Math.max(maxLineNum, lineNum);
          }

          const locationStr =
            minLineNum === maxLineNum
              ? `${filePath}:${minLineNum}`
              : `${filePath}:${minLineNum}-${maxLineNum}`;

          await navigator.clipboard.writeText(locationStr);
          setContextMenuPosition(null);
          addToast({
            title: "Copied",
            description: "Line location copied to clipboard",
            type: "success",
          });
        } catch (error) {
          setContextMenuPosition(null);
          const message =
            error instanceof Error ? error.message : String(error);
          addToast({
            title: "Failed to copy",
            description: message,
            type: "error",
          });
        }
      }, [diffLineSelection, allFileHunks, addToast]);

      // Copy line contents to clipboard
      const handleCopyLines = useCallback(async () => {
        try {
          const lineContents =
            diffLineSelection?.lines?.map((l) => l.content).join("\n") || "";
          if (!lineContents) {
            setContextMenuPosition(null);
            return;
          }

          await navigator.clipboard.writeText(lineContents);
          setContextMenuPosition(null);
          addToast({
            title: "Copied",
            description: "Lines copied to clipboard",
            type: "success",
          });
        } catch (error) {
          setContextMenuPosition(null);
          const message =
            error instanceof Error ? error.message : String(error);
          addToast({
            title: "Failed to copy",
            description: message,
            type: "error",
          });
        }
      }, [diffLineSelection, addToast]);

      // Format review as markdown
      const formatReviewMarkdown = useCallback(() => {
        let markdown = "## Code Review\n\n";

        if (finalReviewComment.trim()) {
          markdown += "### Summary\n";
          markdown += finalReviewComment.trim() + "\n\n";
        }

        if (comments.length > 0) {
          markdown += "### Comments\n\n";

          // Group comments by file
          const commentsByFile = comments.reduce((acc, comment) => {
            if (!acc[comment.filePath]) {
              acc[comment.filePath] = [];
            }
            acc[comment.filePath].push(comment);
            return acc;
          }, {} as Record<string, LineComment[]>);

          for (const [filePath, fileComments] of Object.entries(
            commentsByFile
          )) {
            for (const comment of fileComments) {
              // Line numbers are already 1-indexed actual file line numbers
              const lineRef =
                comment.startLine === comment.endLine
                  ? `${filePath}:${comment.startLine}`
                  : `${filePath}:${comment.startLine}:${comment.endLine}`;
              markdown += `${lineRef}\n`;
              markdown += "```\n";
              markdown += comment.lineContent.join("\n") + "\n";
              markdown += "```\n";
              markdown += `> ${comment.text}\n\n`;
            }
          }
        }

        return markdown;
      }, [comments, finalReviewComment]);

      // Send review to terminal
      const handleRequestChanges = useCallback(
        async (mode: "plan" | "acceptEdits") => {
          setSendingReview(true);
          try {
            const markdown = formatReviewMarkdown();

            if (onCreateAgentWithReview) {
              // Create new agent session with review pre-filled
              await onCreateAgentWithReview(markdown, mode);
              addToast({
                title: "Review sent",
                description: "Code review sent to new agent session",
                type: "success",
              });
            } else {
              addToast({
                title: "No handler provided",
                description: "onCreateAgentWithReview callback not available",
                type: "error",
              });
              return;
            }

            // Clear review state
            setComments([]);
            setHasUserAddedComments(false);
            setFinalReviewComment("");
            setReviewPopoverOpen(false);
            // Notify parent that review was submitted
            onReviewSubmitted?.();
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            addToast({
              title: "Failed to send review",
              description: message,
              type: "error",
            });
          } finally {
            setSendingReview(false);
          }
        },
        [
          onCreateAgentWithReview,
          formatReviewMarkdown,
          addToast,
          onReviewSubmitted,
        ]
      );

      // Cancel review handler
      const handleCancelReview = useCallback(async () => {
        try {
          // Clear review state
          setComments([]);
          setHasUserAddedComments(false);
          setFinalReviewComment("");
          setShowCancelDialog(false);
          setReviewPopoverOpen(false);

          // Clear persisted review from database if available
          if (repoPath && workspaceId !== undefined) {
            await clearPendingReview(repoPath, workspaceId);
          }

          addToast({
            title: "Review canceled",
            description: "All comments have been discarded",
            type: "success",
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          addToast({
            title: "Failed to cancel review",
            description: message,
            type: "error",
          });
        }
      }, [repoPath, workspaceId, addToast]);

      // Copy review to clipboard
      const handleCopyReview = useCallback(async () => {
        try {
          const markdown = formatReviewMarkdown();
          await navigator.clipboard.writeText(markdown);
          setCopiedReview(true);
          setTimeout(() => setCopiedReview(false), 2000);
          addToast({
            title: "Copied to clipboard",
            description: "Review comments copied",
            type: "success",
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          addToast({
            title: "Failed to copy",
            description: message,
            type: "error",
          });
        }
      }, [formatReviewMarkdown, addToast]);

      const handleCommit = useCallback(
        async (commitMsg: string) => {
          if (!commitMsg) {
            addToast({
              title: "Commit message",
              description: "Enter a commit message.",
              type: "error",
            });
            return;
          }

          if (commitMsg.length > 500) {
            addToast({
              title: "Commit message",
              description: "Please keep the message under 500 characters.",
              type: "error",
            });
            return;
          }

          setCommitPending(true);
          try {
            const selectedPaths = Array.from(selectedUnstagedFiles);
            const isPartialCommit =
              selectedPaths.length > 0 && selectedPaths.length < files.length;

            let result: string;
            if (isPartialCommit) {
              result = await jjSplit(workspacePath, commitMsg, selectedPaths);
              setSelectedUnstagedFiles(new Set()); // Clear selection after split
            } else {
              result = await jjCommit(workspacePath, commitMsg);
            }

            await invalidateCache();
            addToast({
              title: "Commit created",
              description: result.trim() || "Commit successful",
              type: "success",
            });
            loadChangedFiles();
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            addToast({
              title: "Commit failed",
              description: message,
              type: "error",
            });
          } finally {
            setCommitPending(false);
          }
        },
        [
          workspacePath,
          addToast,
          invalidateCache,
          selectedUnstagedFiles,
          files.length,
        ]
      );

      const toggleSectionCollapse = useCallback((sectionId: string) => {
        setCollapsedSections((prev) => {
          const next = new Set(prev);
          if (next.has(sectionId)) {
            next.delete(sectionId);
          } else {
            next.add(sectionId);
          }
          return next;
        });
      }, []);

      // Handle clicking on a conflicting file
      const handleConflictFileSelect = useCallback(
        async (filePath: string) => {
          setActiveFilePath(filePath);

          // Check if this file is in the conflicted files list
          if (conflictedFiles.includes(filePath)) {
            setLoadingConflictFile(true);
            setConflictFilePath(filePath);
            setConflictEditorOpen(true);

            try {
              // Load the file content
              const fullPath = `${workspacePath}/${filePath}`;
              const content = await readFile(fullPath);
              setConflictFileContent(content);
            } catch (error) {
              const message =
                error instanceof Error ? error.message : String(error);
              addToast({
                title: "Failed to load conflict file",
                description: message,
                type: "error",
              });
              setConflictEditorOpen(false);
            } finally {
              setLoadingConflictFile(false);
            }
          }
        },
        [workspacePath, conflictedFiles, addToast]
      );

      // Handle resolving a conflict
      const handleResolveConflict = useCallback(async () => {
        if (!conflictFilePath) return;

        setResolvingConflict(true);
        try {
          // For now, just close the editor
          // TODO: Implement actual file writing once the API is available
          addToast({
            title: "Conflict resolved",
            description: `${conflictFilePath} has been resolved`,
            type: "success",
          });
          setConflictEditorOpen(false);
          setConflictFileContent("");
          setConflictFilePath(null);
          // Refresh the changes
          await loadChangedFiles();
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          addToast({
            title: "Failed to resolve conflict",
            description: message,
            type: "error",
          });
        } finally {
          setResolvingConflict(false);
        }
      }, [conflictFilePath, addToast, loadChangedFiles]);

      const handleCloseConflictEditor = useCallback(() => {
        setConflictEditorOpen(false);
        setConflictFileContent("");
        setConflictFilePath(null);
        setActiveFilePath(null);
      }, []);

      // Check if a comment is outdated (its referenced line no longer exists)
      const isCommentOutdated = useCallback(
        (comment: LineComment): boolean => {
          const fileData = allFileHunks.get(comment.filePath);
          if (!fileData || fileData.isLoading || !fileData.hunks) return false;

          // Check if hunk still exists
          const hunk = fileData.hunks.find((h) => h.id === comment.hunkId);
          if (!hunk) return true; // Hunk no longer exists = outdated

          // Check if line numbers are still in range
          const lineNumbers = computeHunkLineNumbers(hunk);
          const hasMatchingLine = lineNumbers.some((ln) => {
            const actualNum = ln.new ?? ln.old;
            return (
              actualNum &&
              actualNum >= comment.startLine &&
              actualNum <= comment.endLine
            );
          });

          return !hasMatchingLine;
        },
        [allFileHunks]
      );

      // Get outdated comments for a specific file
      const getOutdatedCommentsForFile = useCallback(
        (filePath: string): LineComment[] => {
          return comments.filter(
            (c) => c.filePath === filePath && isCommentOutdated(c)
          );
        },
        [comments, isCommentOutdated]
      );

      // Get comments for a specific line in a specific hunk
      const getCommentsForLine = useCallback(
        (filePath: string, hunkId: string, actualLineNum: number) => {
          return comments.filter(
            (c) =>
              c.filePath === filePath &&
              c.hunkId === hunkId &&
              actualLineNum >= c.startLine &&
              actualLineNum <= c.endLine &&
              !isCommentOutdated(c) // Exclude outdated comments
          );
        },
        [comments, isCommentOutdated]
      );

      // Render diff lines for a hunk (no collapsible, just lines with selection support)
      const renderHunkLines = (
        hunk: JjDiffHunk,
        hunkIndex: number,
        filePath: string
      ) => {
        const lineNumbers = computeHunkLineNumbers(hunk);
        const language = getLanguageFromPath(filePath);

        return (
          <Fragment key={hunk.id}>
            {/* Hunk separator header */}
            <div
              className={cn(
                "flex items-stretch font-mono text-sm",
                "bg-muted/60" // JJ has no staging
              )}
            >
              {/* Line number column */}
              <div className="w-16 flex-shrink-0 border-r border-border/40" />

              {/* Comment button spacer */}
              <div className="w-6 flex-shrink-0" />

              {/* Line prefix spacer */}
              <div className="w-5 flex-shrink-0" />

              {/* Header text */}
              <div className="flex-1 flex items-center px-[8px] py-[2px]">
                <span className="text-muted-foreground truncate">
                  {hunk.header}
                </span>
              </div>
            </div>
            {/* Hunk lines */}
            {hunk.lines.map((line, lineIndex) => {
              const lineNum = lineNumbers[lineIndex];
              const actualLineNum =
                lineNum?.new ?? lineNum?.old ?? lineIndex + 1;
              const lineComments = getCommentsForLine(
                filePath,
                hunk.id,
                actualLineNum
              );
              const showCommentInputHere =
                showCommentInput &&
                pendingComment &&
                pendingComment.filePath === filePath &&
                pendingComment.hunkId === hunk.id &&
                lineIndex === pendingComment.displayAtLineIndex;
              const selected = isLineSelected(filePath, hunkIndex, lineIndex);

              return (
                <Fragment key={`${hunk.id}-line-${lineIndex}`}>
                  <div
                    data-diff-line
                    className={cn(
                      "group flex items-stretch",
                      getLineTypeClass(line),
                      selected &&
                        "!bg-blue-500/30 ring-1 ring-inset ring-blue-500/50"
                    )}
                    onMouseEnter={() =>
                      handleLineMouseEnter(filePath, hunkIndex, lineIndex)
                    }
                    onMouseUp={handleLineMouseUp}
                    onClick={(e) => {
                      e.preventDefault();
                    }}
                  >
                    {/* Line number / comment indicator - click here to select lines */}
                    <div
                      className="w-16 flex-shrink-0 text-muted-foreground select-none border-r border-border/40 flex items-center gap-[4px] cursor-pointer hover:bg-muted/50"
                      onMouseDown={(e) =>
                        handleLineMouseDown(
                          e,
                          filePath,
                          hunkIndex,
                          lineIndex,
                          line,
                          false // JJ has no staging
                        )
                      }
                    >
                      {lineComments.length > 0 && (
                        <MessageSquare className="w-3 h-3 text-primary ml-[4px]" />
                      )}
                      <span className="w-6 text-right text-sm mr-1">
                        {lineNum?.old ?? ""}
                      </span>
                      <span className="w-6 text-right text-sm">
                        {lineNum?.new ?? ""}
                      </span>
                    </div>
                    {/* Add comment button - shows on hover or when line is selected */}
                    <div className="w-6 flex-shrink-0 flex items-center justify-center select-none">
                      <button
                        data-comment-button
                        className={cn(
                          "p-[2px] rounded bg-primary text-primary-foreground hover:bg-primary/90",
                          "invisible group-hover:visible"
                        )}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          // If there are selected lines, use those; otherwise use single line
                          if (
                            diffLineSelection &&
                            diffLineSelection.lines.length > 0
                          ) {
                            handleAddCommentFromSelection();
                          } else {
                            setPendingComment({
                              filePath,
                              hunkId: hunk.id,
                              displayAtLineIndex: lineIndex,
                              startLine: actualLineNum,
                              endLine: actualLineNum,
                              lineContent: [line],
                            });
                            setShowCommentInput(true);
                          }
                        }}
                        title={
                          diffLineSelection &&
                          diffLineSelection.lines.length > 1
                            ? "Add comment to selected lines"
                            : "Add comment"
                        }
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    {/* Line prefix (+/-/space) */}
                    <div className="w-5 flex-shrink-0 text-center select-none">
                      {getLinePrefix(line)}
                    </div>
                    {/* Line content - selectable for copying */}
                    <div className="flex-1 px-[8px] py-[2px] whitespace-pre-wrap break-all">
                      <HighlightedLine
                        content={line.substring(1) || " "}
                        language={language}
                      />
                    </div>
                  </div>

                  {/* Inline comments display */}
                  {lineComments.length > 0 &&
                    actualLineNum === lineComments[0].endLine && (
                      <div className="bg-muted/60 border-y border-border/40 px-[16px] py-[8px] space-y-2">
                        {lineComments.map((comment) => {
                          const isEditing = editingCommentId === comment.id;

                          return (
                            <div key={comment.id}>
                              {isEditing ? (
                                <div className="bg-background rounded-md p-[12px] border border-border/60">
                                  <CommentEditInput
                                    initialText={comment.text}
                                    onSave={(newText) =>
                                      saveEditComment(comment.id, newText)
                                    }
                                    onCancel={cancelEditComment}
                                    onDiscard={() => deleteComment(comment.id)}
                                  />
                                </div>
                              ) : (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div
                                        className="group bg-background rounded-md p-[12px] border border-border/60 cursor-pointer hover:shadow-md transition-shadow"
                                        onClick={() =>
                                          startEditComment(comment.id)
                                        }
                                      >
                                        <div className="flex items-start gap-2">
                                          <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
                                          <p className="text-sm whitespace-pre-wrap flex-1">
                                            {comment.text}
                                          </p>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  deleteComment(comment.id);
                                                }}
                                                className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground flex-shrink-0"
                                              >
                                                <X className="w-3 h-3" />
                                              </button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                              Delete comment
                                            </TooltipContent>
                                          </Tooltip>
                                        </div>
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      Click to edit
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                  {/* Comment input */}
                  {showCommentInputHere && pendingComment && (
                    <CommentInput
                      key={`comment-${pendingComment.filePath}-${pendingComment.hunkId}-${pendingComment.displayAtLineIndex}`}
                      onSubmit={addComment}
                      onCancel={cancelComment}
                      filePath={pendingComment.filePath}
                      startLine={pendingComment.startLine}
                      endLine={pendingComment.endLine}
                    />
                  )}
                </Fragment>
              );
            })}
          </Fragment>
        );
      };

      // Note: FileRowComponent extracted outside for performance

      return (
        <div
          className="flex h-full overflow-hidden"
          onClick={handleBackgroundClick}
        >
          <div className="w-60 border-r border-border bg-sidebar flex flex-col">
            {!conflictEditorOpen && (
              <CommitInput
                ref={commitInputRef}
                onCommit={handleCommit}
                disabled={readOnly}
                pending={commitPending}
                selectedFileCount={selectedUnstagedFiles.size}
                totalFileCount={files.length}
              />
            )}
            <div className="flex-1 overflow-y-auto px-4 pb-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full">
              {initialLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <ConflictsSection
                    files={conflictedFiles}
                    isCollapsed={collapsedSections.has("conflicts")}
                    onToggleCollapse={() => toggleSectionCollapse("conflicts")}
                    onFileSelect={handleConflictFileSelect}
                    activeFilePath={activeFilePath}
                  />
                  {files.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center py-12">
                      <CheckCircle2 className="w-12 h-12 text-muted-foreground/40 mb-3" />
                      <p className="text-sm text-muted-foreground">
                        No changes
                      </p>
                    </div>
                  ) : (
                    <ChangesSection
                      title="Changes"
                      files={files}
                      isCollapsed={collapsedSections.has("changes")}
                      onToggleCollapse={() => toggleSectionCollapse("changes")}
                      fileActionTarget={fileActionTarget}
                      activeFilePath={activeFilePath}
                      selectedFiles={selectedUnstagedFiles}
                      lastSelectedPath={
                        lastSelectedFileIndex !== null &&
                        files[lastSelectedFileIndex]
                          ? files[lastSelectedFileIndex].path
                          : null
                      }
                      onFileSelect={handleFileSelect}
                      onMoveToWorkspace={() => setMoveDialogOpen(true)}
                      onDiscardAll={handleDiscardAll}
                      onDiscard={handleDiscardFiles}
                      onDeselectAll={() => setSelectedUnstagedFiles(new Set())}
                    />
                  )}
                </>
              )}
            </div>
          </div>
          <div className="flex-1 flex flex-col min-w-0">
            {/* Review Action Bar - shown when there are comments */}
            {comments.length > 0 && (
              <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-2 bg-muted/80 backdrop-blur-sm border-b border-border">
                <div className="flex items-center gap-2 text-sm">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  <span className="text-muted-foreground">
                    {comments.length} comment{comments.length !== 1 ? "s" : ""}{" "}
                    pending
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCopyReview}
                    className="gap-2"
                  >
                    {copiedReview ? (
                      <>
                        <Check className="w-3 h-3" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        Copy
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowCancelDialog(true)}
                  >
                    Cancel
                  </Button>
                  <Popover
                    open={reviewPopoverOpen}
                    onOpenChange={setReviewPopoverOpen}
                  >
                    <PopoverTrigger asChild>
                      <Button size="sm" variant="default" className="gap-2">
                        <Send className="w-3 h-3" />
                        Finish review
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" side="bottom" className="w-80">
                      <div className="space-y-3">
                        <div>
                          <h4 className="font-medium text-sm mb-1">
                            Finish your review
                          </h4>
                          <p className="text-sm text-muted-foreground">
                            {comments.length} comment
                            {comments.length !== 1 ? "s" : ""} will be
                            submitted.
                          </p>
                        </div>
                        <Textarea
                          value={finalReviewComment}
                          onChange={(e) =>
                            setFinalReviewComment(e.target.value)
                          }
                          placeholder="Add a summary comment (optional)..."
                          className="min-h-[80px] text-sm"
                        />
                        <div className="flex justify-end gap-2">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8"
                                  onClick={() => setReviewPopoverOpen(false)}
                                  disabled={sendingReview}
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Cancel</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleRequestChanges("plan")}
                            disabled={sendingReview}
                          >
                            Plan
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleRequestChanges("acceptEdits")}
                            disabled={sendingReview}
                          >
                            Edit
                          </Button>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            )}

            {/* Cancel Review Confirmation Dialog */}
            <AlertDialog
              open={showCancelDialog}
              onOpenChange={setShowCancelDialog}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Discard review?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will discard all {comments.length} pending comment
                    {comments.length !== 1 ? "s" : ""}. This action cannot be
                    undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep reviewing</AlertDialogCancel>
                  <AlertDialogAction onClick={handleCancelReview}>
                    Discard
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Stale Files Warning Banner - shown when files changed during review */}
            {staleFiles.size > 0 && (
              <div className="flex items-center justify-between px-4 py-2 bg-amber-500/15 border-b border-amber-500/40">
                <div className="flex items-center gap-2 text-sm">
                  <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-300" />
                  <span className="text-amber-800 dark:text-amber-200">
                    {staleFiles.size} file{staleFiles.size !== 1 ? "s" : ""}{" "}
                    changed since you started reviewing
                  </span>
                  <span className="text-sm text-amber-700/80 dark:text-amber-300/80">
                    (
                    {Array.from(staleFiles)
                      .slice(0, 3)
                      .map(getFileName)
                      .join(", ")}
                    {staleFiles.size > 3 ? ` +${staleFiles.size - 3} more` : ""}
                    )
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 border-amber-500/60 text-amber-800 dark:text-amber-200 hover:bg-amber-500/25"
                  onClick={handleReloadWithPendingChanges}
                >
                  <RefreshCw className="w-3 h-3" />
                  Reload
                </Button>
              </div>
            )}

            {/* All Files Diffs */}
            <div className="flex-1 overflow-hidden">
              {conflictEditorOpen ? (
                // Conflict Resolution Editor
                <div className="h-full flex flex-col p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-medium">Resolve Conflict</h3>
                      <p className="text-sm text-muted-foreground font-mono">
                        {conflictFilePath}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCloseConflictEditor}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  {loadingConflictFile ? (
                    <div className="flex-1 flex items-center justify-center text-muted-foreground">
                      <Loader2 className="w-6 h-6 animate-spin" />
                      <span className="ml-2">Loading conflict file...</span>
                    </div>
                  ) : (
                    <>
                      <Textarea
                        value={conflictFileContent}
                        onChange={(e) => setConflictFileContent(e.target.value)}
                        className="flex-1 font-mono text-sm mb-4"
                        placeholder="Edit the file to resolve conflicts..."
                        style={{ minHeight: "400px" }}
                        aria-label="Conflict resolution editor"
                        data-testid="conflict-editor"
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          onClick={handleCloseConflictEditor}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={handleResolveConflict}
                          disabled={resolvingConflict}
                        >
                          {resolvingConflict ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin mr-2" />
                              Resolving...
                            </>
                          ) : (
                            "Resolve"
                          )}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ) : initialLoading || loadingAllHunks ? (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span className="ml-2">Loading diffs...</span>
                </div>
              ) : files.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                  <CheckCircle2 className="w-12 h-12 mb-3 text-muted-foreground/40" />
                  <p className="text-sm">No changes to review</p>
                </div>
              ) : (
                (() => {
                  // Calculate total lines across all files
                  let totalLines = 0;
                  for (const [_, fileData] of allFileHunks) {
                    if (!fileData.isLoading && fileData.hunks) {
                      for (const hunk of fileData.hunks) {
                        totalLines += hunk.lines.length;
                      }
                    }
                  }

                  // If total lines exceed 1000 and not expanded, show a button
                  if (totalLines > 1000 && !largeChangesetExpanded) {
                    return (
                      <div className="h-full flex flex-col items-center justify-center gap-4 text-muted-foreground">
                        <FileText className="w-12 h-12 opacity-50" />
                        <div className="text-center">
                          <p className="font-medium mb-1">Large changeset</p>
                          <p className="text-sm">
                            {totalLines} lines across {files.length} file
                            {files.length !== 1 ? "s" : ""}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          onClick={() => setLargeChangesetExpanded(true)}
                        >
                          View changes
                        </Button>
                      </div>
                    );
                  }

                  return (
                    <div
                      ref={diffContainerRef}
                      className="h-full overflow-y-auto"
                    >
                      <div className="p-4 space-y-4">
                        {files.map((file) => (
                          <FileRowComponent
                            key={file.path}
                            file={file}
                            allFileHunks={allFileHunks}
                            collapsedFiles={collapsedFiles}
                            viewedFiles={viewedFiles}
                            expandedLargeDiffs={expandedLargeDiffs}
                            diffFontSize={diffFontSize}
                            readOnly={readOnly}
                            fileActionTarget={fileActionTarget}
                            selectedUnstagedFiles={selectedUnstagedFiles}
                            workspacePath={workspacePath}
                            toggleFileCollapse={toggleFileCollapse}
                            toggleLargeDiff={toggleLargeDiff}
                            handleMarkFileViewed={handleMarkFileViewed}
                            handleUnmarkFileViewed={handleUnmarkFileViewed}
                            handleDiscardFiles={handleDiscardFiles}
                            handleContextMenu={handleContextMenu}
                            renderHunkLines={renderHunkLines}
                            addToast={addToast}
                            getOutdatedCommentsForFile={
                              getOutdatedCommentsForFile
                            }
                            deleteComment={deleteComment}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          </div>

          {/* Context Menu for Line Selection */}
          {contextMenuPosition &&
            diffLineSelection &&
            diffLineSelection.lines.length > 0 && (
              <div
                className="fixed z-50 bg-popover border border-border rounded-md shadow-lg py-1 min-w-[180px]"
                style={{
                  left: contextMenuPosition.x,
                  top: contextMenuPosition.y,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent flex items-center gap-2"
                  onClick={handleAddCommentFromSelection}
                >
                  <MessageSquare className="w-4 h-4" />
                  Add comment
                </button>
                <button
                  className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent flex items-center gap-2"
                  onClick={handleCopyLineLocation}
                  data-testid="copy-line-location"
                >
                  <Copy className="w-4 h-4" />
                  Copy line location
                </button>
                <button
                  className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent flex items-center gap-2"
                  onClick={handleCopyLines}
                  data-testid="copy-lines"
                >
                  <Copy className="w-4 h-4" />
                  Copy lines
                </button>
              </div>
            )}

          {/* Move to Workspace Dialog */}
          <MoveToWorkspaceDialog
            open={moveDialogOpen}
            onOpenChange={setMoveDialogOpen}
            repoPath={workspacePath}
            selectedFiles={Array.from(selectedUnstagedFiles)}
            onSuccess={handleMoveToWorkspaceSuccess}
          />
        </div>
      );
    }
  )
);

ChangesDiffViewer.displayName = "ChangesDiffViewer";

export default ChangesDiffViewer;
