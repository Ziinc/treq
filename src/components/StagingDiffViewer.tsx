import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  gitGetBranchInfo,
  gitGetChangedFiles,
  gitGetFileHunks,
  gitStageFile,
  gitStageHunk,
  gitUnstageFile,
  gitUnstageHunk,
  type BranchInfo,
  type GitDiffHunk,
} from "../lib/api";
import { Button } from "./ui/button";
import { useToast } from "./ui/toast";
import {
  CheckCircle2,
  Circle,
  FileText,
  Loader2,
  Minus,
  Plus,
  RefreshCcw,
} from "lucide-react";
import { cn } from "../lib/utils";

interface StagingDiffViewerProps {
  worktreePath: string;
  readOnly?: boolean;
  disableInteractions?: boolean;
  onStagedFilesChange?: (files: string[]) => void;
  refreshSignal?: number;
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
}) => {
  const { addToast } = useToast();
  const [files, setFiles] = useState<ParsedFileChange[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [hunks, setHunks] = useState<GitDiffHunk[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingHunks, setLoadingHunks] = useState(false);
  const [manualRefreshKey, setManualRefreshKey] = useState(0);
  const [branchInfo, setBranchInfo] = useState<BranchInfo | null>(null);
  const [fileActionTarget, setFileActionTarget] = useState<string | null>(null);
  const [hunkActionTarget, setHunkActionTarget] = useState<string | null>(null);

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
      setBranchInfo(null);
      return;
    }

    setLoadingFiles(true);
    try {
      const [changedFiles, branch] = await Promise.all([
        gitGetChangedFiles(worktreePath),
        gitGetBranchInfo(worktreePath).catch(() => null),
      ]);

      setBranchInfo(branch ?? null);

      const parsed = parseChangedFiles(changedFiles);
      setFiles(parsed);
      setSelectedFile((current) => {
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addToast({ title: "Git Error", description: message, type: "error" });
    } finally {
      setLoadingFiles(false);
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
        } else {
          await gitStageHunk(worktreePath, hunk.patch);
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
          "px-4 py-2 text-sm flex items-center gap-3 border-b border-border/40",
          isSelected ? "bg-accent/40" : "hover:bg-accent/30"
        )}
      >
        <button
          className="flex-1 text-left"
          onClick={() => setSelectedFile(file.path)}
          title={file.path}
        >
          <div className="font-medium truncate">{label.name}</div>
          <div className="text-xs text-muted-foreground">[{label.parent}]</div>
        </button>
        <span
          className={cn(
            "text-xs font-mono",
            isStagedSection ? "text-emerald-400" : "text-muted-foreground"
          )}
        >
          {status ?? ""}
        </span>
        {showStagedButton && (
          <button
            className="p-1 rounded hover:bg-accent"
            onClick={() =>
              isStagedSection ? handleUnstageFile(file.path) : handleStageFile(file.path)
            }
            disabled={isBusy}
            title={isStagedSection ? "Unstage file" : "Stage file"}
          >
            {isBusy ? (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            ) : isStagedSection ? (
              <Minus className="w-4 h-4 text-muted-foreground" />
            ) : (
              <Plus className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
        )}
        {isStagedSection ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        ) : (
          <Circle className="w-4 h-4 text-muted-foreground" />
        )}
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
    const actionIcon = hunk.is_staged ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />;
    const actionLabel = hunk.is_staged ? "Unstage hunk" : "Stage hunk";
    const allowActions = !readOnly && !disableInteractions;

    return (
      <div
        key={hunk.id}
        className={cn(
          "border rounded-md overflow-hidden",
          hunk.is_staged ? "border-emerald-500/60 bg-emerald-500/5" : "border-border bg-muted/40"
        )}
      >
        <div
          className={cn(
            "flex items-center justify-between px-3 py-2 text-xs font-mono",
            hunk.is_staged ? "bg-emerald-500/10" : "bg-muted"
          )}
        >
          <button
            className="text-left flex-1"
            onClick={() => allowActions && handleHunkAction(hunk)}
            disabled={!allowActions || isBusy}
            title={allowActions ? actionLabel : undefined}
          >
            {hunk.header}
          </button>
          {allowActions && (
            <button
              className="p-1 rounded hover:bg-background/60"
              onClick={() => handleHunkAction(hunk)}
              disabled={isBusy}
              title={actionLabel}
            >
              {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : actionIcon}
            </button>
          )}
        </div>
        <div className="px-3 py-2 bg-background/50 overflow-auto">
          {hunk.lines.length === 0 ? (
            <div className="text-xs text-muted-foreground">No changes in hunk</div>
          ) : (
            <pre className="text-xs font-mono leading-relaxed whitespace-pre-wrap">
              {hunk.lines.map((line, index) => (
                <div
                  key={`${hunk.id}-${index}`}
                  className={cn(
                    line.startsWith("+") && "text-emerald-400",
                    line.startsWith("-") && "text-red-400",
                    line.startsWith("@") && "text-muted-foreground"
                  )}
                >
                  {line || " "}
                </div>
              ))}
            </pre>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full overflow-hidden">
      <div className="w-72 border-r border-border bg-sidebar flex flex-col">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Branch</p>
            <p className="text-sm font-semibold">
              {branchInfo?.name || "--"}
            </p>
            <p className="text-xs text-muted-foreground font-mono">
              ↑{branchInfo?.ahead ?? 0} ↓{branchInfo?.behind ?? 0}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={refresh} disabled={loadingFiles}>
            {loadingFiles ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {renderSection("Staged Changes", stagedFiles, true)}
          {renderSection("Changes", unstagedFiles, false)}
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
