import { useState, useEffect, useCallback } from "react";
import { Folder, FolderOpen, FileText, X, Loader2, AlertCircle } from "lucide-react";
import type { Worktree, DirectoryEntry } from "../lib/api";
import { listDirectory, readFile } from "../lib/api";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { isBinaryFile } from "../lib/git-utils";
import { getLanguageFromPath, highlightCode } from "../lib/syntax-highlight";
import { useToast } from "./ui/toast";

interface FileBrowserProps {
  worktree: Worktree;
  onClose: () => void;
}

export function FileBrowser({ worktree, onClose }: FileBrowserProps) {
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set([worktree.worktree_path]));
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [directoryCache, setDirectoryCache] = useState<Map<string, DirectoryEntry[]>>(new Map());
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [isLoadingDir, setIsLoadingDir] = useState(false);
  const [rootEntries, setRootEntries] = useState<DirectoryEntry[]>([]);
  const { addToast } = useToast();

  // Load root directory on mount
  useEffect(() => {
    const loadRoot = async () => {
      setIsLoadingDir(true);
      try {
        const entries = await listDirectory(worktree.worktree_path);
        setRootEntries(entries);
        setDirectoryCache(new Map([[worktree.worktree_path, entries]]));
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
  }, [worktree.worktree_path, addToast]);

  const loadDirectory = useCallback(async (path: string): Promise<DirectoryEntry[]> => {
    if (directoryCache.has(path)) {
      return directoryCache.get(path)!;
    }

    try {
      const entries = await listDirectory(path);
      setDirectoryCache(prev => new Map(prev).set(path, entries));
      return entries;
    } catch (error) {
      addToast({
        title: "Failed to load directory",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
      return [];
    }
  }, [directoryCache, addToast]);

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

  const handleFileClick = async (path: string) => {
    setSelectedFile(path);

    // Check if binary file
    if (isBinaryFile(path)) {
      setFileContent("");
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
    } catch (error) {
      addToast({
        title: "Failed to read file",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
      setFileContent("");
    } finally {
      setIsLoadingFile(false);
    }
  };

  const renderTreeNode = (entry: DirectoryEntry, depth: number = 0): JSX.Element => {
    if (entry.is_directory) {
      const isExpanded = expandedDirs.has(entry.path);
      const children = directoryCache.get(entry.path) || [];

      return (
        <div key={entry.path} className="text-sm">
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
            <span className="font-medium truncate">{entry.name}</span>
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
    return (
      <button
        key={entry.path}
        type="button"
        onClick={() => handleFileClick(entry.path)}
        className={cn(
          "w-full flex items-center gap-2 px-2 py-1 rounded-md text-sm transition",
          "hover:bg-muted/60 text-left",
          selectedFile === entry.path && "bg-primary/10 border border-primary/40"
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <span className="truncate">{entry.name}</span>
      </button>
    );
  };

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

    if (!fileContent) {
      return (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          Failed to load file content
        </div>
      );
    }

    const language = getLanguageFromPath(selectedFile);
    const highlightedCode = language
      ? highlightCode(fileContent, language)
      : fileContent.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    return (
      <div className="h-full overflow-auto p-4">
        <div className="mb-2 text-xs text-muted-foreground font-mono">
          {selectedFile}
        </div>
        <pre className="text-sm font-mono leading-relaxed">
          <code
            className={language ? `language-${language}` : ''}
            dangerouslySetInnerHTML={{ __html: highlightedCode }}
          />
        </pre>
      </div>
    );
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex flex-col">
          <h2 className="text-lg font-semibold">File Browser</h2>
          <p className="text-sm text-muted-foreground">{worktree.branch_name}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* File Tree */}
        <div className="w-80 border-r bg-sidebar overflow-auto">
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
        <div className="flex-1 bg-background">
          {renderFileContent()}
        </div>
      </div>
    </div>
  );
}
