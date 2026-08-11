/** MIME type for dragging uncommitted Review-tab files onto a workspace. */
export const CHANGE_FILES_MIME = "application/x-treq-change-files";

/** Reserved source/destination branch for the home repo (matches Rust HOME_MOVE_ENDPOINT). */
export const HOME_MOVE_ENDPOINT = ".";

/** Dispatched after a successful drag-move so the Review tab reloads its file list. */
export const REFRESH_WORKSPACE_CHANGES_EVENT = "treq:refresh-workspace-changes";

export interface ChangeFilesDragPayload {
  files: string[];
  /** Source workspace branch_name, or HOME_MOVE_ENDPOINT for the home repo. */
  sourceBranch: string;
}

export function setChangeFilesDragData(
  dataTransfer: DataTransfer,
  payload: ChangeFilesDragPayload,
): void {
  const serialized = JSON.stringify(payload);
  dataTransfer.setData(CHANGE_FILES_MIME, serialized);
  // text/plain fallback helps some browsers / test environments accept the drag.
  dataTransfer.setData("text/plain", serialized);
  dataTransfer.effectAllowed = "move";
}

export function getChangeFilesDragData(
  dataTransfer: DataTransfer,
): ChangeFilesDragPayload | null {
  const raw =
    dataTransfer.getData(CHANGE_FILES_MIME) ||
    dataTransfer.getData("text/plain");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ChangeFilesDragPayload;
    if (
      !parsed ||
      !Array.isArray(parsed.files) ||
      typeof parsed.sourceBranch !== "string" ||
      parsed.files.length === 0
    ) {
      return null;
    }
    return {
      files: parsed.files.filter((f): f is string => typeof f === "string"),
      sourceBranch: parsed.sourceBranch,
    };
  } catch {
    return null;
  }
}

export function isChangeFilesDrag(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes(CHANGE_FILES_MIME);
}

export function dispatchRefreshWorkspaceChanges(): void {
  window.dispatchEvent(new CustomEvent(REFRESH_WORKSPACE_CHANGES_EVENT));
}
