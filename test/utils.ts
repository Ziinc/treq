export function openRepo(repoPath: string) {
	// Point the app at a repo via the URL search param it reads
	window.history.pushState({}, "", `?repo=${encodeURIComponent(repoPath)}`);
}

export function createTestRepo(withRemote = false): {
	repoPath: string;
	tempDirPath: string;
} {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const napi = require("../crates/treq-napi") as {
		createTestRepo: (withRemote: boolean) => {
			repoPath: string;
			tempDirPath: string;
		};
	};
	return napi.createTestRepo(withRemote);
}
