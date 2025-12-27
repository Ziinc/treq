import type { ConsolidatedTerminalHandle } from "../ConsolidatedTerminal";

// Minimum width for each terminal panel (used when multiple terminals)
export const MIN_TERMINAL_WIDTH = 300;

export interface ClaudeSessionData {
  sessionId: number;
  sessionName: string;
  ptySessionId: string;
  workspacePath: string | null;
  repoPath: string;
  pendingPrompt?: string; // Optional prompt to send after Claude initializes
  permissionMode?: 'plan' | 'acceptEdits'; // Permission mode for Claude terminal
}

export interface ShellTerminalData {
  id: string;
  workingDirectory: string;
}

export type TerminalRefsMap = Map<string, ConsolidatedTerminalHandle | null>;
