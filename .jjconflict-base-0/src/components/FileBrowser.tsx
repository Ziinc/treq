import { useState, useEffect, useCallback, useMemo, memo, useRef } from "react";
import {
  Folder,
  FolderOpen,
  FileText,
  Loader2,
  AlertCircle,
  Copy,
  Check,
  Plus,
} from "lucide-react";
import { List } from "react-window";
import type { Workspace, DirectoryEntry } from "../lib/api";
import {
  listDirectory,
  listDirectoryCached,
  readFile,
  jjGetFileHunks,
  jjGetChangedFiles,
  ensureWorkspaceIndexed,
} from "../lib/api";
import { cn } from "../lib/utils";
import { getLanguageFromPath, highlightCode } from "../lib/syntax-highlight";
import { useToast } from "./ui/toast";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "./ui/tooltip";
import { getFileStatusTextColor, getStatusBgColor } from "../lib/git-status-colors";
import { useTerminalSettings } from "../hooks/useTerminalSettings";
import { parseJjChangedFiles, type ParsedFileChange } from "../lib/git-utils";
import { useKeyboardShortcut } from "../hooks/useKeyboard";
import { SearchOverlay } from "./SearchOverlay";
import { findMatches, highlightInHtml, type SearchMatch } from "../lib/text-search";

// Helper to check if file is binary
function isBinaryFile(path: string): boolean {
  const binaryExtensions = [
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg',
    '.pdf', '.zip', '.tar', '.gz', '.rar', '.7z',
    '.exe', '.dll', '.so', '.dylib',
    '.mp3', '.mp4', '.avi', '.mov', '.wmv',
    '.woff', '.woff2', '.ttf', '.eot'
  ];
  return binaryExtensions.some(ext => path.toLowerCase().endsWith(ext));
}

interface LineSelection {
  startLine: number;
  endLine: number;
}

