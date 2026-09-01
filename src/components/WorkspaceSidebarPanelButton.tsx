import type { LucideIcon } from "lucide-react";
import { SidebarMenuButton, SidebarMenuItem } from "./ui/sidebar";

interface WorkspaceSidebarPanelButtonProps {
  page: string;
  currentPage?: string;
  onClick: () => void;
  icon: LucideIcon;
  label: string;
  testId: string;
}

export function WorkspaceSidebarPanelButton({
  page,
  currentPage,
  onClick,
  icon: Icon,
  label,
  testId,
}: WorkspaceSidebarPanelButtonProps) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        type="button"
        data-testid={testId}
        isActive={currentPage === page}
        onClick={onClick}
        aria-label={label}
        className={`h-auto py-1 ${currentPage === page ? "bg-primary/20" : ""}`}
      >
        <Icon className="w-3 h-3" />
        <span>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
