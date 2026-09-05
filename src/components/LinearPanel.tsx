import { Loader2, RefreshCw, Zap, ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  type LinearIssue,
  linearListIssues,
  linearListTeams,
} from "../lib/api-linear";
import type { LinearIssueAttachment } from "../lib/promptAttachments";
import { Button } from "./ui/button";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { cn } from "../lib/utils";

interface LinearPanelProps {
  repoPath: string;
  onOpenWorkspace?: (workspaceId: number) => void;
  onStartPromptFromIssue?: (issue: LinearIssueAttachment) => void;
}

type ViewMode = "list" | "kanban";

export const LinearPanel: React.FC<LinearPanelProps> = ({
  repoPath,
  onStartPromptFromIssue,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedTeam, setSelectedTeam] = useState<string | undefined>(
    undefined,
  );
  const kickoffIssueId = null;

  const { data: teams = [] } = useSWR(
    repoPath ? ["linear-teams", repoPath] : null,
    async () => await linearListTeams(repoPath),
    { revalidateOnFocus: false },
  );

  const {
    data: issues = [],
    isLoading,
    error,
    mutate: refetch,
  } = useSWR(
    repoPath ? ["linear-issues", repoPath, selectedTeam] : null,
    async () => await linearListIssues(repoPath, selectedTeam),
    { revalidateOnFocus: false },
  );

  const handleKickoff = async (issueId: string, hasSubissues: boolean) => {
    const issue = issues.find((candidate) => candidate.id === issueId);
    if (issue)
      onStartPromptFromIssue?.({ ...issue, includeSubissues: hasSubissues });
  };

  const issuesByState = useMemo(() => {
    const grouped: Record<string, LinearIssue[]> = {};
    const parentMap = new Map<string, LinearIssue[]>();

    issues.forEach((issue) => {
      if (!grouped[issue.state.name]) {
        grouped[issue.state.name] = [];
      }

      if (issue.parent_id) {
        if (!parentMap.has(issue.parent_id)) {
          parentMap.set(issue.parent_id, []);
        }
        parentMap.get(issue.parent_id)!.push(issue);
      } else {
        grouped[issue.state.name].push(issue);
      }
    });

    return { byState: grouped, subissues: parentMap };
  }, [issues]);

  const rootIssues = useMemo(
    () => issues.filter((i) => !i.parent_id),
    [issues],
  );

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
          value={viewMode}
          onValueChange={(v) => setViewMode(v as ViewMode)}
        >
          <TabsList className="text-base">
            <TabsTrigger value="list">List</TabsTrigger>
            <TabsTrigger value="kanban">Kanban</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex items-center gap-2 px-4 pb-2 shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-sm"
              data-testid="linear-team-selector"
            >
              {selectedTeam
                ? teams.find((t) => t.key === selectedTeam)?.name ||
                  selectedTeam
                : "All Teams"}
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Teams</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup value={selectedTeam || ""}>
              <DropdownMenuRadioItem
                value=""
                onSelect={() => setSelectedTeam(undefined)}
              >
                All Teams
              </DropdownMenuRadioItem>
              {teams.map((team) => (
                <DropdownMenuRadioItem
                  key={team.key}
                  value={team.key}
                  onSelect={() => setSelectedTeam(team.key)}
                >
                  {team.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => void refetch()}
          title="Refresh"
          disabled={isLoading}
        >
          <RefreshCw
            className={cn("w-3.5 h-3.5", isLoading && "animate-spin")}
          />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center h-full text-center p-8 gap-3">
            <p className="text-base text-destructive">
              {error instanceof Error ? error.message : "Failed to load issues"}
            </p>
          </div>
        )}

        {!isLoading && !error && issues.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center p-8 gap-3">
            <p className="text-base text-muted-foreground">No issues found</p>
          </div>
        )}

        {!isLoading && !error && issues.length > 0 && viewMode === "list" && (
          <LinearIssuesList
            issues={rootIssues}
            subissuesMap={issuesByState.subissues}
            kickoffIssueId={kickoffIssueId}
            onKickoff={handleKickoff}
          />
        )}

        {!isLoading && !error && issues.length > 0 && viewMode === "kanban" && (
          <LinearKanbanView
            issues={rootIssues}
            subissuesMap={issuesByState.subissues}
            issuesByState={issuesByState.byState}
            kickoffIssueId={kickoffIssueId}
            onKickoff={handleKickoff}
          />
        )}
      </div>
    </div>
  );
};

const LinearIssuesList: React.FC<{
  issues: LinearIssue[];
  subissuesMap: Map<string, LinearIssue[]>;
  kickoffIssueId: string | null;
  onKickoff: (issueId: string, hasSubissues: boolean) => Promise<void>;
}> = ({ issues, subissuesMap, kickoffIssueId, onKickoff }) => (
  <div className="divide-y divide-border">
    {issues.map((issue) => {
      const subissues = subissuesMap.get(issue.id) || [];
      return (
        <div key={issue.id}>
          <LinearIssueRow
            issue={issue}
            hasSubissues={subissues.length > 0}
            kickoffIssueId={kickoffIssueId}
            onKickoff={onKickoff}
            indent={false}
          />
          {subissues.map((subissue) => (
            <LinearIssueRow
              key={subissue.id}
              issue={subissue}
              hasSubissues={false}
              kickoffIssueId={kickoffIssueId}
              onKickoff={onKickoff}
              indent
            />
          ))}
        </div>
      );
    })}
  </div>
);

