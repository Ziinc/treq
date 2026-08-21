import React, { createContext, useContext, useMemo } from "react";
import { FileText, Loader2, X } from "lucide-react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { Button } from "../ui/button";
import { CommentInput } from "../CommentInput";
import { FileCommentSection } from "./FileCommentSection";
import { FileRowHeader } from "./FileRowHeader";
import { GithubCommentCard } from "./GithubCommentCard";
import {
  contextLineNumber,
  HunkContextLineRow,
  HunkExpandControl,
  HunkHeaderRow,
} from "./HunkChrome";
import { HunkConflictBlock, HunkDiffLine } from "./HunkLines";
import {
  type DiffVirtuosoIndexMaps,
  type DiffVirtuosoItem,
  buildDiffVirtuosoItems,
  committedFileToParsed,
} from "./buildDiffVirtuosoItems";
import { getFileDisplayState } from "./fileDisplayState";
import {
  buildQuotedPendingComment,
  filterVisibleCommittedFiles,
  getQuoteProp,
} from "./utils";
import { cn } from "../../lib/utils";
import type { DiffContentAreaProps } from "./DiffContentArea";
import {
  FILE_COMMENT_HUNK_ID,
  type FileHunksData,
  type HunkLinesProps,
} from "./types";
import type { ParsedFileChange } from "../../lib/git-utils";

type DiffRenderContextValue = DiffContentAreaProps & {
  hunkLinesProps: Omit<HunkLinesProps, "hunk" | "hunkIndex" | "filePath">;
};

const DiffRenderContext = createContext<DiffRenderContextValue | null>(null);

function useDiffRender() {
  const ctx = useContext(DiffRenderContext);
  if (!ctx) throw new Error("DiffRenderContext missing");
  return ctx;
}

function hunkMapFor(
  isCommitted: boolean,
  allFileHunks: Map<string, FileHunksData>,
  committedFileHunks: Map<string, FileHunksData>,
) {
  return isCommitted ? committedFileHunks : allFileHunks;
}

function fileCardClass(
  completeCard: boolean,
  isStart: boolean,
  isEnd: boolean,
) {
  return cn(
    "border-x border-border overflow-hidden bg-background",
    (completeCard || isStart) && "border-t rounded-t-lg",
    (completeCard || isEnd) && "border-b rounded-b-lg",
    completeCard && "mb-4",
  );
}

function FileHeaderItem({
  file,
  isCommitted,
  completeCard,
}: {
  file: ParsedFileChange;
  isCommitted: boolean;
  completeCard: boolean;
}) {
  const ctx = useDiffRender();
  const hunksMap = hunkMapFor(
    isCommitted,
    ctx.allFileHunks,
    ctx.committedFileHunks,
  );
  const display = getFileDisplayState({
    actualConflictedFiles: ctx.actualConflictedFiles,
    collapsedFiles: ctx.collapsedFiles,
    expandedLargeDiffs: ctx.expandedLargeDiffs,
    file,
    fileHunks: hunksMap.get(file.path),
    getFileCommentsForFile: ctx.getFileCommentsForFile,
    pendingComment: ctx.pendingComment,
    showCommentInput: ctx.showCommentInput,
    viewedFiles: ctx.viewedFiles,
  });
  let deletions = 0;
  if (
    display.fileData &&
    !display.fileData.isLoading &&
    display.fileData.hunks
  ) {
    for (const hunk of display.fileData.hunks) {
      for (const line of hunk.lines) {
        if (line.startsWith("-")) deletions++;
      }
    }
  }
  return (
    <div
      id={display.fileId}
      data-file-path={file.path}
      data-testid={`file-row-${file.path}`}
      className={fileCardClass(completeCard, true, completeCard)}
      style={{ fontSize: `${ctx.diffFontSize}px` }}
    >
      <FileRowHeader
        file={file}
        filePath={file.path}
        isCollapsed={display.isCollapsed}
        isRename={display.isRename}
        isViewed={display.isViewed}
        additions={display.additions}
        deletions={deletions}
        readOnly={isCommitted ? true : ctx.readOnly}
        isCommitted={isCommitted}
        fileActionTarget={isCommitted ? null : ctx.fileActionTarget}
        selectedUnstagedFiles={
          isCommitted ? new Set() : ctx.selectedUnstagedFiles
        }
        workspacePath={ctx.workspacePath}
        toggleFileCollapse={ctx.toggleFileCollapse}
        handleMarkFileViewed={ctx.handleMarkFileViewed}
        handleUnmarkFileViewed={ctx.handleUnmarkFileViewed}
        handleDiscardFiles={ctx.handleDiscardFiles}
        addToast={ctx.addToast}
        onAddFileComment={() => {
          if (ctx.collapsedFiles.has(file.path)) {
            ctx.toggleFileCollapse(file.path);
          }
          ctx.setPendingComment({
            filePath: file.path,
            hunkId: FILE_COMMENT_HUNK_ID,
            displayAtLineIndex: -1,
            startLine: 0,
            endLine: 0,
            lineContent: [],
            lineSide: "new",
          });
          ctx.setShowCommentInput(true);
        }}
      />
    </div>
  );
}

