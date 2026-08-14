import * as React from "react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { TerminalSessionsSidebar } from "../../../src/components/TerminalSessionsSidebar";
import type { TerminalSessionSummary } from "../../../src/components/terminal/types";
import { TooltipProvider } from "../../../src/components/ui/tooltip";
import { render, screen, waitFor } from "../../../test/test-utils";
import { captureDocument } from "../capture";

const makeSession = (
  id: string,
  name: string,
  lastUserInputAt: number,
  agent?: TerminalSessionSummary["agent"],
): TerminalSessionSummary => ({
  id,
  kind: agent ? "agent" : "shell",
  name,
  branchName: `feat/${id}`,
  isMainRepo: false,
  agent,
  lastActivityAt: Date.now(),
  lastUserInputAt,
  isStreaming: false,
  previewOutput: "",
});

function SessionOrderFixture() {
  const [sessions, setSessions] = React.useState([
    makeSession("codex", "Codex session", 300, "codex"),
    makeSession("shell", "Shell", 200),
    makeSession("claude", "Claude session", 100, "claude"),
  ]);

  return (
    <div className="h-screen bg-background p-8 text-foreground">
      <div
        id="qa-terminal-sidebar"
        className="w-80 rounded-md border border-border bg-card shadow-sm"
      >
        <TooltipProvider>
          <TerminalSessionsSidebar
            sessions={sessions}
            onFocus={(id) =>
              setSessions((current) =>
                current.map((session) =>
                  session.id === id
                    ? { ...session, lastUserInputAt: Date.now() }
                    : session,
                ),
              )
            }
          />
        </TooltipProvider>
      </div>
      <button
        type="button"
        onClick={() =>
          setSessions((current) =>
            current.map((session) =>
              session.id === "claude"
                ? { ...session, lastActivityAt: Date.now() - 120_000 }
                : session,
            ),
          )
        }
      >
        Mark Claude idle
      </button>
    </div>
  );
}

it("captures terminal sessions reordering only after user input", async () => {
  const user = userEvent.setup();
  render(<SessionOrderFixture />);

  const list = screen.getByTestId("terminal-sessions-list");
  expect(
    Array.from(list.children).map((item) => item.getAttribute("data-flip-id")),
  ).toEqual(["codex", "shell", "claude"]);
  await captureDocument(document, {
    name: "terminal-session-input-order-01-before",
    clipSelector: "#qa-terminal-sidebar",
    expectations: [
      "The Sessions list shows Codex session first, Shell second, and Claude session third.",
      "All three session rows are visually stable and readable.",
    ],
  });

  await user.click(screen.getByText("Claude session"));
  await waitFor(() => {
    expect(
      Array.from(list.children).map((item) =>
        item.getAttribute("data-flip-id"),
      ),
    ).toEqual(["claude", "codex", "shell"]);
  });

  await captureDocument(document, {
    name: "terminal-session-input-order-02-after-input",
    clipSelector: "#qa-terminal-sidebar",
    expectations: [
      "Claude session has moved to the top after receiving the newest user input.",
      "Codex session and Shell remain below it in their prior relative order.",
      "The reordered list has no overlap, clipping, or excessive displacement.",
    ],
  });

  await user.click(screen.getByRole("button", { name: "Mark Claude idle" }));
  await waitFor(() => {
    expect(
      Array.from(list.children).map((item) =>
        item.getAttribute("data-flip-id"),
      ),
    ).toEqual(["codex", "shell", "claude"]);
  });

  await captureDocument(document, {
    name: "terminal-session-input-order-03-after-idle",
    clipSelector: "#qa-terminal-sidebar",
    expectations: [
      "Claude session has moved below the still-active Codex and Shell sessions after going idle.",
      "Codex session remains first and Shell remains second.",
      "Claude session shows an idle indicator and the list has no overlap.",
    ],
  });
}, 60_000);
