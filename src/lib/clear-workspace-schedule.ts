import { scheduleWorkspaces } from "./api";
import { invalidateQueries } from "./swr-cache";

export async function clearWorkspaceSchedule(
  repoPath: string,
  workspaceIds: number[],
): Promise<void> {
  await scheduleWorkspaces(repoPath, workspaceIds, null);
  void invalidateQueries(["workspaces"]);
  void invalidateQueries(["workspace-statuses"]);
}
