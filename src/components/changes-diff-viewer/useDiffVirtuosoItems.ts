import { useMemo } from "react";
import {
  buildDiffVirtuosoItems,
  type BuildDiffVirtuosoItemsArgs,
  type DiffVirtuosoIndexMaps,
  type DiffVirtuosoItem,
} from "./buildDiffVirtuosoItems";

export function useDiffVirtuosoItems(args: BuildDiffVirtuosoItemsArgs): {
  items: DiffVirtuosoItem[];
  maps: DiffVirtuosoIndexMaps;
} {
  return useMemo(
    () => buildDiffVirtuosoItems(args),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      args.actualConflictedFiles,
      args.allFileHunks,
      args.collapsedFiles,
      args.committedFileHunks,
      args.committedFiles,
      args.conflictLineLookups,
      args.expandedContext,
      args.expandedLargeDiffs,
      args.files,
      args.getFileCommentsForFile,
      args.getOutdatedCommentsForFile,
      args.getUnplacedThreadsForFile,
      args.pendingComment,
      args.showCommentInput,
      args.viewedFiles,
    ],
  );
}
