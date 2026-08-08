export type ReviewTabPillTone = "conflict" | "uncommitted" | "committed";

export interface ReviewTabPillInput {
	conflictCount: number;
	uncommittedCount: number;
	/** True when workspace status reports working-copy changes (may precede file list load). */
	hasUncommittedFromStatus: boolean;
	committedFileCount: number;
	commitsAheadCount: number;
	hasWorkspaceCommits: boolean;
}

export interface ReviewTabPill {
	tone: ReviewTabPillTone;
	count: number;
}

/**
 * Derive Review-tab badge visibility, count, and color tone.
 *
 * Priority: conflict (red) > uncommitted (yellow) > committed-only (grey).
 * Count prefers uncommitted files, then committed files, then commits ahead of target.
 */
export function getReviewTabPill(
	input: ReviewTabPillInput,
): ReviewTabPill | null {
	const hasUncommitted =
		input.uncommittedCount > 0 || input.hasUncommittedFromStatus;
	const hasCommitted =
		input.committedFileCount > 0 ||
		input.commitsAheadCount > 0 ||
		input.hasWorkspaceCommits;

	if (input.conflictCount <= 0 && !hasUncommitted && !hasCommitted) {
		return null;
	}

	const tone: ReviewTabPillTone =
		input.conflictCount > 0
			? "conflict"
			: hasUncommitted
				? "uncommitted"
				: "committed";

	const count =
		input.uncommittedCount > 0
			? input.uncommittedCount
			: input.committedFileCount > 0
				? input.committedFileCount
				: input.commitsAheadCount > 0
					? input.commitsAheadCount
					: input.conflictCount > 0
						? input.conflictCount
						: 0;

	// Status may say "has changes" before the file list is loaded; wait for a real count.
	if (count === 0) {
		return null;
	}

	return { tone, count };
}

export function reviewTabPillClassName(tone: ReviewTabPillTone): string {
	switch (tone) {
		case "conflict":
			return "bg-destructive text-destructive-foreground";
		case "uncommitted":
			return "bg-yellow-500 text-yellow-950";
		case "committed":
			return "bg-muted text-muted-foreground";
	}
}
