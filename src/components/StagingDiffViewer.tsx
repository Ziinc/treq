import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type KeyboardEvent as ReactKeyboardEvent } from "react";
import Editor from "@monaco-editor/react";
import { useTheme } from "../hooks/useTheme";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  gitGetChangedFiles,
  gitGetFileHunks,
  gitStageFile,
  gitStageHunk,
  gitUnstageFile,
  gitUnstageHunk,
  gitCommit,
  gitCommitAmend,
  gitPush,
  gitPull,
  type GitDiffHunk,
} from "../lib/api";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { useToast } from "./ui/toast";
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
  ExternalLink,
  CheckCircle2,
} from "lucide-react";
import { cn } from "../lib/utils";

interface StagingDiffViewerProps {
  worktreePath: string;
  readOnly?: boolean;
  disableInteractions?: boolean;
  onStagedFilesChange?: (files: string[]) => void;
  refreshSignal?: number;
  initialSelectedFile?: string;
}

interface ParsedFileChange {
  path: string;
  stagedStatus?: string | null;
  worktreeStatus?: string | null;
  isUntracked: boolean;
}

const formatFileLabel = (path: string) => {
  const parts = path.split("/").filter(Boolean);
  const name = parts.pop() || path;
  const parent = parts.pop() || "root";
  return { name, parent };
};

const getMonacoLanguage = (filePath: string): string => {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  const name = filePath.toLowerCase();

  // Map file extensions to Monaco language IDs
  const languageMap: Record<string, string> = {
    // JavaScript/TypeScript
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",

    // Web
    html: "html",
    htm: "html",
    css: "css",
    scss: "scss",
    sass: "sass",
    less: "less",

    // Data formats
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    xml: "xml",
    toml: "toml",

    // Languages
    py: "python",
    rs: "rust",
    go: "go",
    java: "java",
    cpp: "cpp",
    c: "c",
    h: "c",
    hpp: "cpp",
    cs: "csharp",
    php: "php",
    rb: "ruby",
    swift: "swift",
    kt: "kotlin",
    scala: "scala",
    sql: "sql",
    sh: "shell",
    bash: "shell",
    zsh: "shell",

    // Markup
    md: "markdown",
    markdown: "markdown",

    // Config
    dockerfile: "dockerfile",
    gitignore: "plaintext",
    env: "plaintext",
  };

  // Check for special filenames
  if (name === "dockerfile" || name.startsWith("dockerfile.")) {
    return "dockerfile";
  }

  return languageMap[ext] || "plaintext";
};

const statusLabel = (code?: string | null) => {
  switch (code) {
    case "M":
      return "Modified";
    case "A":
      return "Added";
    case "D":
      return "Deleted";
    case "R":
      return "Renamed";
    case "??":
      return "Untracked";
    default:
      return "Changed";
  }
};

const parseChangedFiles = (changedFiles: string[]): ParsedFileChange[] => {
  return changedFiles.map((file) => {
    if (file.startsWith("?? ")) {
      return {
        path: file.substring(3).trim(),
        stagedStatus: null,
        worktreeStatus: "??",
        isUntracked: true,
      };
    }

    if (file.length < 3) {
      return {
        path: file.trim(),
        stagedStatus: null,
        worktreeStatus: null,
        isUntracked: false,
      };
    }

    const stagedStatus = file[0] !== " " ? file[0] : null;
    const worktreeStatus = file[1] !== " " ? file[1] : null;
    const rawPath = file.substring(3).trim();
    const path = rawPath.includes(" -> ") ? rawPath.split(" -> ").pop() || rawPath : rawPath;

    return {
      path,
      stagedStatus,
      worktreeStatus,
      isUntracked: false,
    };
  });
};

