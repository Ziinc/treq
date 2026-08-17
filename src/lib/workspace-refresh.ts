export type WorkspaceRefreshTarget =
  | "file-browser"
  | "changes-diff"
  | "commits-list"
  | "none";

export interface WorkspaceChangesRefreshDetail {
  workspaceId?: number;
  changedPaths?: string[];
}

export function visibleWorkspaceRefreshTarget(opts: {
  activeTab: string;
  showFileBrowser: boolean;
}): WorkspaceRefreshTarget {
  if (opts.activeTab === "changes") return "changes-diff";
  if (opts.activeTab === "commits") return "commits-list";
  if (opts.activeTab === "overview" && opts.showFileBrowser) {
    return "file-browser";
  }
  return "none";
}

/** True when `targetPath` is the changed file, a parent dir, or a child of it. */
export function pathIsAffected(
  targetPath: string,
  changedPaths?: string[],
): boolean {
  if (!changedPaths || changedPaths.length === 0) return true;
  return changedPaths.some((changed) => {
    if (changed === targetPath) return true;
    if (changed.startsWith(`${targetPath}/`)) return true;
    if (targetPath.startsWith(`${changed}/`)) return true;
    if (
      targetPath.endsWith(`/${changed}`) ||
      changed.endsWith(`/${targetPath}`)
    ) {
      return true;
    }
    return false;
  });
}
