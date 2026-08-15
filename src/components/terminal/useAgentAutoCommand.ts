import { useEffect, useRef, useState } from "react";
import { getSessionModel, getTreqBinDir } from "../../lib/api";
import {
  discardAgentCliFiles,
  prepareAgentAutoCommand,
} from "../../lib/prepareAgentAutoCommand";
import { type ClaudeSessionData } from "./types";

export const useAgentAutoCommand = (sessionData: ClaudeSessionData) => {
  const [sessionModel, setSessionModelState] = useState<string | null>(null);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [treqBinDir, setTreqBinDir] = useState<string | null>(null);
  const [treqBinDirReady, setTreqBinDirReady] = useState(false);
  const [autoCommand, setAutoCommand] = useState<string | null>(null);

  const pendingPromptRef = useRef(sessionData.pendingPrompt);
  const permissionModeRef = useRef(sessionData.permissionMode);

  useEffect(() => {
    const loadModel = async () => {
      try {
        const model = await getSessionModel(
          sessionData.repoPath,
          sessionData.sessionId,
        );
        setSessionModelState(model);
      } catch (error) {
        console.error("Failed to load session model:", error);
      } finally {
        setIsModelLoaded(true);
      }
    };
    loadModel();
    getTreqBinDir()
      .then(setTreqBinDir)
      .catch(() => {})
      .finally(() => setTreqBinDirReady(true));
  }, [sessionData.repoPath, sessionData.sessionId]);

  useEffect(() => {
    if (!isModelLoaded || !treqBinDirReady) return;

    let cancelled = false;

    prepareAgentAutoCommand({
      agent: sessionData.agent ?? "claude",
      workspacePath: sessionData.workspacePath,
      repoPath: sessionData.repoPath,
      sessionModel,
      permissionMode: permissionModeRef.current,
      pendingPrompt: pendingPromptRef.current,
      treqBinDir,
    })
      .then(async ({ command, filePaths }) => {
        if (cancelled) {
          await discardAgentCliFiles(filePaths);
          return;
        }
        setAutoCommand(command);
      })
      .catch((error) => {
        console.error("Failed to prepare agent CLI files:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [
    isModelLoaded,
    treqBinDirReady,
    sessionData.agent,
    sessionData.workspacePath,
    sessionData.repoPath,
    sessionModel,
    treqBinDir,
  ]);

  return {
    sessionModel,
    setSessionModelState,
    isModelLoaded,
    autoCommand,
  };
};
