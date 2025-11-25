import { memo, useCallback, useEffect, useMemo, useRef, useState, Fragment } from "react";
import { type KeyboardEvent as ReactKeyboardEvent } from "react";
import { openPath } from "@tauri-apps/plugin-opener";
import { v4 as uuidv4 } from "uuid";
import { List, type ListImperativeAPI, type RowComponentProps } from "react-window";
import {
  gitGetChangedFiles,
  gitGetFileHunks,
  getGitCache,
  setGitCache,
  invalidateGitCache,
  gitStageFile,
  gitUnstageFile,
  gitAddAll,
  gitUnstageAll,
  gitDiscardAllChanges,
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
} from "lucide-react";
import { cn } from "../lib/utils";
import {
  parseChangedFiles,
  formatFileLabel,
  statusLabel,
  filterStagedFiles,
  filterUnstagedFiles,
  type ParsedFileChange,
} from "../lib/git-utils";
import { GitChangesSection } from "./GitChangesSection";

interface StagingDiffViewerProps {
  worktreePath: string;
  readOnly?: boolean;
  disableInteractions?: boolean;
  onStagedFilesChange?: (files: string[]) => void;
  refreshSignal?: number;
  initialSelectedFile?: string;
  terminalSessionId?: string;
}

interface LineComment {
  id: string;
  filePath: string;
  hunkId: string;
  startLine: number;
  endLine: number;
  lineContent: string[];
  text: string;
  createdAt: string;
}

