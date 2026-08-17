import type { Meta, StoryObj } from "@storybook/react-vite";
import { CalendarClock, Github, Home, Search, Settings } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarProvider,
  SidebarSeparator,
} from "./sidebar";

const meta = {
  title: "ui/Sidebar",
  component: Sidebar,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof Sidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    controls: { disable: true },
  },
  render: () => (
    <SidebarProvider className="h-[480px]">
      <Sidebar collapsible="none" className="h-full border-r border-border">
        <SidebarHeader>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-muted-foreground"
            >
              <Search className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate text-left">treq</span>
            </button>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted/50"
              aria-label="Settings"
            >
              <Settings className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive>
                    <Home />
                    <span>main</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <Github />
                    <span>Github</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarSeparator />
          <SidebarGroup>
            <SidebarGroupLabel className="uppercase tracking-widest">
              Workspaces
            </SidebarGroupLabel>
            <SidebarGroupAction aria-label="Show hidden workspaces">
              <CalendarClock />
            </SidebarGroupAction>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <span>feat/alpha</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive>
                    <span>feat/beta</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuSkeleton />
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarGroupLabel className="uppercase tracking-widest">
            Sessions
          </SidebarGroupLabel>
        </SidebarFooter>
      </Sidebar>
    </SidebarProvider>
  ),
};
