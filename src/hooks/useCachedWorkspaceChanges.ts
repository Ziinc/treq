import { useCallback, useRef } from "react";

interface UseCachedWorkspaceChangesOptions {
  enabled?: boolean;
  repoPath?: string | null;
  workspaceId?: number | null;
}

interface CachedWorkspaceChangesResult {
  refresh: () => Promise<void>;
}

/**
 * Hook for managing workspace changes cache.
 * Currently a minimal implementation - the actual caching is done
 * via the jjGetChangedFiles calls in the component.
 */
export function useCachedWorkspaceChanges(
  _workspacePath: string,
  _options: UseCachedWorkspaceChangesOptions = {}
): CachedWorkspaceChangesResult {
  const refreshCallbackRef = useRef<(() => void) | null>(null);

  const refresh = useCallback(async () => {
    // Trigger any registered refresh callbacks
    refreshCallbackRef.current?.();
  }, []);

  return {
    refresh,
  };
}














