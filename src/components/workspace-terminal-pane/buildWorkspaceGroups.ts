import { type ClaudeSessionData } from "../terminal/types";
import { type TerminalEntry, type WorkspaceGroup } from "./types";

export function buildWorkspaceGroups(
  allTerminals: TerminalEntry[],
  claudeSessions: ClaudeSessionData[],
): WorkspaceGroup[] {
  const groupMap = new Map<string, WorkspaceGroup>();

  for (const terminal of allTerminals) {
    let workspaceKey: string;
    let workspaceName: string;

    if (terminal.type === "claude") {
      workspaceKey = terminal.data.workspacePath || terminal.data.repoPath;
      workspaceName = terminal.data.workspaceName || "Main Repository";
    } else {
      const matchingClaude = claudeSessions.find((s) => {
        const sessionDir = s.workspacePath || s.repoPath;
        return sessionDir === terminal.data.workingDirectory;
      });
      workspaceKey = terminal.data.workingDirectory;
      workspaceName = matchingClaude?.workspaceName || "Main Repository";
    }

    if (!groupMap.has(workspaceKey)) {
      groupMap.set(workspaceKey, {
        workspaceKey,
        workspaceName,
        isMainRepo: workspaceName === "Main Repository",
        terminals: [],
      });
    }
    groupMap.get(workspaceKey)!.terminals.push(terminal);
  }

  return Array.from(groupMap.values());
}
