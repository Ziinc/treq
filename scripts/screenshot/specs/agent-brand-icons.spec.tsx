/**
 * Visually verifies Claude / Codex / Cursor brand icons in the sessions
 * sidebar and mission-control cards (replacing Lucide Bot/Sparkles/MousePointer2).
 */

import * as React from "react";
import { expect, it } from "vitest";
import { TerminalMissionControl } from "../../../src/components/TerminalMissionControl";
import { TerminalSessionsSidebar } from "../../../src/components/TerminalSessionsSidebar";
import type { TerminalSessionSummary } from "../../../src/components/terminal/types";
import { TooltipProvider } from "../../../src/components/ui/tooltip";
import { render, screen } from "../../../test/test-utils";
import { captureDocument } from "../capture";

const makeSession = (
  overrides: Partial<TerminalSessionSummary> &
    Pick<TerminalSessionSummary, "id" | "name">,
): TerminalSessionSummary => ({
  kind: overrides.agent ? "agent" : "shell",
  branchName: "feat/brand-icons",
  isMainRepo: false,
  lastActivityAt: Date.now(),
  lastUserInputAt: Date.now(),
  isStreaming: false,
  previewOutput: overrides.previewOutput ?? "$ ready",
  ...overrides,
});

const sessions: TerminalSessionSummary[] = [
  makeSession({
    id: "claude-1",
    name: "Claude session",
    agent: "claude",
    lastUserInputAt: 400,
  }),
  makeSession({
    id: "codex-1",
    name: "Codex session",
    agent: "codex",
    lastUserInputAt: 300,
  }),
  makeSession({
    id: "cursor-1",
    name: "Cursor session",
    agent: "cursor",
    lastUserInputAt: 200,
  }),
  makeSession({
    id: "shell-1",
    name: "Shell",
    lastUserInputAt: 100,
  }),
];

it("captures Claude/Codex/Cursor brand icons in the sessions sidebar", async () => {
  render(
    <div className="h-screen bg-background p-6 text-foreground">
      <div
        id="qa-agent-brand-sidebar"
        className="w-80 rounded-md border border-border bg-card shadow-sm"
      >
        <TooltipProvider>
          <TerminalSessionsSidebar sessions={sessions} />
        </TooltipProvider>
      </div>
    </div>,
  );

  expect(
    screen
      .getByTestId("terminal-session-item-claude-1")
      .querySelector('[data-agent-icon="claude"]'),
  ).toBeTruthy();
  expect(
    screen
      .getByTestId("terminal-session-item-codex-1")
      .querySelector('[data-agent-icon="codex"]'),
  ).toBeTruthy();
  expect(
    screen
      .getByTestId("terminal-session-item-cursor-1")
      .querySelector('[data-agent-icon="cursor"]'),
  ).toBeTruthy();

  await captureDocument(document, {
    name: "agent-brand-icons-01-sessions-sidebar",
    clipSelector: "#qa-agent-brand-sidebar",
    expectations: [
      "Sessions list shows four rows: Claude, Codex, Cursor, and Shell.",
      "Claude/Codex/Cursor rows use distinct brand marks (not Lucide Bot/Sparkles/mouse icons).",
      "Shell row uses a terminal icon, not an agent brand mark.",
    ],
  });
}, 60_000);

it("captures Claude/Codex/Cursor brand icons in mission control cards", async () => {
  render(
    <div
      id="qa-agent-brand-mission"
      className="relative h-screen w-screen bg-background text-foreground"
    >
      <TerminalMissionControl
        open
        sessions={sessions}
        onClose={() => {}}
        onFocus={() => {}}
      />
    </div>,
  );

  expect(
    screen
      .getByTestId("mission-control-card-claude-1")
      .querySelector('[data-agent-icon="claude"]'),
  ).toBeTruthy();
  expect(
    screen
      .getByTestId("mission-control-card-codex-1")
      .querySelector('[data-agent-icon="codex"]'),
  ).toBeTruthy();
  expect(
    screen
      .getByTestId("mission-control-card-cursor-1")
      .querySelector('[data-agent-icon="cursor"]'),
  ).toBeTruthy();

  await captureDocument(document, {
    name: "agent-brand-icons-02-mission-control",
    expectations: [
      "Mission control cards for Claude, Codex, and Cursor each show their brand icon in the card header.",
      "The three agent brand icons are visually distinct from each other.",
      "A Shell card is also present with a terminal icon.",
    ],
  });
}, 60_000);