function FilePlaceholderItem({
  item,
}: {
  item: Extract<DiffVirtuosoItem, { type: "file-placeholder" }>;
}) {
  const ctx = useDiffRender();
  const inner =
    item.variant === "binary" ? (
      <div className="flex items-center justify-center py-[32px] text-muted-foreground">
        <FileText className="w-5 h-5 mr-[8px] opacity-50" />
        <span>Binary file - no diff available</span>
      </div>
    ) : item.variant === "deleted" ? (
      <div
        data-testid="deleted-file-placeholder"
        className="flex items-center justify-center py-[32px] text-muted-foreground"
      >
        <FileText className="w-5 h-5 mr-[8px] opacity-50" />
        <span>File deleted</span>
      </div>
    ) : item.variant === "loading" ? (
      <div className="flex items-center justify-center py-[32px] text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-[8px]" />
        Loading diff...
      </div>
    ) : item.variant === "error" ? (
      <div className="text-sm text-destructive px-[12px] py-[8px]">
        {item.error}
      </div>
    ) : item.variant === "empty" ? (
      <div className="text-sm text-muted-foreground px-[12px] py-[24px] text-center">
        {item.emptyMessage}
      </div>
    ) : (
      <div className="flex items-center justify-center gap-[12px] h-20 text-muted-foreground">
        <FileText className="w-5 h-5 opacity-50" />
        <span className="text-sm">
          Large diff ({item.largeLineCount} lines)
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => ctx.toggleLargeDiff(item.filePath)}
        >
          View changes
        </Button>
      </div>
    );
  return (
    <div
      className={cn(fileCardClass(false, false, false), "font-mono text-sm")}
      onContextMenu={ctx.handleContextMenu}
    >
      {inner}
    </div>
  );
}

function lookupHunk(
  ctx: DiffRenderContextValue,
  filePath: string,
  isCommitted: boolean,
  hunkIndex: number,
) {
  const map = hunkMapFor(isCommitted, ctx.allFileHunks, ctx.committedFileHunks);
  return map.get(filePath)?.hunks[hunkIndex];
}

function withHunkProps(
  ctx: DiffRenderContextValue,
  filePath: string,
  isCommitted: boolean,
  hunkIndex: number,
): HunkLinesProps | null {
  const hunk = lookupHunk(ctx, filePath, isCommitted, hunkIndex);
  if (!hunk) return null;
  return {
    ...ctx.hunkLinesProps,
    hunk,
    hunkIndex,
    filePath,
  };
}

