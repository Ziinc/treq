import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Loader2, History } from "lucide-react";
import { Workspace, getAllWorkspacePlans } from "../lib/api";
import { PlanHistoryEntry } from "../types/planHistory";
import { useToast } from "./ui/toast";

interface PlanHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: Workspace | null;
}

const formatTimestamp = (value: string) => {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
};

const resolvePlanContent = (entry: PlanHistoryEntry): string => {
  const { content } = entry;
  if (!content) return "No plan content recorded.";

  if (typeof content === "string") {
    return content;
  }

  if (typeof content === "object") {
    if (content.editedContent) {
      return content.editedContent as string;
    }
    if (content.rawMarkdown) {
      return content.rawMarkdown as string;
    }
    if (content.rawText) {
      return content.rawText as string;
    }
    if (Array.isArray(content.steps)) {
      return (content.steps as string[]).map((step, index) => `${index + 1}. ${step}`).join("\n");
    }
  }

  try {
    return JSON.stringify(content, null, 2);
  } catch {
    return String(content);
  }
};

export const PlanHistoryDialog: React.FC<PlanHistoryDialogProps> = ({ open, onOpenChange, workspace }) => {
  const [plans, setPlans] = useState<PlanHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { addToast } = useToast();

  useEffect(() => {
    let cancelled = false;

    if (open && workspace) {
      setIsLoading(true);
      getAllWorkspacePlans(workspace.repo_path, workspace.id)
        .then((data) => {
          if (!cancelled) {
            setPlans(data);
          }
        })
        .catch((error) => {
          if (!cancelled) {
            console.error("Failed to load plan history:", error);
            addToast({
              title: "Plan History",
              description: error instanceof Error ? error.message : String(error),
              type: "error",
            });
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsLoading(false);
          }
        });
    } else {
      setPlans([]);
    }

    return () => {
      cancelled = true;
    };
  }, [open, workspace, addToast]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-4 h-4" />
            Plan History {workspace ? `- ${workspace.branch_name}` : ""}
          </DialogTitle>
          <DialogDescription>
            Review the plans executed for this workspace. Entries are ordered by execution time.
          </DialogDescription>
        </DialogHeader>

        {!workspace ? (
          <p className="text-sm text-muted-foreground">Select a workspace to view its plans.</p>
        ) : isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading plan history...
          </div>
        ) : plans.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            This workspace does not have any recorded plan executions yet.
          </p>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto space-y-4 pr-1">
            {plans.map((plan) => (
              <div key={plan.id} className="border rounded-lg p-4 bg-muted/30">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-base font-semibold">{plan.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Executed {formatTimestamp(plan.executed_at)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Created {formatTimestamp(plan.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="px-2 py-1 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20">
                      {plan.status}
                    </span>
                    <span className="px-2 py-1 rounded-full bg-secondary text-secondary-foreground border border-border">
                      {plan.type.replace(/_/g, " ")}
                    </span>
                  </div>
                </div>
                <div className="mt-4">
                  <p className="text-xs uppercase text-muted-foreground mb-2">Plan Content</p>
                  <pre className="bg-background border rounded-md p-3 text-sm whitespace-pre-wrap font-mono overflow-x-auto">
                    {resolvePlanContent(plan)}
                  </pre>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
