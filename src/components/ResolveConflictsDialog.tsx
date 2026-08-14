import { useEffect, useMemo, useState } from "react";
import { ExternalLink, FolderOpen, Loader2 } from "lucide-react";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  buildResolveAgentPrompt,
  createSession,
  getRepoSetting,
  getSetting,
  startResolveConflicts,
  type ResolveConflictsSession,
  type ResolveTarget,
} from "../lib/api";
import { useEditorApps } from "../hooks/useEditorApps";
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
  const [session, setSession] = useState<ResolveConflictsSession | null>(null);
  const { addToast } = useToast();
  const editorApps = useEditorApps();

  useEffect(() => {
    if (!open) {
      setPrompt("");
      setSession(null);
      setSubmitting(false);
    }
  }, [open]);

  const title = useMemo(() => {
    if (changeIds && changeIds.length === 1) {
      return `Resolve change ${changeIds[0].slice(0, 8)}…`;
    }
    return "Resolve conflicts…";
  }, [changeIds]);

  const openPathInEditor = async (path: string) => {
    try {
      if (editorApps.cursor) {
        await openUrl(`cursor://file/${path}`);
        return;
      }
      if (editorApps.vscode) {
        await openUrl(`vscode://file/${path}`);
        return;
      }
      if (editorApps.zed) {
        await openUrl(`zed://file/${path}`);
        return;
      }
      await revealItemInDir(path);
    } catch (error) {
      addToast({
        title: "Could not open folder",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
    }
  };

  const handleResolve = async () => {
    setSubmitting(true);
    try {
      const resolveSession = await startResolveConflicts(
        repoPath,
        workspaceId,
        changeIds,
      );
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
        primary.workspace_id,
        sessionName,
      );

      onSessionCreated({
        sessionId: dbSessionId,
        sessionName,
        workspaceId: primary.workspace_id,
        workspacePath: primary.resolve_path,
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

        <p className="text-sm text-muted-foreground">
          Treq will create a short-lived resolve workspace for each conflicted
          commit (edit mode — no extra resolution commit). Tell the agent how
          you want the conflicts resolved. It can edit markers in those
          directories or run{" "}
          <code className="text-xs">treq resolve &lt;change-id&gt; …</code>.
        </p>

        <textarea
          className="min-h-[120px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
          placeholder="e.g. Prefer the workspace-side changes in README, keep both imports in lib.rs…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={submitting}
          data-testid="resolve-conflicts-prompt"
        />

        {session && session.targets.length > 0 && (
          <ResolveTargetList
            targets={session.targets}
            onOpen={openPathInEditor}
          />
        )}

        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={submitting || !session?.targets[0]}
            onClick={() => {
              const path = session?.targets[0]?.resolve_path;
              if (path) void openPathInEditor(path);
            }}
          >
            <FolderOpen className="h-4 w-4" />
            Open in editor
          </Button>
          <div className="flex gap-2">
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
              disabled={submitting}
              data-testid="resolve-conflicts-submit"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Starting…
                </>
              ) : (
                "Resolve"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

function ResolveTargetList({
  targets,
  onOpen,
}: {
  targets: ResolveTarget[];
  onOpen: (path: string) => void;
}) {
  return (
    <ul className="max-h-40 space-y-2 overflow-auto rounded-md border border-border p-2 text-xs">
      {targets.map((target) => (
        <li
          key={target.change_id}
          className="flex items-start justify-between gap-2"
        >
          <div className="min-w-0">
            <p className="font-mono truncate">{target.change_id}</p>
            <p className="text-muted-foreground truncate">
              {target.description}
            </p>
            <p className="text-muted-foreground truncate">
              {target.resolve_path}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 gap-1"
            onClick={() => onOpen(target.resolve_path)}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open
          </Button>
        </li>
      ))}
    </ul>
  );
}
