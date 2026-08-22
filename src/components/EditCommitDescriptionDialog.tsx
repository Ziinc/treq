import { useState } from "react";
import useSWR from "swr";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { useToast } from "./ui/toast";
import {
  type JjLogCommit,
  describeCommit,
  getCommitDescription,
} from "../lib/api";

interface EditCommitDescriptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoPath: string;
  workspaceId: number;
  commit: JjLogCommit | null;
  onSuccess: () => void;
}

export const EditCommitDescriptionDialog: React.FC<
  EditCommitDescriptionDialogProps
> = ({ open, onOpenChange, repoPath, workspaceId, commit, onSuccess }) => {
  const changeId = commit?.change_id;
  const {
    data: loadedDescription,
    error: loadError,
    isLoading: fetching,
  } = useSWR(
    open && changeId
      ? ["commit-description", repoPath, workspaceId, changeId]
      : null,
    () => getCommitDescription(repoPath, workspaceId, changeId!),
  );
  const [draft, setDraft] = useState<{ key: string; text: string } | null>(
    null,
  );
  const description =
    draft && draft.key === changeId ? draft.text : (loadedDescription ?? "");
  const initialDescription = loadedDescription ?? "";
  const setDescription = (text: string) => {
    if (!changeId) return;
    setDraft({ key: changeId, text });
  };
  const error = loadError
    ? loadError instanceof Error
      ? loadError.message
      : String(loadError)
    : "";
  const [saving, setSaving] = useState(false);
  const { addToast } = useToast();

  const handleSave = async () => {
    if (!commit || description === initialDescription) return;

    setSaving(true);

    try {
      await describeCommit(
        repoPath,
        workspaceId,
        commit.change_id,
        description,
      );

      addToast({
        title: "Description updated",
        description: `Updated commit ${commit.short_id}`,
        type: "success",
      });

      onSuccess();
      onOpenChange(false);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      addToast({
        title: "Failed to update description",
        description: errorMsg,
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSave();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onOpenChange(false);
    }
  };

  const canSubmit = !fetching && !saving && description !== initialDescription;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>Edit Commit Description</DialogTitle>
          <DialogDescription>
            {commit ? `Editing ${commit.short_id}` : "Editing commit"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {fetching ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading description...
            </div>
          ) : (
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe this commit..."
              className="min-h-[160px]"
              autoFocus
            />
          )}

          {error && <div className="text-sm text-destructive">{error}</div>}
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSubmit}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
