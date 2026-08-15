import { cleanupAgentCliFiles, readFile, writeAgentCliFiles } from "./api";
import {
  type AgentKind,
  buildAgentAutoCommand,
  buildClaudeSandboxSettings,
  buildTreqAgentSystemPrompt,
  claudeLocalSettingsPath,
  cursorPromptFileContents,
  mergeClaudeLocalSettings,
} from "./agentCommand";

export const parseJsonObject = (
  raw: string,
): Record<string, unknown> | null => {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
};

export const prepareAgentAutoCommand = async ({
  agent,
  workspacePath,
  repoPath,
  sessionModel,
  permissionMode,
  pendingPrompt,
  treqBinDir,
}: {
  agent: AgentKind;
  workspacePath: string | null;
  repoPath: string;
  sessionModel: string | null;
  permissionMode?: string | null;
  pendingPrompt?: string | null;
  treqBinDir: string | null;
}): Promise<{ command: string; filePaths: string[] }> => {
  const cwd = workspacePath || repoPath;
  const agentPathContext = { workspacePath, repoPath };
  const systemPrompt = buildTreqAgentSystemPrompt(agentPathContext);

  let promptContents = systemPrompt;
  let settingsJson: string | undefined;
  if (agent === "cursor") {
    promptContents = cursorPromptFileContents(systemPrompt, pendingPrompt);
  } else if (agent === "claude") {
    let existing: Record<string, unknown> | null = null;
    try {
      existing = parseJsonObject(await readFile(claudeLocalSettingsPath(cwd)));
    } catch {
      existing = null;
    }
    settingsJson = JSON.stringify(
      mergeClaudeLocalSettings(
        existing,
        buildClaudeSandboxSettings(agentPathContext),
      ),
      null,
      2,
    );
  }

  const files = await writeAgentCliFiles(promptContents, settingsJson, cwd);
  const filePaths = [
    files.promptPath,
    files.settingsPath,
    files.skillDir,
    files.agentsSkillPath,
    files.claudeSkillPath,
  ].filter((path): path is string => !!path);

  return {
    command: buildAgentAutoCommand({
      agent,
      permissionMode,
      sessionModel,
      pendingPrompt: agent === "cursor" ? null : pendingPrompt,
      treqBinDir,
      files,
    }),
    filePaths,
  };
};

export const discardAgentCliFiles = (paths: string[]): Promise<void> =>
  cleanupAgentCliFiles(paths);
