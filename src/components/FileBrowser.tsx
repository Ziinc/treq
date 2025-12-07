import { useState, useEffect, useCallback, useMemo, useRef, memo } from "react";
import { Folder, FolderOpen, FileText, Loader2, AlertCircle, Plus } from "lucide-react";
import { List, type ListImperativeAPI, type RowComponentProps } from "react-window";
import type { Worktree, DirectoryEntry } from "../lib/api";
import { listDirectory, readFile, gitGetChangedFiles, gitGetFileHunks } from "../lib/api";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { isBinaryFile, parseChangedFiles, type ParsedFileChange } from "../lib/git-utils";
import { getLanguageFromPath, highlightCode } from "../lib/syntax-highlight";
import { useToast } from "./ui/toast";
import { useWorktreeGitStatus } from "../hooks/useWorktreeGitStatus";
import { LineDiffStatsDisplay } from "./LineDiffStatsDisplay";
import { getWorktreeTitle } from "../lib/worktree-utils";
import { GitBranch, Pin } from "lucide-react";

interface FileBrowserProps {
  worktree?: Worktree;
  repoPath?: string;
  branchName?: string;
  mainBranch?: string;
  onStartPlanSession?: (prompt: string, worktreePath: string) => void;
}

interface LineSelection {
  startLine: number;
  endLine: number;
}

// Filter out .git and .treq files/directories
function filterHiddenEntries(entries: DirectoryEntry[]): DirectoryEntry[] {
  return entries.filter(entry => {
    const name = entry.name;
    return !name.startsWith('.git') && !name.startsWith('.treq');
  });
}

// Virtualization constants
const LINE_HEIGHT = 24;
const COMMENT_INPUT_HEIGHT = 180;

