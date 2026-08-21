import type { ConflictRegion, JjDiffHunk, JjFileChange } from "../../lib/api";
import type { ParsedFileChange } from "../../lib/git-utils";
import { computeHunkLineNumbers, parseHunkHeader } from "./utils";
import { getFileDisplayState, type FileBodyKind } from "./fileDisplayState";
import type { FileHunksData, LineComment, PendingComment } from "./types";

export type DiffVirtuosoItem =
  | {
      type: "file-header";
      key: string;
      file: ParsedFileChange;
      isCommitted: boolean;
      completeCard: boolean;
    }
  | {
      type: "file-placeholder";
      key: string;
      filePath: string;
      isCommitted: boolean;
      variant: Exclude<FileBodyKind, "collapsed" | "hunks">;
      largeLineCount?: number;
      error?: string;
      emptyMessage: string;
    }
  | {
      type: "file-comments";
      key: string;
      filePath: string;
      isCommitted: boolean;
    }
  | {
      type: "unplaced-threads";
      key: string;
      filePath: string;
      isCommitted: boolean;
    }
  | {
      type: "outdated-comments";
      key: string;
      filePath: string;
      isCommitted: boolean;
    }
  | {
      type: "hunk-header";
      key: string;
      filePath: string;
      isCommitted: boolean;
      hunkIndex: number;
    }
  | {
      type: "expand-before";
      key: string;
      filePath: string;
      isCommitted: boolean;
      hunkIndex: number;
    }
  | {
      type: "context-line";
      key: string;
      filePath: string;
      isCommitted: boolean;
      hunkIndex: number;
      direction: "before" | "after";
      ctxIdx: number;
    }
  | {
      type: "conflict";
      key: string;
      filePath: string;
      isCommitted: boolean;
      hunkIndex: number;
      regionId: string;
    }
  | {
      type: "diff-line";
      key: string;
      filePath: string;
      isCommitted: boolean;
      hunkIndex: number;
      lineIndex: number;
    }
  | {
      type: "expand-after";
      key: string;
      filePath: string;
      isCommitted: boolean;
      hunkIndex: number;
    }
  | {
      type: "file-end";
      key: string;
      filePath: string;
      isCommitted: boolean;
    };

export interface DiffVirtuosoIndexMaps {
  filePathToIndex: Map<string, number>;
  searchIdToIndex: Map<string, number>;
}

export interface BuildDiffVirtuosoItemsArgs {
  actualConflictedFiles: string[];
  allFileHunks: Map<string, FileHunksData>;
  collapsedFiles: Set<string>;
  committedFileHunks: Map<string, FileHunksData>;
  committedFiles: ParsedFileChange[];
  conflictLineLookups: Map<string, Map<number, ConflictRegion>>;
  expandedContext: Map<string, string[]>;
  expandedLargeDiffs: Set<string>;
  files: ParsedFileChange[];
  getFileCommentsForFile: (filePath: string) => LineComment[];
  getOutdatedCommentsForFile: (filePath: string) => LineComment[];
  getUnplacedThreadsForFile: (filePath: string) => { id: string }[];
  pendingComment: PendingComment | null;
  showCommentInput: boolean;
  viewedFiles: Map<string, { viewedAt: string; contentHash: string }>;
}

export function committedFileToParsed(file: JjFileChange): ParsedFileChange {
  return {
    path: file.path,
    stagedStatus: "",
    workspaceStatus: file.status,
    isUntracked: false,
  };
}

function pushHunkItems(
  items: DiffVirtuosoItem[],
  maps: DiffVirtuosoIndexMaps,
  args: {
    conflictLineMap: Map<number, ConflictRegion> | undefined;
    expandedContext: Map<string, string[]>;
    filePath: string;
    hunk: JjDiffHunk;
    hunkIndex: number;
    isCommitted: boolean;
  },
) {
  const { filePath, hunk, hunkIndex, isCommitted, expandedContext } = args;
  const prefix = `${isCommitted ? "c" : "u"}:${filePath}:${hunkIndex}`;

  items.push({
    type: "hunk-header",
    key: `${prefix}:header`,
    filePath,
    isCommitted,
    hunkIndex,
  });

  const beforeKey = `${filePath}:${hunkIndex}:before`;
  const beforeLines = expandedContext.get(beforeKey);
  if (beforeLines) {
    for (let ctxIdx = 0; ctxIdx < beforeLines.length; ctxIdx++) {
      items.push({
        type: "context-line",
        key: `${prefix}:before:${ctxIdx}`,
        filePath,
        isCommitted,
        hunkIndex,
        direction: "before",
        ctxIdx,
      });
    }
  }
  const { newStart } = parseHunkHeader(hunk.header);
  const hasRoomAbove = newStart > 1 || (beforeLines && beforeLines.length > 0);
  if (hasRoomAbove) {
    items.push({
      type: "expand-before",
      key: `${prefix}:expand-before`,
      filePath,
      isCommitted,
      hunkIndex,
    });
  }

  const lineNumbers = computeHunkLineNumbers(hunk);
  const renderedConflictIds = new Set<string>();
  for (let lineIndex = 0; lineIndex < hunk.lines.length; lineIndex++) {
    const newLineNumber = lineNumbers[lineIndex]?.new;
    if (newLineNumber !== undefined && args.conflictLineMap) {
      const conflictRegion = args.conflictLineMap.get(newLineNumber);
      if (conflictRegion) {
        if (
          !renderedConflictIds.has(conflictRegion.id) &&
          conflictRegion.start_line === newLineNumber
        ) {
          renderedConflictIds.add(conflictRegion.id);
          const index = items.length;
          items.push({
            type: "conflict",
            key: `${prefix}:conflict:${conflictRegion.id}`,
            filePath,
            isCommitted,
            hunkIndex,
            regionId: conflictRegion.id,
          });
          maps.searchIdToIndex.set(`conflict:${filePath}:${lineIndex}`, index);
          const regionLineCount = Math.max(
            conflictRegion.lines?.length ?? 0,
            conflictRegion.content.split("\n").length,
          );
          for (let idx = 0; idx < regionLineCount; idx++) {
            maps.searchIdToIndex.set(
              `conflict:${conflictRegion.id}:${idx}`,
              index,
            );
          }
        }
        continue;
      }
    }

    const index = items.length;
    items.push({
      type: "diff-line",
      key: `${prefix}:line:${lineIndex}`,
      filePath,
      isCommitted,
      hunkIndex,
      lineIndex,
    });
    maps.searchIdToIndex.set(`${filePath}:${hunkIndex}:${lineIndex}`, index);
  }

  items.push({
    type: "expand-after",
    key: `${prefix}:expand-after`,
    filePath,
    isCommitted,
    hunkIndex,
  });
  const afterKey = `${filePath}:${hunkIndex}:after`;
  const afterLines = expandedContext.get(afterKey);
  if (afterLines) {
    for (let ctxIdx = 0; ctxIdx < afterLines.length; ctxIdx++) {
      items.push({
        type: "context-line",
        key: `${prefix}:after:${ctxIdx}`,
        filePath,
        isCommitted,
        hunkIndex,
        direction: "after",
        ctxIdx,
      });
    }
  }
}

