import { useEffect, useRef, useState, useCallback } from "react";
import { savePlanToRepo, loadPlanFromRepo, savePlanToFile, Worktree, PlanMetadata, saveExecutedPlan, clearSessionPlans } from "../lib/api";
import { PlanSection } from "../types/planning";
import { createDebouncedParser } from "../lib/planParser";
import { PlanDisplay } from "./PlanDisplay";
import { Button } from "./ui/button";
import { X, RotateCw, Loader2 } from "lucide-react";
import { useToast } from "./ui/toast";
import { buildPlanHistoryPayload } from "../lib/planHistory";
import { ConsolidatedTerminal } from "./ConsolidatedTerminal";

interface PlanningTerminalProps {
  repositoryPath?: string;
  worktree?: Worktree;
  sessionId: number | null;
  onClose: () => void;
  onExecutePlan?: (section: PlanSection) => void;
}

export const PlanningTerminal: React.FC<PlanningTerminalProps> = ({
  repositoryPath,
  worktree,
  sessionId,
  onClose,
  onExecutePlan,
}) => {
  const workingDirectory = worktree?.worktree_path || repositoryPath || "";
  const effectiveRepoPath = worktree?.repo_path || repositoryPath || "";
  const ptySessionId = sessionId ? `session-${sessionId}` : `planning-${crypto.randomUUID()}`;

  const [planSections, setPlanSections] = useState<PlanSection[]>([]);
  const [terminalOutput, setTerminalOutput] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const debouncedParserRef = useRef(createDebouncedParser(1000));

  const { addToast } = useToast();

  useEffect(() => {
    setTerminalOutput("");
    setPlanSections([]);
  }, [ptySessionId]);

  const handleExecuteSection = useCallback(async (section: PlanSection) => {
    if (worktree) {
      try {
        const payload = buildPlanHistoryPayload(section);
        await saveExecutedPlan(worktree.repo_path, worktree.id, payload);
      } catch (error) {
        addToast({
          title: "Plan History",
          description: error instanceof Error ? error.message : String(error),
          type: "error",
        });
      }
    }

    onExecutePlan?.(section);
  }, [worktree, onExecutePlan, addToast]);

  const handlePlanEdit = useCallback(async (planId: string, newContent: string) => {
    try {
      const updatedSection = planSections.find((section) => section.id === planId);

      setPlanSections((prev) => prev.map((section) => {
        if (section.id === planId) {
          return {
            ...section,
            editedContent: newContent,
            isEdited: true,
            editedAt: new Date(),
          };
        }
        return section;
      }));

      const metadata: PlanMetadata = {
        id: planId,
        title: updatedSection?.title || "Untitled Plan",
        plan_type: updatedSection?.type || "implementation_plan",
        worktree_id: worktree?.id,
        worktree_path: worktree?.worktree_path,
        branch_name: worktree?.branch_name,
        timestamp: new Date().toISOString(),
      };

      await savePlanToFile(effectiveRepoPath, planId, newContent, metadata);
      await savePlanToRepo(effectiveRepoPath, planId, newContent, ptySessionId);
    } catch (error) {
      console.error("Failed to save plan:", error);
      addToast({
        title: "Save Failed",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
    }
  }, [effectiveRepoPath, worktree, planSections, ptySessionId, addToast]);

  const handleReset = useCallback(async () => {
    setIsResetting(true);

    try {
      await clearSessionPlans(effectiveRepoPath, ptySessionId).catch(console.error);
      setPlanSections([]);
      setTerminalOutput("");

      addToast({
        title: "Terminal Reset",
        description: "Starting new planning session",
        type: "info",
      });
    } catch (error) {
      addToast({
        title: "Reset Failed",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
    } finally {
      setIsResetting(false);
    }
  }, [ptySessionId, effectiveRepoPath, addToast]);

  useEffect(() => {
    if (terminalOutput) {
      debouncedParserRef.current(terminalOutput, async (sections) => {
        const sectionsWithEdits = await Promise.all(
          sections.map(async (section) => {
            try {
              const savedPlan = await loadPlanFromRepo(effectiveRepoPath, section.id, ptySessionId);
              if (savedPlan) {
                const hasExplicitEdit = savedPlan.editedAt && new Date(savedPlan.editedAt) > section.timestamp;
                if (hasExplicitEdit) {
                  return {
                    ...section,
                    editedContent: savedPlan.content,
                    isEdited: true,
                    editedAt: new Date(savedPlan.editedAt),
                  };
                }
              }
            } catch (error) {
              console.error(`Failed to load plan ${section.id}:`, error);
            }
            return section;
          })
        );
        setPlanSections(sectionsWithEdits);
      });
    }
  }, [terminalOutput, effectiveRepoPath, ptySessionId]);

  const handleSessionError = useCallback((message: string) => {
    addToast({
      title: "PTY Error",
      description: message,
      type: "error",
    });
  }, [addToast]);

  const handleAutoCommandError = useCallback((message: string) => {
    addToast({
      title: "Command Error",
      description: message,
      type: "error",
    });
  }, [addToast]);

  const terminalOverlay = isResetting ? (
    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-10">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Resetting terminal...</p>
      </div>
    </div>
  ) : undefined;

  return (
    <div className="h-screen flex flex-col bg-background">
      <div className="border-b p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">Planning Terminal</h2>
          <span className="font-mono bg-secondary px-2 py-1 rounded">
            {worktree ? `Worktree: ${worktree.branch_name}` : "Main"}
          </span>
          {worktree ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-mono bg-secondary px-2 py-1 rounded">{worktree.branch_name}</span>
              <span>•</span>
              <span className="truncate max-w-md">{worktree.worktree_path}</span>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">
              {workingDirectory.split("/").pop() || workingDirectory.split("\\").pop()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={isResetting}
          >
            {isResetting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RotateCw className="w-4 h-4 mr-2" />
            )}
            Reset Terminal
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <ConsolidatedTerminal
        sessionId={ptySessionId}
        workingDirectory={workingDirectory}
        autoCommand="claude --permission-mode plan"
        onAutoCommandError={handleAutoCommandError}
        onSessionError={handleSessionError}
        onTerminalOutput={setTerminalOutput}
        rightPanel={(
          <PlanDisplay
            planSections={planSections}
            onPlanEdit={handlePlanEdit}
            onExecutePlan={handleExecuteSection}
          />
        )}
        showPlanDisplay
        containerClassName="flex-1 flex overflow-hidden"
        terminalOverlay={terminalOverlay}
      />
    </div>
  );
};
