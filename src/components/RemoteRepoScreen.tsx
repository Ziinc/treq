import { useState } from "react";
import useSWR from "swr";
import { dispatchOverSsh } from "../lib/remote-dispatch";
import type { SshEndpoint } from "../lib/api-types-remote";
import type {
  Workspace,
  WorkspaceStatus,
  JjFileChange,
  JjDiffHunk,
  JjFileLines,
  JjLogCommit,
} from "../lib/api-types";
import { RemoteAgentScreen } from "./RemoteAgentScreen";

interface WorkspaceChangeMarker {
  operation_id: string;
}

type Screen =
  | { name: "workspaces" }
  | { name: "workspace"; workspace: string }
  | { name: "diff"; workspace: string; path: string }
  | { name: "commits"; workspace: string }
  | { name: "conflicts"; workspace: string }
  | { name: "agent"; workspace: string };

/**
 * Phase 3 (read-only review) + Phase 4 (agent control) mobile UI, driven
 * entirely over `dispatchOverSsh` against the connected VM. Single-column
 * navigation: workspace list -> workspace detail -> diff/commits/
 * conflicts/agent, each with manual refresh.
 */
export function RemoteRepoScreen({
  endpoint,
  repo,
}: {
  endpoint: SshEndpoint;
  repo: string;
}) {
  const [screen, setScreen] = useState<Screen>({ name: "workspaces" });

  return (
    <div className="flex flex-col gap-3">
      {screen.name !== "workspaces" && (
        <button
          type="button"
          className="self-start text-sm text-muted-foreground"
          onClick={() =>
            "workspace" in screen && screen.name !== "workspace"
              ? setScreen({ name: "workspace", workspace: screen.workspace })
              : setScreen({ name: "workspaces" })
          }
        >
          ← Back
        </button>
      )}
      {screen.name === "workspaces" && (
        <WorkspaceListScreen
          endpoint={endpoint}
          repo={repo}
          onSelect={(workspace) => setScreen({ name: "workspace", workspace })}
        />
      )}
      {screen.name === "workspace" && (
        <WorkspaceDetailScreen
          endpoint={endpoint}
          repo={repo}
          workspace={screen.workspace}
          onOpenDiff={(path) =>
            setScreen({ name: "diff", workspace: screen.workspace, path })
          }
          onOpenCommits={() =>
            setScreen({ name: "commits", workspace: screen.workspace })
          }
          onOpenConflicts={() =>
            setScreen({ name: "conflicts", workspace: screen.workspace })
          }
          onOpenAgent={() =>
            setScreen({ name: "agent", workspace: screen.workspace })
          }
        />
      )}
      {screen.name === "diff" && (
        <DiffScreen
          endpoint={endpoint}
          repo={repo}
          workspace={screen.workspace}
          path={screen.path}
        />
      )}
      {screen.name === "commits" && (
        <CommitsScreen
          endpoint={endpoint}
          repo={repo}
          workspace={screen.workspace}
        />
      )}
      {screen.name === "conflicts" && (
        <ConflictsScreen
          endpoint={endpoint}
          repo={repo}
          workspace={screen.workspace}
        />
      )}
      {screen.name === "agent" && (
        <RemoteAgentScreen
          endpoint={endpoint}
          repo={repo}
          workspace={screen.workspace}
        />
      )}
    </div>
  );
}

function RefreshButton({
  onClick,
  loading,
}: {
  onClick: () => void;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="self-end rounded-md border px-2 py-1 text-xs"
    >
      {loading ? "Refreshing..." : "Refresh"}
    </button>
  );
}

