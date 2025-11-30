import { useState, useCallback } from "react";
import { Sparkles } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/dropdown-menu";

interface ModelSelectorProps {
  currentModel: string | null;
  onModelChange: (model: string) => Promise<void>;
  disabled?: boolean;
}

const AVAILABLE_MODELS = [
  { value: "claude-sonnet-4-5-20250929", label: "Sonnet 4.5" },
  { value: "claude-3-5-sonnet-20241022", label: "Sonnet 3.5" },
  { value: "claude-opus-4-20250514", label: "Opus 4" },
  { value: "claude-3-7-sonnet-20250219", label: "Sonnet 3.7" },
];

export function ModelSelector({ currentModel, onModelChange, disabled }: ModelSelectorProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const getCurrentModelLabel = useCallback(() => {
    if (currentModel) {
      const model = AVAILABLE_MODELS.find(m => m.value === currentModel);
      return model?.label || currentModel;
    }
    return "Default";
  }, [currentModel]);

  const handleModelSelect = useCallback(async (modelValue: string) => {
    setIsOpen(false);
    await onModelChange(modelValue);
  }, [onModelChange]);

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={disabled}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                className="h-6 rounded-md bg-background/90 border border-border/60 hover:bg-muted flex items-center justify-center transition-all duration-200 shadow-sm disabled:opacity-50 overflow-hidden"
                style={{
                  width: isHovered || isOpen ? '120px' : '24px',
                }}
                aria-label="Change model"
              >
                <Sparkles className="w-3 h-3 flex-shrink-0" />
                <span
                  className="text-xs ml-2 whitespace-nowrap transition-all duration-200"
                  style={{
                    opacity: isHovered || isOpen ? 1 : 0,
                    transform: isHovered || isOpen ? 'translateX(0)' : 'translateX(-10px)',
                  }}
                >
                  {getCurrentModelLabel()}
                </span>
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Change Model</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DropdownMenuContent align="end" sideOffset={4}>
        {AVAILABLE_MODELS.map((model) => (
          <DropdownMenuItem
            key={model.value}
            onSelect={() => handleModelSelect(model.value)}
            className={currentModel === model.value ? "bg-accent" : ""}
          >
            {model.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
