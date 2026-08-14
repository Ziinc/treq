import { shellQuote } from "./shellQuote";

/** Append an agent prompt as a positional argument, never as a CLI option. */
export const appendAgentPrompt = (command: string, prompt: string): string =>
  `${command} -- ${shellQuote(prompt)}`;

interface AgentPathContext {
  workspacePath: string | null;
  repoPath: string;
}

/** Build the single-line system prompt injected into agent terminal sessions. */
export const buildTreqAgentSystemPrompt = ({
  workspacePath,
  repoPath,
}: AgentPathContext): string => {
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
