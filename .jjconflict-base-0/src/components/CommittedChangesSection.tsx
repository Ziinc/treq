import { memo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { GitFileRow } from "./GitFileRow";
import type { JjFileChange } from "../lib/api";

export interface CommittedChangesSectionProps {
  files: JjFileChange[];
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  activeFilePath: string | null;
  onFileSelect: (path: string, event: React.MouseEvent) => void;
}

export const CommittedChangesSection = memo<CommittedChangesSectionProps>(
  ({ files, isCollapsed, onToggleCollapse, activeFilePath, onFileSelect }) => {
    // Don't render if no files
    if (files.length === 0) {
      return null;
    }

    return (
      <div className="mt-4">
        <div className="flex items-center justify-between w-full text-sm uppercase tracking-wide text-muted-foreground">
          <button
            type="button"
            className="flex items-center gap-1 hover:text-foreground transition-colors"
            onClick={onToggleCollapse}
          >
            {isCollapsed ? (
              <ChevronRight className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
            <span>Committed</span>
          </button>
          <span className="ml-1">{files.length}</span>
        </div>
        {!isCollapsed && (
          <div className="mt-2 overflow-hidden select-none font-sans">
            {files.map((file) => (
              <GitFileRow
                key={file.path}
                file={file}
                isSelected={false}
                isActive={activeFilePath === file.path}
                isLastSelected={false}
                readOnly={true}
                onFileClick={onFileSelect}
              />
            ))}
          </div>
        )}
      </div>
    );
  }
);

CommittedChangesSection.displayName = "CommittedChangesSection";
