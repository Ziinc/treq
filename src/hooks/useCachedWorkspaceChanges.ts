import { useState, useEffect, useCallback, useRef } from "react";
import {
  getCachedGitChanges,
  listenWorkspaceChanges,
  triggerWorkspaceScan,
  ensureWorkspaceIndexed,
  type CachedFileChange,
  type GitDiffHunk,
} from "../lib/api";
import { type ParsedFileChange } from "../lib/git-utils";

interface UseCachedWorkspaceChangesOptions {
  enabled?: boolean;
  onUpdate?: () => void; // Callback when data is updated
  repoPath?: string; // Needed for workspace_id lookup
  workspaceId?: number | null;
}

interface FileHunksData {
  filePath: string;
  hunks: GitDiffHunk[];
  isLoading: boolean;
  error?: string;
}

interface CachedWorkspaceChangesResult {
  files: ParsedFileChange[];
  filesMap: Map<string, ParsedFileChange>; // Map for quick lookups by full path
  fileHunks: Map<string, FileHunksData>;
  isLoading: boolean;
  error: string | null;
  lastUpdated: string | null;
  refresh: () => Promise<void>;
}

export function useCachedWorkspaceChanges(
  workspacePath: string | null | undefined,
  options?: UseCachedWorkspaceChangesOptions
): CachedWorkspaceChangesResult {
  const [files, setFiles] = useState<ParsedFileChange[]>([]);
  const [filesMap, setFilesMap] = useState<Map<string, ParsedFileChange>>(new Map());
  const [fileHunks, setFileHunks] = useState<Map<string, FileHunksData>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const enabled = options?.enabled !== false && !!workspacePath;
  const mountedRef = useRef(true);

  const fetchData = useCallback(async () => {
    if (!workspacePath || !enabled) return;

    const repoPath = options?.repoPath || workspacePath;
    const workspaceId = options?.workspaceId ?? null;

    setIsLoading(true);
    setError(null);

    try {
      // Ensure workspace is indexed (lazy indexing - only indexes once per session)
      await ensureWorkspaceIndexed(repoPath, workspaceId, workspacePath);

      // If cache is empty, trigger a scan first
      const cachedFiles = await getCachedGitChanges(repoPath, workspaceId);

      if (cachedFiles.length === 0) {
        // Trigger initial scan but don't wait - event listener will handle update
        triggerWorkspaceScan(repoPath, workspaceId).catch((err) => {
          console.error("Failed to trigger workspace scan:", err);
          setError(err instanceof Error ? err.message : String(err));
        });

        // Return immediately with empty state - the event listener will update when scan completes
        setFiles([]);
        setFilesMap(new Map());
        setFileHunks(new Map());
        return;
      }

      await processFiles(cachedFiles);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }

    async function processFiles(
      cachedFiles: CachedFileChange[]
    ) {
      if (!mountedRef.current) return;

      // Convert cached format to ParsedFileChange format
      const parsedFiles = cachedFiles
        .filter((cf) => cf.file_path) // Filter out entries with undefined/null paths
        .map((cf) => ({
          path: cf.file_path,
          stagedStatus: cf.staged_status,
          workspaceStatus: cf.workspace_status,
          isUntracked: cf.is_untracked,
        }));

      // Parse hunks directly from cached files
      const hunksMap = new Map<string, FileHunksData>();
      for (const cf of cachedFiles) {
        if (cf.hunks_json) {
          try {
            // Parse the JSON hunks
            const hunks: GitDiffHunk[] = JSON.parse(cf.hunks_json);
            hunksMap.set(cf.file_path, {
              filePath: cf.file_path,
              hunks,
              isLoading: false,
            });
          } catch (e) {
            console.error(`Failed to parse hunks for ${cf.file_path}:`, e);
            hunksMap.set(cf.file_path, {
              filePath: cf.file_path,
              hunks: [],
              isLoading: false,
              error: "Failed to parse hunks",
            });
          }
        }
      }

      if (!mountedRef.current) return;

      // Build filesMap for quick lookups by full path
      const newFilesMap = new Map<string, ParsedFileChange>();
      for (const file of parsedFiles) {
        const fullPath = workspacePath ? `${workspacePath}/${file.path}` : file.path;
        newFilesMap.set(fullPath, file);
      }

      setFiles(parsedFiles);
      setFilesMap(newFilesMap);
      setFileHunks(hunksMap);
      setLastUpdated(cachedFiles[0]?.updated_at ?? new Date().toISOString());

      options?.onUpdate?.();
    }
  }, [workspacePath, enabled, options]);

  // Initial load
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Subscribe to workspace changes events
  useEffect(() => {
    if (!workspacePath || !enabled) return;

    let unlisten: (() => void) | null = null;

    const setupListener = async () => {
      unlisten = await listenWorkspaceChanges((payload) => {
        // Only refetch if the event is for our workspace
        if (payload.workspace_path === workspacePath) {
          fetchData();
        }
      });
    };

    setupListener();

    return () => {
      unlisten?.();
    };
  }, [workspacePath, enabled, fetchData]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return {
    files,
    filesMap,
    fileHunks,
    isLoading,
    error,
    lastUpdated,
    refresh: fetchData,
  };
}
