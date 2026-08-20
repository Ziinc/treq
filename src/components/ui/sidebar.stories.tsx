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
  SidebarInset,
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
  argTypes: {
    variant: {
      control: "select",
      options: ["sidebar", "floating", "inset"],
    },
    collapsible: {
      control: "select",
      options: ["none", "offcanvas", "icon"],
    },
    side: {
      control: "select",
      options: ["left", "right"],
    },
  },
  args: {
    variant: "sidebar",
    collapsible: "none",
    side: "left",
  },
} satisfies Meta<typeof Sidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

function AdeSidebar() {
  return (
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
  );
}

export const Default: Story = {
  parameters: {
    controls: { disable: true },
  },
  render: () => (
    <div className="flex h-[520px] gap-8 p-4">
      <SidebarProvider className="h-full w-[280px] shrink-0">
        <AdeSidebar />
      </SidebarProvider>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <p className="text-sm text-muted-foreground">Menu button variants</p>
        <SidebarProvider className="h-auto w-full min-h-0">
          <Sidebar collapsible="none" className="w-full border border-border">
            <SidebarContent className="overflow-visible p-2">
              <SidebarMenu>
                {(
                  [
                    ["default", "default"],
                    ["default", "sm"],
                    ["default", "lg"],
                    ["outline", "default"],
                  ] as const
                ).map(([variant, size]) => (
                  <SidebarMenuItem key={`${variant}-${size}`}>
                    <SidebarMenuButton size={size} variant={variant}>
                      <Home />
                      <span>
                        {variant} / {size}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
                <SidebarMenuItem>
                  <SidebarMenuButton disabled>
                    <Home />
                    <span>disabled</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive>
                    <Home />
                    <span>active</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuSkeleton showIcon />
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarContent>
          </Sidebar>
        </SidebarProvider>
      </div>
    </div>
  ),
};

export const WorkspaceAde: Story = {
  render: () => (
    <SidebarProvider className="h-[480px]">
      <AdeSidebar />
    </SidebarProvider>
  ),
};

export const Loading: Story = {
  render: () => (
    <SidebarProvider className="h-[480px]">
      <Sidebar collapsible="none" className="h-full border-r border-border">
        <SidebarHeader>
          <div className="h-9 rounded-lg border border-border bg-muted/50" />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel className="uppercase tracking-widest">
              Workspaces
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {Array.from({ length: 6 }, (_, index) => (
                  <SidebarMenuItem key={index}>
                    <SidebarMenuSkeleton showIcon />
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
    </SidebarProvider>
  ),
};

export const EmptyWorkspaces: Story = {
  render: () => (
    <SidebarProvider className="h-[480px]">
      <Sidebar collapsible="none" className="h-full border-r border-border">
        <SidebarHeader>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-muted-foreground"
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate text-left">treq</span>
          </button>
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
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarSeparator />
          <SidebarGroup>
            <SidebarGroupLabel className="uppercase tracking-widest">
              Workspaces
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <p className="px-2 py-1 text-xs text-muted-foreground">
                No workspaces yet.
              </p>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
    </SidebarProvider>
  ),
};

export const Inset: Story = {
  args: { variant: "inset", collapsible: "none" },
  render: (args) => (
    <SidebarProvider className="h-[480px]">
      <Sidebar {...args}>
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton>
                <Home />
                <span>treq</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Application</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive>
                    <span>Workspaces</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <span>Github</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <div className="p-4 text-sm text-muted-foreground">Main content</div>
      </SidebarInset>
    </SidebarProvider>
  ),
};