interface FileBrowserProps {
  workspace: Workspace | null;
  repoPath: string | null;
  initialSelectedFile: string | null;
  initialExpandedDir: string | null;
  onCreateAgentWithComment?: (
    filePath: string,
    startLine: number,
    endLine: number,
    lineContent: string[],
    commentText: string
  ) => void;
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

// TreeNode component - memoized to prevent unnecessary re-renders
interface TreeNodeProps {
  entry: DirectoryEntry;
  depth: number;
  isExpanded: boolean;
  children: DirectoryEntry[];
  hasChanges: boolean;
  selectedFile: string | null;
  changedFiles: Map<string, ParsedFileChange>;
  onDirectoryClick: (path: string) => void;
  onFileClick: (path: string) => void;
  getDirectoryChangeStatus: (path: string) => ParsedFileChange | undefined;
  renderChildren: (entry: DirectoryEntry, depth: number) => JSX.Element;
}

// CodeLine component - memoized individual line to prevent re-renders
interface CodeLineProps {
  lineNum: number;
  htmlContent: string;
  diffStatus: "add" | "modify" | "delete" | undefined;
  hasDeletionMarker: boolean;
  lineNumberWidth: number;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  style: React.CSSProperties;
  fontSize: number;
  hoveredLine: number | null;
  isLineSelected: boolean;
  isSelecting: boolean;
  onLineMouseDown: (e: React.MouseEvent, lineNum: number, lineContent: string) => void;
  onLineMouseEnter: (lineNum: number) => void;
  onLineMouseUp: () => void;
  onAddComment: (lineNum?: number) => void;
}

const CodeLine = memo(function CodeLine({
  lineNum,
  htmlContent,
  diffStatus,
  hasDeletionMarker,
  lineNumberWidth,
  onMouseEnter,
  onMouseLeave,
  style,
  fontSize: _fontSize,
  hoveredLine,
  isLineSelected,
  isSelecting,
  onLineMouseDown,
  onLineMouseEnter,
  onLineMouseUp,
  onAddComment,
}: CodeLineProps) {
  return (
    <div style={style}>
      <div
        className={cn(
          "flex items-center group relative hover:bg-muted/30 transition-colors text-sm font-mono leading-normal",
          diffStatus === "add" && "bg-emerald-500/10",
          isLineSelected && "!bg-blue-500/20"
        )}
        style={{ height: LINE_HEIGHT }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onMouseDown={(e) => onLineMouseDown(e, lineNum, htmlContent)}
        onMouseMove={() => onLineMouseEnter(lineNum)}
        onMouseUp={onLineMouseUp}
      >
        {diffStatus && (
          <span
            className={cn(
              "absolute left-0 w-1 h-full",
              diffStatus === "add" && "bg-emerald-500",
              diffStatus === "modify" && "bg-yellow-500",
              diffStatus === "delete" && "bg-red-500"
            )}
          />
        )}
        {/* Deletion marker - shown between lines where content was deleted */}
        {hasDeletionMarker && (
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
            paddingLeft: diffStatus ? "4px" : "0",
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
                onAddComment(lineNum);
              }}
              className="w-5 h-5 flex items-center justify-center rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors"
              title="Add comment"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </span>
        {/* Code content */}
        <span
          className="flex-1 whitespace-pre-wrap break-words font-mono text-sm"
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
      </div>
    </div>
  );
});

// FileContentView component - memoized file content panel
interface FileContentViewProps {
  selectedFile: string | null;
  isLoadingFile: boolean;
  fileContent: string;
  fileContentData: {
    lines: string[];
    rawLines: string[];
    lineNumberWidth: number;
    language: string | null;
  } | null;
  basePath: string;
  fileHunks: Map<number, "add" | "modify" | "delete">;
  deletionMarkers: Set<number>;
  getItemHeight: () => number;
  onSetHoveredLine: (lineNum: number | null) => void;
  fontSize: number;
  hoveredLine: number | null;
  isSelecting: boolean;
  onLineMouseDown: (e: React.MouseEvent, lineNum: number, lineContent: string) => void;
  onLineMouseEnter: (lineNum: number) => void;
  onLineMouseUp: () => void;
  isLineSelected: (lineNum: number) => boolean;
  onAddComment: (lineNum?: number) => void;
  showCommentInput: boolean;
  pendingComment: { startLine: number; endLine: number; lineContent: string[] } | null;
  onSubmitComment: (text: string) => void;
  onCancelComment: () => void;
  scrollOffset: number;
  onScrollOffsetChange: (offset: number) => void;
  listRef: React.RefObject<List>;
  // Search props
  isSearchOpen: boolean;
  searchQuery: string;
  searchMatches: SearchMatch[];
  currentMatchIndex: number;
  onSearchQueryChange: (query: string) => void;
  onSearchNext: () => void;
  onSearchPrevious: () => void;
  onSearchClose: () => void;
}

const FileContentView = memo(function FileContentView({
  selectedFile,
  isLoadingFile,
  fileContent,
  fileContentData,
  basePath,
  fileHunks,
  deletionMarkers,
  getItemHeight,
  onSetHoveredLine,
  fontSize,
  hoveredLine,
  isSelecting,
  onLineMouseDown,
  onLineMouseEnter,
  onLineMouseUp,
  isLineSelected,
  onAddComment,
  showCommentInput,
  pendingComment,
  onSubmitComment,
  onCancelComment,
  scrollOffset,
  onScrollOffsetChange,
  listRef,
  isSearchOpen,
  searchQuery,
  searchMatches,
  currentMatchIndex,
  onSearchQueryChange,
  onSearchNext,
  onSearchPrevious,
  onSearchClose,
}: FileContentViewProps) {
  const [copied, setCopied] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);

  const relativePath = selectedFile && basePath && selectedFile.startsWith(basePath + "/")
    ? selectedFile.slice(basePath.length + 1)
    : selectedFile;

  const handleCopy = useCallback(async () => {
    if (!fileContentData) return;
    try {
      await navigator.clipboard.writeText(fileContentData.rawLines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  }, [fileContentData]);

  const handleCopyPath = useCallback(async () => {
    if (!relativePath) return;
    try {
      await navigator.clipboard.writeText(relativePath);
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 2000);
    } catch (error) {
      console.error("Failed to copy path:", error);
    }
  }, [relativePath]);

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
        <p className="text-sm">{selectedFile.split("/").pop()}</p>
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

  const { lines, lineNumberWidth } = fileContentData;

  return (
    <div className="h-full flex flex-col bg-[hsl(var(--code-background))]">
      <TooltipProvider>
        <div className="px-4 pt-4 pb-2 border-b-[1px] border-solid border-zinc-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground font-mono">
              {relativePath}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleCopyPath}
                  className="p-1 hover:bg-muted rounded transition-colors text-muted-foreground hover:text-foreground"
                >
                  {copiedPath ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Copy file path</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleCopy}
                className="p-1 hover:bg-muted rounded border border-border/50 transition-colors text-muted-foreground hover:text-foreground"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Copy file contents</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
      <div className="flex-1 overflow-hidden relative">
        <List
          ref={listRef}
          style={{ height: window.innerHeight, width: "100%" }}
          className="px-4 pb-4"
          rowCount={lines.length}
          rowHeight={getItemHeight}
          onScroll={(e: unknown) => {
            const scrollEvent = e as { scrollOffset: number };
            onScrollOffsetChange(scrollEvent.scrollOffset);
          }}
          rowComponent={({
            index,
            style,
          }: {
            index: number;
            style: React.CSSProperties;
          }) => {
            const lineNum = index + 1;
            let line = lines[index];
            const diffStatus = fileHunks.get(lineNum);
            const hasDeletionMarker = deletionMarkers.has(lineNum);

            // Apply search highlighting if there's a query
            if (searchQuery) {
              // Find which global match index corresponds to this line
              const lineMatches = searchMatches.filter(m => m.lineNumber === index);
              if (lineMatches.length > 0) {
                // Find global index of first match on this line
                const firstMatchGlobalIndex = searchMatches.findIndex(m => m.lineNumber === index);
                const isCurrentMatchOnLine = searchMatches[currentMatchIndex]?.lineNumber === index;
                const currentMatchOffset = isCurrentMatchOnLine ?
                  currentMatchIndex - firstMatchGlobalIndex : -1;

                const result = highlightInHtml(line, searchQuery, currentMatchOffset);
                line = result.html;
              }
            }

            return (
              <CodeLine
                lineNum={lineNum}
                htmlContent={line}
                diffStatus={diffStatus}
                hasDeletionMarker={hasDeletionMarker}
                lineNumberWidth={lineNumberWidth}
                onMouseEnter={() => onSetHoveredLine(lineNum)}
                onMouseLeave={() => onSetHoveredLine(null)}
                style={style}
                fontSize={fontSize}
                hoveredLine={hoveredLine}
                isLineSelected={isLineSelected(lineNum)}
                isSelecting={isSelecting}
                onLineMouseDown={onLineMouseDown}
                onLineMouseEnter={onLineMouseEnter}
                onLineMouseUp={onLineMouseUp}
                onAddComment={onAddComment}
              />
            );
          }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          rowProps={{} as any}
        />
        {/* Comment form overlay - positioned right after the selected line */}
        {showCommentInput && pendingComment && (
          <div
            className="absolute left-4 right-4 z-10 bg-muted/60 border border-border/40 rounded px-4 py-3 shadow-lg"
            style={{
              // Line N (1-indexed) occupies y: (N-1)*LINE_HEIGHT to N*LINE_HEIGHT
              // To position after line N, we want top = N*LINE_HEIGHT
              // Subtract scrollOffset for viewport coords, subtract additional LINE_HEIGHT for observed offset
              top: `${pendingComment.endLine * LINE_HEIGHT - scrollOffset - LINE_HEIGHT}px`,
            }}
          >
            <div className="mb-2 text-md text-muted-foreground">
              <span>
                {selectedFile && basePath && selectedFile.startsWith(basePath + "/")
                  ? selectedFile.slice(basePath.length + 1)
                  : selectedFile}
                :L{pendingComment.startLine}
                {pendingComment.startLine !== pendingComment.endLine &&
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
                  onCancelComment();
                } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  const target = e.target as HTMLTextAreaElement;
                  onSubmitComment(target.value);
                }
              }}
            />
            <div className="flex justify-end items-center gap-2">
              <Button size="sm" variant="ghost" onClick={onCancelComment}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  const textarea = document.getElementById("comment-textarea") as HTMLTextAreaElement;
                  if (textarea) {
                    onSubmitComment(textarea.value);
                  }
                }}
              >
                Request changes
              </Button>
            </div>
          </div>
        )}
        {/* Search overlay */}
        <SearchOverlay
          isVisible={isSearchOpen}
          query={searchQuery}
          onQueryChange={onSearchQueryChange}
          onNext={onSearchNext}
          onPrevious={onSearchPrevious}
          onClose={onSearchClose}
          currentMatch={searchMatches.length > 0 ? currentMatchIndex + 1 : 0}
          totalMatches={searchMatches.length}
          className="absolute top-2 right-2 z-20"
        />
      </div>
    </div>
  );
});

