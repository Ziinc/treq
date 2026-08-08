// Helpers for building the workspace-creation metadata JSON sent to the
// create_workspace command (parsed by core::parse_workspace_metadata).

export function parseSparsePathsInput(input: string): string[] | undefined {
	const paths = input
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
	return paths.length > 0 ? paths : undefined;
}

export function buildCreateMetadata(fields: {
	title: string;
	description: string;
	movedFiles?: string[];
	sparsePaths: string;
}): string {
	return JSON.stringify({
		title: fields.title.trim() || undefined,
		description: fields.description.trim() || undefined,
		moved_files: fields.movedFiles,
		sparse_patterns: parseSparsePathsInput(fields.sparsePaths),
	});
}
