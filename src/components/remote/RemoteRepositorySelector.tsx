import { Button } from "../ui/button";
import type { RemoteRepoProbe } from "../../lib/api-types-remote";
import type { SavedRemoteRepositoryRecord } from "../../lib/remote-endpoints";

export interface RemoteRepositorySelectorProps {
  savedRepositories: SavedRemoteRepositoryRecord[];
  selectedId: string | null;
  path: string;
  probe: RemoteRepoProbe | null;
  cloneUrl: string;
  confirmInit: boolean;
  busy?: boolean;
  error?: string;
  onSelectSaved: (id: string) => void;
  onPathChange: (path: string) => void;
  onProbe: () => void;
  onCloneUrlChange: (url: string) => void;
  onConfirmInitChange: (confirmed: boolean) => void;
  onOpenExisting: () => void;
  onClone: () => void;
  onInit: () => void;
}

/**
 * Select a saved remote repository or enter a new path on the current
 * endpoint. Probe/clone/inspect/init stay typed; empty-dir init requires an
 * explicit confirmation checkbox (PRD "Repository opening").
 */
export function RemoteRepositorySelector({
  savedRepositories,
  selectedId,
  path,
  probe,
  cloneUrl,
  confirmInit,
  busy,
  error,
  onSelectSaved,
  onPathChange,
  onProbe,
  onCloneUrlChange,
  onConfirmInitChange,
  onOpenExisting,
  onClone,
  onInit,
}: RemoteRepositorySelectorProps) {
  return (
    <div
      className="flex flex-col gap-3"
      data-testid="remote-repository-selector"
    >
      {savedRepositories.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">Saved repositories</span>
          <ul className="flex flex-col gap-1">
            {savedRepositories.map((repo) => (
              <li key={repo.id}>
                <button
                  type="button"
                  className={`w-full rounded-md border px-2 py-1.5 text-left text-sm ${
                    selectedId === repo.id
                      ? "border-primary bg-muted/60"
                      : "border-border/60"
                  }`}
                  onClick={() => onSelectSaved(repo.id)}
                >
                  {repo.display_name}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {repo.canonical_remote_path}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <label className="flex flex-col gap-1 max-w-md">
        <span className="text-sm font-medium">Remote repository path</span>
        <input
          className="rounded-md border border-border/60 bg-background px-2 py-1.5"
          value={path}
          onChange={(event) => onPathChange(event.target.value)}
          aria-label="Remote repository path"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy || !path.trim()} onClick={onProbe}>
          Probe
        </Button>
        {probe?.is_repo && (
          <Button size="sm" disabled={busy} onClick={onOpenExisting}>
            Open
          </Button>
        )}
      </div>

      {probe && !probe.is_repo && (
        <div className="flex flex-col gap-2 rounded-md border border-border/60 p-3">
          {probe.needs_clone && (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Git URL to clone</span>
                <input
                  className="rounded-md border border-border/60 bg-background px-2 py-1.5"
                  value={cloneUrl}
                  onChange={(event) => onCloneUrlChange(event.target.value)}
                  aria-label="Git URL to clone"
                />
              </label>
              <Button
                size="sm"
                className="w-fit"
                disabled={busy || !cloneUrl.trim()}
                onClick={onClone}
              >
                Clone repository
              </Button>
            </>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmInit}
              onChange={(event) => onConfirmInitChange(event.target.checked)}
              aria-label="Confirm initialize empty repository"
            />
            Initialize an empty repository at this path
          </label>
          <Button
            size="sm"
            className="w-fit"
            disabled={busy || !confirmInit}
            onClick={onInit}
          >
            Initialize repository
          </Button>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
