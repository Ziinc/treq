import { useEffect } from "react";
import useSWR from "swr";
import type {
  RepositoryLocation,
  SshEndpoint,
} from "../../lib/api-types-remote";
import { dispatch, isRemoteActionSupported } from "../../lib/remote-dispatch";
import { remoteRepoIdentity } from "../../lib/remote-query-keys";

interface RemoteAgentStatus {
  running: boolean;
  should_refresh: boolean;
}

/**
 * Polls the agent supervisor's status for a workspace and refetches remote
 * review data whenever it reports `should_refresh` (PRD "Agent and terminal
 * lifecycle": "When an agent exits or a mutation completes, the desktop
 * client refreshes remote repository status, changes, commits, and
 * conflicts."). Only active when a workspace is selected and an agent may be
 * running there - it is not a general polling refresh.
 */
interface AgentRefreshWatch {
  endpoint: SshEndpoint | null;
  repoPath: string;
  workspace: string | null | undefined;
  onShouldRefresh: () => void;
}

function useAgentShouldRefresh({
  endpoint,
  repoPath,
  workspace,
  onShouldRefresh,
}: AgentRefreshWatch) {
  const { data } = useSWR(
    workspace ? ["remote-agent-status", repoPath, workspace] : null,
    () =>
      dispatch<RemoteAgentStatus>(endpoint, {
        kind: "AgentStatus",
        repo: repoPath,
        workspace: workspace as string,
      }),
    { refreshInterval: 5_000, dedupingInterval: 2_000 },
  );

  useEffect(() => {
    if (data?.should_refresh) onShouldRefresh();
  }, [data?.should_refresh, onShouldRefresh]);
}

export interface RemoteReviewPanelProps {
  /** `null` routes through `remote_dispatch_local` instead of SSH. */
  endpoint: SshEndpoint | null;
  endpointGeneration: number;
  location: RepositoryLocation;
  workspace?: string | null;
  onRefreshRequested?: () => void;
}

interface RemoteChangedFile {
  path: string;
  status?: string;
}

interface RemoteCommitSummary {
  id: string;
  description?: string;
}

interface RemoteConflictSummary {
  path: string;
}

/**
 * Read-only remote status/changes/commits/conflicts, fetched through Phase
 * 5's typed dispatch (`remote_dispatch_local` / `remote_dispatch_over_ssh`)
 * rather than a local Tauri `invoke`. This is what stands in for the old
 * "Repository review remains read-only" placeholder text - real remote data
 * loaded through the existing review surface, keyed so it can never collide
 * with a local repo's cache entries (see `remote-query-keys.ts`).
 */
export function RemoteReviewPanel({
  endpoint,
  endpointGeneration,
  location,
  workspace,
  onRefreshRequested,
}: RemoteReviewPanelProps) {
  const repoPath = location.type === "ssh" ? location.path : location.path;
  const identity = remoteRepoIdentity(location, endpointGeneration);

  const { data, error, isLoading, mutate } = useSWR(
    ["remote-review-panel", identity, workspace ?? null],
    async () => {
      const [status, changes, commits, conflicts] = await Promise.all([
        dispatch(endpoint, { kind: "RepositoryStatus", repo: repoPath }),
        dispatch<RemoteChangedFile[]>(endpoint, {
          kind: "ListChanges",
          repo: repoPath,
          workspace,
        }),
        dispatch<RemoteCommitSummary[]>(endpoint, {
          kind: "ListCommits",
          repo: repoPath,
          workspace,
        }),
        dispatch<RemoteConflictSummary[]>(endpoint, {
          kind: "ListConflicts",
          repo: repoPath,
          workspace,
        }),
      ]);
      return { status, changes, commits, conflicts };
    },
  );

  const refresh = () => {
    void mutate();
    onRefreshRequested?.();
  };

  useAgentShouldRefresh({
    endpoint,
    repoPath,
    workspace,
    onShouldRefresh: refresh,
  });

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Remote review</h2>
        <button
          type="button"
          className="text-xs underline underline-offset-2"
          onClick={refresh}
        >
          Refresh
        </button>
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground">
          Loading remote status...
        </p>
      )}
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">
          {error instanceof Error ? error.message : String(error)}
        </p>
      )}

      {data && (
        <>
          <section>
            <h3 className="text-xs font-medium uppercase text-muted-foreground">
              Changed files ({data.changes?.length ?? 0})
            </h3>
            <ul className="mt-1 space-y-0.5 text-sm">
              {(data.changes ?? []).map((file) => (
                <li key={file.path} className="font-mono text-xs">
                  {file.status ? `${file.status} ` : ""}
                  {file.path}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="text-xs font-medium uppercase text-muted-foreground">
              Commits ({data.commits?.length ?? 0})
            </h3>
            <ul className="mt-1 space-y-0.5 text-sm">
              {(data.commits ?? []).map((commit) => (
                <li key={commit.id} className="truncate">
                  <span className="font-mono text-xs text-muted-foreground">
                    {commit.id.slice(0, 8)}
                  </span>{" "}
                  {commit.description}
                </li>
              ))}
            </ul>
          </section>

          {(data.conflicts ?? []).length > 0 && (
            <section>
              <h3 className="text-xs font-medium uppercase text-red-500">
                Conflicts ({data.conflicts.length})
              </h3>
              <ul className="mt-1 space-y-0.5 text-sm">
                {data.conflicts.map((conflict) => (
                  <li key={conflict.path} className="font-mono text-xs">
                    {conflict.path}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {!isRemoteActionSupported("SplitCommit") && (
        <p className="text-xs text-muted-foreground">
          Commit split is not yet available on remote repositories.
        </p>
      )}
    </div>
  );
}
