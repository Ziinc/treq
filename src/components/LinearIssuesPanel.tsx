import { Loader2, RefreshCw, ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  type LinearIssue,
  linearGetViewer,
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
import { LinearIssuesList, LinearKanbanView } from "./LinearIssueRows";
import { cn } from "../lib/utils";

type ViewMode = "list" | "kanban";
type StandardView = "all" | "active" | "my-issues" | "backlog";

const STANDARD_VIEWS: { value: StandardView; label: string }[] = [
  { value: "all", label: "All Issues" },
  { value: "active", label: "Active" },
  { value: "my-issues", label: "My Issues" },
  { value: "backlog", label: "Backlog" },
];

type IssueFilters = {
  assigneeId?: string;
  priority?: number;
  label?: string;
  projectId?: string;
};

const EMPTY_FILTERS: IssueFilters = {};

function applyStandardView(
  issues: LinearIssue[],
  view: StandardView,
  viewerId: string | undefined,
): LinearIssue[] {
  switch (view) {
    case "active":
      return issues.filter(
        (i) => i.state.type === "started" || i.state.type === "unstarted",
      );
    case "backlog":
      return issues.filter((i) => i.state.type === "backlog");
    case "my-issues":
      return viewerId ? issues.filter((i) => i.assignee?.id === viewerId) : [];
    case "all":
    default:
      return issues;
  }
}

function deriveFilterOptions(issues: LinearIssue[]) {
  const assigneeMap = new Map<string, string>();
  const priorityMap = new Map<number, string>();
  const labelSet = new Set<string>();
  const projectMap = new Map<string, string>();

  issues.forEach((issue) => {
    if (issue.assignee) assigneeMap.set(issue.assignee.id, issue.assignee.name);
    if (issue.priority !== undefined)
      priorityMap.set(
        issue.priority,
        issue.priority_label || String(issue.priority),
      );
    issue.labels.forEach((label) => labelSet.add(label));
    if (issue.project) projectMap.set(issue.project.id, issue.project.name);
  });

  return {
    assignees: Array.from(assigneeMap, ([id, name]) => ({ id, name })),
    priorities: Array.from(priorityMap, ([value, label]) => ({
      value,
      label,
    })).sort((a, b) => a.value - b.value),
    labels: Array.from(labelSet).sort(),
    projects: Array.from(projectMap, ([id, name]) => ({ id, name })),
  };
}

function applyIssueFilters(
  issues: LinearIssue[],
  filters: IssueFilters,
): LinearIssue[] {
  return issues.filter((issue) => {
    if (filters.assigneeId && issue.assignee?.id !== filters.assigneeId)
      return false;
    if (filters.priority !== undefined && issue.priority !== filters.priority)
      return false;
    if (filters.label && !issue.labels.includes(filters.label)) return false;
    if (filters.projectId && issue.project?.id !== filters.projectId)
      return false;
    return true;
  });
}

export const LinearIssuesSection: React.FC<{
  repoPath: string;
  onStartPromptFromIssue?: (issue: LinearIssueAttachment) => void;
}> = ({ repoPath, onStartPromptFromIssue }) => {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [standardView, setStandardView] = useState<StandardView>("all");
  const [selectedTeam, setSelectedTeam] = useState<string | undefined>(
    undefined,
  );
  const [filters, setFilters] = useState<IssueFilters>(EMPTY_FILTERS);
  const kickoffIssueId = null;

  const { data: teams = [] } = useSWR(
    repoPath ? ["linear-teams", repoPath] : null,
    async () => await linearListTeams(repoPath),
    { revalidateOnFocus: false },
  );

  const { data: viewer } = useSWR(
    repoPath ? ["linear-viewer", repoPath] : null,
    async () => await linearGetViewer(repoPath),
    { revalidateOnFocus: false, shouldRetryOnError: false },
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

  const viewFilteredIssues = useMemo(
    () => applyStandardView(issues, standardView, viewer?.id),
    [issues, standardView, viewer?.id],
  );

  const filterOptions = useMemo(
    () => deriveFilterOptions(viewFilteredIssues),
    [viewFilteredIssues],
  );

  const filteredIssues = useMemo(
    () => applyIssueFilters(viewFilteredIssues, filters),
    [viewFilteredIssues, filters],
  );

  const issuesByState = useMemo(() => {
    const grouped: Record<string, LinearIssue[]> = {};
    const parentMap = new Map<string, LinearIssue[]>();

    filteredIssues.forEach((issue) => {
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
  }, [filteredIssues]);

  const rootIssues = useMemo(
    () => filteredIssues.filter((i) => !i.parent_id),
    [filteredIssues],
  );

  const hasActiveFilters =
    filters.assigneeId !== undefined ||
    filters.priority !== undefined ||
    filters.label !== undefined ||
    filters.projectId !== undefined;

  return (
    <>
      <div className="px-4 pb-2 shrink-0">
        <Tabs
          value={standardView}
          onValueChange={(v) => setStandardView(v as StandardView)}
        >
          <TabsList className="text-base">
            {STANDARD_VIEWS.map((view) => (
              <TabsTrigger key={view.value} value={view.value}>
                {view.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="flex items-center gap-2 px-4 pb-2 shrink-0 flex-wrap">
        <Tabs
          value={viewMode}
          onValueChange={(v) => setViewMode(v as ViewMode)}
        >
          <TabsList className="text-base">
            <TabsTrigger value="list">List</TabsTrigger>
            <TabsTrigger value="kanban">Kanban</TabsTrigger>
          </TabsList>
        </Tabs>

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

        <FilterDropdown
          label="Assignee"
          testId="linear-filter-assignee"
          value={filters.assigneeId}
          options={filterOptions.assignees.map((a) => ({
            value: a.id,
            label: a.name,
          }))}
          onChange={(value) => setFilters((f) => ({ ...f, assigneeId: value }))}
        />

        <FilterDropdown
          label="Priority"
          testId="linear-filter-priority"
          value={
            filters.priority !== undefined
              ? String(filters.priority)
              : undefined
          }
          options={filterOptions.priorities.map((p) => ({
            value: String(p.value),
            label: p.label,
          }))}
          onChange={(value) =>
            setFilters((f) => ({
              ...f,
              priority: value !== undefined ? Number(value) : undefined,
            }))
          }
        />

        <FilterDropdown
          label="Label"
          testId="linear-filter-label"
          value={filters.label}
          options={filterOptions.labels.map((l) => ({ value: l, label: l }))}
          onChange={(value) => setFilters((f) => ({ ...f, label: value }))}
        />

        <FilterDropdown
          label="Project"
          testId="linear-filter-project"
          value={filters.projectId}
          options={filterOptions.projects.map((p) => ({
            value: p.id,
            label: p.name,
          }))}
          onChange={(value) => setFilters((f) => ({ ...f, projectId: value }))}
        />

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="text-sm"
            onClick={() => setFilters(EMPTY_FILTERS)}
          >
            Clear filters
          </Button>
        )}

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

        {error !== undefined && error !== null && (
          <div className="flex flex-col items-center justify-center h-full text-center p-8 gap-3">
            <p className="text-base text-destructive">
              {error instanceof Error ? error.message : "Failed to load issues"}
            </p>
          </div>
        )}

        {!isLoading && !error && filteredIssues.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center p-8 gap-3">
            <p className="text-base text-muted-foreground">No issues found</p>
          </div>
        )}

        {!isLoading &&
          !error &&
          filteredIssues.length > 0 &&
          viewMode === "list" && (
            <LinearIssuesList
              repoPath={repoPath}
              issues={rootIssues}
              subissuesMap={issuesByState.subissues}
            />
          )}

        {!isLoading &&
          !error &&
          filteredIssues.length > 0 &&
          viewMode === "kanban" && (
            <LinearKanbanView
              issues={rootIssues}
              subissuesMap={issuesByState.subissues}
              issuesByState={issuesByState.byState}
              kickoffIssueId={kickoffIssueId}
              onKickoff={handleKickoff}
            />
          )}
      </div>
    </>
  );
};

const FilterDropdown: React.FC<{
  label: string;
  testId: string;
  value: string | undefined;
  options: { value: string; label: string }[];
  onChange: (value: string | undefined) => void;
}> = ({ label, testId, value, options, onChange }) => {
  const selectedLabel = options.find((o) => o.value === value)?.label;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 text-sm"
          data-testid={testId}
        >
          {selectedLabel ? `${label}: ${selectedLabel}` : label}
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={value ?? ""}>
          <DropdownMenuRadioItem value="" onSelect={() => onChange(undefined)}>
            Any
          </DropdownMenuRadioItem>
          {options.map((option) => (
            <DropdownMenuRadioItem
              key={option.value}
              value={option.value}
              onSelect={() => onChange(option.value)}
            >
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
