import { invoke } from "@tauri-apps/api/core";
import { getRepoSetting, setRepoSetting } from "./api";

export type LinearState = {
  name: string;
  type: string;
};

export type LinearIssue = {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  state: LinearState;
  labels: string[];
  branch_name: string;
  parent_id: string | null;
  sub_issue_ids: string[];
  url: string;
};

export type LinearTeam = {
  id: string;
  name: string;
  key: string;
};

export type LinearKickoffResult = {
  issue_id: string;
  workspace_id: number;
  created: boolean;
};

export const linearListTeams = (repoPath: string): Promise<LinearTeam[]> =>
  invoke("linear_list_teams", { repoPath });

export const linearListIssues = (
  repoPath: string,
  teamFilter?: string,
): Promise<LinearIssue[]> =>
  invoke("linear_list_issues", { repoPath, teamFilter });

export const linearOpenOrCreateWorkspaceFromIssue = (
  repoPath: string,
  issueId: string,
  includeSubissues: boolean,
): Promise<LinearKickoffResult[]> =>
  invoke("linear_open_or_create_workspace_from_issue", {
    repoPath,
    issueId,
    includeSubissues,
  });

export const getLinearApiKey = (repoPath: string): Promise<string | null> =>
  getRepoSetting(repoPath, "linear_api_key");

export const setLinearApiKey = (
  repoPath: string,
  apiKey: string,
): Promise<void> => setRepoSetting(repoPath, "linear_api_key", apiKey);

export const getLinearAutoKickoffLabel = (
  repoPath: string,
): Promise<string | null> =>
  getRepoSetting(repoPath, "linear_auto_kickoff_label");

export const setLinearAutoKickoffLabel = (
  repoPath: string,
  label: string,
): Promise<void> =>
  setRepoSetting(repoPath, "linear_auto_kickoff_label", label);

export const linearStartAutoKickoffPolling = (
  repoPath: string,
): Promise<void> => invoke("linear_start_auto_kickoff_polling", { repoPath });
