import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

/**
 * Returns a Set of paths that have changes (files and parent directories)
 * Used for showing change indicators in the file browser
 */
export function useDirectoryChangeIndicators(workspacePath: string | null) {
  return useQuery({
    queryKey: ["changeIndicators", workspacePath],
    queryFn: async () => {
      if (!workspacePath) {
        return new Set<string>();
      }

      const paths = await invoke<string[]>("get_change_indicators", {
        workspacePath,
      });

      return new Set(paths);
    },
    staleTime: 5000,
    enabled: !!workspacePath,
  });
}
