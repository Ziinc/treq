import { abandonCommit, getCommitDiff, type JjRevisionDiff } from "./api";

interface OperationResult {
	success: boolean;
	error?: string;
}

/**
 * Abandon a commit by change ID.  Returns a structured result rather than
 * throwing so callers can handle errors without try/catch boilerplate.
 */
export async function performAbandonCommit(
	repoPath: string,
	workspaceId: number,
	changeId: string,
): Promise<OperationResult> {
	try {
		await abandonCommit(repoPath, workspaceId, changeId);
		return { success: true };
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

/**
 * Load the diff for a single commit, trying `commitId` first and falling back
 * to `changeId` when the first revision returns an empty result.  Deduplicates
 * the revision list so the same ID is only tried once.
 */
export async function loadCommitDiff(
	repoPath: string,
	workspaceId: number | null,
	commitId: string,
	changeId?: string,
): Promise<JjRevisionDiff> {
	const revisions = [commitId, changeId].filter(
		(value, index, values): value is string =>
			typeof value === "string" &&
			value.length > 0 &&
			values.indexOf(value) === index,
	);

	let lastError: unknown;
	for (const revision of revisions) {
		try {
			const diff = await getCommitDiff(repoPath, workspaceId, revision);
			if (diff.files.length > 0 || diff.hunks_by_file.length > 0) {
				return diff;
			}
		} catch (error) {
			lastError = error;
		}
	}

	if (lastError) throw lastError;
	return { files: [], hunks_by_file: [] };
}