export const StagingDiffViewer: React.FC<StagingDiffViewerProps> = memo(({
  worktreePath,
  readOnly = false,
  disableInteractions = false,
  onStagedFilesChange,
  refreshSignal = 0,
  initialSelectedFile,
}) => {
  const { addToast } = useToast();
  const { actualTheme } = useTheme();
  const [files, setFiles] = useState<ParsedFileChange[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [hunks, setHunks] = useState<GitDiffHunk[]>([]);
  const [loadingHunks, setLoadingHunks] = useState(false);
  const [manualRefreshKey, setManualRefreshKey] = useState(0);
  const [fileActionTarget, setFileActionTarget] = useState<string | null>(null);
  const [hunkActionTarget, setHunkActionTarget] = useState<string | null>(null);
  const [collapsedHunks, setCollapsedHunks] = useState<Set<string>>(new Set());
  const [commitMessage, setCommitMessage] = useState("");
  const [commitPending, setCommitPending] = useState(false);
  const [actionPending, setActionPending] = useState<'commit' | 'amend' | 'push' | 'sync' | null>(null);
  const commitMessageTextareaRef = useRef<HTMLTextAreaElement>(null);

  const stagedFiles = useMemo(
    () => files.filter((file) => file.stagedStatus && file.stagedStatus !== " "),
    [files]
  );
  const unstagedFiles = useMemo(
    () =>
      files.filter(
        (file) => (file.worktreeStatus && file.worktreeStatus !== " ") || file.isUntracked
      ),
    [files]
  );

  const loadChangedFiles = useCallback(async () => {
    if (!worktreePath) {
      setFiles([]);
      setSelectedFile(null);
      return;
    }

    try {
      const changedFiles = await gitGetChangedFiles(worktreePath);

      const parsed = parseChangedFiles(changedFiles);
      setFiles(parsed);
      setSelectedFile((current) => {
        // If initialSelectedFile is provided and exists in parsed files, use it
        if (initialSelectedFile && parsed.some((file) => file.path === initialSelectedFile)) {
          return initialSelectedFile;
        }
        // Otherwise, keep current selection if it still exists
        if (current && parsed.some((file) => file.path === current)) {
          return current;
        }
        // Default to first file
        return parsed[0]?.path ?? null;
      });

      if (onStagedFilesChange) {
        const staged = parsed
          .filter((file) => file.stagedStatus && file.stagedStatus !== " ")
          .map((file) => file.path);
        onStagedFilesChange(Array.from(new Set(staged)));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addToast({ title: "Git Error", description: message, type: "error" });
    }
  }, [worktreePath, addToast, onStagedFilesChange]);

  useEffect(() => {
    loadChangedFiles();
  }, [loadChangedFiles, refreshSignal, manualRefreshKey]);

  const loadFileHunks = useCallback(
    async (filePath: string) => {
      if (!filePath || !worktreePath) {
        setHunks([]);
        return;
      }
      setLoadingHunks(true);
      try {
        const response = await gitGetFileHunks(worktreePath, filePath);
        setHunks(response);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        addToast({ title: "Diff Error", description: message, type: "error" });
        setHunks([]);
      } finally {
        setLoadingHunks(false);
      }
    },
    [worktreePath, addToast]
  );

  useEffect(() => {
    if (selectedFile) {
      loadFileHunks(selectedFile);
    } else {
      setHunks([]);
    }
  }, [selectedFile, loadFileHunks]);

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
        refresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        addToast({ title: "Stage Failed", description: message, type: "error" });
      } finally {
        setFileActionTarget(null);
      }
    },
    [worktreePath, readOnly, disableInteractions, refresh, addToast]
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
        refresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        addToast({ title: "Unstage Failed", description: message, type: "error" });
      } finally {
        setFileActionTarget(null);
      }
    },
    [worktreePath, readOnly, disableInteractions, refresh, addToast]
  );

  const handleHunkAction = useCallback(
    async (hunk: GitDiffHunk) => {
      if (readOnly || disableInteractions || !selectedFile) {
        return;
      }
      setHunkActionTarget(hunk.id);
      try {
        if (hunk.is_staged) {
          await gitUnstageHunk(worktreePath, hunk.patch);
          // When unstaging, expand the hunk
          setCollapsedHunks((prev) => {
            const next = new Set(prev);
            next.delete(hunk.id);
            return next;
          });
        } else {
          await gitStageHunk(worktreePath, hunk.patch);
          // When staging, collapse the hunk
          setCollapsedHunks((prev) => new Set(prev).add(hunk.id));
        }
        addToast({
          title: hunk.is_staged ? "Hunk Unstaged" : "Hunk Staged",
          description: hunk.header,
          type: "success",
        });
        refresh();
        await loadFileHunks(selectedFile);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        addToast({ title: "Hunk Action Failed", description: message, type: "error" });
      } finally {
        setHunkActionTarget(null);
      }
    },
    [readOnly, disableInteractions, worktreePath, refresh, loadFileHunks, selectedFile, addToast]
  );

  const toggleHunkCollapse = useCallback((hunkId: string) => {
    setCollapsedHunks((prev) => {
      const next = new Set(prev);
      if (next.has(hunkId)) {
        next.delete(hunkId);
      } else {
        next.add(hunkId);
      }
      return next;
    });
  }, []);

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
  }, [worktreePath, commitMessage, stagedFiles, addToast, extractCommitHash, refresh]);

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
  }, [worktreePath, commitMessage, addToast, extractCommitHash, refresh]);

  const handleCommitAndPush = useCallback(async () => {
    if (!canCommit) return;

    setActionPending('push');
    try {
      // First commit
      const commitResult = await gitCommit(worktreePath, commitMessage.trim());
      const hash = extractCommitHash(commitResult);
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
  }, [canCommit, worktreePath, commitMessage, addToast, extractCommitHash, refresh]);

  const handleCommitAndSync = useCallback(async () => {
    if (!canCommit) return;

    setActionPending('sync');
    try {
      // First commit
      const commitResult = await gitCommit(worktreePath, commitMessage.trim());
      const hash = extractCommitHash(commitResult);
      addToast({
        title: "Commit created",
        description: hash ? `Created ${hash}` : "Commit successful",
        type: "success",
      });

      // Then pull
      await gitPull(worktreePath);
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
  }, [canCommit, worktreePath, commitMessage, addToast, extractCommitHash, refresh]);


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

  const handleOpenInEditor = useCallback(async () => {
    if (!selectedFile) {
      return;
    }
    try {
      const fullPath = `${worktreePath}/${selectedFile}`;
      await openPath(fullPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addToast({ title: "Open Failed", description: message, type: "error" });
    }
  }, [selectedFile, worktreePath, addToast]);

  const selectedMeta = useMemo(
    () => files.find((file) => file.path === selectedFile) || null,
    [files, selectedFile]
  );

  const renderFileRow = (
    file: ParsedFileChange,
    isStagedSection: boolean,
  ) => {
    const isSelected = selectedFile === file.path;
    const label = formatFileLabel(file.path);
    const showStagedButton = !readOnly && !disableInteractions;
    const isBusy = fileActionTarget === file.path;
    const status = isStagedSection ? file.stagedStatus ?? file.worktreeStatus : file.worktreeStatus ?? file.stagedStatus;

    return (
      <div
        key={`${isStagedSection ? "staged" : "unstaged"}-${file.path}`}
        className={cn(
          "px-3 py-1.5 text-sm flex items-center gap-2 border-b border-border/40",
          isSelected ? "bg-accent/40" : "hover:bg-accent/30"
        )}
      >
        <button
          className="flex-1 text-left"
          onClick={() => setSelectedFile(file.path)}
          title={file.path}
        >
          <div className="text-xs font-medium truncate">{label.name}</div>
          <div className="text-xs text-muted-foreground">{label.parent}</div>
        </button>
        {showStagedButton && (
          <button
            className="p-0.5 rounded hover:bg-accent"
            onClick={() =>
              isStagedSection ? handleUnstageFile(file.path) : handleStageFile(file.path)
            }
            disabled={isBusy}
            title={isStagedSection ? "Unstage file" : "Stage file"}
          >
            {isBusy ? (
              <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
            ) : isStagedSection ? (
              <Minus className="w-3 h-3 text-muted-foreground" />
            ) : (
              <Plus className="w-3 h-3 text-muted-foreground" />
            )}
          </button>
        )}
        <span
          className={cn(
            "text-[10px] font-mono min-w-[1ch]",
            isStagedSection ? "text-emerald-400" : "text-muted-foreground"
          )}
        >
          {status ?? ""}
        </span>
      </div>
    );
  };

  const renderSection = (
    title: string,
    entries: ParsedFileChange[],
    isStagedSection: boolean,
  ) => (
    <div className="mt-4">
      <div className="flex items-center justify-between px-4 text-xs uppercase tracking-wide text-muted-foreground">
        <span>{title}</span>
        <span>{entries.length}</span>
      </div>
      <div className="mt-2 border border-border/40 rounded-sm overflow-hidden">
        {entries.length === 0 ? (
          <div className="text-xs text-muted-foreground px-4 py-6 text-center">
            {isStagedSection ? "No staged changes" : "No unstaged changes"}
          </div>
        ) : (
          entries.map((file) => renderFileRow(file, isStagedSection))
        )}
      </div>
    </div>
  );

  const renderHunk = (hunk: GitDiffHunk) => {
    const isBusy = hunkActionTarget === hunk.id;
    const allowActions = !readOnly && !disableInteractions;
    const isCollapsed = collapsedHunks.has(hunk.id);

    // Get file name for title
    const fileName = selectedFile ? selectedFile.split("/").pop() || selectedFile : "Unknown";

    // Calculate editor height based on line count
    const lineHeight = 19; // Monaco default line height
    const padding = 8;
    const maxHeight = 600;
    const contentHeight = Math.min(hunk.lines.length * lineHeight + padding * 2, maxHeight);

    // Prepare diff content for Monaco (without the hunk header line if present)
    const diffContent = hunk.lines.join("\n");

    // Get language from file extension
    const language = selectedFile ? getMonacoLanguage(selectedFile) : "plaintext";

    return (
      <div
        key={hunk.id}
        className={cn(
          "border rounded-md overflow-hidden",
          hunk.is_staged ? "border-emerald-500/60 bg-emerald-500/5" : "border-border bg-muted/40"
        )}
      >
        {/* Title Bar */}
        <div
          className={cn(
            "flex items-center justify-between px-3 py-2 text-sm",
            hunk.is_staged ? "bg-emerald-500/10" : "bg-muted"
          )}
        >
          <button
            className="text-left flex-1 flex items-center gap-2 font-medium"
            onClick={() => toggleHunkCollapse(hunk.id)}
            title="Click to expand/collapse"
          >
            {isCollapsed ? (
              <ChevronRight className="w-4 h-4 flex-shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 flex-shrink-0" />
            )}
            <span className="truncate">{fileName}</span>
            {hunk.is_staged && (
              <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-normal">
                Staged
              </span>
            )}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="p-1 rounded hover:bg-background/60 ml-2"
                title="More options"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={4}>
              {allowActions && hunk.is_staged && (
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    handleHunkAction(hunk);
                  }}
                  disabled={isBusy}
                >
                  {isBusy ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Minus className="w-4 h-4 mr-2" />
                  )}
                  Unstage changed lines
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  handleOpenInEditor();
                }}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Open in editor
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Monaco Editor Content */}
        {!isCollapsed && (
          <div className="border-t border-border/40">
            {hunk.lines.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">No changes in hunk</div>
            ) : (
              <Editor
                height={contentHeight}
                language={language}
                value={diffContent}
                theme={actualTheme === "dark" ? "vs-dark" : "light"}
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  fontSize: 12,
                  lineNumbers: "on",
                  scrollBeyondLastLine: false,
                  wordWrap: "off",
                  padding: { top: padding, bottom: padding },
                  renderLineHighlight: "none",
                  smoothScrolling: true,
                  scrollbar: {
                    vertical: hunk.lines.length * lineHeight > maxHeight ? "visible" : "hidden",
                    horizontal: "auto",
                  },
                  overviewRulerLanes: 0,
                  hideCursorInOverviewRuler: true,
                  overviewRulerBorder: false,
                  lineDecorationsWidth: 0,
                  lineNumbersMinChars: 3,
                  glyphMargin: false,
                  folding: false,
                }}
                loading={<div className="px-3 py-2 text-xs text-muted-foreground">Loading editor...</div>}
              />
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
              {renderSection("Staged Changes", stagedFiles, true)}
              {renderSection("Changes", unstagedFiles, false)}
            </>
          )}
        </div>
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        {selectedFile ? (
          <>
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="font-semibold">{selectedFile}</h3>
                {selectedMeta && (
                  <p className="text-xs text-muted-foreground">
                    {selectedMeta.stagedStatus ? `Staged (${statusLabel(selectedMeta.stagedStatus)})` : "Not staged"}
                    {selectedMeta.worktreeStatus && selectedMeta.stagedStatus ? " · " : ""}
                    {selectedMeta.worktreeStatus && !selectedMeta.isUntracked
                      ? `Unstaged (${statusLabel(selectedMeta.worktreeStatus)})`
                      : selectedMeta.isUntracked
                        ? " · Untracked"
                        : null}
                  </p>
                )}
              </div>
              {!readOnly && selectedMeta && (
                <div className="flex items-center gap-2">
                  {selectedMeta.stagedStatus && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleUnstageFile(selectedFile)}
                      disabled={disableInteractions || fileActionTarget === selectedFile}
                    >
                      {fileActionTarget === selectedFile ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>Unstage File</>
                      )}
                    </Button>
                  )}
                  {selectedMeta.worktreeStatus || selectedMeta.isUntracked ? (
                    <Button
                      size="sm"
                      onClick={() => handleStageFile(selectedFile)}
                      disabled={disableInteractions || fileActionTarget === selectedFile}
                    >
                      {fileActionTarget === selectedFile ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>Stage File</>
                      )}
                    </Button>
                  ) : null}
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {loadingHunks ? (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : hunks.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                  <FileText className="w-10 h-10 mb-3" />
                  <p className="text-sm">No diff hunks available</p>
                </div>
              ) : (
                hunks.map(renderHunk)
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <FileText className="w-12 h-12 mx-auto mb-4" />
              <p>Select a file to view diffs</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

StagingDiffViewer.displayName = "StagingDiffViewer";
