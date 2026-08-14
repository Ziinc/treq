import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { scheduleWorkspaces } from "../lib/api";
import {
  datetimeLocalToRfc3339,
  defaultScheduleDatetimeLocal,
  toDatetimeLocalValue,
} from "../lib/workspace-utils";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { useToast } from "./ui/toast";

interface ScheduleWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoPath: string;
  workspaceIds: number[];
  /** Existing schedule for the first workspace, if any. */
  currentHiddenUntil?: string | null;
  mode: "workspace" | "stack";
}

export const ScheduleWorkspaceDialog: React.FC<
  ScheduleWorkspaceDialogProps
> = ({
  open,
  onOpenChange,
  repoPath,
  workspaceIds,
  currentHiddenUntil,
  mode,
}) => {
  const [datetimeLocal, setDatetimeLocal] = useState(
    defaultScheduleDatetimeLocal(),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!open) return;
    setError("");
    if (currentHiddenUntil) {
      const parsed = new Date(currentHiddenUntil);
      setDatetimeLocal(
        Number.isNaN(parsed.getTime())
          ? defaultScheduleDatetimeLocal()
          : toDatetimeLocalValue(parsed),
      );
    } else {
      setDatetimeLocal(defaultScheduleDatetimeLocal());
    }
  }, [open, currentHiddenUntil]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    void queryClient.invalidateQueries({ queryKey: ["workspace-statuses"] });
  };

  const handleSchedule = async () => {
    setLoading(true);
    setError("");
    try {
      await scheduleWorkspaces(
        repoPath,
        workspaceIds,
        datetimeLocalToRfc3339(datetimeLocal),
      );
      addToast({
        title: mode === "stack" ? "Stack scheduled" : "Workspace scheduled",
        description: "Hidden in the sidebar until the scheduled time.",
        type: "success",
      });
      invalidate();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleShowNow = async () => {
    setLoading(true);
    setError("");
    try {
      await scheduleWorkspaces(repoPath, workspaceIds, null);
      addToast({
        title: mode === "stack" ? "Stack visible" : "Workspace visible",
        description: "Shown in the sidebar again.",
        type: "success",
      });
      invalidate();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const count = workspaceIds.length;
  const title =
    mode === "stack" ? "Schedule stack" : "Schedule workspace";
  const description =
    mode === "stack"
      ? `Hide ${count} workspace${count === 1 ? "" : "s"} in this stack until the chosen time. Directories stay on disk.`
      : "Hide this workspace in the sidebar until the chosen time. The directory stays on disk.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="schedule-workspace-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="schedule-hidden-until">Hide until</Label>
            <Input
              id="schedule-hidden-until"
              type="datetime-local"
              value={datetimeLocal}
              onChange={(event) => setDatetimeLocal(event.target.value)}
            />
          </div>
          {error && <div className="text-sm text-destructive">{error}</div>}
        </div>
        <div className="flex justify-end gap-2">
          {currentHiddenUntil && (
            <Button
              variant="outline"
              onClick={() => void handleShowNow()}
              disabled={loading}
            >
              Show now
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void handleSchedule()}
            disabled={loading || !datetimeLocal}
          >
            {loading ? "Scheduling..." : "Schedule"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
