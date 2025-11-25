import { useEffect, useMemo } from "react";
import type { Worktree } from "../lib/api";
import { preloadWorktreeGitData } from "../lib/api";

const sanitizePath = (path?: string | null): string | null => {
  if (!path) return null;
  const trimmed = path.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const useGitCachePreloader = (worktrees: Worktree[] | undefined, repositoryPath?: string | null) => {
  const pathsToPreload = useMemo(() => {
    const unique = new Set<string>();
    const repo = sanitizePath(repositoryPath ?? null);
    if (repo) {
      unique.add(repo);
    }
    (worktrees ?? []).forEach((tree) => {
      const path = sanitizePath(tree.worktree_path);
      if (path) {
        unique.add(path);
      }
    });
    return Array.from(unique);
  }, [worktrees, repositoryPath]);

  useEffect(() => {
    if (pathsToPreload.length === 0) {
      return;
    }

    let cancelled = false;

    const preload = async () => {
      await Promise.allSettled(
        pathsToPreload.map(async (path) => {
          try {
            await preloadWorktreeGitData(path);
          } catch (error) {
            if (!cancelled) {
              console.debug("git cache preload failed", path, error);
            }
          }
        })
      );
    };

    preload();

    return () => {
      cancelled = true;
    };
  }, [pathsToPreload]);
};
