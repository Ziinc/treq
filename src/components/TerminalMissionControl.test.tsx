import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TerminalMissionControl } from "./TerminalMissionControl";
import type { TerminalSessionSummary } from "./terminal/types";
import { TooltipProvider } from "./ui/tooltip";

function renderMissionControl(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>{ui}</TooltipProvider>
    </QueryClientProvider>,
  );
}

const session = (
  overrides: Partial<TerminalSessionSummary> &
    Pick<TerminalSessionSummary, "id">,
): TerminalSessionSummary => ({
  kind: "shell",
  name: overrides.id,
  branchName: "main",
  isMainRepo: true,
  lastActivityAt: 0,
  lastUserInputAt: 0,
  isStreaming: false,
  previewOutput: "",
  ...overrides,
});

describe("TerminalMissionControl", () => {
  it("renders nothing when closed", () => {
    const { container } = renderMissionControl(
      <TerminalMissionControl
        open={false}
        sessions={[session({ id: "shell-1" })]}
        onClose={vi.fn()}
        onFocus={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows terminals as cards in a two-column grid grouped by workspace", () => {
    renderMissionControl(
      <TerminalMissionControl
        open
        sessions={[
          session({
            id: "shell-main",
            branchName: "main",
            isMainRepo: true,
            lastActivityAt: 1,
          }),
          session({
            id: "agent-feat",
            kind: "agent",
            name: "Review agent",
            branchName: "feat/thing",
            isMainRepo: false,
            lastActivityAt: 2,
            agent: "claude",
          }),
          session({
            id: "shell-feat",
            branchName: "feat/thing",
            isMainRepo: false,
            lastActivityAt: 3,
          }),
        ]}
        onClose={vi.fn()}
        onFocus={vi.fn()}
      />,
    );

    expect(screen.getByTestId("terminal-mission-control")).toBeTruthy();
    expect(
      screen.getByTestId("mission-control-grid-feat/thing").className,
    ).toContain("grid-cols-2");
    expect(
      screen.getByTestId("mission-control-group-feat/thing"),
    ).toHaveTextContent("feat/thing");
    expect(screen.getByText("Review agent")).toBeTruthy();
    expect(screen.getByTestId("mission-control-card-shell-feat")).toBeTruthy();
    expect(screen.getByTestId("mission-control-card-shell-main")).toBeTruthy();
  });

  it("shows terminal output in the card preview and status as an icon", () => {
    renderMissionControl(
      <TerminalMissionControl
        open
        sessions={[
          session({
            id: "shell-1",
            name: "Shell",
            previewOutput: "$ echo hi\nhi",
            lastActivityAt: Date.now(),
          }),
          session({
            id: "shell-idle",
            name: "Idle shell",
            previewOutput: "waiting",
            lastActivityAt: Date.now() - 120_000,
          }),
        ]}
        onClose={vi.fn()}
        onFocus={vi.fn()}
      />,
    );

    expect(
      screen.getByTestId("mission-control-preview-shell-1"),
    ).toHaveTextContent("$ echo hi hi");
    expect(screen.getByLabelText("Active")).toBeTruthy();
    expect(screen.getByLabelText("Idle")).toBeTruthy();
    expect(screen.queryByText("Active")).toBeNull();
    expect(screen.queryByText("Idle")).toBeNull();
  });

  it("omits the card footer and pins the swipe hint at the bottom", () => {
    renderMissionControl(
      <TerminalMissionControl
        open
        sessions={[
          session({
            id: "shell-feat",
            name: "Shell",
            branchName: "feat/thing",
            isMainRepo: false,
            previewOutput: "hi",
          }),
        ]}
        onClose={vi.fn()}
        onFocus={vi.fn()}
      />,
    );

    const card = screen.getByTestId("mission-control-card-shell-feat");
    expect(card.textContent).not.toMatch(/feat\/thing.*feat\/thing/);
    const hint = screen.getByTestId("mission-control-swipe-hint");
    expect(hint).toHaveTextContent("Swipe down with three fingers to close");
    expect(hint.className).toContain("text-sm");
    expect(hint.className).toContain("bottom-4");
  });

  it("shows a Gerrit-style LOC indicator on workspace group headers", () => {
    renderMissionControl(
      <TerminalMissionControl
        open
        sessions={[
          session({
            id: "shell-feat",
            name: "Shell",
            branchName: "feat/thing",
            isMainRepo: false,
          }),
        ]}
        diffStatsByWorkspaceKey={
          new Map([["feat/thing", { insertions: 12, deletions: 3 }]])
        }
        onClose={vi.fn()}
        onFocus={vi.fn()}
      />,
    );

    const group = screen.getByTestId("mission-control-group-feat/thing");
    const loc = screen.getByTestId("workspace-loc-indicator");
    expect(group).toContainElement(loc);
    expect(loc).toHaveTextContent("+12");
    expect(loc).toHaveTextContent("-3");
  });

  it("closes via the top-right X button", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderMissionControl(
      <TerminalMissionControl
        open
        sessions={[session({ id: "shell-1" })]}
        onClose={onClose}
        onFocus={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId("mission-control-close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("focuses a terminal and closes when a card is selected", async () => {
    const user = userEvent.setup();
    const onFocus = vi.fn();
    const onClose = vi.fn();
    renderMissionControl(
      <TerminalMissionControl
        open
        sessions={[session({ id: "shell-1", name: "Shell" })]}
        onClose={onClose}
        onFocus={onFocus}
      />,
    );

    await user.click(screen.getByTestId("mission-control-card-shell-1"));
    expect(onFocus).toHaveBeenCalledWith("shell-1");
    expect(onClose).toHaveBeenCalled();
  });

  it("closes when the backdrop is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderMissionControl(
      <TerminalMissionControl
        open
        sessions={[session({ id: "shell-1" })]}
        onClose={onClose}
        onFocus={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId("mission-control-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });
});
