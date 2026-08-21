import React, { useCallback, useLayoutEffect, useMemo } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import type { DiffContentAreaProps } from "./DiffContentArea";
import {
  DiffRenderContext,
  type DiffRenderContextValue,
} from "./DiffVirtuosoContext";
import { DiffVirtuosoRow } from "./DiffVirtuosoRow";
import {
  type DiffVirtuosoIndexMaps,
  buildDiffVirtuosoItems,
  committedFileToParsed,
} from "./buildDiffVirtuosoItems";
import { filterVisibleCommittedFiles } from "./utils";

const VirtuosoList = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ style, children, ...listProps }, ref) => (
  <div ref={ref} {...listProps} style={{ ...style, padding: "16px 0" }}>
    {children}
  </div>
));
VirtuosoList.displayName = "VirtuosoList";

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

  useLayoutEffect(() => {
    indexMapsRef.current = maps;
  }, [indexMapsRef, maps]);

  const setScroller = useCallback(
    (el: HTMLElement | Window | null) => {
      (scrollerRef as React.MutableRefObject<HTMLElement | null>).current =
        (el as HTMLElement) ?? null;
    },
    [scrollerRef],
  );

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

  const contextValue = useMemo<DiffRenderContextValue>(
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
        scrollerRef={setScroller}
        itemContent={(_index, item) => <DiffVirtuosoRow item={item} />}
        components={{ List: VirtuosoList }}
      />
    </DiffRenderContext.Provider>
  );
}
