import useSWR from "swr";
import { loadRepoYamlConfig } from "../lib/api";
import type { RepoYamlConfig } from "../lib/api-extra";
import { invalidateQueries } from "../lib/swr-cache";

export const repoYamlConfigKey = (repoPath: string | undefined) =>
  repoPath ? (["repo-yaml-config", repoPath] as const) : null;

/**
 * Parses `.treq/config.yaml` via SWR, keyed by repo path so every caller
 * sharing that key sees the same data and a `reload()` from any one of them
 * revalidates it for all. Loading it also writes matching fields into the
 * repo settings store on the backend, so this also revalidates the
 * `repo-settings` SWR key that `RepositorySettingsContent` reads from.
 */
export function useRepoYamlConfig(repoPath: string | undefined) {
  const { data, error, isLoading, mutate } = useSWR(
    repoYamlConfigKey(repoPath),
    async () => {
      const config = await loadRepoYamlConfig(repoPath!);
      await invalidateQueries(["repo-settings", repoPath]);
      return config;
    },
    // Re-reading a small local YAML file is cheap; always refetch on mount
    // (e.g. reopening Settings) instead of reusing a recent cached result.
    { dedupingInterval: 0 },
  );

  return {
    config: data as RepoYamlConfig | undefined,
    loading: isLoading,
    error: error
      ? `Failed to load .treq/config.yaml: ${error instanceof Error ? error.message : String(error)}`
      : null,
    reload: () => mutate(),
  };
}
