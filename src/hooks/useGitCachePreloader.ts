import { useEffect } from "react";
import { preloadWorktreeGitData } from "../lib/api";

const sanitizePath = (path?: string | null): string | null => {
  if (!path) return null;
  const trimmed = path.trim();
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * Lazy git cache preloader - only preloads data for the selected worktree
 * with debouncing to avoid rapid calls during navigation
 */
export const useGitCachePreloader = (
  selectedWorktreePath: string | null | undefined
) => {
  useEffect(() => {
    const path = sanitizePath(selectedWorktreePath ?? null);
    if (!path) return;

    // Debounce: wait 200ms before preloading to avoid rapid calls
    const timeoutId = setTimeout(async () => {
      try {
        await preloadWorktreeGitData(path);
      } catch {
        // Silently ignore preload failures
      }
    }, 200);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [selectedWorktreePath]);
};
