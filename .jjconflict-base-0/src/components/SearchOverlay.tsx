import { useEffect, useRef } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { ChevronUp, ChevronDown, X } from "lucide-react";

export interface SearchOverlayProps {
  isVisible: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  onNext: () => void;
  onPrevious: () => void;
  onClose: () => void;
  currentMatch: number;
  totalMatches: number;
  className?: string;
}

export function SearchOverlay({
  isVisible,
  query,
  onQueryChange,
  onNext,
  onPrevious,
  onClose,
  currentMatch,
  totalMatches,
  className = "",
}: SearchOverlayProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when overlay becomes visible
  useEffect(() => {
    if (isVisible && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isVisible]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        onPrevious();
      } else {
        onNext();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div
      className={`bg-background border border-border rounded-md shadow-lg p-0.5 flex items-center gap-0.5 ${className}`}
    >
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Find"
        onKeyDown={handleKeyDown}
        className="h-6 w-48 text-sm !outline-none !ring-0"
      />

      <span className="text-xs text-muted-foreground px-2 whitespace-nowrap">
        {currentMatch} of {totalMatches}
      </span>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="h-5 w-5 rounded-sm p-0 bg-background text-muted-foreground hover:text-foreground"
              onClick={onPrevious}
              disabled={!query.trim()}
              aria-label="Find previous"
            >
              <ChevronUp className="w-3.5 h-3.5" />
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
              onClick={onNext}
              disabled={!query.trim()}
              aria-label="Find next"
            >
              <ChevronDown className="w-3.5 h-3.5" />
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
              <X className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Close (Esc)</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
