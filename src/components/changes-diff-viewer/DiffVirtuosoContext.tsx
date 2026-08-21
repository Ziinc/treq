import { createContext, useContext } from "react";
import { cn } from "../../lib/utils";
import type { DiffContentAreaProps } from "./DiffContentArea";
import type { FileHunksData, HunkLinesProps } from "./types";

export type DiffRenderContextValue = DiffContentAreaProps & {
  hunkLinesProps: Omit<HunkLinesProps, "hunk" | "hunkIndex" | "filePath">;
};

export const DiffRenderContext = createContext<DiffRenderContextValue | null>(
  null,
);

export function useDiffRender() {
  const ctx = useContext(DiffRenderContext);
  if (!ctx) throw new Error("DiffRenderContext missing");
  return ctx;
}

export function hunkMapFor(args: {
  isCommitted: boolean;
  allFileHunks: Map<string, FileHunksData>;
  committedFileHunks: Map<string, FileHunksData>;
}) {
  return args.isCommitted ? args.committedFileHunks : args.allFileHunks;
}

export function fileCardClass(args: {
  completeCard: boolean;
  isStart: boolean;
  isEnd: boolean;
}) {
  return cn(
    "border-x border-border overflow-hidden bg-background",
    (args.completeCard || args.isStart) && "border-t rounded-t-lg",
    (args.completeCard || args.isEnd) && "border-b rounded-b-lg",
    args.completeCard && "mb-4",
  );
}
