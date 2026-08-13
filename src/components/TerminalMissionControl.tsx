import { Bot, GitBranch, Home, Loader2, Moon, MousePointer2, Sparkles, Terminal } from "lucide-react";
import { useMemo } from "react";
import { buildMissionControlGroups } from "./terminal-mission-control/buildMissionControlGroups";
import {
  TERMINAL_IDLE_THRESHOLD_MS,
  type TerminalSessionSummary,
} from "./terminal/types";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { cn } from "../lib/utils";

interface TerminalMissionControlProps {
  open: boolean;
  sessions: TerminalSessionSummary[];
  onClose: () => void;
  onFocus: (id: string) => void;
}

function getSessionIcon(session: TerminalSessionSummary) {
  if (session.kind === "shell") return Terminal;
  if (session.agent === "codex") return Sparkles;
  if (session.agent === "cursor") return MousePointer2;
  return Bot;
}

function sessionStatusLabel(session: TerminalSessionSummary, now: number): string {
  if (session.isStreaming) return "Streaming";
  if (now - session.lastActivityAt >= TERMINAL_IDLE_THRESHOLD_MS) return "Idle";
  return "Active";
}

export const TerminalMissionControl: React.FC<TerminalMissionControlProps> = ({
  open,
  sessions,
  onClose,
  onFocus,
}) => {
  const groups = useMemo(
    () => buildMissionControlGroups(sessions),
    [sessions],
  );
  const now = Date.now();

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col"
      data-testid="terminal-mission-control"
      role="dialog"
      aria-modal="true"
      aria-label="Terminal Mission Control"
    >
      <button
        type="button"
        aria-label="Close Mission Control"
        data-testid="mission-control-backdrop"
        className="absolute inset-0 bg-background/80 backdrop-blur-md transition-opacity animate-in fade-in-0"
        onClick={onClose}
      />

      <div className="relative z-10 flex-1 overflow-y-auto px-8 py-10 animate-in fade-in-0 slide-in-from-bottom-4 duration-200">
        <div className="mx-auto max-w-5xl space-y-8">
          <header className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                Terminals
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Swipe down with three fingers to close
              </p>
            </div>
            <span className="text-xs font-mono text-muted-foreground">
              {sessions.length} session{sessions.length === 1 ? "" : "s"}
            </span>
          </header>

          {groups.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/60 bg-card/40 px-6 py-16 text-center text-sm text-muted-foreground">
              No open terminals
            </div>
          ) : (
            groups.map((group) => (
              <section
                key={group.workspaceKey}
                data-testid={`mission-control-group-${group.workspaceKey}`}
                className="space-y-3"
              >
                <div className="flex items-center gap-2 text-muted-foreground">
                  {group.isMainRepo ? (
                    <Home className="h-3.5 w-3.5" />
                  ) : (
                    <GitBranch className="h-3.5 w-3.5" />
                  )}
                  <h3 className="text-xs font-semibold uppercase tracking-widest">
                    {group.workspaceName}
                  </h3>
                </div>

                <div
                  data-testid={`mission-control-grid-${group.workspaceKey}`}
                  className="grid grid-cols-2 gap-3"
                >
                  {group.terminals.map((session) => {
                    const Icon = getSessionIcon(session);
                    const status = sessionStatusLabel(session, now);
                    const isIdle = status === "Idle";
                    return (
                      <Card
                        key={session.id}
                        role="button"
                        tabIndex={0}
                        data-testid={`mission-control-card-${session.id}`}
                        className={cn(
                          "cursor-pointer overflow-hidden border-border/60 bg-card/90 shadow-sm",
                          "transition-transform duration-150 hover:-translate-y-0.5 hover:border-border hover:shadow-md",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        )}
                        onClick={() => {
                          onFocus(session.id);
                          onClose();
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onFocus(session.id);
                            onClose();
                          }
                        }}
                      >
                        <CardHeader className="flex flex-row items-center gap-2 space-y-0 border-b border-border/40 bg-muted/40 px-4 py-2.5">
                          <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <CardTitle className="truncate text-sm font-medium">
                            {session.name}
                          </CardTitle>
                          <div className="ml-auto flex items-center gap-1.5 text-muted-foreground">
                            {session.isStreaming ? (
                              <Loader2
                                className="h-3 w-3 animate-spin text-primary"
                                aria-label="Streaming"
                              />
                            ) : null}
                            {isIdle ? (
                              <Moon className="h-3 w-3" aria-label="Idle" />
                            ) : null}
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3 px-4 py-4">
                          <div className="h-20 rounded-md border border-border/40 bg-background/80 px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
                            <div className="opacity-70">
                              {session.kind === "agent"
                                ? `${session.agent ?? "agent"} session`
                                : "shell session"}
                            </div>
                            <div className="mt-3 text-foreground/80">{status}</div>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                            <span className="font-mono truncate">
                              {group.workspaceName}
                            </span>
                            <span>{status}</span>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