interface LineSelection {
  filePath: string;
  hunkId: string;
  startLineIndex: number;
  endLineIndex: number | null;
  isSelecting: boolean;
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

// Helper to get line type styling
const getLineTypeClass = (line: string): string => {
  if (line.startsWith("+")) return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
  if (line.startsWith("-")) return "bg-red-500/10 text-red-700 dark:text-red-400";
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

// Parse hunk header to extract starting line numbers
const parseHunkHeader = (header: string): { oldStart: number; newStart: number } => {
  const match = header.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
  return {
    oldStart: match ? parseInt(match[1], 10) : 1,
    newStart: match ? parseInt(match[2], 10) : 1,
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

// Isolated comment input component to prevent parent re-renders during typing
interface CommentInputProps {
  onSubmit: (text: string) => void;
  onCancel: () => void;
}

const CommentInput: React.FC<CommentInputProps> = memo(({ onSubmit, onCancel }) => {
  const [text, setText] = useState("");

  const handleSubmit = useCallback(() => {
    if (text.trim()) {
      onSubmit(text.trim());
    }
  }, [text, onSubmit]);

  const handleKeyDown = useCallback((e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      onCancel();
    } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      handleSubmit();
    }
  }, [onCancel, handleSubmit]);

  return (
    <div className="bg-muted/60 border-y border-border/40 px-4 py-3">
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

export const StagingDiffViewer: React.FC<StagingDiffViewerProps> = memo(({
  worktreePath,
  readOnly = false,
  disableInteractions = false,
  onStagedFilesChange,
  refreshSignal = 0,
  initialSelectedFile,
  terminalSessionId,
}) => {
  const { addToast } = useToast();
  const [files, setFiles] = useState<ParsedFileChange[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
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
  const [commitMessage, setCommitMessage] = useState("");
  const [commitPending, setCommitPending] = useState(false);
  const [actionPending, setActionPending] = useState<'commit' | 'amend' | 'push' | 'sync' | null>(null);
  const commitMessageTextareaRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<ListImperativeAPI | null>(null);

  // Review/comment state
  const [comments, setComments] = useState<LineComment[]>([]);
  const [lineSelection, setLineSelection] = useState<LineSelection | null>(null);
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [reviewPopoverOpen, setReviewPopoverOpen] = useState(false);
  const [finalReviewComment, setFinalReviewComment] = useState("");
  const [sendingReview, setSendingReview] = useState(false);
  const [highlightedFiles, setHighlightedFiles] = useState<Set<string>>(new Set());

  // Viewed files state - maps file path to { viewed_at, content_hash }
  const [viewedFiles, setViewedFiles] = useState<Map<string, { viewedAt: string; contentHash: string }>>(new Map());

  const stagedFiles = useMemo(() => filterStagedFiles(files), [files]);
  const unstagedFiles = useMemo(() => filterUnstagedFiles(files), [files]);

  const applyChangedFiles = useCallback((parsed: ParsedFileChange[]) => {
    setFiles(parsed);
    setSelectedFile((current) => {
      if (initialSelectedFile && parsed.some((file) => file.path === initialSelectedFile)) {
        return initialSelectedFile;
      }
      if (current && parsed.some((file) => file.path === current)) {
        return current;
      }
      return parsed[0]?.path ?? null;
    });

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

  // Calculate height for a file section in the virtualized list
  const getFileHeight = useCallback((index: number): number => {
    const file = files[index];
    if (!file) return FILE_HEADER_HEIGHT;

    // If file is collapsed, just return header height
    if (collapsedFiles.has(file.path)) {
      return FILE_HEADER_HEIGHT;
    }

    const fileData = allFileHunks.get(file.path);

    // If loading or no data, return header + loading indicator
    if (!fileData || fileData.isLoading) {
      return FILE_HEADER_HEIGHT + LOADING_HEIGHT;
    }

    // If error or no hunks, return header + empty state
    if (fileData.error || fileData.hunks.length === 0) {
      return FILE_HEADER_HEIGHT + 60;
    }

    // Calculate expanded height: header + hunks
    let height = FILE_HEADER_HEIGHT;

    for (const hunk of fileData.hunks) {
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
        if (showCommentInput && lineSelection?.filePath === file.path &&
            lineSelection?.hunkId === hunk.id && lineIndex === lineSelection.startLineIndex) {
          height += COMMENT_INPUT_HEIGHT;
        }
      }
    }

    return height;
  }, [files, collapsedFiles, allFileHunks, comments, showCommentInput, lineSelection]);

  const loadChangedFiles = useCallback(async () => {
    if (!worktreePath) {
      setFiles([]);
      setSelectedFile(null);
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
        setAllFileHunks(new Map());
        setLoadingAllHunks(false);
        return;
      }
      setLoadingAllHunks(true);

      const hunksMap = new Map<string, FileHunksData>();
      filesToLoad.forEach((file) => {
        hunksMap.set(file.path, { filePath: file.path, hunks: [], isLoading: true });
      });
      setAllFileHunks(new Map(hunksMap));

      const cachedHunks = new Map<string, GitDiffHunk[]>();

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

      if (cachedHunks.size > 0) {
        setAllFileHunks(new Map(hunksMap));
      }

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

        let shouldUpdate = cachedHunks.size === 0;

        for (const result of results) {
          if (result.error) {
            shouldUpdate = true;
            hunksMap.set(result.filePath, {
              filePath: result.filePath,
              hunks: [],
              isLoading: false,
              error: result.error,
            });
            continue;
          }

          const cached = cachedHunks.get(result.filePath);
          const changed = !cached || !hunksEqual(cached, result.hunks);
          if (changed) {
            shouldUpdate = true;
          }

          hunksMap.set(result.filePath, {
            filePath: result.filePath,
            hunks: result.hunks,
            isLoading: false,
          });

          setGitCache(worktreePath, "file_hunks", result.hunks, result.filePath).catch((error) => {
            console.debug("failed to cache file hunks", result.filePath, error);
          });
        }

        if (shouldUpdate) {
          setAllFileHunks(new Map(hunksMap));
        }
      } finally {
        setLoadingAllHunks(false);
      }
    },
    [worktreePath]
  );

  useEffect(() => {
    if (files.length > 0) {
      loadAllFileHunks(files);
    } else {
      setAllFileHunks(new Map());
    }
  }, [files, loadAllFileHunks]);

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

  // Line selection handlers for staging
  const handleLineMouseDown = useCallback((
    e: React.MouseEvent,
    filePath: string,
    hunkIndex: number,
    lineIndex: number,
    lineContent: string,
    isStaged: boolean
  ) => {
    if (e.button !== 0 || (!lineContent.startsWith('+') && !lineContent.startsWith('-'))) {
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
    lineContent: string,
    _isStaged: boolean
  ) => {
    if (!isSelecting || !selectionAnchor || selectionAnchor.filePath !== filePath) {
      return;
    }
    if (!lineContent.startsWith('+') && !lineContent.startsWith('-')) {
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
        if (line && (line.startsWith('+') || line.startsWith('-'))) {
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

    const unstagedLines = diffLineSelection.lines.filter(l => !l.isStaged);
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

    const stagedLines = diffLineSelection.lines.filter(l => l.isStaged);
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
    if (!lineSelection || !text.trim()) return;

    const fileData = allFileHunks.get(lineSelection.filePath);
    if (!fileData) return;

    const hunk = fileData.hunks.find((h) => h.id === lineSelection.hunkId);
    if (!hunk) return;

    const startIdx = Math.min(lineSelection.startLineIndex, lineSelection.endLineIndex ?? lineSelection.startLineIndex);
    const endIdx = Math.max(lineSelection.startLineIndex, lineSelection.endLineIndex ?? lineSelection.startLineIndex);
    const selectedLines = hunk.lines.slice(startIdx, endIdx + 1);

    const newComment: LineComment = {
      id: uuidv4(),
      filePath: lineSelection.filePath,
      hunkId: lineSelection.hunkId,
      startLine: startIdx,
      endLine: endIdx,
      lineContent: selectedLines,
      text: text.trim(),
      createdAt: new Date().toISOString(),
    };

    setComments((prev) => [...prev, newComment]);
    setShowCommentInput(false);
    setLineSelection(null);

    // Highlight the file in the sidebar
    const filePath = lineSelection.filePath;
    setHighlightedFiles((prev) => new Set(prev).add(filePath));
    setTimeout(() => {
      setHighlightedFiles((prev) => {
        const next = new Set(prev);
        next.delete(filePath);
        return next;
      });
    }, 1500);
  }, [lineSelection, allFileHunks]);

  const cancelComment = useCallback(() => {
    setShowCommentInput(false);
    setLineSelection(null);
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
        markdown += `**${filePath}**\n\n`;
        for (const comment of fileComments) {
          const lineRange = comment.startLine === comment.endLine
            ? `Line ${comment.startLine + 1}`
            : `Lines ${comment.startLine + 1}-${comment.endLine + 1}`;
          markdown += `${lineRange}:\n`;
          markdown += "```diff\n";
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
  }, [terminalSessionId, formatReviewMarkdown, addToast]);

  const scrollToFile = useCallback((filePath: string) => {
    const fileIndex = files.findIndex(f => f.path === filePath);
    if (fileIndex >= 0 && listRef.current) {
      listRef.current.scrollToRow({ index: fileIndex, align: "start" });
    }
    setSelectedFile(filePath);
    // Ensure the file is expanded
    setCollapsedFiles((prev) => {
      const next = new Set(prev);
      next.delete(filePath);
      return next;
    });
  }, [files]);

  const extractCommitHash = useCallback((output: string) => {
    const bracketMatch = output.match(/\[.+? ([0-9a-f]{7,})\]/i);
    if (bracketMatch && bracketMatch[1]) {
      return bracketMatch[1];
    }
    const looseMatch = output.match(/\b[0-9a-f]{7,40}\b/i);
    return looseMatch ? looseMatch[0] : null;
  }, []);

  const handleCommit = useCallback(async () => {
    if (!worktreePath) {
      addToast({
        title: "Missing Worktree",
        description: "Select a worktree before committing.",
        type: "error",
      });
      return;
    }

    const trimmed = commitMessage.trim();
    if (!trimmed) {
      addToast({ title: "Commit message", description: "Enter a commit message.", type: "error" });
      return;
    }

    if (trimmed.length > 500) {
      addToast({ title: "Commit message", description: "Please keep the message under 500 characters.", type: "error" });
      return;
    }

    if (stagedFiles.length === 0) {
      addToast({ title: "No staged files", description: "Stage changes before committing.", type: "error" });
      return;
    }

    setCommitPending(true);
    try {
      const result = await gitCommit(worktreePath, trimmed);
      const hash = extractCommitHash(result);
      await invalidateCache();
      addToast({
        title: "Commit created",
        description: hash ? `Created ${hash}` : result.trim() || "Commit successful",
        type: "success",
      });
      setCommitMessage("");
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
  }, [worktreePath, commitMessage, stagedFiles, addToast, extractCommitHash, refresh, invalidateCache]);

  const canCommit = useMemo(() => {
    const trimmed = commitMessage.trim();
    return Boolean(trimmed) && trimmed.length <= 500 && stagedFiles.length > 0 && !commitPending && !actionPending;
  }, [commitMessage, stagedFiles, commitPending, actionPending]);

  const handleCommitKeyDown = useCallback((event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      if (canCommit) {
        handleCommit();
      }
    }
  }, [canCommit, handleCommit]);

  const handleCommitAmend = useCallback(async () => {
    if (!worktreePath) {
      addToast({
        title: "Missing Worktree",
        description: "Select a worktree before amending.",
        type: "error",
      });
      return;
    }

    const trimmed = commitMessage.trim();
    if (!trimmed) {
      addToast({ title: "Commit message", description: "Enter a commit message.", type: "error" });
      return;
    }

    setActionPending('amend');
    try {
      const result = await gitCommitAmend(worktreePath, trimmed);
      const hash = extractCommitHash(result);
      await invalidateCache();
      addToast({
        title: "Commit amended",
        description: hash ? `Amended to ${hash}` : result.trim() || "Amend successful",
        type: "success",
      });
      setCommitMessage("");
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
  }, [worktreePath, commitMessage, addToast, extractCommitHash, refresh, invalidateCache]);

  const handleCommitAndPush = useCallback(async () => {
    if (!canCommit) return;

    setActionPending('push');
    try {
      // First commit
      const commitResult = await gitCommit(worktreePath, commitMessage.trim());
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

      setCommitMessage("");
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
  }, [canCommit, worktreePath, commitMessage, addToast, extractCommitHash, refresh, invalidateCache]);

  const handleCommitAndSync = useCallback(async () => {
    if (!canCommit) return;

    setActionPending('sync');
    try {
      // First commit
      const commitResult = await gitCommit(worktreePath, commitMessage.trim());
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

      setCommitMessage("");
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
  }, [canCommit, worktreePath, commitMessage, addToast, extractCommitHash, refresh, invalidateCache]);


  const adjustTextareaHeight = useCallback(() => {
    const textarea = commitMessageTextareaRef.current;
    if (!textarea) return;
    
    // Reset height to get accurate scrollHeight
    textarea.style.height = "auto";
    // Set height based on scrollHeight, with minimum of 1 line
    const lineHeight = 20; // Approximate line height
    const minHeight = lineHeight + 16; // 1 line + padding
    textarea.style.height = `${Math.max(minHeight, textarea.scrollHeight)}px`;
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [commitMessage, adjustTextareaHeight]);

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

  // Render diff lines for a hunk (no collapsible, just lines with selection support)
  const renderHunkLines = (hunk: GitDiffHunk, hunkIndex: number, filePath: string) => {
    const lineNumbers = computeHunkLineNumbers(hunk);

    return (
      <Fragment key={hunk.id}>
        {/* Hunk separator header */}
        <div
          className={cn(
            "flex items-center px-3 py-1 text-xs font-mono",
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
            lineSelection &&
            lineSelection.filePath === filePath &&
            lineSelection.hunkId === hunk.id &&
            lineIndex === lineSelection.startLineIndex;
          const selected = isLineSelected(filePath, hunkIndex, lineIndex);
          const isChangeLine = line.startsWith('+') || line.startsWith('-');
          const lineNum = lineNumbers[lineIndex];

          return (
            <Fragment key={`${hunk.id}-line-${lineIndex}`}>
              <div
                data-diff-line
                className={cn(
                  "group flex items-stretch cursor-default",
                  getLineTypeClass(line),
                  selected && "!bg-blue-500/30 ring-1 ring-inset ring-blue-500/50",
                  isChangeLine && "cursor-pointer"
                )}
                onMouseDown={(e) => handleLineMouseDown(e, filePath, hunkIndex, lineIndex, line, hunk.is_staged)}
                onMouseEnter={() => handleLineMouseEnter(filePath, hunkIndex, lineIndex, line, hunk.is_staged)}
                onMouseUp={handleLineMouseUp}
              >
                {/* Line number / comment indicator */}
                <div className="w-16 flex-shrink-0 text-muted-foreground select-none border-r border-border/40 flex items-center gap-1">
                  {lineComments.length > 0 && (
                    <MessageSquare className="w-3 h-3 text-primary ml-1" />
                  )}
                  <span className="text-[10px] w-6 text-right">{lineNum?.old ?? ''}</span>
                  <span className="text-[10px] w-6 text-right">{lineNum?.new ?? ''}</span>
                </div>
                {/* Add comment button - shows on hover */}
                <div className="w-6 flex-shrink-0 flex items-center justify-center">
                  <button
                    className="invisible group-hover:visible p-0.5 rounded bg-primary text-primary-foreground hover:bg-primary/90"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setLineSelection({
                        filePath,
                        hunkId: hunk.id,
                        startLineIndex: lineIndex,
                        endLineIndex: lineIndex,
                        isSelecting: false,
                      });
                      setShowCommentInput(true);
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
                {/* Line content */}
                <div className="flex-1 px-2 py-0.5 whitespace-pre-wrap break-all select-none">
                  {line.substring(1) || " "}
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
              {showCommentInputHere && (
                <CommentInput onSubmit={addComment} onCancel={cancelComment} />
              )}
            </Fragment>
          );
        })}
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
          className={cn(
            "flex items-center justify-between px-4 py-2 bg-muted/50 cursor-pointer hover:bg-muted/70",
            selectedFile === filePath && "bg-accent/30"
          )}
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
            className="bg-background font-mono text-xs"
            onContextMenu={handleContextMenu}
            onClick={handleContainerClick}
          >
            {fileData.isLoading ? (
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
        <div className="px-4 py-3 border-b border-border space-y-2">
          <Textarea
            ref={commitMessageTextareaRef}
            placeholder="Message"
            value={commitMessage}
            onChange={(event) => {
              setCommitMessage(event.target.value);
              adjustTextareaHeight();
            }}
            onKeyDown={handleCommitKeyDown}
            disabled={readOnly || disableInteractions || commitPending}
            className="resize-none overflow-hidden"
            style={{ minHeight: "24px" }}
          />
          <div className="flex gap-1">
            {/* Commit Button Group */}
            <div className="flex flex-1">
              <Button
                className="flex-1 rounded-r-none border-r-0 text-xs !h-auto py-1.5"
                disabled={!canCommit || readOnly || disableInteractions}
                onClick={handleCommit}
                size="sm"
              >
                {commitPending || actionPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Commit"}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    className="px-2 rounded-l-none text-xs !h-auto py-1.5"
                    disabled={!canCommit || readOnly || disableInteractions}
                    size="sm"
                    variant="default"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={4}>
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      handleCommit();
                    }}
                    disabled={!canCommit}
                  >
                    Commit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      handleCommitAmend();
                    }}
                    disabled={!commitMessage.trim()}
                  >
                    Commit (Amend)
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      handleCommitAndPush();
                    }}
                    disabled={!canCommit}
                  >
                    Commit & Push
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      handleCommitAndSync();
                    }}
                    disabled={!canCommit}
                  >
                    Commit & Sync
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
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
                  selectedFile={selectedFile}
                  fileActionTarget={fileActionTarget}
                  readOnly={readOnly || disableInteractions}
                  highlightedFiles={highlightedFiles}
                  onFileClick={scrollToFile}
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
                selectedFile={selectedFile}
                fileActionTarget={fileActionTarget}
                readOnly={readOnly || disableInteractions}
                highlightedFiles={highlightedFiles}
                onFileClick={scrollToFile}
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
          {diffLineSelection.lines.some(l => !l.isStaged) && (
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
          {diffLineSelection.lines.some(l => l.isStaged) && (
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
        </div>
      )}
    </div>
  );
});

StagingDiffViewer.displayName = "StagingDiffViewer";
