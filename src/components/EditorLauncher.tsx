import { useState } from "react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Code2, Terminal as TerminalIcon } from "lucide-react";
import { Worktree, shellLaunchApp } from "../lib/api";
import { useToast } from "./ui/toast";

interface EditorLauncherProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  worktree: Worktree;
}

export const EditorLauncher: React.FC<EditorLauncherProps> = ({
  open,
  onOpenChange,
  worktree,
}) => {
  const [loading, setLoading] = useState(false);
  const { addToast } = useToast();

  const launchEditor = async (appName: string) => {
    setLoading(true);
    try {
      await shellLaunchApp(appName, worktree.worktree_path);
      addToast({
        title: "Editor Launched",
        description: `Opening ${appName} in ${worktree.branch_name}`,
        type: "success",
      });
      onOpenChange(false);
    } catch (error) {
      addToast({
        title: "Launch Failed",
        description: error as string,
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Launch Editor</DialogTitle>
          <DialogDescription>
            Choose an editor to open this worktree
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-4">
          <Button
            variant="outline"
            className="justify-start h-auto py-4"
            onClick={() => launchEditor("cursor")}
            disabled={loading}
          >
            <Code2 className="w-5 h-5 mr-3" />
            <div className="text-left">
              <div className="font-semibold">Cursor</div>
              <div className="text-xs text-muted-foreground">
                Open in Cursor editor
              </div>
            </div>
          </Button>

          <Button
            variant="outline"
            className="justify-start h-auto py-4"
            onClick={() => launchEditor("code")}
            disabled={loading}
          >
            <Code2 className="w-5 h-5 mr-3" />
            <div className="text-left">
              <div className="font-semibold">VS Code</div>
              <div className="text-xs text-muted-foreground">
                Open in Visual Studio Code
              </div>
            </div>
          </Button>

          <Button
            variant="outline"
            className="justify-start h-auto py-4"
            onClick={() => launchEditor("aider")}
            disabled={loading}
          >
            <TerminalIcon className="w-5 h-5 mr-3" />
            <div className="text-left">
              <div className="font-semibold">Aider</div>
              <div className="text-xs text-muted-foreground">
                Start Aider AI coding assistant in terminal
              </div>
            </div>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

