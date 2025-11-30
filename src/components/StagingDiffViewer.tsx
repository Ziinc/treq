import { memo, useCallback, useEffect, useMemo, useRef, useState, Fragment, forwardRef, useImperativeHandle } from "react";
import { type KeyboardEvent as ReactKeyboardEvent } from "react";
import { openPath } from "@tauri-apps/plugin-opener";
import { v4 as uuidv4 } from "uuid";
import { List, type ListImperativeAPI, type RowComponentProps } from "react-window";
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
  formatFileLabel,
  statusLabel,
  filterStagedFiles,
  filterUnstagedFiles,
  isBinaryFile,
  type ParsedFileChange,
} from "../lib/git-utils";
import { useDiffSettings } from "../hooks/useDiffSettings";
import { GitChangesSection } from "./GitChangesSection";
import { MoveToWorktreeDialog } from "./MoveToWorktreeDialog";

// Helper to compute hash of hunk content using native Web Crypto API
const computeHunkHash = async (hunks: any[]): Promise<string> => {
  const content = hunks.map(h => h.lines.join('\n')).join('\n');
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
};

interface StagingDiffViewerProps {
  worktreePath: string;
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
        a[i].worktreeStatus !== b[i].worktreeStatus ||
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
  } catch (error) {
    console.debug("failed to parse cached string array", error);
  }
  return null;
};

