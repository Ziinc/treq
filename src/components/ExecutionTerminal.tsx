import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { gitCommit, gitPush, ptyWrite, Worktree } from "../lib/api";
import { StagingDiffViewer } from "./StagingDiffViewer";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Loader2, X } from "lucide-react";
import { useToast } from "./ui/toast";
import { ConsolidatedTerminal } from "./ConsolidatedTerminal";

interface ExecutionTerminalProps {
  repositoryPath?: string;
  worktree?: Worktree;
  initialPlanContent?: string;
  initialPlanTitle?: string;
  sessionId: number | null;
  onClose: () => void;
}

export const ExecutionTerminal: React.FC<ExecutionTerminalProps> = ({
  repositoryPath,
  worktree,
  initialPlanContent,
  initialPlanTitle,
  sessionId,
  onClose,
}) => {
  const workingDirectory = worktree?.worktree_path || repositoryPath || "";
  const ptySessionId = sessionId ? `session-${sessionId}` : `execution-${crypto.randomUUID()}`;
  const hasSentInitialPlanRef = useRef(false);
  const [autoCommandReady, setAutoCommandReady] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [commitAndPush, setCommitAndPush] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<string[]>([]);
  const [commitPending, setCommitPending] = useState(false);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const { addToast } = useToast();

  const sendInitialPlanPrompt = useCallback(() => {
    if (!initialPlanContent || hasSentInitialPlanRef.current) {
      return;
    }

    const title = initialPlanTitle?.trim() || "Implementation Plan";
    const formattedPrompt = `Please implement the following plan:\n\n# ${title}\n\n${initialPlanContent}\n`;
    hasSentInitialPlanRef.current = true;

    ptyWrite(ptySessionId, formattedPrompt).catch((error) => {
      hasSentInitialPlanRef.current = false;
      console.error("Failed to send initial plan to Claude:", error);
      addToast({
        title: "Claude Error",
        description: "Could not send the implementation plan to Claude.",
        type: "error",
      });
    });
  }, [initialPlanContent, initialPlanTitle, ptySessionId, addToast]);

  useEffect(() => {
    hasSentInitialPlanRef.current = false;
    setAutoCommandReady(false);
  }, [ptySessionId]);

  useEffect(() => {
    if (!initialPlanContent || !autoCommandReady) {
      return;
    }

    const planPromptTimeout = setTimeout(() => {
      sendInitialPlanPrompt();
    }, 2000);

    return () => clearTimeout(planPromptTimeout);
  }, [autoCommandReady, initialPlanContent, sendInitialPlanPrompt]);

  const handleSessionError = useCallback((message: string) => {
    addToast({
      title: "PTY Error",
      description: message,
      type: "error",
    });
  }, [addToast]);

  const handleAutoCommandError = useCallback((message: string) => {
    addToast({
      title: "Command Error",
      description: message,
      type: "error",
    });
  }, [addToast]);

  const handleStagedFilesChange = useCallback((files: string[]) => {
    setStagedFiles(files);
  }, []);

  const triggerSidebarRefresh = useCallback(() => {
    setRefreshSignal((prev) => prev + 1);
  }, []);

  const extractCommitHash = useCallback((output: string) => {
    const bracketMatch = output.match(/\[.+? ([0-9a-f]{7,})\]/i);
    if (bracketMatch && bracketMatch[1]) {
      return bracketMatch[1];
    }
    const looseMatch = output.match(/\b[0-9a-f]{7,40}\b/i);
    return looseMatch ? looseMatch[0] : null;
  }, []);

  const handleCommit = useCallback(async () => {
    if (!workingDirectory) {
      addToast({
        title: "Missing Worktree",
        description: "Select a worktree before committing.",
        type: "error",
      });
      return;
    }

    const trimmed = commitMessage.trim();
    if (!trimmed) {
      addToast({ title: "Commit message", description: "Enter a commit message.", type: "error" });
      return;
    }

    if (trimmed.length > 500) {
      addToast({ title: "Commit message", description: "Please keep the message under 500 characters.", type: "error" });
      return;
    }

    if (stagedFiles.length === 0) {
      addToast({ title: "No staged files", description: "Stage changes before committing.", type: "error" });
      return;
    }

    setCommitPending(true);
    try {
      const result = await gitCommit(workingDirectory, trimmed);
      const hash = extractCommitHash(result);
      addToast({
        title: "Commit created",
        description: hash ? `Created ${hash}` : result.trim() || "Commit successful",
        type: "success",
      });
      setCommitMessage("");
      triggerSidebarRefresh();

      if (commitAndPush) {
        try {
          const pushResult = await gitPush(workingDirectory);
          addToast({
            title: "Push complete",
            description: pushResult.trim() || "Changes pushed",
            type: "success",
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          addToast({ title: "Push failed", description: message, type: "error" });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addToast({
        title: "Commit failed",
        description: message,
        type: "error",
      });
    } finally {
      setCommitPending(false);
    }
  }, [workingDirectory, commitMessage, stagedFiles, commitAndPush, addToast, extractCommitHash, triggerSidebarRefresh]);

  const canCommit = useMemo(() => {
    const trimmed = commitMessage.trim();
    return Boolean(trimmed) && trimmed.length <= 500 && stagedFiles.length > 0 && !commitPending;
  }, [commitMessage, stagedFiles.length, commitPending]);

  const handleCommitKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        if (canCommit) {
          handleCommit();
        }
      }
    },
    [canCommit, handleCommit]
  );

  return (
    <div className="h-screen flex flex-col bg-background">
      <div className="border-b p-4 flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Execution Terminal</h2>
          <span className="text-xs text-muted-foreground font-mono">
            {worktree ? worktree.branch_name : "Main Repository"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <ConsolidatedTerminal
        sessionId={ptySessionId}
        workingDirectory={workingDirectory}
        autoCommand="claude --permission-mode acceptEdits"
        onAutoCommandComplete={() => setAutoCommandReady(true)}
        onAutoCommandError={handleAutoCommandError}
        onSessionError={handleSessionError}
        rightPanel={(
          <div className="flex flex-col h-full">
            <div className="flex-1 min-h-0">
              <StagingDiffViewer
                worktreePath={workingDirectory}
                disableInteractions={commitPending}
                onStagedFilesChange={handleStagedFilesChange}
                refreshSignal={refreshSignal}
              />
            </div>
            <div className="border-t border-border bg-background/80 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">Commit Message</p>
                  <p className="text-xs text-muted-foreground">{stagedFiles.length} staged file(s)</p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {commitMessage.length}/500
                </span>
              </div>
              <Textarea
                placeholder="Describe your changes"
                value={commitMessage}
                onChange={(event) => setCommitMessage(event.target.value)}
                onKeyDown={handleCommitKeyDown}
                disabled={commitPending}
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-3 w-3 accent-primary"
                    checked={commitAndPush}
                    onChange={(event) => setCommitAndPush(event.target.checked)}
                    disabled={commitPending}
                  />
                  Commit & Push
                </label>
                <span>Ctrl/Cmd + Enter to commit</span>
              </div>
              <Button
                className="w-full"
                disabled={!canCommit}
                onClick={handleCommit}
              >
                {commitPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Commit"
                )}
              </Button>
            </div>
          </div>
        )}
        showDiffViewer
        containerClassName="flex-1 flex overflow-hidden"
        terminalPaneClassName="border-r"
      />
    </div>
  );
};