function WorkspaceListScreen({
  endpoint,
  repo,
  onSelect,
}: {
  endpoint: SshEndpoint;
  repo: string;
  onSelect: (workspace: string) => void;
}) {
  const { data, error, isLoading, mutate } = useSWR(
    ["remote-workspaces", endpoint.hostname, repo],
    () =>
      dispatchOverSsh<Workspace[]>(endpoint, { kind: "ListWorkspaces", repo }),
  );

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Workspaces</h2>
        <RefreshButton onClick={() => mutate()} loading={isLoading} />
      </div>
      {error && <p className="text-sm text-destructive">{String(error)}</p>}
      {data?.length === 0 && (
        <p className="text-sm text-muted-foreground">No workspaces found.</p>
      )}
      <ul className="flex flex-col gap-2">
        {data?.map((ws) => (
          <li key={ws.id}>
            <button
              type="button"
              onClick={() => onSelect(ws.workspace_name)}
              className="w-full rounded-md border px-3 py-2 text-left text-sm"
            >
              <div className="font-medium">{ws.title || ws.workspace_name}</div>
              <div className="text-xs text-muted-foreground">
                {ws.branch_name}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function WorkspaceDetailScreen({
  endpoint,
  repo,
  workspace,
  onOpenDiff,
  onOpenCommits,
  onOpenConflicts,
  onOpenAgent,
}: {
  endpoint: SshEndpoint;
  repo: string;
  workspace: string;
  onOpenDiff: (path: string) => void;
  onOpenCommits: () => void;
  onOpenConflicts: () => void;
  onOpenAgent: () => void;
}) {
  const statusKey = [
    "remote-workspace-status",
    endpoint.hostname,
    repo,
    workspace,
  ];
  const {
    data: status,
    error: statusError,
    isLoading: statusLoading,
    mutate: mutateStatus,
  } = useSWR(statusKey, () =>
    dispatchOverSsh<WorkspaceStatus>(endpoint, {
      kind: "InspectWorkspace",
      repo,
      workspace,
    }),
  );

  const {
    data: changes,
    error: changesError,
    isLoading: changesLoading,
    mutate: mutateChanges,
  } = useSWR(["remote-changes", endpoint.hostname, repo, workspace], () =>
    dispatchOverSsh<JjFileChange[]>(endpoint, {
      kind: "ListChanges",
      repo,
      workspace,
    }),
  );

  const { data: marker, mutate: mutateMarker } = useSWR(
    ["remote-change-marker", endpoint.hostname, repo, workspace],
    () =>
      dispatchOverSsh<WorkspaceChangeMarker>(endpoint, {
        kind: "WorkspaceChangeMarker",
        repo,
        workspace,
      }),
    { refreshInterval: 15_000 },
  );

  const refreshAll = () => {
    mutateStatus();
    mutateChanges();
    mutateMarker();
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{workspace}</h2>
        <RefreshButton
          onClick={refreshAll}
          loading={statusLoading || changesLoading}
        />
      </div>
      {marker && (
        <p className="text-xs text-muted-foreground">
          op {marker.operation_id.slice(0, 12)}
        </p>
      )}
      {statusError && (
        <p className="text-sm text-destructive">{String(statusError)}</p>
      )}
      {status && (
        <div className="rounded-md border px-3 py-2 text-sm">
          <p>{status.has_changes ? "Has uncommitted changes" : "Clean"}</p>
          <p>{status.has_conflicts ? "Has conflicts" : "No conflicts"}</p>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onOpenCommits}
          className="flex-1 rounded-md border px-3 py-2 text-sm"
        >
          Commits
        </button>
        <button
          type="button"
          onClick={onOpenConflicts}
          className="flex-1 rounded-md border px-3 py-2 text-sm"
        >
          Conflicts
        </button>
        <button
          type="button"
          onClick={onOpenAgent}
          className="flex-1 rounded-md border px-3 py-2 text-sm"
        >
          Agent
        </button>
      </div>

      <h3 className="text-sm font-semibold">Changed files</h3>
      {changesError && (
        <p className="text-sm text-destructive">{String(changesError)}</p>
      )}
      {changes?.length === 0 && (
        <p className="text-sm text-muted-foreground">No changed files.</p>
      )}
      <ul className="flex flex-col gap-2">
        {changes?.map((file) => (
          <li key={file.path}>
            <button
              type="button"
              onClick={() => onOpenDiff(file.path)}
              className="w-full rounded-md border px-3 py-2 text-left text-sm"
            >
              <span className="font-mono text-xs uppercase text-muted-foreground">
                {file.status}
              </span>{" "}
              {file.path}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DiffScreen({
  endpoint,
  repo,
  workspace,
  path,
}: {
  endpoint: SshEndpoint;
  repo: string;
  workspace: string;
  path: string;
}) {
  const { data, error, isLoading, mutate } = useSWR(
    ["remote-diff", endpoint.hostname, repo, workspace, path],
    () =>
      dispatchOverSsh<JjDiffHunk[]>(endpoint, {
        kind: "DiffFile",
        repo,
        workspace,
        path,
      }),
  );

  const { data: workingCopy } = useSWR(
    ["remote-file", endpoint.hostname, repo, workspace, path, "wc"],
    () =>
      dispatchOverSsh<JjFileLines>(endpoint, {
        kind: "ReadFile",
        repo,
        workspace,
        path,
        revision: "WorkingCopy",
      }),
  );

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="truncate text-sm font-semibold">{path}</h2>
        <RefreshButton onClick={() => mutate()} loading={isLoading} />
      </div>
      {error && <p className="text-sm text-destructive">{String(error)}</p>}
      {data?.map((hunk) => (
        <pre
          key={hunk.id}
          className="overflow-x-auto whitespace-pre rounded-md border bg-muted px-3 py-2 font-mono text-xs"
        >
          {hunk.header}
          {"\n"}
          {hunk.lines.join("\n")}
        </pre>
      ))}
      {workingCopy && (
        <details className="rounded-md border px-3 py-2 text-xs">
          <summary className="cursor-pointer text-sm font-semibold">
            Working-copy content
          </summary>
          <pre className="overflow-x-auto whitespace-pre font-mono">
            {workingCopy.lines.join("\n")}
          </pre>
        </details>
      )}
    </section>
  );
}

function CommitsScreen({
  endpoint,
  repo,
  workspace,
}: {
  endpoint: SshEndpoint;
  repo: string;
  workspace: string;
}) {
  const { data, error, isLoading, mutate } = useSWR(
    ["remote-commits", endpoint.hostname, repo, workspace],
    () =>
      dispatchOverSsh<JjLogCommit[]>(endpoint, {
        kind: "ListCommits",
        repo,
        workspace,
      }),
  );

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Commits</h2>
        <RefreshButton onClick={() => mutate()} loading={isLoading} />
      </div>
      {error && <p className="text-sm text-destructive">{String(error)}</p>}
      <ul className="flex flex-col gap-2">
        {data?.map((commit) => (
          <li
            key={commit.commit_id}
            className="rounded-md border px-3 py-2 text-sm"
          >
            <p className="font-mono text-xs text-muted-foreground">
              {commit.short_id}
            </p>
            <p>{commit.description || "(no description)"}</p>
            <p className="text-xs text-muted-foreground">
              {commit.author_name} · {commit.timestamp}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ConflictsScreen({
  endpoint,
  repo,
  workspace,
}: {
  endpoint: SshEndpoint;
  repo: string;
  workspace: string;
}) {
  const { data, error, isLoading, mutate } = useSWR(
    ["remote-conflicts", endpoint.hostname, repo, workspace],
    () =>
      dispatchOverSsh<string[]>(endpoint, {
        kind: "ListConflicts",
        repo,
        workspace,
      }),
  );

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Conflicts</h2>
        <RefreshButton onClick={() => mutate()} loading={isLoading} />
      </div>
      {error && <p className="text-sm text-destructive">{String(error)}</p>}
      {data?.length === 0 && (
        <p className="text-sm text-muted-foreground">No conflicted files.</p>
      )}
      <ul className="flex flex-col gap-2">
        {data?.map((path) => (
          <li
            key={path}
            className="rounded-md border px-3 py-2 font-mono text-sm"
          >
            {path}
          </li>
        ))}
      </ul>
    </section>
  );
}
