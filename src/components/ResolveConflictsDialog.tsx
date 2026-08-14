import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  buildResolveAgentPrompt,
  createSession,
  getRepoSetting,
  getSetting,
  startResolveConflicts,
  type ResolveConflictsSession,
} from "../lib/api";
import type { SessionCreationInfo } from "../types/sessions";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { useToast } from "./ui/toast";

interface ResolveConflictsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoPath: string;
  workspaceId: number | null;
  /** When set, only these change ids are resolved; otherwise all conflicted commits. */
  changeIds?: string[] | null;
  onSessionCreated: (session: SessionCreationInfo) => void;
}

export const ResolveConflictsDialog: React.FC<ResolveConflictsDialogProps> = ({
  open,
  onOpenChange,
  repoPath,
  workspaceId,
  changeIds = null,
  onSessionCreated,
}) => {
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [session, setSession] = useState<ResolveConflictsSession | null>(null);
  const { addToast } = useToast();

  useEffect(() => {
    if (!open) {
      setPrompt("");
      setSession(null);
      setSubmitting(false);
      setPreparing(false);
      return;
    }

    let cancelled = false;
    setPreparing(true);
    startResolveConflicts(repoPath, workspaceId, changeIds)
      .then((resolveSession) => {
        if (!cancelled) setSession(resolveSession);
      })
      .catch((error) => {
        if (!cancelled) {
          addToast({
            title: "Failed to prepare resolve workspaces",
            description: error instanceof Error ? error.message : String(error),
            type: "error",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setPreparing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, repoPath, workspaceId, changeIds, addToast]);

  const title = useMemo(() => {
    if (changeIds && changeIds.length === 1) {
      return `Resolve change ${changeIds[0].slice(0, 8)}…`;
    }
    return "Resolve conflicts…";
  }, [changeIds]);

  const handleResolve = async () => {
    setSubmitting(true);
    try {
      const resolveSession =
        session ??
        (await startResolveConflicts(repoPath, workspaceId, changeIds));
      setSession(resolveSession);

      const fullPrompt = await buildResolveAgentPrompt(
        prompt.trim(),
        resolveSession,
      );

      let resolvedAgent: "claude" | "codex" | "cursor" = "claude";
      try {
        const repoDefault = await getRepoSetting(repoPath, "default_agent");
        const appDefault = await getSetting("default_agent");
        const pick = repoDefault || appDefault;
        if (pick === "codex" || pick === "cursor" || pick === "claude") {
          resolvedAgent = pick;
        }
      } catch {
        // keep default
      }

      const primary = resolveSession.targets[0];
      if (!primary) {
        throw new Error("No resolve targets were created");
      }

      const sessionName =
        resolveSession.targets.length > 1
          ? "Resolve conflicts"
          : `Resolve ${primary.change_id.slice(0, 8)}`;

      const dbSessionId = await createSession(
        repoPath,
        // Bind the agent session to the product workspace when available so
        // sidebar/session UI stays on the user's stack, not a hidden resolve WC.
        resolveSession.source_workspace_id ?? primary.workspace_id,
        sessionName,
      );

      onSessionCreated({
        sessionId: dbSessionId,
        sessionName,
        workspaceId: resolveSession.source_workspace_id ?? primary.workspace_id,
        // Agent cwd is the resolve slug root; change-id dirs live under it.
        workspacePath: resolveSession.agent_cwd,
        repoPath,
        pendingPrompt: fullPrompt,
        permissionMode: "acceptEdits",
        agent: resolvedAgent,
      });

      addToast({
        title: "Resolve session started",
        description: `${resolveSession.targets.length} resolve director${
          resolveSession.targets.length === 1 ? "y" : "ies"
        } ready for the agent`,
        type: "success",
      });
      onOpenChange(false);
    } catch (error) {
      addToast({
        title: "Failed to start resolve",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex w-[42vw] max-w-none flex-col gap-y-4">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <textarea
          className="min-h-[120px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
          placeholder="e.g. Prefer the workspace-side changes in README, keep both imports in lib.rs…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={submitting}
          data-testid="resolve-conflicts-prompt"
        />

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleResolve()}
            disabled={submitting || preparing || !session}
            data-testid="resolve-conflicts-submit"
          >
            {submitting || preparing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {preparing ? "Preparing…" : "Starting…"}
              </>
            ) : (
              "Resolve"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
