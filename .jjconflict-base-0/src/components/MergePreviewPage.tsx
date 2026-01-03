import { memo, useCallback, useEffect, useState } from "react";
import {
  type Workspace,
  jjGetCommitsAhead,
  jjGetMergeDiff,
  jjCreateMerge,
  type JjCommitsAhead,
  type JjRevisionDiff,
} from "../lib/api";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { useToast } from "./ui/toast";
import {
  ArrowLeft,
  GitMerge,
  Loader2,
  FileText,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { cn } from "../lib/utils";

export interface MergePreviewPageProps {
  workspace: Workspace;
  repoPath: string;
  onCancel: () => void;
  onMergeComplete: () => Promise<void>;
}

export const MergePreviewPage = memo<MergePreviewPageProps>(
  function MergePreviewPage({
    workspace,
    repoPath: _repoPath,
    onCancel,
    onMergeComplete,
  }) {
    const { addToast } = useToast();

    // State
    const [loading, setLoading] = useState(true);
    const [commitsAhead, setCommitsAhead] = useState<JjCommitsAhead | null>(
      null
    );
    const [diff, setDiff] = useState<JjRevisionDiff | null>(null);
    const [commitMessage, setCommitMessage] = useState("");
    const [merging, setMerging] = useState(false);
    const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

    const targetBranch = workspace.target_branch || "main";

    // Load merge preview data
    useEffect(() => {
      const loadPreview = async () => {
        setLoading(true);
        try {
          const [commits, diffData] = await Promise.all([
            jjGetCommitsAhead(workspace.workspace_path, targetBranch),
            jjGetMergeDiff(workspace.workspace_path, targetBranch),
          ]);

          setCommitsAhead(commits);
          setDiff(diffData);

          // Expand all files by default
          if (diffData && diffData.hunks_by_file) {
            const allPaths = diffData.hunks_by_file.map((file) => file.path);
            setExpandedFiles(new Set(allPaths));
          }

          // Generate default commit message
          const defaultMessage = `Merge ${workspace.branch_name} into ${targetBranch}`;
          setCommitMessage(defaultMessage);
        } catch (error) {
          addToast({
            title: "Failed to load merge preview",
            description:
              error instanceof Error ? error.message : String(error),
            type: "error",
          });
        } finally {
          setLoading(false);
        }
      };

      loadPreview().catch((error) => {
        console.error("Unexpected error loading merge preview:", error);
      });
    }, [workspace.workspace_path, workspace.branch_name, targetBranch, addToast]);

    // Handle merge
    const handleMerge = useCallback(async () => {
      if (!commitMessage.trim()) {
        addToast({
          title: "Commit message required",
          type: "error",
        });
        return;
      }

      setMerging(true);
      try {
        const result = await jjCreateMerge(
          workspace.workspace_path,
          targetBranch,
          commitMessage
        );

        if (!result.success) {
          addToast({
            title: "Merge failed",
            description: result.message,
            type: "error",
          });
          return;
        }

        if (result.has_conflicts) {
          addToast({
            title: "Merge created with conflicts",
            description: `${result.conflicted_files?.length ?? 0} file(s) have conflicts`,
            type: "error",
          });
          // Don't delete workspace if there are conflicts
          onCancel();
          return;
        }

        addToast({
          title: "Merge successful",
          description: `Merged ${workspace.branch_name} into ${targetBranch}`,
          type: "success",
        });

        // Delete workspace and return to dashboard
        await onMergeComplete();
      } catch (error) {
        addToast({
          title: "Merge failed",
          description: error instanceof Error ? error.message : String(error),
          type: "error",
        });
      } finally {
        setMerging(false);
      }
    }, [
      workspace,
      targetBranch,
      commitMessage,
      addToast,
      onMergeComplete,
      onCancel,
    ]);

    // Toggle file expansion
    const toggleFile = useCallback((path: string) => {
      setExpandedFiles((prev) => {
        const next = new Set(prev);
        if (next.has(path)) {
          next.delete(path);
        } else {
          next.add(path);
        }
        return next;
      });
    }, []);

    if (loading) {
      return (
        <div className="h-full flex items-center justify-center">
          <Loader2
            className="w-8 h-8 animate-spin text-muted-foreground"
            role="status"
            aria-hidden="true"
          />
        </div>
      );
    }

    const canMerge =
      commitsAhead &&
      commitsAhead.total_count > 0 &&
      commitMessage.trim().length > 0;

    return (
      <div className="h-full flex flex-col bg-background">
        {/* Header */}
        <div className="border-b p-4 flex items-center gap-4 flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">Merge Preview</h1>
            <p className="text-sm text-muted-foreground">
              {workspace.branch_name} → {targetBranch}
            </p>
          </div>
          <Button
            onClick={handleMerge}
            disabled={!canMerge || merging}
            className="gap-2"
          >
            {merging ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <GitMerge className="w-4 h-4" />
            )}
            {merging ? "Merging..." : "Confirm merge"}
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 space-y-6">
          {/* Commits to be merged */}
          <section>
            <h2 className="text-sm font-semibold mb-3">
              Commits to be merged ({commitsAhead?.total_count || 0})
            </h2>
            {commitsAhead && commitsAhead.commits.length > 0 ? (
              <div className="border rounded-lg divide-y">
                {commitsAhead.commits.map((commit) => (
                  <div key={commit.short_id} className="p-3">
                    <div className="flex items-start gap-3">
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                        {commit.short_id}
                      </code>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {commit.description || "(no description)"}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-xs text-muted-foreground">
                            {commit.author_name}
                          </span>
                          {commit.insertions > 0 || commit.deletions > 0 ? (
                            <span className="text-xs text-muted-foreground">
                              <span className="text-green-600">+{commit.insertions}</span>
                              {" "}
                              <span className="text-red-600">-{commit.deletions}</span>
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="border rounded-lg p-6 text-center text-muted-foreground">
                No commits ahead of {targetBranch}
              </div>
            )}
          </section>

          {/* Commit message */}
          <section>
            <h2 className="text-sm font-semibold mb-3">
              Merge Commit Message
            </h2>
            <Textarea
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="Enter merge commit message..."
              rows={3}
              maxLength={10000}
              className="font-mono text-sm"
            />
          </section>

          {/* Combined diff */}
          <section>
            <h2 className="text-sm font-semibold mb-3">
              Changed Files ({diff?.files.length || 0})
            </h2>
            {diff && diff.files.length > 0 ? (
              <div className="border rounded-lg divide-y">
                {diff.hunks_by_file.map((fileDiff) => {
                  const isExpanded = expandedFiles.has(fileDiff.path);
                  return (
                    <div key={fileDiff.path}>
                      <button
                        className="w-full p-3 flex items-center gap-2 text-left hover:bg-muted/50 transition-colors"
                        onClick={() => toggleFile(fileDiff.path)}
                        type="button"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        )}
                        <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span className="font-mono text-sm flex-1 truncate">
                          {fileDiff.path}
                        </span>
                      </button>
                      {isExpanded && fileDiff.hunks.length > 0 && (
                        <div className="border-t bg-muted/30">
                          {fileDiff.hunks.map((hunk, hunkIndex) => (
                            <pre
                              key={hunk.id || hunkIndex}
                              className="p-2 text-xs font-mono overflow-x-auto"
                            >
                              <div className="text-muted-foreground mb-1">
                                {hunk.header}
                              </div>
                              {hunk.lines.map((line, lineIndex) => (
                                <div
                                  key={lineIndex}
                                  className={cn(
                                    line.startsWith("+") &&
                                      !line.startsWith("+++") &&
                                      "bg-emerald-500/20",
                                    line.startsWith("-") &&
                                      !line.startsWith("---") &&
                                      "bg-red-500/20"
                                  )}
                                >
                                  {line}
                                </div>
                              ))}
                            </pre>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="border rounded-lg p-6 text-center text-muted-foreground">
                No file changes
              </div>
            )}
          </section>
        </div>
      </div>
    );
  }
);
