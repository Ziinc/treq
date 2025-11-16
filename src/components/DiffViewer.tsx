import { useEffect, useState } from "react";
import Editor from "@monaco-editor/react";
import { gitGetFileDiff, gitGetChangedFiles } from "../lib/api";
import { FileText } from "lucide-react";

interface DiffViewerProps {
  worktreePath: string;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({ worktreePath }) => {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [diff, setDiff] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<string[]>([]);

  useEffect(() => {
    loadChangedFiles();
  }, [worktreePath]);

  const loadChangedFiles = async () => {
    try {
      const changedFiles = await gitGetChangedFiles(worktreePath);
      setFiles(changedFiles);
    } catch (err) {
      console.error("Failed to load changed files:", err);
      setFiles([]);
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


  return (
    <div className="flex h-full">
      {/* File list sidebar */}
      <div className="w-64 border-r bg-sidebar overflow-y-auto">
        <div className="p-4">
          <h3 className="font-semibold mb-3 text-sm">Changed Files</h3>
          {files.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              No changes detected
            </div>
          ) : (
            <div className="space-y-0.5">
              {files.map((file) => (
                <button
                  key={file}
                  onClick={() => handleFileClick(file)}
                  className={`w-full text-left px-2 py-1.5 rounded-md text-sm flex items-center gap-2 hover:bg-accent transition-colors ${
                    selectedFile === file ? "bg-accent" : ""
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  <span className="truncate">{file}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Diff viewer */}
      <div className="flex-1">
        {files.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <FileText className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-semibold mb-2">No Active Changes</p>
              <p className="text-sm">This worktree has no uncommitted changes.</p>
            </div>
          </div>
        ) : selectedFile ? (
          <div className="h-full flex flex-col">
            <div className="p-4 border-b">
              <h3 className="font-semibold">{selectedFile}</h3>
            </div>
            <div className="flex-1">
              {loading ? (
                <div className="p-4">Loading diff...</div>
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
                  }}
                />
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Select a file to view diff</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