const TreeNode = memo(function TreeNode({
  entry,
  depth,
  isExpanded,
  children,
  hasChanges,
  selectedFile,
  changedFiles,
  onDirectoryClick,
  onFileClick,
  getDirectoryChangeStatus,
  renderChildren,
}: TreeNodeProps) {
  if (entry.is_directory) {
    return (
      <div key={entry.path} className="text-sm">
        <button
          type="button"
          className={cn(
            "flex items-center gap-2 w-full px-2 py-1 rounded-md hover:bg-muted/60 transition",
            "text-left"
          )}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => onDirectoryClick(entry.path)}
        >
          {isExpanded ? (
            <FolderOpen className="w-4 h-4 flex-shrink-0" />
          ) : (
            <Folder className="w-4 h-4 flex-shrink-0" />
          )}
          <span
            className={cn(
              "font-medium truncate font-mono text-sm",
              getFileStatusTextColor(getDirectoryChangeStatus(entry.path)?.workspaceStatus)
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
              .map((child) => renderChildren(child, depth + 1))}
          </div>
        )}
        {isExpanded && children.length === 0 && (
          <div
            className="text-sm text-muted-foreground px-2 py-1"
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
  const status = fileStatus?.workspaceStatus;
  return (
    <button
      key={entry.path}
      type="button"
      onClick={() => onFileClick(entry.path)}
      className={cn(
        "w-full flex items-center gap-2 px-2 py-1 rounded-md text-sm transition",
        "hover:bg-muted/60 text-left",
        selectedFile === entry.path && "bg-primary/10"
      )}
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
    >
      <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      <span className={cn("truncate font-mono text-sm", getFileStatusTextColor(status))}>
        {entry.name}
      </span>
      {status && (
        <span
          className={cn("w-2 h-2 rounded-full flex-shrink-0 ml-auto", getStatusBgColor(status))}
          title={status === "M" ? "Modified" : status === "A" ? "Added" : status === "D" ? "Deleted" : "Changed"}
        />
      )}
    </button>
  );
});

export const FileBrowser = memo(function FileBrowser({
  workspace,
  repoPath,
  initialSelectedFile,
  initialExpandedDir,
  onCreateAgentWithComment,
}: FileBrowserProps) {
  // Determine the path and branch to use
  const basePath = workspace?.workspace_path ?? repoPath ?? "";

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
  const [changedFiles, setChangedFiles] = useState<Map<string, ParsedFileChange>>(new Map());
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
  const [scrollOffset, setScrollOffset] = useState(0);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const { addToast } = useToast();
  const { fontSize} = useTerminalSettings();
  const listRef = useRef<List>(null);

  // Ensure workspace is indexed on mount
  useEffect(() => {
    if (repoPath) {
      const workspacePath = workspace?.workspace_path || basePath;
      const workspaceId = workspace?.id ?? null;
      ensureWorkspaceIndexed(repoPath, workspaceId, workspacePath)
        .catch((error) => {
          console.error("Failed to ensure workspace indexed:", error);
        });
    }
  }, [repoPath, workspace?.id, workspace?.workspace_path, basePath]);

  // Load root directory on mount
  useEffect(() => {
    setIsLoadingDir(true);
    listDirectory(basePath)
      .then((entries) => {
        const filtered = filterHiddenEntries(entries);
        setRootEntries(filtered);
        setDirectoryCache(new Map([[basePath, filtered]]));
      })
      .catch((error) => {
        addToast({
          title: "Failed to load directory",
          description: error instanceof Error ? error.message : String(error),
          type: "error",
        });
      })
      .finally(() => setIsLoadingDir(false));
  }, [basePath]);

  // Load changed files from JJ
  useEffect(() => {
    if (repoPath) {
      const workspacePath = workspace?.workspace_path || repoPath;
      jjGetChangedFiles(workspacePath)
        .then(jjFiles => {
          const parsed = parseJjChangedFiles(jjFiles);
          const map = new Map<string, ParsedFileChange>();
          for (const file of parsed) {
            // Store with full path as key (basePath + relative path)
            const fullPath = `${basePath}/${file.path}`;
            map.set(fullPath, file);
          }
          setChangedFiles(map);
        })
        .catch(() => setChangedFiles(new Map()));
    }
  }, [repoPath, workspace?.workspace_path, basePath]);

  // Keyboard shortcut for search
  useKeyboardShortcut("f", true, () => {
    if (selectedFile && !isBinaryFile(selectedFile)) {
      setIsSearchOpen(true);
    }
  }, [selectedFile]);

  // Compute search matches
  const searchMatches = useMemo(() => {
    if (!searchQuery || !fileContent) {
      return [];
    }
    return findMatches(fileContent, searchQuery);
  }, [fileContent, searchQuery]);

  // Search navigation handlers
  const handleSearchNext = useCallback(() => {
    if (searchMatches.length === 0) return;
    const newIndex = (currentMatchIndex + 1) % searchMatches.length;
    setCurrentMatchIndex(newIndex);

    // Scroll to the match
    const match = searchMatches[newIndex];
    if (match && listRef.current) {
      listRef.current.scrollToItem(match.lineNumber, "center");
    }
  }, [searchMatches, currentMatchIndex]);

  const handleSearchPrevious = useCallback(() => {
    if (searchMatches.length === 0) return;
    const newIndex = (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length;
    setCurrentMatchIndex(newIndex);

    // Scroll to the match
    const match = searchMatches[newIndex];
    if (match && listRef.current) {
      listRef.current.scrollToItem(match.lineNumber, "center");
    }
  }, [searchMatches, currentMatchIndex]);

  const handleSearchClose = useCallback(() => {
    setIsSearchOpen(false);
    setSearchQuery("");
    setCurrentMatchIndex(0);
  }, []);

  // Reset search when file changes
  useEffect(() => {
    setSearchQuery("");
    setCurrentMatchIndex(0);
    setIsSearchOpen(false);
  }, [selectedFile]);

  // Reset current match index when query changes
  useEffect(() => {
    setCurrentMatchIndex(0);
  }, [searchQuery]);

  const handleFileClick = useCallback(
    async (path: string) => {
      setSelectedFile(path);
      setScrollOffset(0); // Reset scroll when switching files

      // Check if binary file
      if (isBinaryFile(path)) {
        setFileContent("");
        setFileHunks(new Map());
        return;
      }

      setIsLoadingFile(true);
      try {
        const content = await readFile(path);

        // Don't load large files
        if (content.length > 1024 * 1024) {
          addToast({
            title: "File too large",
            description: "Files larger than 1MB cannot be displayed.",
            type: "warning",
          });
          setSelectedFile(null);
          setIsLoadingFile(false);
          return;
        }

        setFileContent(content);

        // Load hunks for line-level indicators
        if (changedFiles.has(path)) {
          try {
            const hunks = await jjGetFileHunks(
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
            console.error("Failed to load jj hunks:", error);
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
    (text: string) => {
      if (!pendingComment || !selectedFile) return;

      // Call the callback to create agent and send comment
      if (onCreateAgentWithComment) {
        onCreateAgentWithComment(
          selectedFile,
          pendingComment.startLine,
          pendingComment.endLine,
          pendingComment.lineContent,
          text
        );
      }

      setShowCommentInput(false);
      setPendingComment(null);
      setLineSelection(null);
    },
    [pendingComment, selectedFile, onCreateAgentWithComment]
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
      const isExpanded = expandedDirs.has(entry.path);
      const children = directoryCache.get(entry.path) || [];
      const hasChanges = hasChangedFilesInDirectory(entry.path);

      return (
        <TreeNode
          key={entry.path}
          entry={entry}
          depth={depth}
          isExpanded={isExpanded}
          children={children}
          hasChanges={hasChanges}
          selectedFile={selectedFile}
          changedFiles={changedFiles}
          onDirectoryClick={handleDirectoryClick}
          onFileClick={handleFileClick}
          getDirectoryChangeStatus={getDirectoryChangeStatus}
          renderChildren={renderTreeNode}
        />
      );
    },
    [
      expandedDirs,
      directoryCache,
      hasChangedFilesInDirectory,
      selectedFile,
      changedFiles,
      handleDirectoryClick,
      handleFileClick,
      getDirectoryChangeStatus,
    ]
  );

  // Calculate item height for virtualization
  const getItemHeight = useCallback(() => {
    return LINE_HEIGHT;
  }, []);

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
    return (
      <FileContentView
        selectedFile={selectedFile}
        isLoadingFile={isLoadingFile}
        fileContent={fileContent}
        fileContentData={fileContentData}
        basePath={basePath}
        fileHunks={fileHunks}
        deletionMarkers={deletionMarkers}
        getItemHeight={getItemHeight}
        onSetHoveredLine={setHoveredLine}
        fontSize={fontSize}
        hoveredLine={hoveredLine}
        isSelecting={isSelecting}
        onLineMouseDown={handleLineMouseDown}
        onLineMouseEnter={handleLineMouseEnter}
        onLineMouseUp={handleLineMouseUp}
        isLineSelected={isLineSelected}
        onAddComment={handleAddComment}
        showCommentInput={showCommentInput}
        pendingComment={pendingComment}
        onSubmitComment={handleSubmitComment}
        onCancelComment={handleCancelComment}
        scrollOffset={scrollOffset}
        onScrollOffsetChange={setScrollOffset}
        listRef={listRef}
        isSearchOpen={isSearchOpen}
        searchQuery={searchQuery}
        searchMatches={searchMatches}
        currentMatchIndex={currentMatchIndex}
        onSearchQueryChange={setSearchQuery}
        onSearchNext={handleSearchNext}
        onSearchPrevious={handleSearchPrevious}
        onSearchClose={handleSearchClose}
      />
    );
  };

  return (
    <div
      className="h-full flex bg-background overflow-hidden"
      data-testid="file-browser"
    >
      {/* File Tree */}
      <div className="w-72 flex-shrink-0 border-r bg-sidebar overflow-auto">
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