export const FileBrowser = memo(function FileBrowser({ worktree, repoPath, branchName, mainBranch, onStartPlanSession }: FileBrowserProps) {
  // Determine the path and branch to use
  const basePath = worktree?.worktree_path ?? repoPath ?? "";
  const displayBranch = worktree?.branch_name ?? branchName ?? "main";

  // Get git status for worktree
  const { status, branchInfo, lineDiffStats } = useWorktreeGitStatus(
    worktree?.worktree_path,
    {
      refetchInterval: 30000,
      baseBranch: mainBranch,
    }
  );

  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set([basePath]));
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [directoryCache, setDirectoryCache] = useState<Map<string, DirectoryEntry[]>>(new Map());
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [isLoadingDir, setIsLoadingDir] = useState(false);
  const [rootEntries, setRootEntries] = useState<DirectoryEntry[]>([]);
  const [changedFiles, setChangedFiles] = useState<Map<string, ParsedFileChange>>(new Map());
  const [fileHunks, setFileHunks] = useState<Map<number, 'add' | 'modify' | 'delete'>>(new Map());
  const [deletionMarkers, setDeletionMarkers] = useState<Set<number>>(new Set());
  const [lineSelection, setLineSelection] = useState<LineSelection | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionAnchor, setSelectionAnchor] = useState<number | null>(null);
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [pendingComment, setPendingComment] = useState<{
    startLine: number;
    endLine: number;
    lineContent: string[];
  } | null>(null);
  const [hoveredLine, setHoveredLine] = useState<number | null>(null);
  const { addToast } = useToast();
  const listRef = useRef<ListImperativeAPI | null>(null);

  // Load root directory on mount
  useEffect(() => {
    const loadRoot = async () => {
      setIsLoadingDir(true);
      try {
        const entries = await listDirectory(basePath);
        const filtered = filterHiddenEntries(entries);
        setRootEntries(filtered);
        setDirectoryCache(new Map([[basePath, filtered]]));
      } catch (error) {
        addToast({
          title: "Failed to load directory",
          description: error instanceof Error ? error.message : String(error),
          type: "error",
        });
      } finally {
        setIsLoadingDir(false);
      }
    };
    loadRoot();
  }, [basePath, addToast]);

  // Load changed files for git status indicators
  useEffect(() => {
    const loadChangedFiles = async () => {
      if (!basePath) return;
      try {
        const files = await gitGetChangedFiles(basePath);
        const parsed = parseChangedFiles(files);
        const fileMap = new Map<string, ParsedFileChange>();
        for (const file of parsed) {
          fileMap.set(`${basePath}/${file.path}`, file);
        }
        setChangedFiles(fileMap);
      } catch (error) {
        // Silently fail - git status is optional
        console.error("Failed to load git status:", error);
      }
    };
    loadChangedFiles();
  }, [basePath]);

  const handleFileClick = useCallback(async (path: string) => {
    setSelectedFile(path);

    // Check if binary file
    if (isBinaryFile(path)) {
      setFileContent("");
      setFileHunks(new Map());
      return;
    }

    setIsLoadingFile(true);
    try {
      const content = await readFile(path);

      // Warn for large files
      if (content.length > 1024 * 1024) { // 1MB
        const confirmed = window.confirm(
          "This file is quite large (>1MB). Loading it may slow down the browser. Continue?"
        );
        if (!confirmed) {
          setSelectedFile(null);
          setIsLoadingFile(false);
          return;
        }
      }

      setFileContent(content);

      // Load git hunks for line-level indicators
      if (changedFiles.has(path)) {
        try {
          const hunks = await gitGetFileHunks(basePath, path.replace(`${basePath}/`, ''));
          const lineMap = new Map<number, 'add' | 'modify' | 'delete'>();
          const deletionSet = new Set<number>();

          hunks.forEach(hunk => {
            // Parse the hunk header to get starting line number
            // Format: @@ -old_start,old_count +new_start,new_count @@
            const headerMatch = hunk.header.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
            if (!headerMatch) return;

            let newLineNum = parseInt(headerMatch[1], 10);

            hunk.lines.forEach(line => {
              if (line.startsWith('+') && !line.startsWith('+++')) {
                lineMap.set(newLineNum, 'add');
                newLineNum++;
              } else if (line.startsWith('-') && !line.startsWith('---')) {
                // Deletions don't have a line in the current file
                // Mark the line before where deletion occurred (show marker between lines)
                if (newLineNum > 1) {
                  deletionSet.add(newLineNum - 1);
                }
              } else if (line.startsWith(' ')) {
                // Context line - just increment
                newLineNum++;
              }
            });
          });

          setFileHunks(lineMap);
          setDeletionMarkers(deletionSet);
        } catch (error) {
          console.error("Failed to load git hunks:", error);
          setFileHunks(new Map());
          setDeletionMarkers(new Set());
        }
      } else {
        setFileHunks(new Map());
        setDeletionMarkers(new Set());
      }
    } catch (error) {
      addToast({
        title: "Failed to read file",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
      setFileContent("");
      setFileHunks(new Map());
    } finally {
      setIsLoadingFile(false);
    }
  }, [addToast, basePath, changedFiles]);

  // Helper to determine text color based on git status
  const getStatusTextColor = useCallback((file: ParsedFileChange | undefined): string => {
    if (!file) return "";
    if (file.isUntracked) return "text-green-500";
    if (file.worktreeStatus === "M" || file.stagedStatus === "M") return "text-yellow-500";
    if (file.worktreeStatus === "A" || file.stagedStatus === "A") return "text-green-500";
    if (file.worktreeStatus === "D" || file.stagedStatus === "D") return "text-red-500";
    return "text-yellow-500"; // default for any other change
  }, []);

  // Line selection handlers
  const handleLineMouseDown = useCallback((e: React.MouseEvent, lineNum: number, _lineContent: string) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setIsSelecting(true);
    setSelectionAnchor(lineNum);
    setLineSelection({ startLine: lineNum, endLine: lineNum });
    setShowCommentInput(false);
  }, []);

  const handleLineMouseEnter = useCallback((lineNum: number) => {
    if (!isSelecting || selectionAnchor === null) return;
    const start = Math.min(selectionAnchor, lineNum);
    const end = Math.max(selectionAnchor, lineNum);
    setLineSelection({ startLine: start, endLine: end });
  }, [isSelecting, selectionAnchor]);

  const handleLineMouseUp = useCallback(() => {
    setIsSelecting(false);
  }, []);

  const isLineSelected = useCallback((lineNum: number) => {
    if (!lineSelection) return false;
    return lineNum >= lineSelection.startLine && lineNum <= lineSelection.endLine;
  }, [lineSelection]);

  // Comment handlers
  const handleAddComment = useCallback((lineNum?: number) => {
    if (!selectedFile) return;

    const lines = fileContent.split('\n');
    let start: number, end: number, selectedLines: string[];

    if (lineNum !== undefined) {
      // Single line comment from + button
      start = lineNum;
      end = lineNum;
      selectedLines = [lines[lineNum - 1]];
      setLineSelection({ startLine: lineNum, endLine: lineNum });
    } else if (lineSelection) {
      // Multi-line comment from selection
      start = lineSelection.startLine;
      end = lineSelection.endLine;
      selectedLines = lines.slice(start - 1, end);
    } else {
      return;
    }

    setPendingComment({
      startLine: start,
      endLine: end,
      lineContent: selectedLines,
    });
    setShowCommentInput(true);
  }, [lineSelection, selectedFile, fileContent]);

  const handleSubmitComment = useCallback((text: string, action: 'edit' | 'plan') => {
    if (!pendingComment || !selectedFile) return;

    if (action === 'plan' && onStartPlanSession) {
      // Format the prompt similar to code review format
      const lineRef = pendingComment.startLine === pendingComment.endLine
        ? `${selectedFile}:${pendingComment.startLine}`
        : `${selectedFile}:${pendingComment.startLine}-${pendingComment.endLine}`;

      let prompt = `File: ${lineRef}\n\n`;
      prompt += "```\n";
      prompt += pendingComment.lineContent.join('\n') + '\n';
      prompt += "```\n\n";
      prompt += `"${text.trim()}"`;

      onStartPlanSession(prompt, basePath);
    }

    setShowCommentInput(false);
    setPendingComment(null);
    setLineSelection(null);
  }, [pendingComment, selectedFile, onStartPlanSession, basePath]);

  const handleCancelComment = useCallback(() => {
    setShowCommentInput(false);
    setPendingComment(null);
  }, []);

  // Auto-select README.md when rootEntries change (switching worktrees)
  useEffect(() => {
    if (rootEntries.length === 0) return;

    // Look for README.md (case-insensitive)
    const readme = rootEntries.find(
      entry => !entry.is_directory && entry.name.toLowerCase() === 'readme.md'
    );

    if (readme) {
      // Auto-select and load README.md
      handleFileClick(readme.path);
    } else {
      // Clear selection if no README.md
      setSelectedFile(null);
      setFileContent("");
    }
  }, [rootEntries, handleFileClick]);

  const loadDirectory = useCallback(async (path: string): Promise<DirectoryEntry[]> => {
    if (directoryCache.has(path)) {
      return directoryCache.get(path)!;
    }

    try {
      const entries = await listDirectory(path);
      const filtered = filterHiddenEntries(entries);
      setDirectoryCache(prev => new Map(prev).set(path, filtered));
      return filtered;
    } catch (error) {
      addToast({
        title: "Failed to load directory",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
      return [];
    }
  }, [directoryCache, addToast]);

  const hasChangedFilesInDirectory = useCallback((dirPath: string): boolean => {
    for (const [path] of changedFiles) {
      if (path.startsWith(dirPath + '/')) {
        return true;
      }
    }
    return false;
  }, [changedFiles]);

  const getDirectoryChangeStatus = useCallback((dirPath: string): ParsedFileChange | undefined => {
    // Check if any files in this directory are changed
    // Returns the first found change, or undefined if none
    for (const [path, file] of changedFiles) {
      if (path.startsWith(dirPath + '/')) {
        return file;
      }
    }
    return undefined;
  }, [changedFiles]);

  const handleDirectoryClick = async (path: string) => {
    if (expandedDirs.has(path)) {
      // Collapse
      setExpandedDirs(prev => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
    } else {
      // Expand and load
      await loadDirectory(path);
      setExpandedDirs(prev => new Set(prev).add(path));
    }
  };

  const renderTreeNode = useCallback((entry: DirectoryEntry, depth: number = 0): JSX.Element => {
    if (entry.is_directory) {
      const isExpanded = expandedDirs.has(entry.path);
      const children = directoryCache.get(entry.path) || [];
      const hasChanges = hasChangedFilesInDirectory(entry.path);

      return (
        <div key={entry.path} className="text-xs">
          <button
            type="button"
            className={cn(
              "flex items-center gap-2 w-full px-2 py-1 rounded-md hover:bg-muted/60 transition",
              "text-left"
            )}
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
            onClick={() => handleDirectoryClick(entry.path)}
          >
            {isExpanded ? (
              <FolderOpen className="w-4 h-4 flex-shrink-0" />
            ) : (
              <Folder className="w-4 h-4 flex-shrink-0" />
            )}
            <span className={cn("font-medium truncate", getStatusTextColor(getDirectoryChangeStatus(entry.path)))}>
              {entry.name}
            </span>
            {hasChanges && (
              <span
                className="w-2 h-2 rounded-full flex-shrink-0 bg-yellow-500 ml-auto"
                title="Contains modified files"
              />
            )}
          </button>
          {isExpanded && children.length > 0 && (
            <div>
              {children
                .sort((a, b) => {
                  // Directories first, then alphabetically
                  if (a.is_directory === b.is_directory) {
                    return a.name.localeCompare(b.name);
                  }
                  return a.is_directory ? -1 : 1;
                })
                .map((child) => renderTreeNode(child, depth + 1))}
            </div>
          )}
          {isExpanded && children.length === 0 && (
            <div
              className="text-xs text-muted-foreground px-2 py-1"
              style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
            >
              Empty directory
            </div>
          )}
        </div>
      );
    }

    // File node
    const fileStatus = changedFiles.get(entry.path);
    const isChanged = fileStatus !== undefined;
    return (
      <button
        key={entry.path}
        type="button"
        onClick={() => handleFileClick(entry.path)}
        className={cn(
          "w-full flex items-center gap-2 px-2 py-1 rounded-md text-xs transition",
          "hover:bg-muted/60 text-left",
          selectedFile === entry.path && "bg-primary/10"
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <span className={cn("truncate", getStatusTextColor(fileStatus))}>{entry.name}</span>
        {isChanged && (
          <span
            className="w-2 h-2 rounded-full flex-shrink-0 bg-yellow-500 ml-auto"
            title="Modified"
          />
        )}
      </button>
    );
  }, [expandedDirs, directoryCache, hasChangedFilesInDirectory, handleDirectoryClick, changedFiles, handleFileClick, selectedFile]);

  // Calculate item height for virtualization
  const getItemHeight = useCallback((index: number) => {
    const lineNum = index + 1;
    let height = LINE_HEIGHT;

    // Add comment input height if this line has it
    if (showCommentInput && pendingComment && lineNum === pendingComment.endLine) {
      height += COMMENT_INPUT_HEIGHT;
    }

    return height;
  }, [showCommentInput, pendingComment]);

  // Memoize file content data for virtualization
  const fileContentData = useMemo(() => {
    if (!selectedFile || !fileContent) return null;

    const language = getLanguageFromPath(selectedFile);
    const highlightedCode = language
      ? highlightCode(fileContent, language)
      : fileContent.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const lines = highlightedCode.split('\n');
    const rawLines = fileContent.split('\n');
    const lineNumberWidth = Math.max(4, String(lines.length).length);

    return { lines, rawLines, lineNumberWidth, language };
  }, [selectedFile, fileContent]);

  const renderFileContent = () => {
    if (!selectedFile) {
      return (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          Select a file to view its contents
        </div>
      );
    }

    if (isBinaryFile(selectedFile)) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
          <AlertCircle className="w-8 h-8" />
          <p>Binary file - cannot display</p>
          <p className="text-xs">{selectedFile.split('/').pop()}</p>
        </div>
      );
    }

    if (isLoadingFile) {
      return (
        <div className="flex items-center justify-center h-full">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (!fileContent || !fileContentData) {
      return (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          Failed to load file content
        </div>
      );
    }

    const { lines, rawLines, lineNumberWidth, language } = fileContentData;

    return (
      <div className="h-full flex flex-col bg-background" onMouseUp={handleLineMouseUp}>
        <div className="px-4 pt-4 pb-2">
          <div className="mb-2 text-xs text-muted-foreground font-mono">
            <span>{selectedFile.startsWith(basePath + '/') ? selectedFile.slice(basePath.length + 1) : selectedFile}</span>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <List
            listRef={(ref) => { listRef.current = ref; }}
            rowCount={lines.length}
            rowHeight={getItemHeight}
            rowProps={{}}
            className="px-4 pb-4"
            style={{ height: "100%" }}
            rowComponent={({ index, style }: RowComponentProps) => {
              const lineNum = index + 1;
              const line = lines[index];
              const gitStatus = fileHunks.get(lineNum);
              const isSelected = isLineSelected(lineNum);

              return (
                <div style={style}>
                  <div
                    className={cn(
                      "flex group relative cursor-pointer hover:bg-muted/30 transition-colors text-xs font-mono leading-normal",
                      isSelected && "bg-primary/10",
                      gitStatus === 'add' && "bg-emerald-500/10"
                    )}
                    style={{ height: LINE_HEIGHT }}
                    onMouseDown={(e) => handleLineMouseDown(e, lineNum, rawLines[index])}
                    onMouseEnter={() => {
                      handleLineMouseEnter(lineNum);
                      setHoveredLine(lineNum);
                    }}
                    onMouseLeave={() => setHoveredLine(null)}
                  >
                    {gitStatus && (
                      <span
                        className={cn(
                          "absolute left-0 w-1 h-full",
                          gitStatus === 'add' && "bg-emerald-500",
                          gitStatus === 'modify' && "bg-yellow-500",
                          gitStatus === 'delete' && "bg-red-500"
                        )}
                      />
                    )}
                    {/* Deletion marker - shown between lines where content was deleted */}
                    {deletionMarkers.has(lineNum) && (
                      <span
                        className="absolute left-0 bottom-0 w-2 h-[3px] bg-red-500"
                        style={{
                          clipPath: 'polygon(0 0, 100% 50%, 0 100%)',
                          transform: 'translateY(50%)'
                        }}
                        title="Lines deleted here"
                      />
                    )}
                    {/* Line number */}
                    <span
                      className="select-none text-muted-foreground/50 pr-2 text-right"
                      style={{ minWidth: `${lineNumberWidth}ch`, paddingLeft: gitStatus ? '4px' : '0' }}
                    >
                      {lineNum}
                    </span>
                    {/* Comment button - appears on hover to the right of line numbers */}
                    <span
                      className="flex-shrink-0 w-6 flex items-center justify-center"
                    >
                      {hoveredLine === lineNum && !isSelecting && (
                        <button
                          onMouseDown={(e) => {
                            e.stopPropagation();
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            // If there's a selection, use it; otherwise create single-line comment
                            if (lineSelection) {
                              handleAddComment();
                            } else {
                              handleAddComment(lineNum);
                            }
                          }}
                          className="w-5 h-5 flex items-center justify-center rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                          title={lineSelection ? "Add comment to selection" : "Add comment"}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </span>
                    {/* Code content */}
                    <code
                      className={cn("flex-1 whitespace-pre", language ? `language-${language}` : '')}
                      dangerouslySetInnerHTML={{ __html: line || '&nbsp;' }}
                    />
                  </div>

                  {/* Show comment input after last selected line */}
                  {showCommentInput && pendingComment && lineNum === pendingComment.endLine && (
                    <div className="bg-muted/60 border-y border-border/40 px-4 py-3 my-1 font-sans">
                      <div className="mb-2 text-xs text-muted-foreground">
                        <span>
                          {selectedFile.startsWith(basePath + '/')
                            ? selectedFile.slice(basePath.length + 1)
                            : selectedFile}:L{pendingComment.startLine}
                          {pendingComment.startLine !== pendingComment.endLine && `-${pendingComment.endLine}`}
                        </span>
                      </div>
                      <Textarea
                        id="comment-textarea"
                        placeholder="Describe what you want to change..."
                        className="mb-2 text-sm font-sans"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            handleCancelComment();
                          }
                        }}
                      />
                      <div className="flex justify-end items-center gap-2">
                        <Button size="sm" variant="ghost" onClick={handleCancelComment}>
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const textarea = document.getElementById('comment-textarea') as HTMLTextAreaElement;
                            if (textarea) {
                              const text = textarea.value;
                              if (text.trim()) {
                                handleSubmitComment(text, 'edit');
                              }
                            }
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            const textarea = document.getElementById('comment-textarea') as HTMLTextAreaElement;
                            if (textarea) {
                              const text = textarea.value;
                              if (text.trim()) {
                                handleSubmitComment(text, 'plan');
                              }
                            }
                          }}
                        >
                          Plan
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            }}
          />
        </div>
      </div>
    );
  };

  const totalChanges = status
    ? status.modified + status.added + status.deleted + status.untracked
    : 0;

  const title = worktree ? getWorktreeTitle(worktree) : "File Browser";

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex flex-col gap-2 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{title}</h2>
            {worktree?.is_pinned && (
              <Pin className="w-3.5 h-3.5 text-muted-foreground" />
            )}
            <LineDiffStatsDisplay stats={lineDiffStats} size="sm" />
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <GitBranch className="w-3 h-3" />
            <span className="font-mono text-xs">{displayBranch}</span>
            {branchInfo && (branchInfo.ahead > 0 || branchInfo.behind > 0) && (
              <span className="text-xs">
                {branchInfo.ahead > 0 && <span className="text-green-600 dark:text-green-400">{branchInfo.ahead}↑</span>}
                {branchInfo.behind > 0 && <span className="text-orange-600 dark:text-orange-400 ml-1">{branchInfo.behind}↓</span>}
              </span>
            )}
          </div>
          {status && totalChanges > 0 && (
            <div className="flex flex-wrap gap-1 text-xs">
              {status.modified > 0 && (
                <span className="px-1.5 py-0.5 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 rounded">
                  {status.modified} modified
                </span>
              )}
              {status.added > 0 && (
                <span className="px-1.5 py-0.5 bg-green-500/10 text-green-600 dark:text-green-400 rounded">
                  {status.added} added
                </span>
              )}
              {status.deleted > 0 && (
                <span className="px-1.5 py-0.5 bg-red-500/10 text-red-600 dark:text-red-400 rounded">
                  {status.deleted} deleted
                </span>
              )}
              {status.untracked > 0 && (
                <span className="px-1.5 py-0.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded">
                  {status.untracked} untracked
                </span>
              )}
            </div>
          )}
          {worktree && (
            <div className="text-xs text-muted-foreground">
              <div>Created {new Date(worktree.created_at).toLocaleString()}</div>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* File Tree */}
        <div className="w-[240px] flex-shrink-0 border-r bg-sidebar overflow-auto">
          {isLoadingDir && rootEntries.length === 0 ? (
            <div className="flex items-center justify-center p-4">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="p-3 space-y-1">
              {rootEntries
                .sort((a, b) => {
                  // Directories first, then alphabetically
                  if (a.is_directory === b.is_directory) {
                    return a.name.localeCompare(b.name);
                  }
                  return a.is_directory ? -1 : 1;
                })
                .map((entry) => renderTreeNode(entry, 0))}
            </div>
          )}
        </div>

        {/* File Content */}
        <div className="flex-1 min-w-0 bg-background overflow-auto">
          {renderFileContent()}
        </div>
      </div>
    </div>
  );
});
