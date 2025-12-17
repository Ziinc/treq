import { useState, useEffect, useCallback, useMemo, memo } from "react";
import {
  Folder,
  FolderOpen,
  FileText,
  Loader2,
  AlertCircle,
  Plus,
} from "lucide-react";
import { List } from "react-window";
import type { Workspace, DirectoryEntry } from "../lib/api";
import {
  listDirectory,
  listDirectoryCached,
  readFile,
  gitGetFileHunks,
} from "../lib/api";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { isBinaryFile, type ParsedFileChange } from "../lib/git-utils";
import { getLanguageFromPath, highlightCode } from "../lib/syntax-highlight";
import { useToast } from "./ui/toast";
import { useWorkspaceGitStatus } from "../hooks/useWorkspaceGitStatus";
import { getFileStatusTextColor } from "../lib/git-status-colors";
import { useChangedFiles } from "../hooks/useChangedFiles";

interface FileBrowserProps {
  workspace?: Workspace;
  repoPath?: string;
  mainBranch?: string;
  initialSelectedFile?: string;
  initialExpandedDir?: string;
}

interface LineSelection {
  startLine: number;
  endLine: number;
}

// Filter out .git and .treq files/directories (but keep .github, .gitignore, etc.)
function filterHiddenEntries(entries: DirectoryEntry[]): DirectoryEntry[] {
  return entries.filter((entry) => {
    const name = entry.name;
    return name !== ".git" && name !== ".treq";
  });
}

// Virtualization constants
const LINE_HEIGHT = 24;
const COMMENT_INPUT_HEIGHT = 180;

