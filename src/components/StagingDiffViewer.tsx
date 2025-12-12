import { memo, useCallback, useEffect, useMemo, useRef, useState, Fragment, forwardRef, useImperativeHandle } from "react";
import { type KeyboardEvent as ReactKeyboardEvent } from "react";
import { openPath } from "@tauri-apps/plugin-opener";
import { v4 as uuidv4 } from "uuid";
import { List } from "react-window";
import {
  gitGetChangedFiles,
  gitGetFileHunks,
  gitGetFileLines,
  getGitCache,
  setGitCache,
  invalidateGitCache,
  gitStageFile,
  gitUnstageFile,
  gitAddAll,
  gitUnstageAll,
  gitDiscardAllChanges,
  gitDiscardFiles,
  gitCommit,
  gitCommitAmend,
  gitPush,
  gitPull,
  gitStageSelectedLines,
  gitUnstageSelectedLines,
  ptyWrite,
  getViewedFiles,
  markFileViewed,
  unmarkFileViewed,
  type GitDiffHunk,
  type LineSelectionPayload,
} from "../lib/api";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { useToast } from "./ui/toast";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/popover";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";
import {
  AlertTriangle,
  FileText,
  Loader2,
  Minus,
  Plus,
  ChevronUp,
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
} from "lucide-react";
import { cn } from "../lib/utils";
import { getLanguageFromPath, highlightCode } from "../lib/syntax-highlight";
import {
  parseChangedFiles,
  filterStagedFiles,
  filterUnstagedFiles,
  isBinaryFile,
  type ParsedFileChange,
} from "../lib/git-utils";
import { useDiffSettings } from "../hooks/useDiffSettings";
import { GitChangesSection } from "./GitChangesSection";
import { MoveToWorkspaceDialog } from "./MoveToWorkspaceDialog";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "./ui/tooltip";

interface StagingDiffViewerProps {
  workspacePath: string;
  readOnly?: boolean;
  disableInteractions?: boolean;
  onStagedFilesChange?: (files: string[]) => void;
  refreshSignal?: number;
  initialSelectedFile?: string;
  terminalSessionId?: string;
  onReviewSubmitted?: () => void;
}

export interface StagingDiffViewerHandle {
  focusCommitInput: () => void;
}

interface LineComment {
  id: string;
  filePath: string;
  hunkId: string;
  startLine: number;  // actual file line number (1-indexed)
  endLine: number;    // actual file line number (1-indexed)
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
  hunks: GitDiffHunk[];
  isLoading: boolean;
  error?: string;
}

interface ExpandedRange {
  startLine: number;
  endLine: number;
  lines: string[];
}

// Helper to get line type styling (background only, text color handled by syntax highlighting)
const getLineTypeClass = (line: string): string => {
  if (line.startsWith("+")) return "bg-emerald-500/10";
  if (line.startsWith("-")) return "bg-red-500/10";
  return "";
};

const getLinePrefix = (line: string): string => {
  if (line.startsWith("+")) return "+";
  if (line.startsWith("-")) return "-";
  return " ";
};

const arraysEqual = (a?: string[] | null, b?: string[] | null): boolean => {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
};

const hunksEqual = (a?: GitDiffHunk[] | null, b?: GitDiffHunk[] | null): boolean => {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  return JSON.stringify(a) === JSON.stringify(b);
};

const filesEqual = (a: ParsedFileChange[], b: ParsedFileChange[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].path !== b[i].path ||
        a[i].stagedStatus !== b[i].stagedStatus ||
        a[i].workspaceStatus !== b[i].workspaceStatus ||
        a[i].isUntracked !== b[i].isUntracked) {
      return false;
    }
  }
  return true;
};

const parseCachedStrings = (raw: string): string[] | null => {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed as string[];
    }
  } catch {
    // Silently ignore parse failures
  }
  return null;
};

const parseCachedHunks = (raw: string): GitDiffHunk[] | null => {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed as GitDiffHunk[];
    }
  } catch {
    // Silently ignore parse failures
  }
  return null;
};

// Parse hunk header to extract starting line numbers and counts
const parseHunkHeader = (header: string): { oldStart: number; newStart: number; oldCount: number; newCount: number } => {
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
const computeHunkLineNumbers = (hunk: GitDiffHunk): Array<{ old?: number; new?: number }> => {
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
const computeHunksHash = (hunks: GitDiffHunk[]): string => {
  // Create a string from all hunk content and hash it
  const content = hunks.map(h => h.header + h.lines.join("")).join("|");
  // Simple hash function (djb2)
  let hash = 5381;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) + hash) + content.charCodeAt(i);
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

const CommentInput: React.FC<CommentInputProps> = memo(({
  onSubmit,
  onCancel,
  filePath,
  startLine,
  endLine,
}) => {
  const [text, setText] = useState("");

  const handleSubmit = useCallback(() => {
    if (text.trim()) {
      onSubmit(text.trim());
    }
  }, [text, onSubmit]);

  const handleKeyDown = useCallback((e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    // Stop propagation for standard text editing shortcuts
    if (e.metaKey || e.ctrlKey) {
      const key = e.key.toLowerCase();
      if (['a', 'c', 'x', 'v', 'z', 'y'].includes(key)) {
        e.stopPropagation();
        return; // Let browser handle natively
      }
    }

    if (e.key === "Escape") {
      onCancel();
    } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      handleSubmit();
    }
  }, [onCancel, handleSubmit]);

  const lineLabel = startLine && endLine
    ? (startLine === endLine ? `L${startLine}` : `L${startLine}-${endLine}`)
    : null;

  return (
    <div className="bg-muted/60 border-y border-border/40 px-4 py-3 font-sans">
      {filePath && lineLabel && (
        <div className="mb-2 text-xs text-muted-foreground">
          {filePath}:{lineLabel}
        </div>
      )}
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add a comment..."
        className="mb-2 text-sm font-sans"
        autoFocus
        onKeyDown={handleKeyDown}
      />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSubmit} disabled={!text.trim()}>
          Add Comment
        </Button>
      </div>
    </div>
  );
});
CommentInput.displayName = "CommentInput";

// Isolated commit input component to prevent parent re-renders during typing
interface CommitInputHandle {
  focus: () => void;
}

interface CommitInputProps {
  onCommit: (message: string) => void;
  onCommitAmend: (message: string) => void;
  onCommitAndPush: (message: string) => void;
  onCommitAndSync: (message: string) => void;
  stagedFilesCount: number;
  disabled: boolean;
  pending: boolean;
  actionPending: 'commit' | 'amend' | 'push' | 'sync' | null;
  onRefresh?: () => void;
}

