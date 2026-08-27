import { type ClaudeSessionData } from "../terminal/types";

export interface ShellTerminalData {
	id: string;
	workingDirectory: string;
	remoteHost?: string;
}

export interface WorkspaceTerminalPaneProps {
	workingDirectory: string;
	remoteHost?: string;
	onSessionError?: (message: string) => void;
	currentBranch?: string | null;
	claudeSessions?: ClaudeSessionData[];
	activeClaudeSessionId?: number | null;
	onActiveSessionChange?: (sessionId: number | null) => void;
	onCreateNewSession?: (
		activeWorkspacePath?: string | null,
		agent?: "claude" | "codex" | "cursor",
	) => void;
	onCloseSession?: (sessionId: number) => void;
	onNavigateToWorkspace?: (workspaceKey: string, isMainRepo: boolean) => void;
	className?: string;
}

export interface WorkspaceTerminalPaneHandle {
	toggleCollapse: () => void;
	toggleMaximize: () => void;
	createAgentSession: (agent?: "claude" | "codex" | "cursor") => void;
	createShellSession: (workingDir?: string) => void;
}

export type TerminalEntry =
	| { type: "shell"; data: ShellTerminalData }
	| { type: "claude"; data: ClaudeSessionData };

export interface WorkspaceGroup {
	workspaceKey: string;
	workspaceName: string;
	isMainRepo: boolean;
	terminals: TerminalEntry[];
}