const parseCachedHunks = (raw: string): GitDiffHunk[] | null => {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed as GitDiffHunk[];
    }
  } catch (error) {
    console.debug("failed to parse cached hunks", error);
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

// Virtualization height constants
const FILE_HEADER_HEIGHT = 48;
const HUNK_HEADER_HEIGHT = 28;
const LINE_HEIGHT = 24;
const LOADING_HEIGHT = 60;
const COMMENT_INPUT_HEIGHT = 140;
const COMMENT_DISPLAY_HEIGHT = 120;
const ROW_PADDING_BOTTOM = 16; // pb-4 class = 1rem = 16px

// Isolated comment input component to prevent parent re-renders during typing
interface CommentInputProps {
  onSubmit: (text: string) => void;
  onCancel: () => void;
  filePath?: string;
  startLine?: number;
  endLine?: number;
  lineContents?: string[];
}

const CommentInput: React.FC<CommentInputProps> = memo(({
  onSubmit,
  onCancel,
  filePath,
  startLine,
  endLine,
  lineContents,
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
    <div className="bg-muted/60 border-y border-border/40 px-4 py-3">
      {(lineLabel || lineContents) && (
        <div className="mb-2 text-xs text-muted-foreground">
          {filePath && lineLabel && (
            <span className="font-mono">{filePath}:{lineLabel}</span>
          )}
          {lineContents && lineContents.length > 0 && (
            <div className="mt-1 bg-background/50 rounded border border-border/40 p-2 max-h-[100px] overflow-auto">
              <pre className="font-mono text-[11px] whitespace-pre-wrap">{lineContents.join('\n')}</pre>
            </div>
          )}
        </div>
      )}
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add a comment..."
        className="mb-2 text-sm"
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
  worktreePath,
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
  const listRef = useRef<ListImperativeAPI | null>(null);
  const prevFilePathsRef = useRef<string[]>([]);

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

  // Track content hash when comment input is shown
  const commentInputFileHashRef = useRef<string | null>(null);

  // Viewed files state - maps file path to { viewed_at, content_hash }
  const [viewedFiles, setViewedFiles] = useState<Map<string, { viewedAt: string; contentHash: string }>>(new Map());

  // File selection state for moving to worktree
  const [selectedUnstagedFiles, setSelectedUnstagedFiles] = useState<Set<string>>(new Set());
  const [lastSelectedFileIndex, setLastSelectedFileIndex] = useState<number | null>(null);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);

  // Expanded context lines state
  const [expandedRanges, setExpandedRanges] = useState<
    Map<string, { before: ExpandedRange[]; after: ExpandedRange[] }>
  >(new Map());
  const [loadingExpansions, setLoadingExpansions] = useState<Set<string>>(new Set());

  const stagedFiles = useMemo(() => filterStagedFiles(files), [files]);
  const unstagedFiles = useMemo(() => filterUnstagedFiles(files), [files]);

  const applyChangedFiles = useCallback((parsed: ParsedFileChange[]) => {
    setFiles((prev) => {
      if (filesEqual(prev, parsed)) return prev; // Skip if unchanged
      return parsed;
    });

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
  }, [initialSelectedFile, onStagedFilesChange]);

  const invalidateCache = useCallback(async () => {
    if (!worktreePath) {
      return;
    }
    try {
      await invalidateGitCache(worktreePath);
    } catch (error) {
      console.debug("git cache invalidate failed", worktreePath, error);
    }
  }, [worktreePath]);

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

      // Can we expand 5 more lines?
      const targetStart = Math.max(1, lowestExpanded - 5);
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
        // Last hunk - allow expanding 5 lines (will be capped by file length)
        maxLine = highestExpanded + 5;
      }

      const targetStart = highestExpanded + 1;
      const targetEnd = Math.min(highestExpanded + 5, maxLine);

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
        worktreePath,
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
  }, [worktreePath, allFileHunks, expandedRanges, computeExpandableLines, addToast]);

  // Calculate height for a file section in the virtualized list
  const getFileHeight = useCallback((index: number): number => {
    const file = files[index];
    if (!file) return FILE_HEADER_HEIGHT + ROW_PADDING_BOTTOM;

    // If file is collapsed, just return header height
    if (collapsedFiles.has(file.path)) {
      return FILE_HEADER_HEIGHT + ROW_PADDING_BOTTOM;
    }

    const fileData = allFileHunks.get(file.path);

    // If loading or no data, return header + loading indicator
    if (!fileData || fileData.isLoading) {
      return FILE_HEADER_HEIGHT + LOADING_HEIGHT + ROW_PADDING_BOTTOM;
    }

    // If error or no hunks, return header + empty state
    if (fileData.error || fileData.hunks.length === 0) {
      return FILE_HEADER_HEIGHT + 60 + ROW_PADDING_BOTTOM;
    }

    // Calculate expanded height: header + hunks
    let height = FILE_HEADER_HEIGHT;

    for (let hunkIdx = 0; hunkIdx < fileData.hunks.length; hunkIdx++) {
      const hunk = fileData.hunks[hunkIdx];
      const hunkRanges = expandedRanges.get(hunk.id) || { before: [], after: [] };

      // Check for expand button BEFORE
      const beforeExpandInfo = computeExpandableLines(
        hunk,
        'before',
        hunkRanges.before,
        fileData.hunks,
        hunkIdx
      );
      if (beforeExpandInfo) {
        height += LINE_HEIGHT; // Button height
      }

      // Add height for expanded lines BEFORE
      const beforeLineCount = hunkRanges.before.reduce(
        (sum, range) => sum + range.lines.length,
        0
      );
      height += beforeLineCount * LINE_HEIGHT;

      height += HUNK_HEADER_HEIGHT; // Hunk header
      height += hunk.lines.length * LINE_HEIGHT; // Lines in hunk

      // Check for comments on lines in this hunk
      for (let lineIndex = 0; lineIndex < hunk.lines.length; lineIndex++) {
        const lineComments = comments.filter(
          c => c.filePath === file.path && c.hunkId === hunk.id &&
               lineIndex >= c.startLine && lineIndex <= c.endLine
        );
        if (lineComments.length > 0 && lineIndex === lineComments[0].endLine) {
          height += COMMENT_DISPLAY_HEIGHT * lineComments.length;
        }

        // Check for comment input
        if (showCommentInput && pendingComment?.filePath === file.path &&
            pendingComment?.hunkId === hunk.id && lineIndex === pendingComment.displayAtLineIndex) {
          height += COMMENT_INPUT_HEIGHT;
        }
      }

      // Add height for expanded lines AFTER
      const afterLineCount = hunkRanges.after.reduce(
        (sum, range) => sum + range.lines.length,
        0
      );
      height += afterLineCount * LINE_HEIGHT;

      // Check for expand button AFTER
      const afterExpandInfo = computeExpandableLines(
        hunk,
        'after',
        hunkRanges.after,
        fileData.hunks,
        hunkIdx
      );
      if (afterExpandInfo) {
        height += LINE_HEIGHT; // Button height
      }
    }

    return height + ROW_PADDING_BOTTOM;
  }, [files, collapsedFiles, allFileHunks, comments, showCommentInput, pendingComment, expandedRanges, computeExpandableLines]);

  const loadChangedFiles = useCallback(async () => {
    if (!worktreePath) {
      setFiles([]);
      return;
    }

    let cachedEntries: string[] | null = null;

    try {
      const cached = await getGitCache(worktreePath, "changed_files");
      if (cached?.data) {
        const parsedCache = parseCachedStrings(cached.data);
        if (parsedCache) {
          cachedEntries = parsedCache;
          const parsed = parseChangedFiles(parsedCache);
          applyChangedFiles(parsed);
        }
      }
    } catch (error) {
      console.debug("failed to get git cache", worktreePath, error);
    }

    try {
      const changedFiles = await gitGetChangedFiles(worktreePath);
      const parsed = parseChangedFiles(changedFiles);
      if (!arraysEqual(cachedEntries, changedFiles)) {
        applyChangedFiles(parsed);
      }
      setGitCache(worktreePath, "changed_files", changedFiles).catch((error) => {
        console.debug("failed to cache changed files", worktreePath, error);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addToast({ title: "Git Error", description: message, type: "error" });
    }
  }, [worktreePath, addToast, applyChangedFiles]);

  useEffect(() => {
    loadChangedFiles();
  }, [loadChangedFiles, refreshSignal, manualRefreshKey]);

  // Load viewed files from database
  const loadViewedFiles = useCallback(async () => {
    if (!worktreePath) {
      setViewedFiles(new Map());
      return;
    }

    try {
      const views = await getViewedFiles(worktreePath);
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
    } catch (error) {
      console.debug("Failed to load viewed files", error);
    }
  }, [worktreePath]);

  useEffect(() => {
    loadViewedFiles();
  }, [loadViewedFiles]);

  // Reset expanded lines when files change
  useEffect(() => {
    setExpandedRanges(new Map());
    setLoadingExpansions(new Set());
  }, [files, manualRefreshKey]);

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
      unmarkFileViewed(worktreePath, filePath).catch((err) => {
        console.debug("Failed to unmark stale viewed file", filePath, err);
      });
    }
  }, [files, allFileHunks, worktreePath]);

  // Detect file content changes while comment input is open
  useEffect(() => {
    if (!showCommentInput || !pendingComment) {
      commentInputFileHashRef.current = null;
      return;
    }

    const fileData = allFileHunks.get(pendingComment.filePath);
    if (!fileData?.hunks) {
      // File was removed
      addToast({
        title: "File changed",
        description: "The file has been modified or removed. Your comment input has been closed.",
        type: "warning",
      });
      setShowCommentInput(false);
      setPendingComment(null);
      commentInputFileHashRef.current = null;
      return;
    }

    // Compare hashes asynchronously
    const previousHash = commentInputFileHashRef.current;
    if (previousHash) {
      computeHunkHash(fileData.hunks).then(currentHash => {
        if (currentHash !== previousHash) {
          // Content changed
          addToast({
            title: "File content changed",
            description: "The file has been modified. Your comment input has been closed.",
            type: "warning",
          });
          setShowCommentInput(false);
          setPendingComment(null);
          commentInputFileHashRef.current = null;
        }
      });
    }
  }, [showCommentInput, pendingComment, allFileHunks, addToast]);

  const handleMarkFileViewed = useCallback(
    async (filePath: string) => {
      if (!worktreePath) return;

      // Compute hash from current hunks
      const fileData = allFileHunks.get(filePath);
      const contentHash = fileData?.hunks ? computeHunksHash(fileData.hunks) : "";

      try {
        await markFileViewed(worktreePath, filePath, contentHash);
        const now = new Date().toISOString();
        setViewedFiles((prev) => new Map(prev).set(filePath, { viewedAt: now, contentHash }));
        // Collapse the file
        setCollapsedFiles((prev) => new Set(prev).add(filePath));
      } catch (error) {
        console.debug("Failed to mark file as viewed", filePath, error);
      }
    },
    [worktreePath, allFileHunks]
  );

  const handleUnmarkFileViewed = useCallback(
    async (filePath: string) => {
      if (!worktreePath) return;

      try {
        await unmarkFileViewed(worktreePath, filePath);
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
      } catch (error) {
        console.debug("Failed to unmark file as viewed", filePath, error);
      }
    },
    [worktreePath]
  );

  const loadAllFileHunks = useCallback(
    async (filesToLoad: ParsedFileChange[]) => {
      if (!worktreePath || filesToLoad.length === 0) {
        setAllFileHunks((prev) => prev.size === 0 ? prev : new Map());
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
            const cache = await getGitCache(worktreePath, "file_hunks", file.path);
            if (cache?.data) {
              const hunks = parseCachedHunks(cache.data);
              if (hunks) {
                cachedHunks.set(file.path, hunks);
                hunksMap.set(file.path, { filePath: file.path, hunks, isLoading: false });
              }
            }
          } catch (error) {
            console.debug("failed to read cached file hunks", file.path, error);
          }
        })
      );

      // Set loading state only for uncached files
      filesToLoad.forEach((file) => {
        if (!hunksMap.has(file.path)) {
          hunksMap.set(file.path, { filePath: file.path, hunks: [], isLoading: true });
        }
      });

      // Update with cached data (only if needed)
      if (cachedHunks.size > 0) {
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
              const hunks = await gitGetFileHunks(worktreePath, file.path);
              return { filePath: file.path, hunks, error: null as string | null };
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              return { filePath: file.path, hunks: [] as GitDiffHunk[], error: message };
            }
          })
        );

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
              setGitCache(worktreePath, "file_hunks", result.hunks, result.filePath).catch(console.debug);
            }
          }

          return hasChanges ? next : prev;
        });
      } finally {
        setLoadingAllHunks(false);
      }
    },
    [worktreePath]
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
    if (!worktreePath) {
      return;
    }

    const pollGitChanges = async () => {
      try {
        await invalidateCache();
        setManualRefreshKey((prev) => prev + 1);
      } catch (error) {
        console.debug("Git polling failed", error);
      }
    };

    // Poll every 5 seconds
    const interval = setInterval(pollGitChanges, 5000);

    return () => clearInterval(interval);
  }, [worktreePath, invalidateCache]);

  const refresh = useCallback(() => {
    setManualRefreshKey((prev) => prev + 1);
  }, []);

  const handleStageFile = useCallback(
    async (filePath: string) => {
      if (readOnly || disableInteractions || !filePath) {
        return;
      }
      setFileActionTarget(filePath);
      try {
        await gitStageFile(worktreePath, filePath);
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
    [worktreePath, readOnly, disableInteractions, refresh, addToast, invalidateCache]
  );

  const handleUnstageFile = useCallback(
    async (filePath: string) => {
      if (readOnly || disableInteractions || !filePath) {
        return;
      }
      setFileActionTarget(filePath);
      try {
        await gitUnstageFile(worktreePath, filePath);
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
    [worktreePath, readOnly, disableInteractions, refresh, addToast, invalidateCache]
  );

  const handleStageAll = useCallback(async () => {
    if (readOnly || disableInteractions) return;
    try {
      await gitAddAll(worktreePath);
      addToast({ title: "Staged", description: "All changes staged", type: "success" });
      await invalidateCache();
      refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addToast({ title: "Stage All Failed", description: message, type: "error" });
    }
  }, [worktreePath, readOnly, disableInteractions, refresh, addToast, invalidateCache]);

  const handleUnstageAll = useCallback(async () => {
    if (readOnly || disableInteractions) return;
    try {
      await gitUnstageAll(worktreePath);
      addToast({ title: "Unstaged", description: "All changes unstaged", type: "success" });
      await invalidateCache();
      refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addToast({ title: "Unstage All Failed", description: message, type: "error" });
    }
  }, [worktreePath, readOnly, disableInteractions, refresh, addToast, invalidateCache]);

  const handleDiscardAll = useCallback(async () => {
    if (readOnly || disableInteractions) return;
    try {
      await gitDiscardAllChanges(worktreePath);
      addToast({ title: "Discarded", description: "All changes discarded", type: "success" });
      await invalidateCache();
      refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addToast({ title: "Discard All Failed", description: message, type: "error" });
    }
  }, [worktreePath, readOnly, disableInteractions, refresh, addToast, invalidateCache]);

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
        await gitDiscardFiles(worktreePath, filesToDiscard);
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
    [worktreePath, readOnly, disableInteractions, selectedUnstagedFiles, refresh, addToast, invalidateCache]
  );

  // Smart scroll function - only scrolls if file not visible in viewport
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

    // Smart scroll - only scroll if element not currently visible
    requestAnimationFrame(() => {
      const fileId = `file-section-${filePath.replace(/[^a-zA-Z0-9]/g, "-")}`;
      const element = document.getElementById(fileId);
      if (!element) return;

      const rect = element.getBoundingClientRect();
      const viewportHeight = window.innerHeight;

      // Check if element is visible in viewport
      const isVisible = rect.top >= 0 && rect.top < viewportHeight;

      // Only scroll if not visible
      if (!isVisible) {
        element.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
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

  // Handler for when files are successfully moved to worktree
  const handleMoveToWorktreeSuccess = useCallback((_worktreeInfo: {
    id: number;
    worktreePath: string;
    branchName: string;
    metadata: string;
  }) => {
    setMoveDialogOpen(false);
    setSelectedUnstagedFiles(new Set());
    setLastSelectedFileIndex(null);
    refresh();
    // Note: Navigation to the new worktree session is handled by the parent component
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
    if ((e.target as HTMLElement).closest('[data-diff-line]')) {
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
        worktreePath,
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
  }, [diffLineSelection, readOnly, disableInteractions, allFileHunks, worktreePath, addToast, refresh, invalidateCache]);

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
        worktreePath,
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
  }, [diffLineSelection, readOnly, disableInteractions, allFileHunks, worktreePath, addToast, refresh, invalidateCache]);

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

    // Set initial hash for change detection
    if (fileData.hunks) {
      computeHunkHash(fileData.hunks).then(hash => {
        commentInputFileHashRef.current = hash;
      });
    }
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
    if (!worktreePath) {
      addToast({
        title: "Missing Worktree",
        description: "Select a worktree before committing.",
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
      const result = await gitCommit(worktreePath, commitMsg);
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
  }, [worktreePath, stagedFiles, addToast, extractCommitHash, refresh, invalidateCache]);

  const handleCommitAmend = useCallback(async (commitMsg: string) => {
    if (!worktreePath) {
      addToast({
        title: "Missing Worktree",
        description: "Select a worktree before amending.",
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
      const result = await gitCommitAmend(worktreePath, commitMsg);
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
  }, [worktreePath, addToast, extractCommitHash, refresh, invalidateCache]);

  const handleCommitAndPush = useCallback(async (commitMsg: string) => {
    if (!commitMsg || stagedFiles.length === 0) return;

    setActionPending('push');
    try {
      // First commit
      const commitResult = await gitCommit(worktreePath, commitMsg);
      const hash = extractCommitHash(commitResult);
      await invalidateCache();
      addToast({
        title: "Commit created",
        description: hash ? `Created ${hash}` : "Commit successful",
        type: "success",
      });

      // Then push
      await gitPush(worktreePath);
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
  }, [worktreePath, stagedFiles, addToast, extractCommitHash, refresh, invalidateCache]);

  const handleCommitAndSync = useCallback(async (commitMsg: string) => {
    if (!commitMsg || stagedFiles.length === 0) return;

    setActionPending('sync');
    try {
      // First commit
      const commitResult = await gitCommit(worktreePath, commitMsg);
      const hash = extractCommitHash(commitResult);
      await invalidateCache();
      addToast({
        title: "Commit created",
        description: hash ? `Created ${hash}` : "Commit successful",
        type: "success",
      });

      // Then pull
      await gitPull(worktreePath);
      await invalidateCache();
      addToast({
        title: "Pulled",
        description: "Changes pulled from remote",
        type: "success",
      });

      // Then push
      await gitPush(worktreePath);
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
  }, [worktreePath, stagedFiles, addToast, extractCommitHash, refresh, invalidateCache]);

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

  // Expand button component
  const ExpandButton = ({
    direction,
    lineCount,
    onClick,
    isLoading,
  }: {
    direction: 'up' | 'down';
    lineCount: number;
    onClick: () => void;
    isLoading: boolean;
  }) => {
    const Icon = direction === 'up' ? ChevronUp : ChevronDown;

    return (
      <div
        className="flex items-center bg-blue-500/5 hover:bg-blue-500/10 cursor-pointer transition-colors"
        onClick={onClick}
      >
        {/* Line number column */}
        <div className="w-16 flex-shrink-0 border-r border-border/40 flex items-center justify-center py-1">
          <button
            className="flex flex-col items-center justify-center text-blue-600 dark:text-blue-400 p-1 rounded hover:bg-blue-500/20"
            disabled={isLoading}
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                {direction === 'up' && <Icon className="w-3 h-3" />}
                <div className="flex gap-0.5">
                  <div className="w-1 h-1 rounded-full bg-blue-600" />
                  <div className="w-1 h-1 rounded-full bg-blue-600" />
                  <div className="w-1 h-1 rounded-full bg-blue-600" />
                </div>
                {direction === 'down' && <Icon className="w-3 h-3" />}
              </>
            )}
          </button>
        </div>

        {/* Comment button spacer */}
        <div className="w-6 flex-shrink-0" />

        {/* Line prefix spacer */}
        <div className="w-5 flex-shrink-0" />

        {/* Text */}
        <div className="flex-1 px-2 py-1 text-sm text-blue-600 dark:text-blue-400 font-mono">
          {isLoading ? 'Loading...' : `Show ${lineCount} more line${lineCount !== 1 ? 's' : ''}`}
        </div>
      </div>
    );
  };

  // Expanded lines component
  const ExpandedLines = ({
    ranges,
    language,
  }: {
    ranges: ExpandedRange[];
    language: string | null;
  }) => {
    return (
      <>
        {ranges.flatMap(range =>
          range.lines.map((line, idx) => {
            const lineNum = range.startLine + idx;
            return (
              <div key={`expanded-${range.startLine}-${idx}`} className="flex items-stretch">
                {/* Line numbers (both old and new) */}
                <div className="w-16 flex-shrink-0 text-muted-foreground/60 select-none border-r border-border/40 flex items-center gap-1 px-1">
                  <span className="w-6 text-right text-xs">{lineNum}</span>
                  <span className="w-6 text-right text-xs">{lineNum}</span>
                </div>

                {/* Comment button spacer */}
                <div className="w-6 flex-shrink-0" />

                {/* Line prefix (context = space) */}
                <div className="w-5 flex-shrink-0 text-center text-muted-foreground/40 select-none">
                  {' '}
                </div>

                {/* Line content */}
                <div className="flex-1 px-2 py-0.5 whitespace-pre-wrap break-all font-mono text-sm">
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
        {/* Expand UP button */}
        {beforeExpandInfo && (
          <ExpandButton
            direction="up"
            lineCount={beforeExpandInfo.endLine - beforeExpandInfo.startLine + 1}
            onClick={() => handleExpandLines(filePath, hunk, hunkIndex, 'before')}
            isLoading={isLoadingBefore}
          />
        )}

        {/* Expanded lines BEFORE hunk */}
        {hunkRanges.before.length > 0 && (
          <ExpandedLines
            ranges={hunkRanges.before}
            language={language}
          />
        )}

        {/* Hunk separator header */}
        <div
          className={cn(
            "flex items-center px-3 py-1 font-mono",
            hunk.is_staged ? "bg-emerald-500/10" : "bg-muted/60"
          )}
        >
          <span className="text-muted-foreground truncate">{hunk.header}</span>
          {hunk.is_staged && (
            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
              Staged
            </span>
          )}
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
                  <span className="w-6 text-right" style={{ fontSize: `${Math.max(8, diffFontSize - 2)}px` }}>{lineNum?.old ?? ''}</span>
                  <span className="w-6 text-right" style={{ fontSize: `${Math.max(8, diffFontSize - 2)}px` }}>{lineNum?.new ?? ''}</span>
                </div>
                {/* Add comment button - shows on hover */}
                <div className="w-6 flex-shrink-0 flex items-center justify-center select-none">
                  <button
                    className="invisible group-hover:visible p-0.5 rounded bg-primary text-primary-foreground hover:bg-primary/90"
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
                    title="Add comment"
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
                  lineContents={pendingComment.lineContent}
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
          />
        )}

        {/* Expand DOWN button */}
        {afterExpandInfo && (
          <ExpandButton
            direction="down"
            lineCount={afterExpandInfo.endLine - afterExpandInfo.startLine + 1}
            onClick={() => handleExpandLines(filePath, hunk, hunkIndex, 'after')}
            isLoading={isLoadingAfter}
          />
        )}
      </Fragment>
    );
  };

  // Render all diffs for a single file
  const renderFileDiffs = (filePath: string, fileData: FileHunksData, fileMeta: ParsedFileChange | undefined) => {
    const isCollapsed = collapsedFiles.has(filePath);
    const isViewed = viewedFiles.has(filePath);
    const fileId = `file-section-${filePath.replace(/[^a-zA-Z0-9]/g, "-")}`;
    const label = formatFileLabel(filePath);

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
      <div key={filePath} id={fileId} className="border border-border rounded-lg overflow-hidden">
        {/* File Header */}
        <div
          className="flex items-center justify-between px-4 py-2 bg-muted/50 cursor-pointer hover:bg-muted/70"
          onClick={() => toggleFileCollapse(filePath)}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {isCollapsed ? (
              <ChevronRight className="w-4 h-4 flex-shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 flex-shrink-0" />
            )}
            <FileText className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <span className="font-medium text-sm truncate block">{label.name}</span>
              <div className="flex items-center gap-1.5">
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
            {fileMeta?.stagedStatus && (
              <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                {statusLabel(fileMeta.stagedStatus)}
              </span>
            )}
            {fileMeta?.worktreeStatus && (
              <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400">
                {statusLabel(fileMeta.worktreeStatus)}
              </span>
            )}
            {!readOnly && !disableInteractions && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <button className="p-1 rounded hover:bg-accent">
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={4}>
                  {fileMeta?.worktreeStatus && (
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
                  {(fileMeta?.worktreeStatus || fileMeta?.stagedStatus) && (
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
                        await openPath(`${worktreePath}/${filePath}`);
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
            ) : (
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
                selectedFiles={selectedUnstagedFiles}
                onFileSelect={handleFileSelect}
                onMoveToWorktree={() => setMoveDialogOpen(true)}
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
            <List
              listRef={(ref) => { listRef.current = ref; }}
              rowCount={files.length}
              rowHeight={getFileHeight}
              rowProps={{}}
              className="p-4"
              style={{ height: "100%" }}
              rowComponent={({ index, style }: RowComponentProps) => {
                const file = files[index];
                const fileData = allFileHunks.get(file.path);
                if (!fileData) return <div style={style} />;
                return (
                  <div style={style} className="px-4 pb-4">
                    {renderFileDiffs(file.path, fileData, file)}
                  </div>
                );
              }}
            />
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

      {/* Move to Worktree Dialog */}
      <MoveToWorktreeDialog
        open={moveDialogOpen}
        onOpenChange={setMoveDialogOpen}
        repoPath={worktreePath}
        selectedFiles={Array.from(selectedUnstagedFiles)}
        onSuccess={handleMoveToWorktreeSuccess}
      />
    </div>
  );
}));

StagingDiffViewer.displayName = "StagingDiffViewer";