function DiffVirtuosoRow({ item }: { item: DiffVirtuosoItem }) {
  const ctx = useDiffRender();
  const bodyWrap = (node: React.ReactNode, isEnd = false) => (
    <div
      className={cn(
        fileCardClass(false, false, isEnd),
        "font-mono text-sm",
        isEnd && "mb-4",
      )}
      onContextMenu={ctx.handleContextMenu}
    >
      {node}
    </div>
  );

  switch (item.type) {
    case "file-header":
      return (
        <FileHeaderItem
          file={item.file}
          isCommitted={item.isCommitted}
          completeCard={item.completeCard}
        />
      );
    case "file-placeholder":
      return <FilePlaceholderItem item={item} />;
    case "file-comments": {
      const comments = ctx.getFileCommentsForFile(item.filePath);
      const showInput =
        ctx.showCommentInput &&
        ctx.pendingComment?.filePath === item.filePath &&
        ctx.pendingComment.hunkId === FILE_COMMENT_HUNK_ID;
      return bodyWrap(
        <FileCommentSection
          comments={comments}
          editingCommentId={ctx.editingCommentId}
          showInput={!!showInput}
          onSubmit={ctx.addComment}
          onCancel={ctx.cancelComment}
          onStartEdit={ctx.startEditComment}
          onCancelEdit={ctx.cancelEditComment}
          onSaveEdit={ctx.saveEditComment}
          onDelete={ctx.deleteComment}
        />,
      );
    }
    case "unplaced-threads": {
      const threads = ctx.getUnplacedThreadsForFile(item.filePath);
      return bodyWrap(
        <div
          className="border-b border-sky-500/40 bg-sky-500/5 px-4 py-3 space-y-3"
          data-testid="github-outdated-threads"
        >
          {threads.map((thread) => (
            <GithubCommentCard
              key={thread.id}
              thread={thread}
              collapsed={ctx.collapsedThreadIds.has(thread.id)}
              onToggleCollapse={() => ctx.toggleThreadCollapse(thread.id)}
              onQuote={(quote) => {
                ctx.setPendingComment(
                  buildQuotedPendingComment(
                    {
                      filePath: item.filePath,
                      hunkId: "",
                      displayAtLineIndex: -1,
                      lineNumber: thread.line ?? 0,
                      lineSide: "new",
                    },
                    quote,
                  ),
                );
                ctx.setShowCommentInput(true);
              }}
            />
          ))}
          {ctx.showCommentInput &&
            ctx.pendingComment &&
            ctx.pendingComment.filePath === item.filePath &&
            ctx.pendingComment.hunkId === "" && (
              <CommentInput
                onSubmit={ctx.addComment}
                onCancel={ctx.cancelComment}
                filePath={ctx.pendingComment.filePath}
                startLine={ctx.pendingComment.startLine}
                endLine={ctx.pendingComment.endLine}
                quote={getQuoteProp(ctx.pendingComment)}
              />
            )}
        </div>,
      );
    }
    case "outdated-comments": {
      const outdated = ctx.getOutdatedCommentsForFile(item.filePath);
      return bodyWrap(
        <div className="border-b border-amber-500/40 bg-amber-500/5 px-4 py-3 space-y-3">
          {outdated.map((comment) => (
            <div
              key={comment.id}
              className="bg-background rounded-md p-3 border border-amber-500/30"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/25 text-amber-700 dark:text-amber-300 text-[10px] font-medium">
                    Outdated
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Line{" "}
                    {comment.startLine === comment.endLine
                      ? comment.startLine
                      : `${comment.startLine}-${comment.endLine}`}
                  </span>
                </div>
                <button
                  onClick={() => ctx.deleteComment(comment.id)}
                  className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                  title="Delete"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              {comment.lineContent.length > 0 && (
                <pre className="bg-muted/60 rounded px-2 py-1 text-xs mb-2 whitespace-pre-wrap overflow-auto font-mono">
                  {comment.lineContent.join("\n")}
                </pre>
              )}
              <p className="font-sans">{comment.text}</p>
            </div>
          ))}
        </div>,
      );
    }
    case "hunk-header": {
      const hunk = lookupHunk(
        ctx,
        item.filePath,
        item.isCommitted,
        item.hunkIndex,
      );
      if (!hunk) return null;
      return bodyWrap(<HunkHeaderRow hunk={hunk} />);
    }
    case "expand-before":
    case "expand-after":
      return bodyWrap(
        <HunkExpandControl
          direction={item.type === "expand-before" ? "before" : "after"}
          onExpand={() =>
            ctx.handleExpandContext(
              item.filePath,
              item.hunkIndex,
              item.type === "expand-before" ? "before" : "after",
            )
          }
        />,
      );
    case "context-line": {
      const hunk = lookupHunk(
        ctx,
        item.filePath,
        item.isCommitted,
        item.hunkIndex,
      );
      if (!hunk) return null;
      const ctxKey = `${item.filePath}:${item.hunkIndex}:${item.direction}`;
      const lines = ctx.expandedContext.get(ctxKey) ?? [];
      const line = lines[item.ctxIdx] ?? "";
      return bodyWrap(
        <HunkContextLineRow
          filePath={item.filePath}
          line={line}
          lineNum={contextLineNumber(
            hunk,
            item.direction,
            item.ctxIdx,
            lines.length,
          )}
        />,
      );
    }
    case "conflict": {
      const props = withHunkProps(
        ctx,
        item.filePath,
        item.isCommitted,
        item.hunkIndex,
      );
      const region = Array.from(
        ctx.conflictLineLookups.get(item.filePath)?.values() ?? [],
      ).find((r) => r.id === item.regionId);
      if (!props || !region) return null;
      return bodyWrap(
        <HunkConflictBlock
          {...props}
          region={region}
          filePath={item.filePath}
          firstConflictRegionId={ctx.firstConflictRegionIdByFile.get(
            item.filePath,
          )}
        />,
      );
    }
    case "diff-line": {
      const props = withHunkProps(
        ctx,
        item.filePath,
        item.isCommitted,
        item.hunkIndex,
      );
      if (!props) return null;
      return bodyWrap(<HunkDiffLine {...props} lineIndex={item.lineIndex} />);
    }
    case "file-end":
      return (
        <div className={cn(fileCardClass(false, false, true), "h-0 mb-4")} />
      );
    default:
      return null;
  }
}

