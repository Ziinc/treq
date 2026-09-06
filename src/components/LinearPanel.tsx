import { Zap } from "lucide-react";
import { useState } from "react";
import type { LinearIssueAttachment } from "../lib/promptAttachments";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { LinearIssuesSection } from "./LinearIssuesPanel";
import { LinearProjectsSection } from "./LinearProjectsPanel";

interface LinearPanelProps {
  repoPath: string;
  onOpenWorkspace?: (workspaceId: number) => void;
  onStartPromptFromIssue?: (issue: LinearIssueAttachment) => void;
}

type MainSection = "issues" | "projects";

export const LinearPanel: React.FC<LinearPanelProps> = ({
  repoPath,
  onStartPromptFromIssue,
}) => {
  const [section, setSection] = useState<MainSection>("issues");

  return (
    <div
      className="flex h-full bg-background flex-col"
      data-testid="linear-panel"
    >
      <div className="flex items-center px-4 pt-4 pb-2 shrink-0">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-muted-foreground" />
          <h1 className="text-base font-semibold leading-tight">Linear</h1>
        </div>
      </div>

      <div className="px-4 pb-2 shrink-0">
        <Tabs
          value={section}
          onValueChange={(v) => setSection(v as MainSection)}
        >
          <TabsList className="text-base">
            <TabsTrigger value="issues">Issues</TabsTrigger>
            <TabsTrigger value="projects">Projects</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {section === "issues" ? (
        <LinearIssuesSection
          repoPath={repoPath}
          onStartPromptFromIssue={onStartPromptFromIssue}
        />
      ) : (
        <LinearProjectsSection repoPath={repoPath} />
      )}
    </div>
  );
};
