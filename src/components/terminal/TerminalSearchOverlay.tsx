import {
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";

interface TerminalSearchOverlayProps {
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onSearchKeyDown: (e: ReactKeyboardEvent<HTMLInputElement>) => void;
  onFindPrevious: () => void;
  onFindNext: () => void;
  onClose: () => void;
}

export function TerminalSearchOverlay({
  searchInputRef,
  searchQuery,
  onSearchQueryChange,
  onSearchKeyDown,
  onFindPrevious,
  onFindNext,
  onClose,
}: TerminalSearchOverlayProps) {
  return (
    <div className="absolute top-2 right-2 z-30 bg-background border border-border rounded-md shadow-lg p-0.5 flex items-center gap-0.5">
      <Input
        ref={searchInputRef}
        value={searchQuery}
        onChange={(e) => onSearchQueryChange(e.target.value)}
        placeholder="Find"
        onKeyDown={onSearchKeyDown}
        className="h-6 w-48 text-sm !outline-none !ring-0"
      />
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="h-5 w-5 rounded-sm p-0 bg-background text-muted-foreground hover:text-foreground"
              onClick={onFindPrevious}
              disabled={!searchQuery.trim()}
              aria-label="Find previous"
            >
              <ChevronUp className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Previous (Shift+Enter)</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="h-5 w-5 rounded-sm p-0 bg-background text-muted-foreground hover:text-foreground"
              onClick={onFindNext}
              disabled={!searchQuery.trim()}
              aria-label="Find next"
            >
              <ChevronDown className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Next (Enter)</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="h-5 w-5 rounded-sm p-0 bg-background text-muted-foreground hover:text-foreground"
              onClick={onClose}
              aria-label="Close search"
            >
              <X className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Close (Esc)</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
