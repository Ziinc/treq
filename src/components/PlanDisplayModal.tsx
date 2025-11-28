import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { PlanDisplay } from "./PlanDisplay";
import { PlanSection } from "../types/planning";
import { FileText } from "lucide-react";

interface PlanDisplayModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planSections: PlanSection[];
  onPlanEdit?: (planId: string, newContent: string) => void;
  onExecutePlan?: (section: PlanSection) => void;
  onExecuteInWorktree?: (section: PlanSection) => void;
  isExecutingInWorktree?: boolean;
  sessionId?: string;
  repoPath?: string;
  worktreeId?: number;
}

export const PlanDisplayModal: React.FC<PlanDisplayModalProps> = ({
  open,
  onOpenChange,
  planSections,
  onPlanEdit,
  onExecutePlan,
  onExecuteInWorktree,
  isExecutingInWorktree,
  sessionId,
  repoPath,
  worktreeId,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Implementation Plan
          </DialogTitle>
          <DialogDescription>
            Review and execute the detected implementation plan.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto -mx-6 -mb-6">
          <PlanDisplay
            planSections={planSections}
            onPlanEdit={onPlanEdit}
            onExecutePlan={onExecutePlan}
            onExecuteInWorktree={onExecuteInWorktree}
            isExecutingInWorktree={isExecutingInWorktree}
            sessionId={sessionId}
            repoPath={repoPath}
            worktreeId={worktreeId}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};
