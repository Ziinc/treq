import { useEffect } from "react";
import { preloadWorkspaceGitData } from "../lib/api";

const sanitizePath = (path?: string | null): string | null => {
  if (!path) return null;
  const trimmed = path.trim();
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * Lazy git cache preloader - only preloads data for the selected workspace
 * with debouncing to avoid rapid calls during navigation
 */
export const useGitCachePreloader = (
  selectedWorkspacePath: string | null | undefined
) => {
  useEffect(() => {
    const path = sanitizePath(selectedWorkspacePath ?? null);
    if (!path) return;

    // Debounce: wait 200ms before preloading to avoid rapid calls
    const timeoutId = setTimeout(async () => {
      try {
        await preloadWorkspaceGitData(path);
      } catch {
        // Silently ignore preload failures
      }
    }, 200);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [selectedWorkspacePath]);
};
