import type { QueryClient } from "@tanstack/react-query";
import { scheduleWorkspaces } from "./api";

export async function clearWorkspaceSchedule(
  repoPath: string,
  workspaceIds: number[],
  queryClient: QueryClient,
): Promise<void> {
  await scheduleWorkspaces(repoPath, workspaceIds, null);
  void queryClient.invalidateQueries({ queryKey: ["workspaces"] });
  void queryClient.invalidateQueries({ queryKey: ["workspace-statuses"] });
}
