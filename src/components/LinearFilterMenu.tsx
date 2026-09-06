import { ChevronDown, Filter, X } from "lucide-react";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export type LinearFilterGroup = {
  key: string;
  label: string;
  value: string | undefined;
  options: { value: string; label: string }[];
  onChange: (value: string | undefined) => void;
};

/**
 * A single "Filter" trigger whose menu nests one submenu per filter group
 * (Assignee ›, Priority ›, ...), matching Linear's filter menu shape.
 * Active selections render as removable chips next to the trigger.
 */
export const LinearFilterMenu: React.FC<{
  groups: LinearFilterGroup[];
  testId?: string;
}> = ({ groups, testId }) => {
  const activeGroups = groups.filter((g) => g.value !== undefined);

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-sm"
            data-testid={testId ?? "linear-filter-menu-trigger"}
          >
            <Filter className="w-3.5 h-3.5" />
            Filter
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Filter by</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {groups.map((group) => (
            <DropdownMenuSub key={group.key}>
              <DropdownMenuSubTrigger
                data-testid={`linear-filter-${group.key}`}
              >
                {group.label}
                {group.value !== undefined && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {group.options.find((o) => o.value === group.value)
                      ?.label ?? group.value}
                  </span>
                )}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup value={group.value ?? ""}>
                  <DropdownMenuRadioItem
                    value=""
                    onSelect={() => group.onChange(undefined)}
                  >
                    Any
                  </DropdownMenuRadioItem>
                  {group.options.map((option) => (
                    <DropdownMenuRadioItem
                      key={option.value}
                      value={option.value}
                      onSelect={() => group.onChange(option.value)}
                    >
                      {option.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {activeGroups.map((group) => (
        <span
          key={group.key}
          data-testid={`linear-filter-chip-${group.key}`}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-muted text-foreground"
        >
          <span className="text-muted-foreground">{group.label}:</span>
          {group.options.find((o) => o.value === group.value)?.label ??
            group.value}
          <button
            type="button"
            aria-label={`Clear ${group.label} filter`}
            className="hover:text-destructive"
            onClick={() => group.onChange(undefined)}
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
    </div>
  );
};
