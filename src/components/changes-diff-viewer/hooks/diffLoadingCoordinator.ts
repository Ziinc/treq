import type { JjDiffHunk } from "../../../lib/api";
import type { FileHunksData } from "../types";

export interface HunkBatchFile {
  path: string;
  contentHash: string;
  hunks: JjDiffHunk[];
  error?: string;
}

export function chunkPaths(paths: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < paths.length; index += size) {
    chunks.push(paths.slice(index, index + size));
  }
  return chunks;
}

export function replaceGeneration(
  current: Map<string, FileHunksData>,
  paths: string[],
): Map<string, FileHunksData> {
  return new Map(
    paths.map((path) => [
      path,
      current.get(path) ?? { filePath: path, hunks: [], isLoading: true },
    ]),
  );
}

export function applyHunkBatch(
  current: Map<string, FileHunksData>,
  files: HunkBatchFile[],
): Map<string, FileHunksData> {
  const next = new Map(current);
  for (const file of files) {
    const existing = current.get(file.path);
    if (existing?.contentHash === file.contentHash && !existing.isLoading) continue;
    next.set(file.path, {
      filePath: file.path,
      hunks: file.error ? [] : file.hunks,
      isLoading: false,
      contentHash: file.contentHash,
      error: file.error,
    });
  }
  return next;
}