function pushFileItems(
  items: DiffVirtuosoItem[],
  maps: DiffVirtuosoIndexMaps,
  file: ParsedFileChange,
  isCommitted: boolean,
  hunksMap: Map<string, FileHunksData>,
  args: BuildDiffVirtuosoItemsArgs,
) {
  const filePath = file.path;
  const display = getFileDisplayState({
    actualConflictedFiles: args.actualConflictedFiles,
    collapsedFiles: args.collapsedFiles,
    expandedLargeDiffs: args.expandedLargeDiffs,
    file,
    fileHunks: hunksMap.get(filePath),
    getFileCommentsForFile: args.getFileCommentsForFile,
    pendingComment: args.pendingComment,
    showCommentInput: args.showCommentInput,
    viewedFiles: args.viewedFiles,
  });
  const ns = isCommitted ? "c" : "u";
  maps.filePathToIndex.set(filePath, items.length);
  const completeCard = display.body === "collapsed";
  items.push({
    type: "file-header",
    key: `${ns}:${filePath}:header`,
    file,
    isCommitted,
    completeCard,
  });
  if (completeCard) return;

  if (display.hasFileCommentActivity) {
    items.push({
      type: "file-comments",
      key: `${ns}:${filePath}:file-comments`,
      filePath,
      isCommitted,
    });
  }

  if (display.body !== "hunks" && display.body !== "collapsed") {
    items.push({
      type: "file-placeholder",
      key: `${ns}:${filePath}:placeholder`,
      filePath,
      isCommitted,
      variant: display.body,
      largeLineCount: display.totalChangedLines,
      error: display.error,
      emptyMessage: display.isConflictedFile
        ? "No diff available for this conflicted file (possibly deleted)"
        : "No diff hunks available",
    });
    items.push({
      type: "file-end",
      key: `${ns}:${filePath}:end`,
      filePath,
      isCommitted,
    });
    return;
  }

  const unplaced = args.getUnplacedThreadsForFile(filePath);
  if (unplaced.length > 0) {
    items.push({
      type: "unplaced-threads",
      key: `${ns}:${filePath}:unplaced`,
      filePath,
      isCommitted,
    });
  }
  const outdated = args.getOutdatedCommentsForFile(filePath);
  if (outdated.length > 0) {
    items.push({
      type: "outdated-comments",
      key: `${ns}:${filePath}:outdated`,
      filePath,
      isCommitted,
    });
  }

  const hunks = display.fileData?.hunks ?? [];
  const conflictLineMap = args.conflictLineLookups.get(filePath);
  for (let hunkIndex = 0; hunkIndex < hunks.length; hunkIndex++) {
    pushHunkItems(items, maps, {
      conflictLineMap,
      expandedContext: args.expandedContext,
      filePath,
      hunk: hunks[hunkIndex],
      hunkIndex,
      isCommitted,
    });
  }

  items.push({
    type: "file-end",
    key: `${ns}:${filePath}:end`,
    filePath,
    isCommitted,
  });
}

export function buildDiffVirtuosoItems(args: BuildDiffVirtuosoItemsArgs): {
  items: DiffVirtuosoItem[];
  maps: DiffVirtuosoIndexMaps;
} {
  const items: DiffVirtuosoItem[] = [];
  const maps: DiffVirtuosoIndexMaps = {
    filePathToIndex: new Map(),
    searchIdToIndex: new Map(),
  };
  for (const file of args.files) {
    pushFileItems(items, maps, file, false, args.allFileHunks, args);
  }
  for (const file of args.committedFiles) {
    pushFileItems(items, maps, file, true, args.committedFileHunks, args);
  }
  return { items, maps };
}
