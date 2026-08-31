import { useEffect, useState } from "react";
import { getSetting, getWorkspaces, type Workspace } from "../lib/api";

/**
 * Mobile-optimized top-level layout. Runs on the same Tauri backend and IPC
 * commands as the desktop Dashboard, but renders a single-column,
 * touch-first shell instead of the desktop's multi-pane layout.
 */
export function MobileShell() {
  const [repoPath, setRepoPath] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSetting("lastRepoPath")
      .then((path) => {
        if (!cancelled) setRepoPath(path ?? null);
      })
      .catch(() => {
        if (!cancelled) setRepoPath(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!repoPath) return;
    let cancelled = false;
    getWorkspaces(repoPath)
      .then((ws) => {
        if (!cancelled) setWorkspaces(ws);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [repoPath]);

  return (
    <div className="flex h-screen flex-col overflow-y-auto">
      <header className="sticky top-0 z-10 border-b bg-background px-4 py-3">
        <h1 className="text-lg font-semibold">Treq</h1>
      </header>
      <main className="flex-1 px-4 py-3">
        {!repoPath && (
          <p className="text-sm text-muted-foreground">
            No repository selected yet.
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {repoPath && workspaces && (
          <ul className="flex flex-col gap-2">
            {workspaces.map((ws) => (
              <li
                key={ws.id}
                className="rounded-md border px-3 py-2 text-sm"
              >
                {ws.workspace_name}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
