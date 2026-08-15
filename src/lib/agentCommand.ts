import { resolveCommit } from "./api";
import { shellQuote } from "./shellQuote";

/** Append an agent prompt as a positional argument, never as a CLI option. */
export const appendAgentPrompt = (command: string, prompt: string): string =>
  `${command} -- ${shellQuote(prompt)}`;

interface AgentPathContext {
  workspacePath: string | null;
  repoPath: string;
}

export type AgentKind = "claude" | "codex" | "cursor";

export interface AgentCliFiles {
  promptPath: string;
  settingsPath?: string;
}

/** Build the single-line system prompt injected into agent terminal sessions. */
export const buildTreqAgentSystemPrompt = ({
  workspacePath,
  repoPath,
}: AgentPathContext): string => {
  if (typeof resolveCommit !== "function") {
    throw new Error("resolveCommit Tauri invoke wrapper is missing");
  }

  const locationContext = workspacePath
    ? [
        "You are operating inside a Treq workspace.",
        `Your current working directory and direct filesystem scope is ${workspacePath}.`,
        `The Treq home repository is ${repoPath}.`,
        "The home repository and sibling workspaces are outside your direct filesystem scope.",
      ]
    : [
        "You are operating in the Treq home repository.",
        `Your current working directory and direct filesystem scope is ${repoPath}.`,
      ];

  return [
    ...locationContext,
    "You may freely read and write files within this directory and its descendants.",
    "Do not directly read, write, edit, or delete files outside this directory.",
    "You have access to the treq CLI for managing workspaces.",
    "Run `treq --help` to discover the currently available commands before using the CLI.",
    "You may run treq CLI commands even when they create or manage workspaces outside the current working directory.",
    "To finish conflict resolution, work under `.treq/resolve/<workspace-slug>/`. Each change-id subdirectory is one conflicted commit. Run `treq resolve <change-id> [1|2|base|both]` or pipe JSON path→content replacements into `treq resolve <change-id>`. Your work is complete when no change-id directories remain.",
    "Use `treq send <path>` (or pipe text into `treq send`) to preview images and text in the Treq UI for the user.",
  ].join(" ");
};

/** Build per-session Claude sandbox settings for the resolved working directory. */
export const buildClaudeSandboxSettings = ({
  workspacePath,
  repoPath,
}: AgentPathContext) => ({
  sandbox: {
    enabled: true,
    failIfUnavailable: true,
    allowUnsandboxedCommands: false,
    filesystem: workspacePath
      ? {
          denyRead: [repoPath],
          allowRead: [workspacePath],
          allowWrite: [workspacePath],
        }
      : {
          allowRead: [repoPath],
          allowWrite: [repoPath],
        },
  },
});

/** Overlay Treq sandbox config onto a copy of `.claude/settings.local.json`. */
export const mergeClaudeLocalSettings = (
  existing: Record<string, unknown> | null,
  sandboxSettings: ReturnType<typeof buildClaudeSandboxSettings>,
): Record<string, unknown> => ({
  ...existing,
  sandbox: sandboxSettings.sandbox,
});

export const claudeLocalSettingsPath = (cwd: string): string =>
  `${cwd.replace(/\/+$/, "")}/.claude/settings.local.json`;

const shellCat = (path: string): string => `$(cat -- ${shellQuote(path)})`;

const wrapWithTempFileCleanup = (command: string, paths: string[]): string => {
  const quoted = paths.map(shellQuote).join(" ");
  return `( trap "rm -f ${quoted}" EXIT; ${command} )`;
};

export const cursorPromptFileContents = (
  systemPrompt: string,
  pendingPrompt?: string | null,
): string =>
  pendingPrompt ? `${systemPrompt} ${pendingPrompt}` : systemPrompt;

export interface BuildAgentAutoCommandOptions {
  agent: AgentKind;
  permissionMode?: string | null;
  sessionModel?: string | null;
  pendingPrompt?: string | null;
  treqBinDir?: string | null;
  files: AgentCliFiles;
}

/**
 * Build the PTY auto-command for an agent CLI.
 *
 * Long prompt/settings bodies are never inlined. Claude reads files via native
 * flags; Codex and Cursor have no append-from-file flags, so the shell expands
 * `$(cat -- path)` at exec time (the typed command stays short).
 */
export const buildAgentAutoCommand = ({
  agent,
  permissionMode,
  sessionModel,
  pendingPrompt,
  treqBinDir,
  files,
}: BuildAgentAutoCommandOptions): string => {
  let autoCommand: string;
  const cleanupPaths = [files.promptPath];

  if (agent === "codex") {
    autoCommand = `codex -c "developer_instructions=${shellCat(files.promptPath)}"`;
    if (pendingPrompt) {
      autoCommand = appendAgentPrompt(autoCommand, pendingPrompt);
    }
  } else if (agent === "cursor") {
    const planFlag = permissionMode === "plan" ? " --plan" : "";
    autoCommand = `cursor-agent${planFlag} -- "${shellCat(files.promptPath)}"`;
  } else {
    const permissionModeArg =
      permissionMode === "plan"
        ? " --permission-mode plan"
        : " --permission-mode acceptEdits";
    autoCommand = `claude${permissionModeArg}`;
    if (sessionModel) {
      autoCommand += ` --model=${shellQuote(sessionModel)}`;
    }
    if (!files.settingsPath) {
      throw new Error("Claude auto-command requires a settings file path");
    }
    cleanupPaths.push(files.settingsPath);
    autoCommand += ` --settings ${shellQuote(files.settingsPath)}`;
    autoCommand += ` --append-system-prompt-file ${shellQuote(files.promptPath)}`;
    if (pendingPrompt) {
      autoCommand += ` -- ${shellQuote(pendingPrompt)}`;
    }
  }

  autoCommand = wrapWithTempFileCleanup(autoCommand, cleanupPaths);

  if (treqBinDir) {
    autoCommand = `export PATH=${shellQuote(treqBinDir)}:$PATH; ${autoCommand}`;
  }

  return autoCommand;
};