const LinearIssueRow: React.FC<{
  issue: LinearIssue;
  hasSubissues: boolean;
  kickoffIssueId: string | null;
  onKickoff: (issueId: string, hasSubissues: boolean) => Promise<void>;
  indent: boolean;
}> = ({ issue, hasSubissues, kickoffIssueId, onKickoff, indent }) => {
  const isKickingOff = kickoffIssueId === issue.id;

  return (
    <div
      className={cn(
        "flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors",
        indent && "ml-6 border-l border-muted-foreground/20",
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <a
            href={issue.url}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-sm font-medium text-primary hover:underline"
          >
            {issue.identifier}
          </a>
          <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
            {issue.state.name}
          </span>
        </div>
        <p className="text-base mt-1 truncate">{issue.title}</p>
        {issue.labels.length > 0 && (
          <div className="flex gap-1 mt-2 flex-wrap">
            {issue.labels.map((label) => (
              <span
                key={label}
                className="text-xs px-1.5 py-0.5 rounded-full bg-primary/10 text-primary/80"
              >
                {label}
              </span>
            ))}
          </div>
        )}
      </div>

      <Button
        size="sm"
        variant="outline"
        className="shrink-0 text-base"
        onClick={() => void onKickoff(issue.id, hasSubissues)}
        disabled={isKickingOff}
      >
        {isKickingOff ? (
          <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
        ) : null}
        Kick off
      </Button>
    </div>
  );
};

const LinearKanbanView: React.FC<{
  issues: LinearIssue[];
  subissuesMap: Map<string, LinearIssue[]>;
  issuesByState: Record<string, LinearIssue[]>;
  kickoffIssueId: string | null;
  onKickoff: (issueId: string, hasSubissues: boolean) => Promise<void>;
}> = ({ issuesByState, subissuesMap, kickoffIssueId, onKickoff }) => {
  const states = Object.keys(issuesByState).sort();

  return (
    <div className="flex gap-3 overflow-x-auto p-4 h-full">
      {states.map((stateName) => {
        const stateIssues = issuesByState[stateName]!.filter(
          (i) => !i.parent_id,
        );
        return (
          <div
            key={stateName}
            className="flex-shrink-0 w-80 bg-muted/30 rounded-lg border border-border p-3 flex flex-col"
          >
            <h3 className="font-medium text-sm mb-3 text-muted-foreground">
              {stateName}
            </h3>
            <div className="flex-1 overflow-y-auto flex flex-col gap-2">
              {stateIssues.map((issue) => {
                const subissues = subissuesMap.get(issue.id) || [];
                return (
                  <div key={issue.id}>
                    <LinearKanbanCard
                      issue={issue}
                      hasSubissues={subissues.length > 0}
                      kickoffIssueId={kickoffIssueId}
                      onKickoff={onKickoff}
                    />
                    {subissues.map((subissue) => (
                      <div key={subissue.id} className="ml-2 mt-2">
                        <LinearKanbanCard
                          issue={subissue}
                          hasSubissues={false}
                          kickoffIssueId={kickoffIssueId}
                          onKickoff={onKickoff}
                          isSubissue
                        />
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const LinearKanbanCard: React.FC<{
  issue: LinearIssue;
  hasSubissues: boolean;
  kickoffIssueId: string | null;
  onKickoff: (issueId: string, hasSubissues: boolean) => Promise<void>;
  isSubissue?: boolean;
}> = ({ issue, hasSubissues, kickoffIssueId, onKickoff, isSubissue }) => {
  const isKickingOff = kickoffIssueId === issue.id;

  return (
    <div
      className={cn(
        "bg-background border border-border rounded-md p-2.5 text-sm",
        isSubissue && "opacity-75",
      )}
    >
      <a
        href={issue.url}
        target="_blank"
        rel="noreferrer"
        className="font-mono text-xs font-medium text-primary hover:underline"
      >
        {issue.identifier}
      </a>
      <p className="text-xs font-medium mt-1 line-clamp-2">{issue.title}</p>
      {issue.labels.length > 0 && (
        <div className="flex gap-1 mt-1.5 flex-wrap">
          {issue.labels.slice(0, 2).map((label) => (
            <span
              key={label}
              className="text-xs px-1 py-0.5 rounded bg-primary/10 text-primary/70"
            >
              {label}
            </span>
          ))}
          {issue.labels.length > 2 && (
            <span className="text-xs px-1 py-0.5 text-muted-foreground">
              +{issue.labels.length - 2}
            </span>
          )}
        </div>
      )}
      <Button
        size="sm"
        variant="outline"
        className="w-full mt-2 text-xs h-7"
        onClick={() => void onKickoff(issue.id, hasSubissues)}
        disabled={isKickingOff}
      >
        {isKickingOff ? (
          <Loader2 className="w-2.5 h-2.5 mr-1 animate-spin" />
        ) : null}
        Kick off
      </Button>
    </div>
  );
};
