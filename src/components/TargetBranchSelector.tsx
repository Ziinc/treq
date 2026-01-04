import { useState } from "react";
import { GitBranch, Loader2, ChevronDown, Check } from "lucide-react";
import { Command } from "cmdk";
import { Button } from "./ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/popover";

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
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
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
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command>
          <Command.Input
            placeholder="Search branches..."
            className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-10 px-3"
          />
          <Command.List className="max-h-[300px] overflow-auto">
            {loading ? (
              <div className="px-2 py-4 text-sm text-center text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1" />
                Loading branches...
              </div>
            ) : (
              <>
                <Command.Empty>
                  <div className="px-2 py-4 text-sm text-center text-muted-foreground">
                    No branches found
                  </div>
                </Command.Empty>
                {branches.map((branch) => (
                  <Command.Item
                    key={branch.full_name}
                    value={branch.name}
                    onSelect={() => {
                      onSelect(branch.name);
                      setOpen(false);
                    }}
                    className="px-3 py-1.5 flex items-center gap-2 cursor-pointer aria-selected:bg-accent font-mono"
                  >
                    <span className="flex-1">{branch.name}</span>
                    {branch.name === targetBranch && (
                      <Check className="w-4 h-4" />
                    )}
                  </Command.Item>
                ))}
              </>
            )}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
