import { CalendarClock } from "lucide-react";
import { SidebarGroupAction } from "./ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

export function HiddenWorkspacesToggle({
  showHidden,
  hiddenCount,
  onToggle,
}: {
  showHidden: boolean;
  hiddenCount: number;
  onToggle: () => void;
}) {
  const label = showHidden
    ? "Hide scheduled workspaces"
    : hiddenCount > 0
      ? `Show ${hiddenCount} hidden workspace${hiddenCount === 1 ? "" : "s"}`
      : "Show hidden workspaces";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <SidebarGroupAction
          type="button"
          data-testid="show-hidden-workspaces-toggle"
          aria-pressed={showHidden}
          aria-label={label}
          onClick={onToggle}
          className={showHidden ? "bg-primary/20 text-primary" : undefined}
        >
          <CalendarClock />
          {hiddenCount > 0 && (
            <span
              data-testid="hidden-workspace-count"
              className="absolute -top-1 -right-1 min-w-3.5 h-3.5 px-0.5 rounded-full bg-foreground/70 text-background text-[9px] leading-none font-semibold flex items-center justify-center"
            >
              {hiddenCount}
            </span>
          )}
        </SidebarGroupAction>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