export const FileBrowser = memo(function FileBrowser({
  workspace,
  repoPath,
  mainBranch,
  initialSelectedFile,
  initialExpandedDir,
}: FileBrowserProps) {
  // Determine the path and branch to use
  const basePath = workspace?.workspace_path ?? repoPath ?? "";

  // Get git status for workspace
  useWorkspaceGitStatus(workspace?.workspace_path, {
    refetchInterval: 30000,
    baseBranch: mainBranch,
  });

  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(
    new Set([basePath])
  );
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [directoryCache, setDirectoryCache] = useState<
    Map<string, DirectoryEntry[]>
  >(new Map());
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [isLoadingDir, setIsLoadingDir] = useState(false);
  const [rootEntries, setRootEntries] = useState<DirectoryEntry[]>([]);
  const changedFiles = useChangedFiles(basePath);
  const [fileHunks, setFileHunks] = useState<
    Map<number, "add" | "modify" | "delete">
  >(new Map());
  const [deletionMarkers, setDeletionMarkers] = useState<Set<number>>(
    new Set()
  );
  const [lineSelection, setLineSelection] = useState<LineSelection | null>(
    null
  );
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

  // Load root directory on mount
  useEffect(() => {
    const loadRoot = async () => {
      setIsLoadingDir(true);
      try {
        // Use cached version if workspace info is available
        let entries: DirectoryEntry[];
        if (workspace?.repo_path && workspace?.id !== undefined) {
          const cachedEntries = await listDirectoryCached(
            workspace.repo_path,
            workspace.id,
            basePath
          );
          // CachedDirectoryEntry is compatible with DirectoryEntry
          entries = cachedEntries;
        } else if (repoPath) {
          // Fallback to cached with null workspace_id
          const cachedEntries = await listDirectoryCached(
            repoPath,
            null,
            basePath
          );
          entries = cachedEntries;
        } else {
          // Final fallback to live filesystem
          entries = await listDirectory(basePath);
        }

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
  }, [basePath, workspace, repoPath, addToast]);

  const handleFileClick = useCallback(
    async (path: string) => {
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
        if (content.length > 1024 * 1024) {
          // 1MB
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
            const hunks = await gitGetFileHunks(
              basePath,
              path.replace(`${basePath}/`, "")
            );
            const lineMap = new Map<number, "add" | "modify" | "delete">();
            const deletionSet = new Set<number>();

            hunks.forEach((hunk) => {
              // Parse the hunk header to get starting line number
              // Format: @@ -old_start,old_count +new_start,new_count @@
              const headerMatch = hunk.header.match(
                /@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/
              );
              if (!headerMatch) return;

              let newLineNum = parseInt(headerMatch[1], 10);

              hunk.lines.forEach((line) => {
                if (line.startsWith("+") && !line.startsWith("+++")) {
                  lineMap.set(newLineNum, "add");
                  newLineNum++;
                } else if (line.startsWith("-") && !line.startsWith("---")) {
                  // Deletions don't have a line in the current file
                  // Mark the line before where deletion occurred (show marker between lines)
                  if (newLineNum > 1) {
                    deletionSet.add(newLineNum - 1);
                  }
                } else if (line.startsWith(" ")) {
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
    },
    [addToast, basePath, changedFiles]
  );

  // Line selection handlers
  const handleLineMouseDown = useCallback(
    (e: React.MouseEvent, lineNum: number, _lineContent: string) => {
      if (e.button !== 0) return;
      e.preventDefault();
      setIsSelecting(true);
      setSelectionAnchor(lineNum);
      setLineSelection({ startLine: lineNum, endLine: lineNum });
      setShowCommentInput(false);
    },
    []
  );

  const handleLineMouseEnter = useCallback(
    (lineNum: number) => {
      if (!isSelecting || selectionAnchor === null) return;
      const start = Math.min(selectionAnchor, lineNum);
      const end = Math.max(selectionAnchor, lineNum);
      setLineSelection({ startLine: start, endLine: end });
    },
    [isSelecting, selectionAnchor]
  );

  const handleLineMouseUp = useCallback(() => {
    setIsSelecting(false);
  }, []);

  const isLineSelected = useCallback(
    (lineNum: number) => {
      if (!lineSelection) return false;
      return (
        lineNum >= lineSelection.startLine && lineNum <= lineSelection.endLine
      );
    },
    [lineSelection]
  );

  // Comment handlers
  const handleAddComment = useCallback(
    (lineNum?: number) => {
      if (!selectedFile) return;

      const lines = fileContent.split("\n");
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
    },
    [lineSelection, selectedFile, fileContent]
  );

  const handleSubmitComment = useCallback(
    (_text: string, _action: "edit") => {
      if (!pendingComment || !selectedFile) return;

      setShowCommentInput(false);
      setPendingComment(null);
      setLineSelection(null);
    },
    [pendingComment, selectedFile, basePath]
  );

  const handleCancelComment = useCallback(() => {
    setShowCommentInput(false);
    setPendingComment(null);
  }, []);

  // Auto-select README.md when rootEntries change (switching workspaces)
  useEffect(() => {
    if (rootEntries.length === 0) return;

    // Look for README.md (case-insensitive)
    const readme = rootEntries.find(
      (entry) => !entry.is_directory && entry.name.toLowerCase() === "readme.md"
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

  const loadDirectory = useCallback(
    async (path: string): Promise<DirectoryEntry[]> => {
      if (directoryCache.has(path)) {
        return directoryCache.get(path)!;
      }

      try {
        // Use cached version if workspace info is available
        let entries: DirectoryEntry[];
        if (workspace?.repo_path && workspace?.id !== undefined) {
          const cachedEntries = await listDirectoryCached(
            workspace.repo_path,
            workspace.id,
            path
          );
          entries = cachedEntries;
        } else if (repoPath) {
          const cachedEntries = await listDirectoryCached(repoPath, null, path);
          entries = cachedEntries;
        } else {
          entries = await listDirectory(path);
        }

        const filtered = filterHiddenEntries(entries);
        setDirectoryCache((prev) => new Map(prev).set(path, filtered));
        return filtered;
      } catch (error) {
        addToast({
          title: "Failed to load directory",
          description: error instanceof Error ? error.message : String(error),
          type: "error",
        });
        return [];
      }
    },
    [directoryCache, workspace, repoPath, addToast]
  );

  // Handle initial file selection from external navigation
  useEffect(() => {
    if (initialSelectedFile) {
      handleFileClick(initialSelectedFile);
    }
  }, [initialSelectedFile, handleFileClick]);

  // Handle initial directory expansion from external navigation
  useEffect(() => {
    if (initialExpandedDir) {
      loadDirectory(initialExpandedDir)
        .then(() => {
          setExpandedDirs((prev) => new Set([...prev, initialExpandedDir]));
        })
        .catch(() => {
          // Silently fail if directory can't be loaded
        });
    }
  }, [initialExpandedDir, loadDirectory]);

  const hasChangedFilesInDirectory = useCallback(
    (dirPath: string): boolean => {
      for (const [path] of changedFiles) {
        if (path.startsWith(dirPath + "/")) {
          return true;
        }
      }
      return false;
    },
    [changedFiles]
  );

  const getDirectoryChangeStatus = useCallback(
    (dirPath: string): ParsedFileChange | undefined => {
      // Check if any files in this directory are changed
      // Returns the first found change, or undefined if none
      for (const [path, file] of changedFiles) {
        if (path.startsWith(dirPath + "/")) {
          return file;
        }
      }
      return undefined;
    },
    [changedFiles]
  );

  const handleDirectoryClick = async (path: string) => {
    if (expandedDirs.has(path)) {
      // Collapse
      setExpandedDirs((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
    } else {
      // Expand and load
      await loadDirectory(path);
      setExpandedDirs((prev) => new Set(prev).add(path));
    }
  };

  const renderTreeNode = useCallback(
    (entry: DirectoryEntry, depth: number = 0): JSX.Element => {
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
              <span
                className={cn(
                  "font-medium truncate",
                  getFileStatusTextColor(getDirectoryChangeStatus(entry.path))
                )}
              >
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
          <span className={cn("truncate", getFileStatusTextColor(fileStatus))}>
            {entry.name}
          </span>
          {isChanged && (
            <span
              className="w-2 h-2 rounded-full flex-shrink-0 bg-yellow-500 ml-auto"
              title="Modified"
            />
          )}
        </button>
      );
    },
    [
      expandedDirs,
      directoryCache,
      hasChangedFilesInDirectory,
      handleDirectoryClick,
      changedFiles,
      handleFileClick,
      selectedFile,
    ]
  );

  // Calculate item height for virtualization
  const getItemHeight = useCallback(
    (index: number) => {
      const lineNum = index + 1;
      let height = LINE_HEIGHT;

      // Add comment input height if this line has it
      if (
        showCommentInput &&
        pendingComment &&
        lineNum === pendingComment.endLine
      ) {
        height += COMMENT_INPUT_HEIGHT;
      }

      return height;
    },
    [showCommentInput, pendingComment]
  );

  // Memoize file content data for virtualization
  const fileContentData = useMemo(() => {
    if (!selectedFile || !fileContent) return null;

    const language = getLanguageFromPath(selectedFile);
    const highlightedCode = language
      ? highlightCode(fileContent, language)
      : fileContent
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");

    const lines = highlightedCode.split("\n");
    const rawLines = fileContent.split("\n");
    const lineNumberWidth = Math.max(4, String(lines.length).length);

    return { lines, rawLines, lineNumberWidth, language };
  }, [selectedFile, fileContent]);

  // Memoize sorted root entries to avoid re-sorting on every render
  const sortedRootEntries = useMemo(
    () =>
      [...rootEntries].sort((a, b) => {
        // Directories first, then alphabetically
        if (a.is_directory === b.is_directory) {
          return a.name.localeCompare(b.name);
        }
        return a.is_directory ? -1 : 1;
      }),
    [rootEntries]
  );

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
          <p className="text-xs">{selectedFile.split("/").pop()}</p>
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
      <div
        className="h-full flex flex-col bg-[hsl(var(--code-background))]"
        onMouseUp={handleLineMouseUp}
      >
        <div className="px-4 pt-4 pb-2">
          <div className="mb-2 text-xs text-muted-foreground font-mono">
            <span>
              {selectedFile.startsWith(basePath + "/")
                ? selectedFile.slice(basePath.length + 1)
                : selectedFile}
            </span>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <List
            style={{ height: window.innerHeight, width: "100%" }}
            className="px-4 pb-4"
            rowCount={lines.length}
            rowHeight={getItemHeight}
            rowComponent={({
              index,
              style,
            }: {
              index: number;
              style: React.CSSProperties;
            }) => {
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
                      gitStatus === "add" && "bg-emerald-500/10"
                    )}
                    style={{ height: LINE_HEIGHT }}
                    onMouseDown={(e) =>
                      handleLineMouseDown(e, lineNum, rawLines[index])
                    }
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
                          gitStatus === "add" && "bg-emerald-500",
                          gitStatus === "modify" && "bg-yellow-500",
                          gitStatus === "delete" && "bg-red-500"
                        )}
                      />
                    )}
                    {/* Deletion marker - shown between lines where content was deleted */}
                    {deletionMarkers.has(lineNum) && (
                      <span
                        className="absolute left-0 bottom-0 w-2 h-[3px] bg-red-500"
                        style={{
                          clipPath: "polygon(0 0, 100% 50%, 0 100%)",
                          transform: "translateY(50%)",
                        }}
                        title="Lines deleted here"
                      />
                    )}
                    {/* Line number */}
                    <span
                      className="select-none text-muted-foreground/50 pr-2 text-right"
                      style={{
                        minWidth: `${lineNumberWidth}ch`,
                        paddingLeft: gitStatus ? "4px" : "0",
                      }}
                    >
                      {lineNum}
                    </span>
                    {/* Comment button - appears on hover to the right of line numbers */}
                    <span className="flex-shrink-0 w-6 flex items-center justify-center">
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
                          title={
                            lineSelection
                              ? "Add comment to selection"
                              : "Add comment"
                          }
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </span>
                    {/* Code content */}
                    <code
                      className={cn(
                        "flex-1 whitespace-pre",
                        language ? `language-${language}` : ""
                      )}
                      dangerouslySetInnerHTML={{ __html: line || "&nbsp;" }}
                    />
                  </div>

                  {/* Show comment input after last selected line */}
                  {showCommentInput &&
                    pendingComment &&
                    lineNum === pendingComment.endLine && (
                      <div className="bg-muted/60 border-y border-border/40 px-4 py-3 my-1 font-sans">
                        <div className="mb-2 text-xs text-muted-foreground">
                          <span>
                            {selectedFile.startsWith(basePath + "/")
                              ? selectedFile.slice(basePath.length + 1)
                              : selectedFile}
                            :L{pendingComment.startLine}
                            {pendingComment.startLine !==
                              pendingComment.endLine &&
                              `-${pendingComment.endLine}`}
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
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={handleCancelComment}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const textarea = document.getElementById(
                                "comment-textarea"
                              ) as HTMLTextAreaElement;
                              if (textarea) {
                                const text = textarea.value;
                                if (text.trim()) {
                                  handleSubmitComment(text, "edit");
                                }
                              }
                            }}
                          >
                            Edit
                          </Button>
                        </div>
                      </div>
                    )}
                </div>
              );
            }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            rowProps={{} as any}
          />
        </div>
      </div>
    );
  };

  return (
    <div
      className="h-full flex bg-background overflow-hidden"
      data-testid="file-browser"
    >
      {/* File Tree */}
      <div className="w-[400px] flex-shrink-0 border-r bg-sidebar overflow-auto">
        {isLoadingDir && rootEntries.length === 0 ? (
          <div className="flex items-center justify-center p-4">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="p-3 space-y-1">
            {sortedRootEntries.map((entry) => renderTreeNode(entry, 0))}
          </div>
        )}
      </div>

      {/* File Content */}
      <div className="flex-1 min-w-0 bg-background overflow-auto">
        {renderFileContent()}
      </div>
    </div>
  );
});