export function DiffVirtuosoList({
  props,
  virtuosoRef,
  indexMapsRef,
  scrollerRef,
}: {
  props: DiffContentAreaProps;
  virtuosoRef: React.RefObject<VirtuosoHandle>;
  indexMapsRef: React.MutableRefObject<DiffVirtuosoIndexMaps>;
  scrollerRef: React.RefObject<HTMLDivElement>;
}) {
  const visibleCommittedFiles = useMemo(() => {
    const paths = new Set<string>(props.actualConflictedFiles);
    for (const file of props.files) paths.add(file.path);
    return filterVisibleCommittedFiles(
      props.committedFiles,
      props.showCommittedChanges ?? false,
      paths,
    ).map(committedFileToParsed);
  }, [
    props.actualConflictedFiles,
    props.files,
    props.committedFiles,
    props.showCommittedChanges,
  ]);

  const { items, maps } = useMemo(
    () =>
      buildDiffVirtuosoItems({
        actualConflictedFiles: props.actualConflictedFiles,
        allFileHunks: props.allFileHunks,
        collapsedFiles: props.collapsedFiles,
        committedFileHunks: props.committedFileHunks,
        committedFiles: visibleCommittedFiles,
        conflictLineLookups: props.conflictLineLookups,
        expandedContext: props.expandedContext,
        expandedLargeDiffs: props.expandedLargeDiffs,
        files: props.files,
        getFileCommentsForFile: props.getFileCommentsForFile,
        getOutdatedCommentsForFile: props.getOutdatedCommentsForFile,
        getUnplacedThreadsForFile: props.getUnplacedThreadsForFile,
        pendingComment: props.pendingComment,
        showCommentInput: props.showCommentInput,
        viewedFiles: props.viewedFiles,
      }),
    [
      props.actualConflictedFiles,
      props.allFileHunks,
      props.collapsedFiles,
      props.committedFileHunks,
      visibleCommittedFiles,
      props.conflictLineLookups,
      props.expandedContext,
      props.expandedLargeDiffs,
      props.files,
      props.getFileCommentsForFile,
      props.getOutdatedCommentsForFile,
      props.getUnplacedThreadsForFile,
      props.pendingComment,
      props.showCommentInput,
      props.viewedFiles,
    ],
  );
  indexMapsRef.current = maps;

  const hunkLinesProps = useMemo(
    () => ({
      conflictedFilePaths: new Set(props.actualConflictedFiles),
      conflictLineLookups: props.conflictLineLookups,
      firstConflictRegionIdByFile: props.firstConflictRegionIdByFile,
      expandedContext: props.expandedContext,
      conflictComments: props.conflictComments,
      openConflictComments: props.openConflictComments,
      editingConflictCommentId: props.editingConflictCommentId,
      searchData: props.searchData,
      debouncedSearchQuery: props.debouncedSearchQuery,
      currentMatchIndex: props.currentMatchIndex,
      diffLineSelection: props.diffLineSelection,
      showCommentInput: props.showCommentInput,
      pendingComment: props.pendingComment,
      editingCommentId: props.editingCommentId,
      comments: props.comments,
      conflictFileRefs: props.conflictFileRefs,
      diffFontSize: props.diffFontSize,
      handleExpandContext: props.handleExpandContext,
      handleLineMouseDown: props.handleLineMouseDown,
      handleLineMouseEnter: props.handleLineMouseEnter,
      handleLineMouseUp: props.handleLineMouseUp,
      handleAddCommentFromSelection: props.handleAddCommentFromSelection,
      isLineSelected: props.isLineSelected,
      saveConflictComment: props.saveConflictComment,
      clearConflictComment: props.clearConflictComment,
      toggleConflictComment: props.toggleConflictComment,
      setOpenConflictComments: props.setOpenConflictComments,
      startEditConflictComment: props.startEditConflictComment,
      cancelEditConflictComment: props.cancelEditConflictComment,
      saveEditConflictComment: props.saveEditConflictComment,
      addComment: props.addComment,
      cancelComment: props.cancelComment,
      deleteComment: props.deleteComment,
      startEditComment: props.startEditComment,
      cancelEditComment: props.cancelEditComment,
      saveEditComment: props.saveEditComment,
      setPendingComment: props.setPendingComment,
      setShowCommentInput: props.setShowCommentInput,
      getCommentsForLine: props.getCommentsForLine,
      getThreadsForLine: props.getThreadsForLine,
      collapsedThreadIds: props.collapsedThreadIds,
      toggleThreadCollapse: props.toggleThreadCollapse,
    }),
    [props],
  );

  const contextValue = useMemo(
    () => ({ ...props, hunkLinesProps }),
    [props, hunkLinesProps],
  );

  return (
    <DiffRenderContext.Provider value={contextValue}>
      <Virtuoso
        ref={virtuosoRef}
        data={items}
        className="h-full"
        increaseViewportBy={800}
        computeItemKey={(_, item) => item.key}
        scrollerRef={(el) => {
          (scrollerRef as React.MutableRefObject<HTMLElement | null>).current =
            (el as HTMLElement) ?? null;
        }}
        itemContent={(_index, item) => <DiffVirtuosoRow item={item} />}
        components={{
          List: React.forwardRef<
            HTMLDivElement,
            React.HTMLAttributes<HTMLDivElement>
          >(({ style, children, ...listProps }, ref) => (
            <div
              ref={ref}
              {...listProps}
              style={{ ...style, padding: "16px 0" }}
            >
              {children}
            </div>
          )),
        }}
      />
    </DiffRenderContext.Provider>
  );
}
