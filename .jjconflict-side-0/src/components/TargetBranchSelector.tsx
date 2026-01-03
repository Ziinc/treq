import { GitBranch, Loader2, ChevronDown, Check } from "lucide-react";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/dropdown-menu";

// Define BranchListItem locally since git API was removed
export interface BranchListItem {
  name: string;
  full_name: string;
  is_current: boolean;
}

interface TargetBranchSelectorProps {
  branches: BranchListItem[];
  loading: boolean;
  targetBranch: string | null;
  onSelect: (branch: string) => void;
  disabled?: boolean;
}

export const TargetBranchSelector: React.FC<TargetBranchSelectorProps> = ({
  branches,
  loading,
  targetBranch,
  onSelect,
  disabled,
}) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || loading}
          className="gap-2"
          aria-label="Workspace target"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <GitBranch className="w-4 h-4" />
          )}
          <span className="font-mono">{targetBranch || "Select..."}</span>
          <ChevronDown className="w-4 h-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-96 overflow-auto">
        {loading ? (
          <div className="px-2 py-4 text-sm text-center text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1" />
            Loading branches...
          </div>
        ) : branches.length === 0 ? (
          <div className="px-2 py-4 text-sm text-center text-muted-foreground">
            No branches available
          </div>
        ) : (
          branches.map((branch) => (
            <DropdownMenuItem
              key={branch.full_name}
              onSelect={() => onSelect(branch.name)}
              className="font-mono"
            >
              <span className="flex-1">{branch.name}</span>
              {branch.name === targetBranch && (
                <Check className="w-4 h-4 ml-2" />
              )}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
