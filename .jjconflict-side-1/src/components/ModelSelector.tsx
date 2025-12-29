import { useCallback } from "react";
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
  { value: "default", label: "Default" },
  { value: "sonnet", label: "Sonnet" },
  { value: "opus", label: "Opus" },
  { value: "haiku", label: "Haiku" },
  { value: "sonnet[1m]", label: "Sonnet (1M)" },
  { value: "opusplan", label: "Opus Plan" },
];

export function ModelSelector({ currentModel, onModelChange, disabled }: ModelSelectorProps) {
  const getCurrentModelLabel = useCallback(() => {
    if (currentModel) {
      const model = AVAILABLE_MODELS.find(m => m.value === currentModel);
      return model?.label || currentModel;
    }
    return "Default";
  }, [currentModel]);

  const handleModelSelect = useCallback(async (modelValue: string) => {
    await onModelChange(modelValue);
  }, [onModelChange]);

  const isSelected = (modelValue: string) => {
    if (currentModel === null && modelValue === "default") return true;
    return currentModel === modelValue;
  };

  return (
    <DropdownMenu>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={disabled}
                className="h-5 w-5 rounded-sm hover:bg-muted flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity disabled:opacity-30"
                aria-label={`Model: ${getCurrentModelLabel()}`}
              >
                <Sparkles className="w-3 h-3 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{getCurrentModelLabel()}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DropdownMenuContent align="end" sideOffset={4}>
        {AVAILABLE_MODELS.map((model) => (
          <DropdownMenuItem
            key={model.value}
            onSelect={() => handleModelSelect(model.value)}
            className={isSelected(model.value) ? "bg-primary/15 text-primary font-medium" : ""}
          >
            {model.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
