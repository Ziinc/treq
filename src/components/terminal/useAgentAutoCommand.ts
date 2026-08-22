import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { getSessionModel, getTreqBinDir } from "../../lib/api";
import { prepareAgentAutoCommand } from "../../lib/prepareAgentAutoCommand";
import { useToast } from "../ui/toast";
import type { ClaudeSessionData } from "./types";

export const useAgentAutoCommand = (sessionData: ClaudeSessionData) => {
  const { addToast } = useToast();
  const [sessionModelOverride, setSessionModelState] = useState<
    string | null | undefined
  >(undefined);

  const { data: loadedModel, isLoading: modelLoading } = useSWR(
    ["session-model", sessionData.repoPath, sessionData.sessionId],
    () => getSessionModel(sessionData.repoPath, sessionData.sessionId),
  );
  const { data: treqBinDir = null, isLoading: binLoading } = useSWR(
    "treq-bin-dir",
    getTreqBinDir,
  );

  const sessionModel =
    sessionModelOverride === undefined
      ? (loadedModel ?? null)
      : sessionModelOverride;
  const isModelLoaded = !modelLoading;
  const treqBinDirReady = !binLoading;

  const pendingPromptRef = useRef(sessionData.pendingPrompt);
  const permissionModeRef = useRef(sessionData.permissionMode);

  const { data: prepared, error: prepareErr } = useSWR(
    isModelLoaded && treqBinDirReady
      ? [
          "agent-auto-command",
          sessionData.agent ?? "claude",
          sessionData.workspacePath,
          sessionData.repoPath,
          sessionModel,
          treqBinDir,
        ]
      : null,
    () =>
      prepareAgentAutoCommand({
        agent: sessionData.agent ?? "claude",
        workspacePath: sessionData.workspacePath,
        repoPath: sessionData.repoPath,
        sessionModel,
        permissionMode: permissionModeRef.current,
        pendingPrompt: pendingPromptRef.current,
        treqBinDir,
      }),
  );

  const [prepareError, setPrepareError] = useState<string | null>(null);

  useEffect(() => {
    if (prepareErr) {
      setPrepareError(
        prepareErr instanceof Error ? prepareErr.message : String(prepareErr),
      );
    } else {
      setPrepareError(null);
    }
    if (prepared?.skillWriteWarning) {
      addToast({
        type: "warning",
        title: "Could not write Treq skills",
        description: prepared.skillWriteWarning,
      });
    }
  }, [prepareErr, prepared?.skillWriteWarning, addToast]);

  return {
    sessionModel,
    setSessionModelState,
    isModelLoaded,
    autoCommand: prepared?.command ?? null,
    prepareError,
  };
};
