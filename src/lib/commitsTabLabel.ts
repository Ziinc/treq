export type CommitsTabCountTone = "conflict" | "default";

export type CommitsTabLabel =
  | { kind: "count"; count: number; tone: CommitsTabCountTone }
  | { kind: "home-conflict" }
  | null;

export interface CommitsTabLabelInput {
  isHomeRepo: boolean;
  /** Commits made in this workspace (ahead of target); ignored for home. */
  commitCount: number;
  hasConflict: boolean;
}

/**
 * Derive the Commits tab adornment.
 *
 * Workspace: grey (or red on conflict) count pill when there is at least one
 * workspace commit. Home: no count; warning icon only when the home repo has
 * a conflict.
 */
export function getCommitsTabLabel(
  input: CommitsTabLabelInput,
): CommitsTabLabel {
  if (input.isHomeRepo) {
    return input.hasConflict ? { kind: "home-conflict" } : null;
  }
  if (input.commitCount <= 0) {
    return null;
  }
  return {
    kind: "count",
    count: input.commitCount,
    tone: input.hasConflict ? "conflict" : "default",
  };
}

export function commitsTabCountClassName(tone: CommitsTabCountTone): string {
  switch (tone) {
    case "conflict":
      return "bg-destructive/20 text-destructive";
    case "default":
      return "bg-muted text-muted-foreground";
    default: {
      const _exhaustive: never = tone;
      return _exhaustive;
    }
  }
}
