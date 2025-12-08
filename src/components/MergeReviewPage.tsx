import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  type BranchDiffFileChange,
  type BranchDiffFileDiff,
  type BranchCommitInfo,
  type DiffLineKind,
  type Workspace,
  gitGetChangedFilesBetweenBranches,
  gitGetCommitsBetweenBranches,
  gitGetDiffBetweenBranches,
} from "../lib/api";
import { FileTreeView } from "./FileTreeView";
import { AnnotatableDiffViewer, type CommentInput } from "./AnnotatableDiffViewer";
import { ReviewSummaryPanel } from "./ReviewSummaryPanel";
import { Button } from "./ui/button";
import { useToast } from "./ui/toast";
import { GitBranch, RefreshCw, ArrowLeft } from "lucide-react";
import { cn } from "../lib/utils";
import { useKeyboardShortcut } from "../hooks/useKeyboard";

export interface ReviewComment {
  id: string;
  filePath: string;
  lineKey: string;
  lineLabel: string;
  kind: DiffLineKind;
  oldLine?: number | null;
  newLine?: number | null;
  lineText: string;
  text: string;
  contextBefore: string[];
  contextAfter: string[];
  createdAt: string;
}

interface MergeReviewPageProps {
  repoPath: string;
  baseBranch: string | null;
  workspace: Workspace;
  onClose: () => void;
  onStartMerge: (workspace: Workspace) => void;
  onRequestChanges: (prompt: string) => void;
}

