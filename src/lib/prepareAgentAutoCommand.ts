import {
  type AgentKind,
  buildAgentAutoCommand,
  buildTreqAgentSystemPrompt,
  cursorPromptFileContents,
} from "./agentCommand";
import { cleanupAgentCliFiles, writeAgentCliFiles } from "./api";

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
}): Promise<{
  command: string;
  filePaths: string[];
  skillWriteWarning?: string;
}> => {
  const cwd = workspacePath || repoPath;
  const agentPathContext = { workspacePath, repoPath };
  const systemPrompt = buildTreqAgentSystemPrompt(agentPathContext);

  let promptContents = systemPrompt;
  if (agent === "cursor") {
    promptContents = cursorPromptFileContents(systemPrompt, pendingPrompt);
  }

  let skippedProjectSkills = false;
  const files = await writeAgentCliFiles(promptContents, undefined, cwd).catch(
    (error) => {
      if (!cwd) {
        throw error;
      }
      skippedProjectSkills = true;
      return writeAgentCliFiles(promptContents, undefined, null);
    },
  );
  const filePaths = [
    files.promptPath,
    files.settingsPath,
    files.skillDir,
    files.agentsSkillPath,
    files.claudeSkillPath,
  ].filter((path): path is string => !!path);

  const skillWriteWarning =
    files.skillWriteWarning ??
    (skippedProjectSkills
      ? "Could not write Treq skills into the workspace. The session still has the bundled copy."
      : undefined);

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
    skillWriteWarning,
  };
};

export const discardAgentCliFiles = (paths: string[]): Promise<void> =>
  cleanupAgentCliFiles(paths);
