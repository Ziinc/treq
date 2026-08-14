import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { listCommits, type Workspace } from "../../lib/api";
import {
  sumWorkspaceDiffStats,
  type WorkspaceDiffStats,
} from "../../lib/workspace-stack";
import type { MissionControlGroup } from "./buildMissionControlGroups";

/**
 * Resolves Gerrit-style LOC stats for Mission Control workspace groups.
 * Groups are keyed by branch name (or `__main__`); stats come from each
 * matching workspace's commit list.
 */
export function useMissionControlDiffStats({
  open,
  repoPath,
  workspaces,
  groups,
}: {
  open: boolean;
  repoPath?: string;
  workspaces?: Workspace[];
  groups: MissionControlGroup[];
}): {
  diffStatsByWorkspaceKey: Map<string, WorkspaceDiffStats>;
  maxChange: number;
} {
  const workspaceByBranch = useMemo(() => {
    const map = new Map<string, Workspace>();
    for (const ws of workspaces ?? []) {
      map.set(ws.branch_name, ws);
    }
    return map;
  }, [workspaces]);

  const groupWorkspaceIds = useMemo(
    () =>
      groups.map((group) => {
        if (group.isMainRepo) return null;
        return workspaceByBranch.get(group.workspaceName)?.id ?? null;
      }),
    [groups, workspaceByBranch],
  );

  const commitQueries = useQueries({
    queries: groupWorkspaceIds.map((workspaceId) => ({
      queryKey: ["workspace-commits", repoPath, workspaceId],
      queryFn: () => listCommits(repoPath!, workspaceId!),
      enabled: Boolean(open && repoPath && workspaceId != null),
    })),
  });

  return useMemo(() => {
    const diffStatsByWorkspaceKey = new Map<string, WorkspaceDiffStats>();
    groups.forEach((group, index) => {
      const data = commitQueries[index]?.data?.commits;
      if (!data) return;
      diffStatsByWorkspaceKey.set(
        group.workspaceKey,
        sumWorkspaceDiffStats(data),
      );
    });

    const maxChange = Math.max(
      0,
      ...Array.from(diffStatsByWorkspaceKey.values()).map((stats) =>
        Math.max(stats.insertions, stats.deletions),
      ),
    );

    return { diffStatsByWorkspaceKey, maxChange };
  }, [groups, commitQueries]);
}
