import { useState, useCallback, useEffect } from "react";
import { Command } from "cmdk";
import { FileText } from "lucide-react";
import { searchWorkspaceFiles, FileSearchResult } from "../lib/api";
import { useDebounce } from "../hooks/useDebounce";

interface FilePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoPath: string;
  workspaceId: number | null;
  onFileSelect: (filePath: string) => void;
}

export const FilePicker: React.FC<FilePickerProps> = ({
  open,
  onOpenChange,
  repoPath,
  workspaceId,
  onFileSelect,
}) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FileSearchResult[]>([]);
  const [_isLoading, setIsLoading] = useState(false);

  const debouncedQuery = useDebounce(query, 150);

  // Search when debounced query changes
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([]);
      return;
    }

    setIsLoading(true);
    searchWorkspaceFiles(repoPath, workspaceId, debouncedQuery, 50)
      .then(setResults)
      .catch(() => setResults([]))
      .finally(() => setIsLoading(false));
  }, [debouncedQuery, repoPath, workspaceId]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  const handleSelect = useCallback(
    (filePath: string) => {
      onFileSelect(filePath);
      onOpenChange(false);
    },
    [onFileSelect, onOpenChange]
  );

  // Get icon based on file extension (can be expanded)
  const getFileIcon = () => {
    return <FileText className="w-4 h-4 text-muted-foreground" />;
  };

  if (!open) {
    return null;
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Jump to File"
      className="[&_[cmdk-root]]:bg-background [&_[cmdk-root]]:text-foreground"
    >
      <div className="bg-background text-foreground rounded-xl border border-border shadow-2xl w-[40vw] max-w-none overflow-hidden">
        {/* Search Input */}
        <div className="flex items-center border-b border-border px-3 bg-background">
          <Command.Input
            placeholder="Search files..."
            value={query}
            onValueChange={setQuery}
            className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-12 flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground text-foreground"
          />
        </div>

        {/* Results List */}
        <Command.List className="max-h-[300px] overflow-y-auto py-2">
          <Command.Empty>
            <div className="px-4 py-8 text-center text-muted-foreground text-sm">
              {query.trim() ? "No files found" : "Type to search files..."}
            </div>
          </Command.Empty>

          {results.map((file) => (
            <Command.Item
              key={file.file_path}
              value={file.relative_path}
              onSelect={() => handleSelect(file.file_path)}
              className="px-3 py-1.5 mx-2 rounded-md flex items-center gap-3 cursor-pointer text-foreground aria-selected:bg-accent/50 aria-selected:text-foreground hover:bg-accent/30 transition-colors"
            >
              {getFileIcon()}
              <span className="truncate font-mono text-sm">
                {file.relative_path}
              </span>
            </Command.Item>
          ))}
        </Command.List>

        {/* Footer with keyboard hints */}
        <div className="border-t border-border px-3 py-2 flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">
                ↑↓
              </kbd>{" "}
              Navigate
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">
                ↵
              </kbd>{" "}
              Open
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">
                Esc
              </kbd>{" "}
              Close
            </span>
          </div>
        </div>
      </div>
    </Command.Dialog>
  );
};
