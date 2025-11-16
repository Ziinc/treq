import { useEffect, useState, useMemo, memo } from "react";
import Editor from "@monaco-editor/react";
import { gitGetChangedFiles, gitGetFileDiff, gitStageFile, gitUnstageFile } from "../lib/api";
import { CheckCircle2, Circle, Loader2, FileText } from "lucide-react";
import { Button } from "./ui/button";
import { useToast } from "./ui/toast";

interface StagingDiffViewerProps {
  worktreePath: string;
  readOnly?: boolean;
}

interface FileChange {
  path: string;
  status: string; // M, A, D, ??
}

export const StagingDiffViewer: React.FC<StagingDiffViewerProps> = memo(({ worktreePath, readOnly = false }) => {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [diff, setDiff] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<FileChange[]>([]);
  const [stagedFiles, setStagedFiles] = useState<Set<string>>(new Set());
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const { addToast } = useToast();

  useEffect(() => {
    loadChangedFiles();
  }, [worktreePath, refreshTrigger]);

  const loadChangedFiles = async () => {
    try {
      const changedFiles = await gitGetChangedFiles(worktreePath);
      
      // Parse git status to determine which files are staged
      // Files that are staged will have their status in the first column (not a space)
      const fileChanges: FileChange[] = changedFiles.map((file) => {
        // Determine status from file path
        // git status --porcelain format: XY filename
        // X = staged, Y = working tree
        const statusCode = file.startsWith(' ') ? '??' : 'M';
        return {
          path: file.trim(),
          status: statusCode,
        };
      });
      
      setFiles(fileChanges);
    } catch (err) {
      console.error("Failed to load changed files:", err);
      addToast({
        title: "Error",
        description: "Failed to load changed files",
        type: "error",
      });
    }
  };

  const handleFileClick = async (filePath: string) => {
    setSelectedFile(filePath);
    setLoading(true);
    
    try {
      const diffContent = await gitGetFileDiff(worktreePath, filePath);
      setDiff(diffContent);
    } catch (err) {
      console.error("Failed to load diff:", err);
      setDiff("Failed to load diff");
    } finally {
      setLoading(false);
    }
  };

  const handleStageFile = async (filePath: string) => {
    try {
      await gitStageFile(worktreePath, filePath);
      setStagedFiles(prev => new Set(prev).add(filePath));
      addToast({
        title: "File Staged",
        description: `${filePath} has been staged`,
        type: "success",
      });
      setRefreshTrigger(prev => prev + 1);
    } catch (err) {
      addToast({
        title: "Stage Failed",
        description: err instanceof Error ? err.message : String(err),
        type: "error",
      });
    }
  };

  const handleUnstageFile = async (filePath: string) => {
    try {
      await gitUnstageFile(worktreePath, filePath);
      setStagedFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(filePath);
        return newSet;
      });
      addToast({
        title: "File Unstaged",
        description: `${filePath} has been unstaged`,
        type: "success",
      });
      setRefreshTrigger(prev => prev + 1);
    } catch (err) {
      addToast({
        title: "Unstage Failed",
        description: err instanceof Error ? err.message : String(err),
        type: "error",
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'M':
        return 'text-yellow-500';
      case 'A':
        return 'text-green-500';
      case 'D':
        return 'text-red-500';
      case '??':
        return 'text-gray-500';
      default:
        return 'text-foreground';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'M':
        return 'M';
      case 'A':
        return 'A';
      case 'D':
        return 'D';
      case '??':
        return 'U';
      default:
        return status;
    }
  };

  // Memoize the file list rendering to prevent unnecessary re-renders
  const fileListContent = useMemo(() => {
    if (files.length === 0) {
      return (
        <div className="text-sm text-muted-foreground text-center py-8">
          No changes detected
        </div>
      );
    }

    return (
      <div className="space-y-0.5">
        {files.map((file) => {
          const isStaged = stagedFiles.has(file.path);
          return (
            <div
              key={file.path}
              className={`rounded transition-colors ${
                selectedFile === file.path ? "bg-accent" : "hover:bg-accent/50"
              }`}
            >
              <div className="flex items-center gap-1.5 px-2 py-1">
                <span className={`font-mono text-xs font-semibold ${getStatusColor(file.status)}`}>
                  {getStatusIcon(file.status)}
                </span>
                <button
                  onClick={() => handleFileClick(file.path)}
                  className="flex-1 text-xs truncate text-left"
                  title={file.path}
                >
                  {file.path}
                </button>
                
                {!readOnly && (
                  <button
                    onClick={() => isStaged ? handleUnstageFile(file.path) : handleStageFile(file.path)}
                    className="p-0.5 hover:bg-accent rounded transition-colors flex-shrink-0"
                    title={isStaged ? "Unstage file" : "Stage file"}
                  >
                    {isStaged ? (
                      <CheckCircle2 className="w-3 h-3 text-green-500" />
                    ) : (
                      <Circle className="w-3 h-3 text-muted-foreground" />
                    )}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }, [files, selectedFile, stagedFiles, readOnly]);

  return (
    <div className="flex h-full">
      {/* File list sidebar */}
      <div className="w-56 border-r bg-sidebar overflow-y-auto">
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">Changed Files</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRefreshTrigger(prev => prev + 1)}
            >
              <Loader2 className="w-4 h-4" />
            </Button>
          </div>
          
          {fileListContent}
        </div>
      </div>

      {/* Diff viewer */}
      <div className="flex-1 flex flex-col">
        {selectedFile ? (
          <>
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <h3 className="font-semibold">{selectedFile}</h3>
                {!readOnly && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {stagedFiles.has(selectedFile) ? "Staged for commit" : "Not staged"}
                  </p>
                )}
              </div>
              {!readOnly && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => 
                    stagedFiles.has(selectedFile) 
                      ? handleUnstageFile(selectedFile) 
                      : handleStageFile(selectedFile)
                  }
                >
                  {stagedFiles.has(selectedFile) ? "Unstage" : "Stage"}
                </Button>
              )}
            </div>
            <div className="flex-1">
              {loading ? (
                <div className="p-4 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : (
                <Editor
                  height="100%"
                  defaultLanguage="diff"
                  value={diff}
                  theme="vs-dark"
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    lineNumbers: "on",
                    renderLineHighlight: "all",
                  }}
                />
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p>Select a file to view diff</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

StagingDiffViewer.displayName = 'StagingDiffViewer';

