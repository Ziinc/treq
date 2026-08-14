import { expect } from "vitest";
import { screen, waitFor } from "../../test/test-utils";
import { setRepoSetting } from "../../src/lib/api";

type UserEvent = {
  click: (element: Element) => Promise<void>;
};

const TUI_STYLE = [
  "position:absolute",
  "inset:28px 0 0 0",
  "z-index:20",
  "overflow:hidden",
  "padding:8px 10px",
  "background:#1e1e1e",
  "color:#d4d4d4",
  'font-family:"JetBrains Mono",ui-monospace,Menlo,monospace',
  "font-size:11px",
  "line-height:1.45",
  "white-space:pre",
  "pointer-events:none",
].join(";");

const CLAUDE_TUI = `<div data-testid="marketing-tui-claude" style="${TUI_STYLE}">
<span style="color:#d97757">  ▐▛███▜▌</span>   <span style="color:#f4f4f5">Claude Code</span> <span style="color:#737373">v2.1.0</span>
<span style="color:#d97757"> ▝▜█████▛▘</span>  <span style="color:#a1a1aa">Opus 4.6 · lorem-ipsum/event-bus</span>
<span style="color:#d97757">   ▘▘ ▝▝</span>    <span style="color:#52525b">feat/empty-event-message</span>

<span style="color:#a1a1aa">  Welcome back. Context restored from the previous session.</span>

<span style="color:#60a5fa">&gt; Fix empty event_message when posting Discord events, then
  rebase this stacked PR onto feat/event-ingest.</span>

<span style="color:#d97757">⏺</span> I'll inspect the client and the conflicted Home page.

<span style="color:#52525b">  ⎿  Read packages/web/src/lib/client.ts</span>
<span style="color:#52525b">  ⎿  Read packages/web/src/pages/Home.tsx</span>

<span style="color:#d97757">⏺ Update</span> <span style="color:#a1a1aa">packages/web/src/lib/client.ts</span>
<span style="color:#4ade80">      + const message = body.event_message?.trim() || JSON.stringify(body);</span>
<span style="color:#f87171">      - return fetch("/events", { method: "POST", body: JSON.stringify(body) });</span>

<span style="color:#a1a1aa">  Conflict in packages/web/src/pages/Home.tsx — Side #1 vs Side #2.</span>
<span style="color:#fbbf24">  ▸ packages/web</span> <span style="color:#f87171">conflict</span>
</div>`;

const CODEX_TUI = `<div data-testid="marketing-tui-codex" style="${TUI_STYLE}">
<span style="color:#f4f4f5">codex</span>  <span style="color:#737373">gpt-5 · ~/event-bus</span>

<span style="color:#a1a1aa">• Exploring stacked PR #418</span>
<span style="color:#52525b">  └ packages/api/src/ingest.ts</span>
<span style="color:#52525b">  └ packages/web/src/lib/client.ts</span>

<span style="color:#60a5fa">› Add retry/backoff when event_message is empty and keep the
  Discord payload intact for the parent ingest PR.</span>

<span style="color:#4ade80">✔</span> <span style="color:#a1a1aa">Mapped empty-body fallback to EventBody</span>
<span style="color:#fbbf24">…</span> <span style="color:#a1a1aa">Waiting on CI: test failed, typecheck pending</span>

<span style="color:#27272a">────────────────────────────────</span>
<span style="color:#a1a1aa">  tokens  12.4k</span>   <span style="color:#737373">esc interrupt</span>
</div>`;

const CURSOR_TUI = `<div data-testid="marketing-tui-cursor" style="${TUI_STYLE}">
<span style="color:#f4f4f5">Cursor Agent</span>  <span style="color:#818cf8">composer</span>
<span style="color:#52525b">feat/empty-event-message → feat/event-ingest</span>

<span style="color:#a1a1aa"> I'll resolve the Home.tsx conflict in packages/web and keep
 the event feed from this stacked change.</span>

<span style="color:#818cf8">packages/web/src/pages/Home.tsx</span>
<span style="color:#f87171">- &lt;h1&gt;Lorem ipsum dolor sit amet&lt;/h1&gt;</span>
<span style="color:#4ade80">+ &lt;h1&gt;Lorem ipsum — event feed&lt;/h1&gt;</span>
<span style="color:#4ade80">+ &lt;EventFeed source="discord" /&gt;</span>

<span style="color:#a1a1aa"> CI on #418: 2/4 passing (test failed).</span>
<span style="color:#52525b"> Ask · Tab to accept · Esc to reject</span>
</div>`;

function tuiForHeader(text: string): string | null {
  if (/codex/i.test(text)) return CODEX_TUI;
  if (/cursor/i.test(text)) return CURSOR_TUI;
  if (/claude/i.test(text)) return CLAUDE_TUI;
  return null;
}

/** Open Claude, Codex, and Cursor agent terminals via the real sidebar control. */
export async function openMarketingAgentTerminals(
  user: UserEvent,
  repoPath: string,
): Promise<void> {
  const agents = ["claude", "codex", "cursor"] as const;
  for (const agent of agents) {
    await setRepoSetting(repoPath, "default_agent", agent);
    await user.click(await screen.findByLabelText("New agent terminal"));
    await waitFor(() => {
      const items = document.querySelectorAll(
        '[data-testid^="terminal-session-item-"]',
      );
      expect(items.length).toBeGreaterThanOrEqual(agents.indexOf(agent) + 1);
    });
  }

  await waitFor(() => {
    expect(
      document.querySelectorAll("[data-terminal-id]").length,
    ).toBeGreaterThanOrEqual(3);
  });
}

export function expandMarketingTerminalPane(): void {
  const label = [...document.querySelectorAll("span")].find(
    (node) => node.textContent === "Terminals",
  );
  const pane = label?.closest("div.flex.flex-col.border-t") as HTMLElement | null;
  if (!pane) return;
  pane.style.height = "40%";
  pane.style.maxHeight = "60%";
}

/** Overlay TUI HTML — xterm paints to canvas, which does not serialize into the screenshot DOM. */
export function injectMarketingTuiOverlays(): void {
  for (const panel of document.querySelectorAll<HTMLElement>(
    "[data-terminal-id]",
  )) {
    if (panel.querySelector("[data-testid^='marketing-tui-']")) continue;
    panel.style.position = "relative";
    const headerText = panel.querySelector("span.truncate")?.textContent ?? "";
    const html = tuiForHeader(headerText);
    if (!html) continue;
    panel.insertAdjacentHTML("beforeend", html);
  }
}

export async function expandMarketingFileTree(user: UserEvent): Promise<void> {
  const clickNth = async (name: string, index = 0) => {
    const buttons = await screen.findAllByRole("button", { name });
    const target = buttons[index];
    if (!target) throw new Error(`No directory button named ${name} at ${index}`);
    await user.click(target);
  };

  await clickNth("packages");
  await clickNth("api");
  await clickNth("src", 0);
  await clickNth("web");
  await clickNth("src", 1);
  await clickNth("pages");
  await clickNth("lib");
}