export const MergeReviewPage: React.FC<MergeReviewPageProps> = ({
  repoPath,
  baseBranch,
  workspace,
  onClose,
  onStartMerge,
  onRequestChanges,
}) => {
  const { addToast } = useToast();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
  const [overallComment, setOverallComment] = useState("");
  const [isFormatting, setIsFormatting] = useState(false);

  const branchesReady = Boolean(repoPath && baseBranch);

  const changesQuery = useQuery<BranchDiffFileChange[]>({
    queryKey: ["merge-review-files", repoPath, baseBranch, workspace.branch_name],
    queryFn: () =>
      gitGetChangedFilesBetweenBranches(repoPath, baseBranch!, workspace.branch_name),
    enabled: branchesReady,
  });

  const diffQuery = useQuery<BranchDiffFileDiff[]>({
    queryKey: ["merge-review-diffs", repoPath, baseBranch, workspace.branch_name],
    queryFn: () => gitGetDiffBetweenBranches(repoPath, baseBranch!, workspace.branch_name),
    enabled: branchesReady,
  });

  const commitsQuery = useQuery<BranchCommitInfo[]>({
    queryKey: ["merge-review-commits", repoPath, baseBranch, workspace.branch_name],
    queryFn: () => gitGetCommitsBetweenBranches(repoPath, baseBranch!, workspace.branch_name, 50),
    enabled: branchesReady,
  });

  const diffMap = useMemo(() => {
    const map = new Map<string, BranchDiffFileDiff>();
    diffQuery.data?.forEach((fileDiff) => {
      map.set(fileDiff.path, fileDiff);
    });
    return map;
  }, [diffQuery.data]);

  useEffect(() => {
    if (!selectedFile && changesQuery.data && changesQuery.data.length > 0) {
      setSelectedFile(changesQuery.data[0].path);
    }
  }, [changesQuery.data, selectedFile]);

  const selectedDiff = selectedFile ? diffMap.get(selectedFile) : null;

  const handleSelectFile = useCallback((path: string) => {
    setSelectedFile(path);
    setSelectedCommentId(null);
  }, []);

  const handleAddComment = useCallback(
    (input: CommentInput) => {
      if (!input.text.trim()) return;
      const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
      setComments((prev) => [
        ...prev,
        {
          id,
          filePath: input.filePath,
          lineKey: input.lineKey,
          lineLabel: input.lineLabel,
          kind: input.kind,
          oldLine: input.oldLine,
          newLine: input.newLine,
          lineText: input.lineText,
          text: input.text,
          contextBefore: input.contextBefore,
          contextAfter: input.contextAfter,
          createdAt: new Date().toISOString(),
        },
      ]);
      setSelectedCommentId(id);
    },
    []
  );

  const handleDeleteComment = useCallback((commentId: string) => {
    setComments((prev) => prev.filter((comment) => comment.id !== commentId));
    if (selectedCommentId === commentId) {
      setSelectedCommentId(null);
    }
  }, [selectedCommentId]);

  const handleSelectComment = useCallback(
    (commentId: string | null) => {
      setSelectedCommentId(commentId);
      if (!commentId) return;
      const comment = comments.find((item) => item.id === commentId);
      if (comment) {
        setSelectedFile(comment.filePath);
      }
    },
    [comments]
  );

  const formatPrompt = useCallback(() => {
    if (!overallComment.trim() && comments.length === 0) {
      return null;
    }

    const lines: string[] = [];
    lines.push(`# Merge Review Feedback`);
    lines.push(`Target: ${workspace.branch_name} → ${baseBranch}`);
    lines.push("");

    if (overallComment.trim()) {
      lines.push(`## Overall Feedback`);
      lines.push(overallComment.trim());
      lines.push("");
    }

    comments.forEach((comment, index) => {
      const lineDescription = comment.lineLabel || `Line ${comment.newLine ?? comment.oldLine ?? ""}`;
      lines.push(`## ${index + 1}. ${comment.filePath} (${lineDescription})`);
      lines.push("```diff");
      comment.contextBefore.forEach((ctx) => lines.push(ctx));
      lines.push(`${comment.kind === "addition" ? "+" : comment.kind === "deletion" ? "-" : " "}${comment.lineText}`);
      comment.contextAfter.forEach((ctx) => lines.push(ctx));
      lines.push("```");
      lines.push(comment.text);
      lines.push("");
    });

    return lines.join("\n");
  }, [overallComment, comments, workspace.branch_name, baseBranch]);

  const handleRequestChanges = useCallback(() => {
    if (!branchesReady) {
      addToast({
        title: "Missing branch context",
        description: "Select a base branch before formatting review feedback.",
        type: "error",
      });
      return;
    }

    const prompt = formatPrompt();
    if (!prompt) {
      addToast({
        title: "No feedback",
        description: "Add inline or overall comments before requesting changes.",
        type: "error",
      });
      return;
    }

    setIsFormatting(true);
    onRequestChanges(prompt);
    setIsFormatting(false);
  }, [branchesReady, formatPrompt, addToast, onRequestChanges]);

  useKeyboardShortcut("Enter", true, () => {
    handleRequestChanges();
  }, [handleRequestChanges]);

  const handleMerge = useCallback(() => {
    onStartMerge(workspace);
  }, [onStartMerge, workspace]);

  const handleRefresh = () => {
    changesQuery.refetch();
    diffQuery.refetch();
    commitsQuery.refetch();
  };

  const headerSubtitle = baseBranch ? `${workspace.branch_name} → ${baseBranch}` : "Select a base branch";

  return (
    <div className="flex flex-col h-screen bg-background">
      <div className="border-b px-6 py-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Merge Review</p>
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4" />
            <p className="font-semibold">{headerSubtitle}</p>
          </div>
          {commitsQuery.data && (
            <p className="text-xs text-muted-foreground">{commitsQuery.data.length} commits to review</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className={cn("w-4 h-4", (changesQuery.isFetching || diffQuery.isFetching) && "animate-spin")} />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-72 border-r bg-card/80">
          <div className="p-4 border-b">
            <p className="text-sm font-semibold">Changed Files</p>
            <p className="text-xs text-muted-foreground">
              {changesQuery.data?.length || 0} files
            </p>
          </div>
          <FileTreeView
            files={changesQuery.data || []}
            selectedPath={selectedFile}
            onSelect={handleSelectFile}
            isLoading={changesQuery.isLoading}
          />
        </div>

        <div className="flex-1 flex flex-col">
          <div className="border-b px-4 py-2 bg-muted/40">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Commits</p>
            <div className="flex gap-6 overflow-auto text-xs">
              {commitsQuery.isLoading && <span className="text-muted-foreground">Loading commits...</span>}
              {!commitsQuery.isLoading && commitsQuery.data?.length === 0 && (
                <span className="text-muted-foreground">No pending commits</span>
              )}
              {commitsQuery.data?.slice(0, 5).map((commit) => (
                <div key={commit.hash} className="space-y-0.5">
                  <p className="font-semibold">{commit.abbreviated_hash}</p>
                  <p>{commit.message}</p>
                  <p className="text-[10px] text-muted-foreground">{commit.author_name}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="flex-1 min-h-0">
            <AnnotatableDiffViewer
              diff={selectedDiff}
              comments={comments}
              isLoading={diffQuery.isLoading}
              onAddComment={handleAddComment}
              selectedCommentId={selectedCommentId}
              onSelectComment={handleSelectComment}
            />
          </div>
        </div>

        <div className="w-80">
          <ReviewSummaryPanel
            workspaceBranch={workspace.branch_name}
            baseBranch={baseBranch || ""}
            comments={comments}
            selectedCommentId={selectedCommentId}
            overallComment={overallComment}
            onOverallCommentChange={setOverallComment}
            onSelectComment={handleSelectComment}
            onDeleteComment={handleDeleteComment}
            onRequestChanges={handleRequestChanges}
            onMerge={handleMerge}
            isRequestingChanges={isFormatting}
            commitCount={commitsQuery.data?.length || 0}
          />
        </div>
      </div>
    </div>
  );
};