const CommitInput = memo(forwardRef<CommitInputHandle, CommitInputProps>(({
  onCommit,
  onCommitAmend,
  onCommitAndPush,
  onCommitAndSync,
  stagedFilesCount,
  disabled,
  pending,
  actionPending,
  onRefresh,
}, ref) => {
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Expose focus method via ref
  useImperativeHandle(ref, () => ({
    focus: () => {
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          // Select all text for easy overwriting
          textareaRef.current.select();
        }
      });
    }
  }), []);

  const canCommit = useMemo(() => {
    const trimmed = message.trim();
    return Boolean(trimmed) && trimmed.length <= 500 && stagedFilesCount > 0 && !pending && !actionPending;
  }, [message, stagedFilesCount, pending, actionPending]);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const lineHeight = 20;
    const minHeight = lineHeight + 16;
    textarea.style.height = `${Math.max(minHeight, textarea.scrollHeight)}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [message, adjustHeight]);

  const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      if (canCommit) {
        onCommit(message.trim());
        setMessage("");
      }
    }
  }, [canCommit, message, onCommit]);

  const handleCommit = useCallback(() => {
    if (canCommit) {
      onCommit(message.trim());
      setMessage("");
    }
  }, [canCommit, message, onCommit]);

  const handleAmend = useCallback(() => {
    const trimmed = message.trim();
    if (trimmed) {
      onCommitAmend(trimmed);
      setMessage("");
    }
  }, [message, onCommitAmend]);

  const handlePush = useCallback(() => {
    if (canCommit) {
      onCommitAndPush(message.trim());
      setMessage("");
    }
  }, [canCommit, message, onCommitAndPush]);

  const handleSync = useCallback(() => {
    if (canCommit) {
      onCommitAndSync(message.trim());
      setMessage("");
    }
  }, [canCommit, message, onCommitAndSync]);

  return (
    <div className="px-4 py-3 border-b border-border space-y-2">
      {onRefresh && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={disabled || pending}
            className="h-7 w-7"
          >
            <RefreshCw className="w-3 h-3" />
          </Button>
        </div>
      )}
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
      <div className="flex gap-1">
        <div className="flex flex-1">
          <Button
            className="flex-1 rounded-r-none border-r-0 text-xs !h-auto py-1.5"
            disabled={!canCommit || disabled}
            onClick={handleCommit}
            size="sm"
          >
            {pending || actionPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Commit"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                className="px-2 rounded-l-none text-xs !h-auto py-1.5"
                disabled={!canCommit || disabled}
                size="sm"
                variant="default"
              >
                <ChevronDown className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={4}>
              <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleCommit(); }} disabled={!canCommit}>
                Commit
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleAmend(); }} disabled={!message.trim()}>
                Commit (Amend)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handlePush(); }} disabled={!canCommit}>
                Commit & Push
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleSync(); }} disabled={!canCommit}>
                Commit & Sync
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}));
CommitInput.displayName = "CommitInput";

// Memoized syntax-highlighted line content
interface HighlightedLineProps {
  content: string;
  language: string | null;
}

const HighlightedLine: React.FC<HighlightedLineProps> = memo(({ content, language }) => {
  const html = useMemo(() => highlightCode(content, language), [content, language]);
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
});
HighlightedLine.displayName = "HighlightedLine";

export const StagingDiffViewer = memo(forwardRef<StagingDiffViewerHandle, StagingDiffViewerProps>(({
  workspacePath,
  readOnly = false,
  disableInteractions = false,
  onStagedFilesChange,
  refreshSignal = 0,
  initialSelectedFile,
  terminalSessionId,
  onReviewSubmitted,
}, ref) => {
  const { addToast } = useToast();
  const { fontSize: diffFontSize } = useDiffSettings();
  const [files, setFiles] = useState<ParsedFileChange[]>([]);
  const [allFileHunks, setAllFileHunks] = useState<Map<string, FileHunksData>>(new Map());
  const [loadingAllHunks, setLoadingAllHunks] = useState(false);
  const [manualRefreshKey, setManualRefreshKey] = useState(0);
  const [fileActionTarget, setFileActionTarget] = useState<string | null>(null);
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  // Line selection state for staging
  const [diffLineSelection, setDiffLineSelection] = useState<DiffLineSelection | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionAnchor, setSelectionAnchor] = useState<{ filePath: string; hunkIndex: number; lineIndex: number } | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [stagingLines, setStagingLines] = useState(false);
  const [commitPending, setCommitPending] = useState(false);
  const [actionPending, setActionPending] = useState<'commit' | 'amend' | 'push' | 'sync' | null>(null);
  const commitInputRef = useRef<CommitInputHandle>(null);
  const prevFilePathsRef = useRef<string[]>([]);
  const diffContainerRef = useRef<HTMLDivElement>(null);

  // Expose focusCommitInput method via ref
  useImperativeHandle(ref, () => ({
    focusCommitInput: () => {
      commitInputRef.current?.focus();
    }
  }), []);

  // Review/comment state
  const [comments, setComments] = useState<LineComment[]>([]);
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [reviewPopoverOpen, setReviewPopoverOpen] = useState(false);
  const [finalReviewComment, setFinalReviewComment] = useState("");

  // Track if user is in review mode (has comments or is typing)
  const isInReviewMode = useMemo(() => {
    return comments.length > 0 || showCommentInput || reviewPopoverOpen || finalReviewComment.trim().length > 0;
  }, [comments.length, showCommentInput, reviewPopoverOpen, finalReviewComment]);

  // Track stale files that changed while user is in review mode
  const [staleFiles, setStaleFiles] = useState<Set<string>>(new Set());
  const [pendingFilesData, setPendingFilesData] = useState<ParsedFileChange[] | null>(null);
  const [pendingHunksData, setPendingHunksData] = useState<Map<string, FileHunksData> | null>(null);
  const [sendingReview, setSendingReview] = useState(false);
  // Pending comment data (used for both single and multi-line)
  const [pendingComment, setPendingComment] = useState<{
    filePath: string;
    hunkId: string;
    displayAtLineIndex: number;  // Where to show the inline input
    startLine: number;           // Actual file line number (1-indexed)
    endLine: number;             // Actual file line number (1-indexed)
    lineContent: string[];
  } | null>(null);

  // Viewed files state - maps file path to { viewed_at, content_hash }
  const [viewedFiles, setViewedFiles] = useState<Map<string, { viewedAt: string; contentHash: string }>>(new Map());

  // File selection state for moving to workspace
  const [selectedUnstagedFiles, setSelectedUnstagedFiles] = useState<Set<string>>(new Set());
  const [lastSelectedFileIndex, setLastSelectedFileIndex] = useState<number | null>(null);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);

  // Active file tracking (for sidebar highlighting)
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);

  // Expanded context lines state
  const [expandedRanges, setExpandedRanges] = useState<
    Map<string, { before: ExpandedRange[]; after: ExpandedRange[] }>
  >(new Map());
  const [loadingExpansions, setLoadingExpansions] = useState<Set<string>>(new Set());

  const stagedFiles = useMemo(() => filterStagedFiles(files), [files]);
  const unstagedFiles = useMemo(() => filterUnstagedFiles(files), [files]);

  const applyChangedFiles = useCallback((parsed: ParsedFileChange[], forceApply = false) => {
    // If in review mode and not forcing, store as pending and mark stale files
    if (isInReviewMode && !forceApply) {
      setFiles((prev) => {
        if (filesEqual(prev, parsed)) return prev; // No changes, no need to mark stale

        // Find which files changed
        const prevPaths = new Set(prev.map(f => f.path));
        const newPaths = new Set(parsed.map(f => f.path));
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
          const oldFile = prev.find(f => f.path === newFile.path);
          if (oldFile && (
            oldFile.stagedStatus !== newFile.stagedStatus ||
            oldFile.workspaceStatus !== newFile.workspaceStatus
          )) {
            changedFiles.add(newFile.path);
          }
        }

        if (changedFiles.size > 0) {
          setStaleFiles(prevStale => {
            const next = new Set(prevStale);
            changedFiles.forEach(f => next.add(f));
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
    if (initialSelectedFile && parsed.some((file) => file.path === initialSelectedFile)) {
      setSelectedUnstagedFiles(new Set([initialSelectedFile]));
    }

    if (onStagedFilesChange) {
      const staged = parsed
        .filter((file) => file.stagedStatus && file.stagedStatus !== " ")
        .map((file) => file.path);
      onStagedFilesChange(Array.from(new Set(staged)));
    }
  }, [initialSelectedFile, onStagedFilesChange, isInReviewMode]);

  const invalidateCache = useCallback(async () => {
    if (!workspacePath) {
      return;
    }
    try {
      await invalidateGitCache(workspacePath);
    } catch {
      // Silently ignore cache invalidation failures
    }
  }, [workspacePath]);

  // Compute expandable lines for a hunk boundary
  const computeExpandableLines = useCallback((
    hunk: GitDiffHunk,
    position: 'before' | 'after',
    existingRanges: ExpandedRange[],
    allHunks: GitDiffHunk[],
    hunkIndex: number
  ): { startLine: number; endLine: number; canExpand: boolean } | null => {
    const { oldStart, oldCount } = parseHunkHeader(hunk.header);

    if (position === 'before') {
      // Find the lowest line we've already expanded to
      const lowestExpanded = existingRanges.length > 0
        ? Math.min(...existingRanges.map(r => r.startLine))
        : oldStart;

      // Can we expand 25 more lines?
      const targetStart = Math.max(1, lowestExpanded - 25);
      const targetEnd = lowestExpanded - 1;

      if (targetStart > targetEnd) return null;

      return {
        startLine: targetStart,
        endLine: targetEnd,
        canExpand: true,
      };
    } else {
      // After: expand down from last hunk line
      const hunkEndLine = oldStart + oldCount - 1;
      const highestExpanded = existingRanges.length > 0
        ? Math.max(...existingRanges.map(r => r.endLine))
        : hunkEndLine;

      // Check if next hunk exists and calculate gap
      const nextHunk = allHunks[hunkIndex + 1];
      let maxLine: number;

      if (nextHunk) {
        const { oldStart: nextStart } = parseHunkHeader(nextHunk.header);
        maxLine = nextStart - 1;
      } else {
        // Last hunk - allow expanding 25 lines (will be capped by file length)
        maxLine = highestExpanded + 25;
      }

      const targetStart = highestExpanded + 1;
      const targetEnd = Math.min(highestExpanded + 25, maxLine);

      if (targetStart > targetEnd) return null;

      return {
        startLine: targetStart,
        endLine: targetEnd,
        canExpand: true,
      };
    }
  }, []);

  // Handle expanding context lines
  const handleExpandLines = useCallback(async (
    filePath: string,
    hunk: GitDiffHunk,
    hunkIndex: number,
    position: 'before' | 'after'
  ) => {
    const fileData = allFileHunks.get(filePath);
    if (!fileData) return;

    const hunkRanges = expandedRanges.get(hunk.id) || { before: [], after: [] };
    const existingRanges = position === 'before' ? hunkRanges.before : hunkRanges.after;

    const expandInfo = computeExpandableLines(
      hunk,
      position,
      existingRanges,
      fileData.hunks,
      hunkIndex
    );

    if (!expandInfo?.canExpand) return;

    // Set loading state
    const loadingKey = `${hunk.id}-${position}`;
    setLoadingExpansions(prev => new Set(prev).add(loadingKey));

    try {
      const result = await gitGetFileLines(
        workspacePath,
        filePath,
        hunk.is_staged,
        expandInfo.startLine,
        expandInfo.endLine
      );

      // Update expanded ranges
      setExpandedRanges(prev => {
        const next = new Map(prev);
        const ranges = next.get(hunk.id) || { before: [], after: [] };

        const newRange: ExpandedRange = {
          startLine: result.start_line,
          endLine: result.end_line,
          lines: result.lines,
        };

        if (position === 'before') {
          ranges.before = [...ranges.before, newRange].sort((a, b) => a.startLine - b.startLine);
        } else {
          ranges.after = [...ranges.after, newRange].sort((a, b) => a.startLine - b.startLine);
        }

        next.set(hunk.id, ranges);
        return next;
      });
    } catch (error: any) {
      console.error('Failed to expand context:', error);
      addToast({
        title: "Expansion failed",
        description: error?.message || "Unknown error",
        type: "error",
      });
    } finally {
      // Clear loading state
      setLoadingExpansions(prev => {
        const next = new Set(prev);
        next.delete(loadingKey);
        return next;
      });
    }
  }, [workspacePath, allFileHunks, expandedRanges, computeExpandableLines, addToast]);

  const loadChangedFiles = useCallback(async () => {
    if (!workspacePath) {
      setFiles([]);
      return;
    }

    let cachedEntries: string[] | null = null;

    try {
      const cached = await getGitCache(workspacePath, "changed_files");
      if (cached?.data) {
        const parsedCache = parseCachedStrings(cached.data);
        if (parsedCache) {
          cachedEntries = parsedCache;
          const parsed = parseChangedFiles(parsedCache);
          applyChangedFiles(parsed);
        }
      }
    } catch {
      // Silently ignore cache retrieval failures
    }

    try {
      const changedFiles = await gitGetChangedFiles(workspacePath);
      const parsed = parseChangedFiles(changedFiles);
      if (!arraysEqual(cachedEntries, changedFiles)) {
        applyChangedFiles(parsed);
      }
      setGitCache(workspacePath, "changed_files", changedFiles).catch(() => {
        // Silently ignore cache write failures
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addToast({ title: "Git Error", description: message, type: "error" });
    }
  }, [workspacePath, addToast, applyChangedFiles]);

  useEffect(() => {
    loadChangedFiles();
  }, [loadChangedFiles, refreshSignal, manualRefreshKey]);

  // Load viewed files from database
  const loadViewedFiles = useCallback(async () => {
    if (!workspacePath) {
      setViewedFiles(new Map());
      return;
    }

    try {
      const views = await getViewedFiles(workspacePath);
      const viewsMap = new Map<string, { viewedAt: string; contentHash: string }>();
      for (const view of views) {
        viewsMap.set(view.file_path, {
          viewedAt: view.viewed_at,
          contentHash: view.content_hash,
        });
      }
      setViewedFiles(viewsMap);

      // Auto-collapse viewed files
      setCollapsedFiles((prev) => {
        const next = new Set(prev);
        for (const filePath of viewsMap.keys()) {
          next.add(filePath);
        }
        return next;
      });
    } catch {
      // Silently ignore viewed files load failures
    }
  }, [workspacePath]);

  useEffect(() => {
    loadViewedFiles();
  }, [loadViewedFiles]);

  // Reset expanded lines when files change
  useEffect(() => {
    setExpandedRanges(new Map());
    setLoadingExpansions(new Set());
  }, [files, manualRefreshKey]);

  // Auto-expand 10 lines of context before and after each hunk
  const autoExpandedHunksRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Reset auto-expanded tracking when files change
    autoExpandedHunksRef.current = new Set();
  }, [files, manualRefreshKey]);

  useEffect(() => {
    if (loadingAllHunks) return;

    const expandContextForHunks = async () => {
      const hunksToExpand: Array<{
        filePath: string;
        hunk: GitDiffHunk;
        hunkIndex: number;
        allHunks: GitDiffHunk[];
      }> = [];

      // Collect all hunks that need auto-expansion
      for (const [filePath, fileData] of allFileHunks) {
        if (fileData.isLoading || fileData.error || fileData.hunks.length === 0) continue;

        for (let hunkIndex = 0; hunkIndex < fileData.hunks.length; hunkIndex++) {
          const hunk = fileData.hunks[hunkIndex];
          const hunkKey = `${filePath}:${hunk.id}`;

          // Skip if already auto-expanded
          if (autoExpandedHunksRef.current.has(hunkKey)) continue;

          // Mark as being processed
          autoExpandedHunksRef.current.add(hunkKey);

          hunksToExpand.push({
            filePath,
            hunk,
            hunkIndex,
            allHunks: fileData.hunks,
          });
        }
      }

      if (hunksToExpand.length === 0) return;

      // Expand context for each hunk (10 lines before and after)
      const CONTEXT_LINES = 10;

      for (const { filePath, hunk, hunkIndex, allHunks } of hunksToExpand) {
        const { oldStart, oldCount } = parseHunkHeader(hunk.header);

        // Calculate lines to fetch BEFORE the hunk
        const beforeStart = Math.max(1, oldStart - CONTEXT_LINES);
        const beforeEnd = oldStart - 1;

        // Calculate lines to fetch AFTER the hunk
        const hunkEndLine = oldStart + oldCount - 1;
        const nextHunk = allHunks[hunkIndex + 1];
        let afterEnd: number;

        if (nextHunk) {
          const { oldStart: nextStart } = parseHunkHeader(nextHunk.header);
          afterEnd = Math.min(hunkEndLine + CONTEXT_LINES, nextStart - 1);
        } else {
          afterEnd = hunkEndLine + CONTEXT_LINES;
        }
        const afterStart = hunkEndLine + 1;

        // Fetch before context
        if (beforeStart <= beforeEnd) {
          try {
            const result = await gitGetFileLines(
              workspacePath,
              filePath,
              hunk.is_staged,
              beforeStart,
              beforeEnd
            );

            if (result.lines.length > 0) {
              setExpandedRanges(prev => {
                const next = new Map(prev);
                const ranges = next.get(hunk.id) || { before: [], after: [] };

                const newRange: ExpandedRange = {
                  startLine: result.start_line,
                  endLine: result.end_line,
                  lines: result.lines,
                };

                // Only add if not already present
                if (!ranges.before.some(r => r.startLine === newRange.startLine)) {
                  ranges.before = [...ranges.before, newRange].sort((a, b) => a.startLine - b.startLine);
                  next.set(hunk.id, ranges);
                }

                return next;
              });
            }
          } catch {
            // Silently ignore - context expansion is optional
          }
        }

        // Fetch after context
        if (afterStart <= afterEnd) {
          try {
            const result = await gitGetFileLines(
              workspacePath,
              filePath,
              hunk.is_staged,
              afterStart,
              afterEnd
            );

            if (result.lines.length > 0) {
              setExpandedRanges(prev => {
                const next = new Map(prev);
                const ranges = next.get(hunk.id) || { before: [], after: [] };

                const newRange: ExpandedRange = {
                  startLine: result.start_line,
                  endLine: result.end_line,
                  lines: result.lines,
                };

                // Only add if not already present
                if (!ranges.after.some(r => r.startLine === newRange.startLine)) {
                  ranges.after = [...ranges.after, newRange].sort((a, b) => a.startLine - b.startLine);
                  next.set(hunk.id, ranges);
                }

                return next;
              });
            }
          } catch {
            // Silently ignore - context expansion is optional
          }
        }
      }
    };

    expandContextForHunks();
  }, [allFileHunks, loadingAllHunks, workspacePath]);

  // Auto-collapse binary files when files list changes
  useEffect(() => {
    if (files.length > 0) {
      setCollapsedFiles((prev) => {
        const next = new Set(prev);
        for (const file of files) {
          if (isBinaryFile(file.path)) {
            next.add(file.path);
          }
        }
        return next;
      });
    }
  }, [files]);

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
          if (viewData.contentHash && currentHash !== viewData.contentHash) {
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
      if (!workspacePath) return;

      // Compute hash from current hunks
      const fileData = allFileHunks.get(filePath);
      const contentHash = fileData?.hunks ? computeHunksHash(fileData.hunks) : "";

      try {
        await markFileViewed(workspacePath, filePath, contentHash);
        const now = new Date().toISOString();
        setViewedFiles((prev) => new Map(prev).set(filePath, { viewedAt: now, contentHash }));
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
      if (!workspacePath) return;

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
      if (!workspacePath || filesToLoad.length === 0) {
        if (!isInReviewMode || forceApply) {
          setAllFileHunks((prev) => prev.size === 0 ? prev : new Map());
        }
        setLoadingAllHunks(false);
        return;
      }
      setLoadingAllHunks(true);

      const cachedHunks = new Map<string, GitDiffHunk[]>();
      const hunksMap = new Map<string, FileHunksData>();

      // Load cached data first
      await Promise.all(
        filesToLoad.map(async (file) => {
          try {
            const cache = await getGitCache(workspacePath, "file_hunks", file.path);
            if (cache?.data) {
              const hunks = parseCachedHunks(cache.data);
              if (hunks) {
                cachedHunks.set(file.path, hunks);
                hunksMap.set(file.path, { filePath: file.path, hunks, isLoading: false });
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
          hunksMap.set(file.path, { filePath: file.path, hunks: [], isLoading: true });
        }
      });

      // Update with cached data (only if needed and not in review mode)
      if (cachedHunks.size > 0 && (!isInReviewMode || forceApply)) {
        setAllFileHunks((prev) => {
          let needsUpdate = prev.size !== hunksMap.size;
          if (!needsUpdate) {
            for (const [path, data] of hunksMap) {
              const existing = prev.get(path);
              if (!existing || existing.isLoading !== data.isLoading || !hunksEqual(existing.hunks, data.hunks)) {
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
              const hunks = await gitGetFileHunks(workspacePath, file.path);
              return { filePath: file.path, hunks, error: null as string | null };
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              return { filePath: file.path, hunks: [] as GitDiffHunk[], error: message };
            }
          })
        );

        // If in review mode and not forcing, check for changes and store as pending
        if (isInReviewMode && !forceApply) {
          const newHunksMap = new Map<string, FileHunksData>();
          const changedFiles = new Set<string>();

          for (const result of results) {
            const existing = allFileHunks.get(result.filePath);
            const newData: FileHunksData = result.error
              ? { filePath: result.filePath, hunks: [], isLoading: false, error: result.error }
              : { filePath: result.filePath, hunks: result.hunks, isLoading: false };

            newHunksMap.set(result.filePath, newData);

            // Check if hunks changed
            if (!existing || !hunksEqual(existing.hunks, result.hunks)) {
              changedFiles.add(result.filePath);
            }
          }

          if (changedFiles.size > 0) {
            setStaleFiles(prev => {
              const next = new Set(prev);
              changedFiles.forEach(f => next.add(f));
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
                next.set(result.filePath, { filePath: result.filePath, hunks: [], isLoading: false, error: result.error });
              }
              continue;
            }

            if (!existing || existing.isLoading || !hunksEqual(existing.hunks, result.hunks)) {
              hasChanges = true;
              next.set(result.filePath, { filePath: result.filePath, hunks: result.hunks, isLoading: false });
            }

            // Cache result
            const cached = cachedHunks.get(result.filePath);
            if (!cached || !hunksEqual(cached, result.hunks)) {
              setGitCache(workspacePath, "file_hunks", result.hunks, result.filePath).catch(console.debug);
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
    const currentPaths = files.map(f => f.path);
    const pathsChanged = currentPaths.length !== prevFilePathsRef.current.length ||
      currentPaths.some((p, i) => p !== prevFilePathsRef.current[i]);

    if (files.length > 0 && pathsChanged) {
      prevFilePathsRef.current = currentPaths;
      loadAllFileHunks(files);
    } else if (files.length === 0 && prevFilePathsRef.current.length > 0) {
      prevFilePathsRef.current = [];
      setAllFileHunks(new Map());
    }
  }, [files, loadAllFileHunks]);

  // Poll for git changes every 5 seconds when component is active
  useEffect(() => {
    if (!workspacePath) {
      return;
    }

    const pollGitChanges = async () => {
      try {
        await invalidateCache();
        setManualRefreshKey((prev) => prev + 1);
      } catch {
        // Silently ignore polling failures
      }
    };

    // Poll every 5 seconds
    const interval = setInterval(pollGitChanges, 5000);

    return () => clearInterval(interval);
  }, [workspacePath, invalidateCache]);

  // Track active file for sidebar highlighting
  useEffect(() => {
    const container = diffContainerRef.current;
    if (!container || files.length === 0) {
      setActiveFilePath(null);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        // Find all visible entries and pick the topmost one
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

        if (visible.length > 0) {
          const filePath = visible[0].target.getAttribute('data-file-path');
          setActiveFilePath(filePath);
        }
      },
      {
        root: container,
        threshold: 0,
        rootMargin: '-10px 0px -80% 0px' // Top 20% of container
      }
    );

    // Observe all file sections
    const fileSections = container.querySelectorAll('[data-file-path]');
    fileSections.forEach(el => observer.observe(el));

    return () => observer.disconnect();
  }, [files, allFileHunks]);

  const refresh = useCallback(() => {
    setManualRefreshKey((prev) => prev + 1);
  }, []);

  // Reload with pending data, preserving comments and moving orphaned ones to general comment
  const handleReloadWithPendingChanges = useCallback(() => {
    // If we have pending data, apply it now
    if (pendingFilesData) {
      // Find orphaned comments (comments on files/hunks that no longer exist or changed)
      const orphanedComments: LineComment[] = [];
      const validComments: LineComment[] = [];

      for (const comment of comments) {
        const newFileData = pendingHunksData?.get(comment.filePath);
        const fileStillExists = pendingFilesData.some(f => f.path === comment.filePath);

        if (!fileStillExists || !newFileData) {
          // File was removed or has no hunks data - comment is orphaned
          orphanedComments.push(comment);
          continue;
        }

        // Check if the hunk still exists
        const hunkStillExists = newFileData.hunks.some(h => h.id === comment.hunkId);
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
        const orphanedText = orphanedComments.map(c => {
          const lineRef = c.startLine === c.endLine
            ? `${c.filePath}:${c.startLine}`
            : `${c.filePath}:${c.startLine}-${c.endLine}`;
          const codeBlock = c.lineContent.length > 0
            ? `\n\`\`\`\n${c.lineContent.join('\n')}\n\`\`\`\n`
            : '';
          return `**${lineRef}** (outdated)${codeBlock}${c.text}`;
        }).join('\n\n');

        setFinalReviewComment(prev => {
          if (prev.trim()) {
            return `${prev}\n\n---\n**Outdated comments:**\n\n${orphanedText}`;
          }
          return `**Outdated comments:**\n\n${orphanedText}`;
        });

        addToast({
          title: "Comments moved",
          description: `${orphanedComments.length} comment${orphanedComments.length > 1 ? 's' : ''} moved to summary (lines changed)`,
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
  }, [pendingFilesData, pendingHunksData, comments, applyChangedFiles, addToast]);

  const handleStageFile = useCallback(
    async (filePath: string) => {
      if (readOnly || disableInteractions || !filePath) {
        return;
      }
      setFileActionTarget(filePath);
      try {
        await gitStageFile(workspacePath, filePath);
        addToast({ title: "Staged", description: `${filePath} staged`, type: "success" });
        await invalidateCache();
        refresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        addToast({ title: "Stage Failed", description: message, type: "error" });
      } finally {
        setFileActionTarget(null);
      }
    },
    [workspacePath, readOnly, disableInteractions, refresh, addToast, invalidateCache]
  );

  const handleUnstageFile = useCallback(
    async (filePath: string) => {
      if (readOnly || disableInteractions || !filePath) {
        return;
      }
      setFileActionTarget(filePath);
      try {
        await gitUnstageFile(workspacePath, filePath);
        addToast({ title: "Unstaged", description: `${filePath} unstaged`, type: "success" });
        await invalidateCache();
        refresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        addToast({ title: "Unstage Failed", description: message, type: "error" });
      } finally {
        setFileActionTarget(null);
      }
    },
    [workspacePath, readOnly, disableInteractions, refresh, addToast, invalidateCache]
  );

  const handleStageAll = useCallback(async () => {
    if (readOnly || disableInteractions) return;
    try {
      await gitAddAll(workspacePath);
      addToast({ title: "Staged", description: "All changes staged", type: "success" });
      await invalidateCache();
      refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addToast({ title: "Stage All Failed", description: message, type: "error" });
    }
  }, [workspacePath, readOnly, disableInteractions, refresh, addToast, invalidateCache]);

  const handleUnstageAll = useCallback(async () => {
    if (readOnly || disableInteractions) return;
    try {
      await gitUnstageAll(workspacePath);
      addToast({ title: "Unstaged", description: "All changes unstaged", type: "success" });
      await invalidateCache();
      refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addToast({ title: "Unstage All Failed", description: message, type: "error" });
    }
  }, [workspacePath, readOnly, disableInteractions, refresh, addToast, invalidateCache]);

  const handleDiscardAll = useCallback(async () => {
    if (readOnly || disableInteractions) return;
    try {
      await gitDiscardAllChanges(workspacePath);
      addToast({ title: "Discarded", description: "All changes discarded", type: "success" });
      await invalidateCache();
      refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addToast({ title: "Discard All Failed", description: message, type: "error" });
    }
  }, [workspacePath, readOnly, disableInteractions, refresh, addToast, invalidateCache]);

  const handleDiscardFiles = useCallback(
    async (filePath: string) => {
      if (readOnly || disableInteractions || !filePath) {
        return;
      }

      // If there are selected files and the clicked file is one of them, discard all selected files
      // Otherwise, discard just the clicked file
      const filesToDiscard = selectedUnstagedFiles.has(filePath) && selectedUnstagedFiles.size > 0
        ? Array.from(selectedUnstagedFiles)
        : [filePath];

      setFileActionTarget(filePath);
      try {
        await gitDiscardFiles(workspacePath, filesToDiscard);
        const count = filesToDiscard.length;
        const description = count === 1
          ? `${filesToDiscard[0]} discarded`
          : `${count} files discarded`;
        addToast({ title: "Discarded", description, type: "success" });

        // Clear selection after discarding
        setSelectedUnstagedFiles(new Set());

        await invalidateCache();
        refresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        addToast({ title: "Discard Failed", description: message, type: "error" });
      } finally {
        setFileActionTarget(null);
      }
    },
    [workspacePath, readOnly, disableInteractions, selectedUnstagedFiles, refresh, addToast, invalidateCache]
  );

  // Scroll to file in the diff container
  const scrollToFileIfNeeded = useCallback((fileIndex: number) => {
    const file = unstagedFiles[fileIndex];
    if (!file) return;

    const filePath = file.path;

    // Expand the file first
    setCollapsedFiles((prev) => {
      const next = new Set(prev);
      next.delete(filePath);
      return next;
    });

    // Find the element by ID and scroll to it within the container
    // Use setTimeout to wait for React to re-render after expanding
    const fileId = `file-section-${filePath.replace(/[^a-zA-Z0-9]/g, "-")}`;
    setTimeout(() => {
      const element = document.getElementById(fileId);
      const container = diffContainerRef.current;
      if (element && container) {
        // Calculate the element's position relative to the container
        const containerRect = container.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        const scrollTop = container.scrollTop + (elementRect.top - containerRect.top);
        container.scrollTo({ top: scrollTop, behavior: 'smooth' });
      }
    }, 50);
  }, [unstagedFiles]);

  // File selection handler - VSCode-style click selection
  const handleFileSelect = useCallback((path: string, event: React.MouseEvent) => {
    const fileIndex = unstagedFiles.findIndex(f => f.path === path);
    if (fileIndex === -1) return;

    const isMetaKey = event.metaKey || event.ctrlKey;
    const isShiftKey = event.shiftKey;

    setSelectedUnstagedFiles(prev => {
      const next = new Set(prev);

      if (isShiftKey && lastSelectedFileIndex !== null) {
        // Range selection - clear others and select range
        next.clear();
        const start = Math.min(lastSelectedFileIndex, fileIndex);
        const end = Math.max(lastSelectedFileIndex, fileIndex);
        for (let i = start; i <= end; i++) {
          next.add(unstagedFiles[i].path);
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
  }, [lastSelectedFileIndex, unstagedFiles, scrollToFileIfNeeded]);

  // Handler for when files are successfully moved to workspace
  const handleMoveToWorkspaceSuccess = useCallback((_workspaceInfo: {
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
  }, [refresh]);

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
    // In react-window v2, heights are recalculated automatically when rowHeight function changes
  }, []);

  // Line selection handlers for staging and comments
  const handleLineMouseDown = useCallback((
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
    setIsSelecting(true);
    setSelectionAnchor({ filePath, hunkIndex, lineIndex });
    setDiffLineSelection({
      filePath,
      lines: [{ hunkIndex, lineIndex, content: lineContent, isStaged }],
    });
    setContextMenuPosition(null);
  }, []);

  const handleLineMouseEnter = useCallback((
    filePath: string,
    hunkIndex: number,
    lineIndex: number,
    _lineContent: string,
    _isStaged: boolean
  ) => {
    if (!isSelecting || !selectionAnchor || selectionAnchor.filePath !== filePath) {
      return;
    }

    const fileData = allFileHunks.get(filePath);
    if (!fileData) return;

    const newLines: DiffLineSelection['lines'] = [];
    const minHunk = Math.min(selectionAnchor.hunkIndex, hunkIndex);
    const maxHunk = Math.max(selectionAnchor.hunkIndex, hunkIndex);

    for (let h = minHunk; h <= maxHunk; h++) {
      const hunk = fileData.hunks[h];
      if (!hunk) continue;

      const startLine = h === minHunk
        ? (selectionAnchor.hunkIndex === minHunk ? selectionAnchor.lineIndex : 0)
        : 0;
      const endLine = h === maxHunk
        ? (hunkIndex === maxHunk ? lineIndex : hunk.lines.length - 1)
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
            isStaged: hunk.is_staged,
          });
        }
      }
    }

    setDiffLineSelection({ filePath, lines: newLines });
  }, [isSelecting, selectionAnchor, allFileHunks]);

  const handleLineMouseUp = useCallback(() => {
    setIsSelecting(false);
  }, []);

  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    // Don't clear selection if clicking on a diff line or the comment button
    if ((e.target as HTMLElement).closest('[data-diff-line]') ||
        (e.target as HTMLElement).closest('[data-comment-button]')) {
      return;
    }
    setDiffLineSelection(null);
    setContextMenuPosition(null);
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (diffLineSelection && diffLineSelection.lines.length > 0) {
      e.preventDefault();
      setContextMenuPosition({ x: e.clientX, y: e.clientY });
    }
  }, [diffLineSelection]);

  const isLineSelected = useCallback((filePath: string, hunkIndex: number, lineIndex: number) => {
    if (!diffLineSelection || diffLineSelection.filePath !== filePath) {
      return false;
    }
    return diffLineSelection.lines.some(l => l.hunkIndex === hunkIndex && l.lineIndex === lineIndex);
  }, [diffLineSelection]);

  const handleStageSelectedLines = useCallback(async () => {
    if (!diffLineSelection || diffLineSelection.lines.length === 0 || readOnly || disableInteractions) {
      return;
    }

    const fileData = allFileHunks.get(diffLineSelection.filePath);
    if (!fileData) return;

    // Filter to only +/- lines that aren't already staged
    const unstagedLines = diffLineSelection.lines.filter(l =>
      !l.isStaged && (l.content.startsWith('+') || l.content.startsWith('-'))
    );
    if (unstagedLines.length === 0) {
      addToast({ title: "No unstaged lines", description: "Selected lines are already staged", type: "info" });
      return;
    }

    setStagingLines(true);
    try {
      const selections: LineSelectionPayload[] = unstagedLines.map(l => ({
        hunk_index: l.hunkIndex,
        line_index: l.lineIndex,
        content: l.content,
      }));

      const hunks: [string, string[]][] = fileData.hunks.map(h => [h.header, h.lines]);

      const metadataLines: string[] = [];
      const firstHunk = fileData.hunks[0];
      if (firstHunk?.patch) {
        const patchLines = firstHunk.patch.split('\n');
        for (const line of patchLines) {
          if (line.startsWith('@@')) break;
          metadataLines.push(line);
        }
      }

      await gitStageSelectedLines(
        workspacePath,
        diffLineSelection.filePath,
        selections,
        metadataLines,
        hunks
      );

      await invalidateCache();
      addToast({
        title: "Lines staged",
        description: `${unstagedLines.length} line${unstagedLines.length > 1 ? 's' : ''} staged`,
        type: "success",
      });
      setDiffLineSelection(null);
      setContextMenuPosition(null);
      refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addToast({ title: "Stage failed", description: message, type: "error" });
    } finally {
      setStagingLines(false);
    }
  }, [diffLineSelection, readOnly, disableInteractions, allFileHunks, workspacePath, addToast, refresh, invalidateCache]);

  const handleUnstageSelectedLines = useCallback(async () => {
    if (!diffLineSelection || diffLineSelection.lines.length === 0 || readOnly || disableInteractions) {
      return;
    }

    const fileData = allFileHunks.get(diffLineSelection.filePath);
    if (!fileData) return;

    // Filter to only +/- lines that are staged
    const stagedLines = diffLineSelection.lines.filter(l =>
      l.isStaged && (l.content.startsWith('+') || l.content.startsWith('-'))
    );
    if (stagedLines.length === 0) {
      addToast({ title: "No staged lines", description: "Selected lines are not staged", type: "info" });
      return;
    }

    setStagingLines(true);
    try {
      const selections: LineSelectionPayload[] = stagedLines.map(l => ({
        hunk_index: l.hunkIndex,
        line_index: l.lineIndex,
        content: l.content,
      }));

      const hunks: [string, string[]][] = fileData.hunks.map(h => [h.header, h.lines]);

      const metadataLines: string[] = [];
      const firstHunk = fileData.hunks[0];
      if (firstHunk?.patch) {
        const patchLines = firstHunk.patch.split('\n');
        for (const line of patchLines) {
          if (line.startsWith('@@')) break;
          metadataLines.push(line);
        }
      }

      await gitUnstageSelectedLines(
        workspacePath,
        diffLineSelection.filePath,
        selections,
        metadataLines,
        hunks
      );

      await invalidateCache();
      addToast({
        title: "Lines unstaged",
        description: `${stagedLines.length} line${stagedLines.length > 1 ? 's' : ''} unstaged`,
        type: "success",
      });
      setDiffLineSelection(null);
      setContextMenuPosition(null);
      refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addToast({ title: "Unstage failed", description: message, type: "error" });
    } finally {
      setStagingLines(false);
    }
  }, [diffLineSelection, readOnly, disableInteractions, allFileHunks, workspacePath, addToast, refresh, invalidateCache]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenuPosition(null);
        setDiffLineSelection(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const handleClickOutside = () => {
      setContextMenuPosition(null);
    };
    if (contextMenuPosition) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [contextMenuPosition]);

  // Comment management
  const addComment = useCallback((text: string) => {
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
    setShowCommentInput(false);
    setPendingComment(null);
    setDiffLineSelection(null);
    setContextMenuPosition(null);
  }, [pendingComment]);

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
    let lastHunkId = '';
    let lastLineIndex = 0;

    for (const line of diffLineSelection.lines) {
      const hunk = fileData.hunks[line.hunkIndex];
      if (!hunk) continue;

      const lineNumbers = computeHunkLineNumbers(hunk);
      const lineNum = lineNumbers[line.lineIndex]?.new ?? lineNumbers[line.lineIndex]?.old ?? line.lineIndex + 1;

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

      for (const [filePath, fileComments] of Object.entries(commentsByFile)) {
        for (const comment of fileComments) {
          // Line numbers are already 1-indexed actual file line numbers
          const lineRef = comment.startLine === comment.endLine
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
  const handleRequestChanges = useCallback(async () => {
    if (!terminalSessionId) {
      addToast({
        title: "No terminal",
        description: "Terminal session not available",
        type: "error",
      });
      return;
    }

    setSendingReview(true);
    try {
      const markdown = formatReviewMarkdown();
      await ptyWrite(terminalSessionId, markdown + "\n");
      addToast({
        title: "Review sent",
        description: "Code review sent to terminal",
        type: "success",
      });
      // Clear review state
      setComments([]);
      setFinalReviewComment("");
      setReviewPopoverOpen(false);
      // Notify parent that review was submitted
      onReviewSubmitted?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addToast({
        title: "Failed to send review",
        description: message,
        type: "error",
      });
    } finally {
      setSendingReview(false);
    }
  }, [terminalSessionId, formatReviewMarkdown, addToast, onReviewSubmitted]);

  const extractCommitHash = useCallback((output: string) => {
    const bracketMatch = output.match(/\[.+? ([0-9a-f]{7,})\]/i);
    if (bracketMatch && bracketMatch[1]) {
      return bracketMatch[1];
    }
    const looseMatch = output.match(/\b[0-9a-f]{7,40}\b/i);
    return looseMatch ? looseMatch[0] : null;
  }, []);

  const handleCommit = useCallback(async (commitMsg: string) => {
    if (!workspacePath) {
      addToast({
        title: "Missing Workspace",
        description: "Select a workspace before committing.",
        type: "error",
      });
      return;
    }

    if (!commitMsg) {
      addToast({ title: "Commit message", description: "Enter a commit message.", type: "error" });
      return;
    }

    if (commitMsg.length > 500) {
      addToast({ title: "Commit message", description: "Please keep the message under 500 characters.", type: "error" });
      return;
    }

    if (stagedFiles.length === 0) {
      addToast({ title: "No staged files", description: "Stage changes before committing.", type: "error" });
      return;
    }

    setCommitPending(true);
    try {
      const result = await gitCommit(workspacePath, commitMsg);
      const hash = extractCommitHash(result);
      await invalidateCache();
      addToast({
        title: "Commit created",
        description: hash ? `Created ${hash}` : result.trim() || "Commit successful",
        type: "success",
      });
      refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addToast({
        title: "Commit failed",
        description: message,
        type: "error",
      });
    } finally {
      setCommitPending(false);
    }
  }, [workspacePath, stagedFiles, addToast, extractCommitHash, refresh, invalidateCache]);

  const handleCommitAmend = useCallback(async (commitMsg: string) => {
    if (!workspacePath) {
      addToast({
        title: "Missing Workspace",
        description: "Select a workspace before amending.",
        type: "error",
      });
      return;
    }

    if (!commitMsg) {
      addToast({ title: "Commit message", description: "Enter a commit message.", type: "error" });
      return;
    }

    setActionPending('amend');
    try {
      const result = await gitCommitAmend(workspacePath, commitMsg);
      const hash = extractCommitHash(result);
      await invalidateCache();
      addToast({
        title: "Commit amended",
        description: hash ? `Amended to ${hash}` : result.trim() || "Amend successful",
        type: "success",
      });
      refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addToast({
        title: "Amend failed",
        description: message,
        type: "error",
      });
    } finally {
      setActionPending(null);
    }
  }, [workspacePath, addToast, extractCommitHash, refresh, invalidateCache]);

  const handleCommitAndPush = useCallback(async (commitMsg: string) => {
    if (!commitMsg || stagedFiles.length === 0) return;

    setActionPending('push');
    try {
      // First commit
      const commitResult = await gitCommit(workspacePath, commitMsg);
      const hash = extractCommitHash(commitResult);
      await invalidateCache();
      addToast({
        title: "Commit created",
        description: hash ? `Created ${hash}` : "Commit successful",
        type: "success",
      });

      // Then push
      await gitPush(workspacePath);
      addToast({
        title: "Pushed",
        description: "Changes pushed to remote",
        type: "success",
      });

      refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addToast({
        title: "Commit & Push failed",
        description: message,
        type: "error",
      });
    } finally {
      setActionPending(null);
    }
  }, [workspacePath, stagedFiles, addToast, extractCommitHash, refresh, invalidateCache]);

  const handleCommitAndSync = useCallback(async (commitMsg: string) => {
    if (!commitMsg || stagedFiles.length === 0) return;

    setActionPending('sync');
    try {
      // First commit
      const commitResult = await gitCommit(workspacePath, commitMsg);
      const hash = extractCommitHash(commitResult);
      await invalidateCache();
      addToast({
        title: "Commit created",
        description: hash ? `Created ${hash}` : "Commit successful",
        type: "success",
      });

      // Then pull
      await gitPull(workspacePath);
      await invalidateCache();
      addToast({
        title: "Pulled",
        description: "Changes pulled from remote",
        type: "success",
      });

      // Then push
      await gitPush(workspacePath);
      addToast({
        title: "Pushed",
        description: "Changes pushed to remote",
        type: "success",
      });

      refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addToast({
        title: "Commit & Sync failed",
        description: message,
        type: "error",
      });
    } finally {
      setActionPending(null);
    }
  }, [workspacePath, stagedFiles, addToast, extractCommitHash, refresh, invalidateCache]);

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

  // Get comments for a specific line in a specific hunk
  const getCommentsForLine = useCallback((filePath: string, hunkId: string, lineIndex: number) => {
    return comments.filter(
      (c) => c.filePath === filePath && c.hunkId === hunkId && lineIndex >= c.startLine && lineIndex <= c.endLine
    );
  }, [comments]);

  // Compact expand button component for inline use
  const CompactExpandButton = ({
    direction,
    onClick,
    isLoading,
    tooltip,
  }: {
    direction: 'up' | 'down';
    onClick: () => void;
    isLoading: boolean;
    tooltip: string;
  }) => {
    const Icon = direction === 'up' ? ChevronUp : ChevronDown;

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="w-full h-full flex flex-col items-center justify-center text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 transition-colors"
            disabled={isLoading}
            onClick={onClick}
          >
            {isLoading ? (
              <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                {direction === 'up' && <Icon className="w-2.5 h-2.5" />}
                <div className="flex gap-0.5">
                  <div className="w-0.5 h-0.5 rounded-full bg-blue-600 dark:bg-blue-400" />
                  <div className="w-0.5 h-0.5 rounded-full bg-blue-600 dark:bg-blue-400" />
                  <div className="w-0.5 h-0.5 rounded-full bg-blue-600 dark:bg-blue-400" />
                </div>
                {direction === 'down' && <Icon className="w-2.5 h-2.5" />}
              </>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{tooltip}</TooltipContent>
      </Tooltip>
    );
  };

  // Expanded lines component
  const ExpandedLines = ({
    ranges,
    language,
    fontSize,
  }: {
    ranges: ExpandedRange[];
    language: string | null;
    fontSize: number;
  }) => {
    return (
      <>
        {ranges.flatMap(range =>
          range.lines.map((line, idx) => {
            const lineNum = range.startLine + idx;
            return (
              <div key={`expanded-${range.startLine}-${idx}`} className="flex items-stretch">
                {/* Line numbers (both old and new) */}
                <div className="w-16 flex-shrink-0 text-muted-foreground select-none border-r border-border/40 flex items-center gap-1 px-1">
                  <span className="w-6 text-right" style={{ fontSize: `${fontSize}px` }}>{lineNum}</span>
                  <span className="w-6 text-right" style={{ fontSize: `${fontSize}px` }}>{lineNum}</span>
                </div>

                {/* Comment button spacer */}
                <div className="w-6 flex-shrink-0" />

                {/* Line prefix (context = space) */}
                <div className="w-5 flex-shrink-0 text-center text-muted-foreground/40 select-none">
                  {' '}
                </div>

                {/* Line content */}
                <div className="flex-1 px-2 py-0.5 whitespace-pre-wrap break-all font-mono" style={{ fontSize: `${fontSize}px` }}>
                  <HighlightedLine content={line} language={language} />
                </div>
              </div>
            );
          })
        )}
      </>
    );
  };

  // Render diff lines for a hunk (no collapsible, just lines with selection support)
  const renderHunkLines = (hunk: GitDiffHunk, hunkIndex: number, filePath: string) => {
    const lineNumbers = computeHunkLineNumbers(hunk);
    const language = getLanguageFromPath(filePath);

    const fileData = allFileHunks.get(filePath);
    const hunkRanges = expandedRanges.get(hunk.id) || { before: [], after: [] };

    // Check if we can expand more lines
    const beforeExpandInfo = fileData ? computeExpandableLines(
      hunk,
      'before',
      hunkRanges.before,
      fileData.hunks,
      hunkIndex
    ) : null;
    const afterExpandInfo = fileData ? computeExpandableLines(
      hunk,
      'after',
      hunkRanges.after,
      fileData.hunks,
      hunkIndex
    ) : null;

    const isLoadingBefore = loadingExpansions.has(`${hunk.id}-before`);
    const isLoadingAfter = loadingExpansions.has(`${hunk.id}-after`);

    return (
      <Fragment key={hunk.id}>
        {/* Expanded lines BEFORE hunk */}
        {hunkRanges.before.length > 0 && (
          <ExpandedLines
            ranges={hunkRanges.before}
            language={language}
            fontSize={diffFontSize}
          />
        )}

        {/* Hunk separator header with inline expand button */}
        <div
          className={cn(
            "flex items-stretch font-mono",
            hunk.is_staged ? "bg-emerald-500/10" : "bg-muted/60"
          )}
        >
          {/* Line number column with expand button */}
          <div className="w-16 flex-shrink-0 border-r border-border/40 flex items-center justify-center">
            <TooltipProvider>
              {beforeExpandInfo && (
                <CompactExpandButton
                  direction="up"
                  onClick={() => handleExpandLines(filePath, hunk, hunkIndex, 'before')}
                  isLoading={isLoadingBefore}
                  tooltip="Expand up"
                />
              )}
            </TooltipProvider>
          </div>

          {/* Comment button spacer */}
          <div className="w-6 flex-shrink-0" />

          {/* Line prefix spacer */}
          <div className="w-5 flex-shrink-0" />

          {/* Header text */}
          <div className="flex-1 flex items-center px-2 py-1">
            <span className="text-muted-foreground truncate">{hunk.header}</span>
            {hunk.is_staged && (
              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                Staged
              </span>
            )}
          </div>
        </div>
        {/* Hunk lines */}
        {hunk.lines.map((line, lineIndex) => {
          const lineComments = getCommentsForLine(filePath, hunk.id, lineIndex);
          const showCommentInputHere = showCommentInput &&
            pendingComment &&
            pendingComment.filePath === filePath &&
            pendingComment.hunkId === hunk.id &&
            lineIndex === pendingComment.displayAtLineIndex;
          const selected = isLineSelected(filePath, hunkIndex, lineIndex);
          const lineNum = lineNumbers[lineIndex];
          const actualLineNum = lineNum?.new ?? lineNum?.old ?? lineIndex + 1;

          return (
            <Fragment key={`${hunk.id}-line-${lineIndex}`}>
              <div
                data-diff-line
                className={cn(
                  "group flex items-stretch",
                  getLineTypeClass(line),
                  selected && "!bg-blue-500/30 ring-1 ring-inset ring-blue-500/50"
                )}
                onMouseEnter={() => handleLineMouseEnter(filePath, hunkIndex, lineIndex, line, hunk.is_staged)}
                onMouseUp={handleLineMouseUp}
              >
                {/* Line number / comment indicator - click here to select lines */}
                <div
                  className="w-16 flex-shrink-0 text-muted-foreground select-none border-r border-border/40 flex items-center gap-1 cursor-pointer hover:bg-muted/50"
                  onMouseDown={(e) => handleLineMouseDown(e, filePath, hunkIndex, lineIndex, line, hunk.is_staged)}
                >
                  {lineComments.length > 0 && (
                    <MessageSquare className="w-3 h-3 text-primary ml-1" />
                  )}
                  <span className="w-6 text-right" style={{ fontSize: `${diffFontSize}px` }}>{lineNum?.old ?? ''}</span>
                  <span className="w-6 text-right" style={{ fontSize: `${diffFontSize}px` }}>{lineNum?.new ?? ''}</span>
                </div>
                {/* Add comment button - shows on hover or when line is selected */}
                <div className="w-6 flex-shrink-0 flex items-center justify-center select-none">
                  <button
                    data-comment-button
                    className={cn(
                      "p-0.5 rounded bg-primary text-primary-foreground hover:bg-primary/90",
                      selected ? "visible" : "invisible group-hover:visible"
                    )}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      // If there are selected lines, use those; otherwise use single line
                      if (diffLineSelection && diffLineSelection.lines.length > 0) {
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
                    title={diffLineSelection && diffLineSelection.lines.length > 1 ? "Add comment to selected lines" : "Add comment"}
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
                {/* Line prefix (+/-/space) */}
                <div className="w-5 flex-shrink-0 text-center select-none">
                  {getLinePrefix(line)}
                </div>
                {/* Line content - selectable for copying */}
                <div className="flex-1 px-2 py-0.5 whitespace-pre-wrap break-all">
                  <HighlightedLine content={line.substring(1) || " "} language={language} />
                </div>
              </div>

              {/* Inline comments display */}
              {lineComments.length > 0 && lineIndex === lineComments[0].endLine && (
                <div className="bg-muted/60 border-y border-border/40 px-4 py-2 space-y-2">
                  {lineComments.map((comment) => (
                    <div key={comment.id} className="bg-background rounded-md p-3 border border-border/60">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm whitespace-pre-wrap flex-1">{comment.text}</p>
                        <button
                          onClick={() => deleteComment(comment.id)}
                          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                          title="Delete comment"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
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

        {/* Expanded lines AFTER hunk */}
        {hunkRanges.after.length > 0 && (
          <ExpandedLines
            ranges={hunkRanges.after}
            language={language}
            fontSize={diffFontSize}
          />
        )}

        {/* Expand DOWN button integrated in a row */}
        {afterExpandInfo && (
          <div
            className={cn(
              "flex items-stretch font-mono",
              hunk.is_staged ? "bg-emerald-500/10" : "bg-muted/60"
            )}
          >
            {/* Line number column with expand button */}
            <div className="w-16 flex-shrink-0 border-r border-border/40 flex items-center justify-center">
              <TooltipProvider>
                <CompactExpandButton
                  direction="down"
                  onClick={() => handleExpandLines(filePath, hunk, hunkIndex, 'after')}
                  isLoading={isLoadingAfter}
                  tooltip="Expand down"
                />
              </TooltipProvider>
            </div>

            {/* Comment button spacer */}
            <div className="w-6 flex-shrink-0" />

            {/* Line prefix spacer */}
            <div className="w-5 flex-shrink-0" />

            {/* Empty content area */}
            <div className="flex-1 px-2 py-1" />
          </div>
        )}
      </Fragment>
    );
  };

  // Render all diffs for a single file
  const renderFileDiffs = (filePath: string, fileData: FileHunksData, fileMeta: ParsedFileChange | undefined) => {
    const isCollapsed = collapsedFiles.has(filePath);
    const isViewed = viewedFiles.has(filePath);
    const fileId = `file-section-${filePath.replace(/[^a-zA-Z0-9]/g, "-")}`;

    // Compute line stats from hunks
    let additions = 0;
    let deletions = 0;
    if (!fileData.isLoading && fileData.hunks) {
      for (const hunk of fileData.hunks) {
        for (const line of hunk.lines) {
          if (line.startsWith('+')) additions++;
          else if (line.startsWith('-')) deletions++;
        }
      }
    }

    return (
      <div key={filePath} id={fileId} data-file-path={filePath} className="border border-border rounded-lg overflow-hidden">
        {/* File Header */}
        <div
          className="sticky top-0 z-10 flex items-center justify-between px-4 py-2 bg-muted cursor-pointer hover:bg-muted/80 border-b border-border"
          onClick={() => toggleFileCollapse(filePath)}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {isCollapsed ? (
              <ChevronRight className="w-3 h-3 flex-shrink-0" />
            ) : (
              <ChevronDown className="w-3 h-3 flex-shrink-0" />
            )}
            <div className="min-w-0 flex-1 flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground truncate">{filePath}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(filePath);
                  addToast({ title: "Copied", description: "File path copied to clipboard", type: "success" });
                }}
                className="text-muted-foreground hover:text-foreground flex-shrink-0"
                title="Copy file path"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Viewed checkbox */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (isViewed) {
                  handleUnmarkFileViewed(filePath);
                } else {
                  handleMarkFileViewed(filePath);
                }
              }}
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors",
                isViewed
                  ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/30"
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
              <span className="text-xs px-2 py-0.5 rounded bg-zinc-500/20 text-zinc-600 dark:text-zinc-400">
                Binary
              </span>
            )}
            {(additions > 0 || deletions > 0) && (
              <span className="text-xs font-mono flex items-center gap-1">
                <span className="text-emerald-600 dark:text-emerald-400">+{additions}</span>
                <span className="text-red-600 dark:text-red-400">-{deletions}</span>
              </span>
            )}
            {!readOnly && !disableInteractions && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <button className="p-1 rounded hover:bg-accent">
                    <MoreVertical className="w-3 h-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={4}>
                  {fileMeta?.workspaceStatus && (
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        handleStageFile(filePath);
                      }}
                      disabled={fileActionTarget === filePath}
                    >
                      Stage file
                    </DropdownMenuItem>
                  )}
                  {fileMeta?.stagedStatus && (
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        handleUnstageFile(filePath);
                      }}
                      disabled={fileActionTarget === filePath}
                    >
                      Unstage file
                    </DropdownMenuItem>
                  )}
                  {(fileMeta?.workspaceStatus || fileMeta?.stagedStatus) && (
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        handleDiscardFiles(filePath);
                      }}
                      disabled={fileActionTarget === filePath}
                      className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
                    >
                      {selectedUnstagedFiles.has(filePath) && selectedUnstagedFiles.size > 1
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
                        const msg = err instanceof Error ? err.message : String(err);
                        addToast({ title: "Open Failed", description: msg, type: "error" });
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
            className="bg-background font-mono"
            style={{ fontSize: `${diffFontSize}px` }}
            onContextMenu={handleContextMenu}
            onClick={handleContainerClick}
          >
            {isBinaryFile(filePath) ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <FileText className="w-5 h-5 mr-2 opacity-50" />
                <span>Binary file - no diff available</span>
              </div>
            ) : fileData.isLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Loading diff...
              </div>
            ) : fileData.error ? (
              <div className="text-sm text-destructive px-3 py-2">{fileData.error}</div>
            ) : fileData.hunks.length === 0 ? (
              <div className="text-sm text-muted-foreground px-3 py-6 text-center">
                No diff hunks available
              </div>
            ) : fileData.hunks.length > 10 ? (
              // Virtualize for files with many hunks
              <List
                style={{ height: Math.min(fileData.hunks.length * 150, 2000), width: "100%" }}
                rowCount={fileData.hunks.length}
                rowHeight={(index: number) => {
                  const hunk = fileData.hunks[index];
                  const expandedBefore = expandedRanges.get(hunk.id)?.before || [];
                  const expandedAfter = expandedRanges.get(hunk.id)?.after || [];
                  const totalLines = hunk.lines.length +
                    expandedBefore.reduce((sum, r) => sum + r.lines.length, 0) +
                    expandedAfter.reduce((sum, r) => sum + r.lines.length, 0);
                  // Estimate: line height ~24px, hunk header ~32px, expand buttons ~28px each
                  const lineHeight = diffFontSize + 8;
                  return (totalLines * lineHeight) + 32 + 56; // header + 2 expand buttons
                }}
                rowComponent={({ index, style }: { index: number; style: React.CSSProperties }) => (
                  <div key={fileData.hunks[index].id} style={style}>
                    {renderHunkLines(fileData.hunks[index], index, filePath)}
                  </div>
                )}
                rowProps={{}}
              />
            ) : (
              // Render directly for files with few hunks
              fileData.hunks.map((hunk, hunkIndex) => renderHunkLines(hunk, hunkIndex, filePath))
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full overflow-hidden">
      <div className="w-72 border-r border-border bg-sidebar flex flex-col">
        <CommitInput
          ref={commitInputRef}
          onCommit={handleCommit}
          onCommitAmend={handleCommitAmend}
          onCommitAndPush={handleCommitAndPush}
          onCommitAndSync={handleCommitAndSync}
          stagedFilesCount={stagedFiles.length}
          disabled={readOnly || disableInteractions}
          pending={commitPending}
          actionPending={actionPending}
          onRefresh={refresh}
        />
        <div className="flex-1 overflow-y-auto px-4 pb-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full">
          {stagedFiles.length === 0 && unstagedFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <CheckCircle2 className="w-12 h-12 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No changes</p>
            </div>
          ) : (
            <>
              {stagedFiles.length > 0 && (
                <GitChangesSection
                  title="Staged Changes"
                  files={stagedFiles}
                  isStaged={true}
                  isCollapsed={collapsedSections.has("staged")}
                  onToggleCollapse={() => toggleSectionCollapse("staged")}
                  fileActionTarget={fileActionTarget}
                  readOnly={readOnly || disableInteractions}
                  activeFilePath={activeFilePath}
                  onUnstage={handleUnstageFile}
                  onUnstageAll={handleUnstageAll}
                />
              )}
              <GitChangesSection
                title="Changes"
                files={unstagedFiles}
                isStaged={false}
                isCollapsed={collapsedSections.has("unstaged")}
                onToggleCollapse={() => toggleSectionCollapse("unstaged")}
                fileActionTarget={fileActionTarget}
                readOnly={readOnly || disableInteractions}
                activeFilePath={activeFilePath}
                selectedFiles={selectedUnstagedFiles}
                onFileSelect={handleFileSelect}
                onMoveToWorkspace={() => setMoveDialogOpen(true)}
                onStage={handleStageFile}
                onStageAll={handleStageAll}
                onDiscardAll={handleDiscardAll}
              />
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
                {comments.length} comment{comments.length !== 1 ? "s" : ""} pending
              </span>
            </div>
            <Popover open={reviewPopoverOpen} onOpenChange={setReviewPopoverOpen}>
              <PopoverTrigger asChild>
                <Button size="sm" variant="default" className="gap-2">
                  <Send className="w-3 h-3" />
                  Finish review
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" side="bottom" className="w-80">
                <div className="space-y-3">
                  <div>
                    <h4 className="font-medium text-sm mb-1">Finish your review</h4>
                    <p className="text-xs text-muted-foreground">
                      {comments.length} comment{comments.length !== 1 ? "s" : ""} will be submitted.
                    </p>
                  </div>
                  <Textarea
                    value={finalReviewComment}
                    onChange={(e) => setFinalReviewComment(e.target.value)}
                    placeholder="Add a summary comment (optional)..."
                    className="min-h-[80px] text-sm"
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setReviewPopoverOpen(false)}
                      disabled={sendingReview}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleRequestChanges}
                      disabled={sendingReview}
                      className="gap-1.5"
                    >
                      {sendingReview ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Send className="w-3 h-3" />
                      )}
                      Request changes
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        )}

        {/* Stale Files Warning Banner - shown when files changed during review */}
        {staleFiles.size > 0 && (
          <div className="flex items-center justify-between px-4 py-2 bg-amber-500/10 border-b border-amber-500/30">
            <div className="flex items-center gap-2 text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span className="text-amber-700 dark:text-amber-300">
                {staleFiles.size} file{staleFiles.size !== 1 ? "s" : ""} changed since you started reviewing
              </span>
              <span className="text-xs text-amber-600/70 dark:text-amber-400/70">
                ({Array.from(staleFiles).slice(0, 3).join(", ")}{staleFiles.size > 3 ? ` +${staleFiles.size - 3} more` : ""})
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-amber-500/50 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20"
              onClick={handleReloadWithPendingChanges}
            >
              <RefreshCw className="w-3 h-3" />
              Reload
            </Button>
          </div>
        )}

        {/* All Files Diffs - Virtualized */}
        <div className="flex-1 overflow-hidden">
          {loadingAllHunks ? (
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
            <div ref={diffContainerRef} className="h-full overflow-y-auto p-4 space-y-6">
              {files.map((file) => {
                const fileData = allFileHunks.get(file.path);
                if (!fileData) return null;
                return (
                  <div key={file.path}>
                    {renderFileDiffs(file.path, fileData, file)}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Context Menu for Line Selection */}
      {contextMenuPosition && diffLineSelection && diffLineSelection.lines.length > 0 && (
        <div
          className="fixed z-50 bg-popover border border-border rounded-md shadow-lg py-1 min-w-[180px]"
          style={{ left: contextMenuPosition.x, top: contextMenuPosition.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {diffLineSelection.lines.some(l => !l.isStaged && (l.content.startsWith('+') || l.content.startsWith('-'))) && (
            <button
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent flex items-center gap-2 disabled:opacity-50"
              onClick={handleStageSelectedLines}
              disabled={stagingLines}
            >
              {stagingLines ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Stage selected lines
            </button>
          )}
          {diffLineSelection.lines.some(l => l.isStaged && (l.content.startsWith('+') || l.content.startsWith('-'))) && (
            <button
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent flex items-center gap-2 disabled:opacity-50"
              onClick={handleUnstageSelectedLines}
              disabled={stagingLines}
            >
              {stagingLines ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Minus className="w-4 h-4" />
              )}
              Unstage selected lines
            </button>
          )}
          <button
            className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent flex items-center gap-2"
            onClick={handleAddCommentFromSelection}
          >
            <MessageSquare className="w-4 h-4" />
            Add comment
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
}));

StagingDiffViewer.displayName = "StagingDiffViewer";
