import type { ConflictRegion, ConflictStyle } from "./api-types";

const SIDE_LABELLED_STYLES: ReadonlySet<ConflictStyle> = new Set([
  "git_merge",
  "git_diff3",
  "jj_git_diff3",
]);

function sideHasContent(
  region: ConflictRegion,
  role: "left" | "right",
): boolean {
  return region.lines.some(
    (line) =>
      line.kind === "content" &&
      line.role === role &&
      line.raw.trim().length > 0,
  );
}

/**
 * Detect which conflict sides represent a file deletion.
 * jj materializes an absent side as empty bytes, so the corresponding
 * left/right section has no non-whitespace content lines.
 */
export function getConflictDeletedSides(region: ConflictRegion): {
  left: boolean;
  right: boolean;
} {
  if (!SIDE_LABELLED_STYLES.has(region.marker_style)) {
    return { left: false, right: false };
  }

  return {
    left: !sideHasContent(region, "left"),
    right: !sideHasContent(region, "right"),
  };
}

export function isDeletedFileStatus(
  status: string | undefined | null,
): boolean {
  return status === "D";
}
