import { Loader2, RefreshCw, Zap, ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  type LinearDocument,
  type LinearIssue,
  type LinearProject,
  linearGetViewer,
  linearListIssues,
  linearListProjectDocuments,
  linearListProjects,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { cn } from "../lib/utils";

interface LinearPanelProps {
  repoPath: string;
  onOpenWorkspace?: (workspaceId: number) => void;
  onStartPromptFromIssue?: (issue: LinearIssueAttachment) => void;
}

type ViewMode = "list" | "kanban";
type MainSection = "issues" | "projects";
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

export const LinearPanel: React.FC<LinearPanelProps> = ({
  repoPath,
  onStartPromptFromIssue,
}) => {
  const [section, setSection] = useState<MainSection>("issues");
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
        <Tabs value={section} onValueChange={(v) => setSection(v as MainSection)}>
          <TabsList className="text-base">
            <TabsTrigger value="issues" data-testid="linear-section-issues">
              Issues
            </TabsTrigger>
            <TabsTrigger value="projects" data-testid="linear-section-projects">
              Projects
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {section === "issues" ? (
        <IssuesSection
          teams={teams}
          selectedTeam={selectedTeam}
          setSelectedTeam={setSelectedTeam}
          standardView={standardView}
          setStandardView={setStandardView}
          viewMode={viewMode}
          setViewMode={setViewMode}
          filters={filters}
          setFilters={setFilters}
          filterOptions={filterOptions}
          isLoading={isLoading}
          error={error}
          refetch={refetch}
          filteredIssues={filteredIssues}
          rootIssues={rootIssues}
          issuesByState={issuesByState}
          kickoffIssueId={kickoffIssueId}
          handleKickoff={handleKickoff}
        />
      ) : (
        <ProjectsSection repoPath={repoPath} />
      )}
    </div>
  );
};

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
      priorityMap.set(issue.priority, issue.priority_label || String(issue.priority));
    issue.labels.forEach((label) => labelSet.add(label));
    if (issue.project) projectMap.set(issue.project.id, issue.project.name);
  });

  return {
    assignees: Array.from(assigneeMap, ([id, name]) => ({ id, name })),
    priorities: Array.from(priorityMap, ([value, label]) => ({ value, label })).sort(
      (a, b) => a.value - b.value,
    ),
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

const IssuesSection: React.FC<{
  teams: { key: string; name: string }[];
  selectedTeam: string | undefined;
  setSelectedTeam: (v: string | undefined) => void;
  standardView: StandardView;
  setStandardView: (v: StandardView) => void;
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
  filters: IssueFilters;
  setFilters: React.Dispatch<React.SetStateAction<IssueFilters>>;
  filterOptions: ReturnType<typeof deriveFilterOptions>;
  isLoading: boolean;
  error: unknown;
  refetch: () => unknown;
  filteredIssues: LinearIssue[];
  rootIssues: LinearIssue[];
  issuesByState: { byState: Record<string, LinearIssue[]>; subissues: Map<string, LinearIssue[]> };
  kickoffIssueId: string | null;
  handleKickoff: (issueId: string, hasSubissues: boolean) => Promise<void>;
}> = ({
  teams,
  selectedTeam,
  setSelectedTeam,
  standardView,
  setStandardView,
  viewMode,
  setViewMode,
  filters,
  setFilters,
  filterOptions,
  isLoading,
  error,
  refetch,
  filteredIssues,
  rootIssues,
  issuesByState,
  kickoffIssueId,
  handleKickoff,
}) => {
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
              <TabsTrigger
                key={view.value}
                value={view.value}
                data-testid={`linear-view-${view.value}`}
              >
                {view.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
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

      <div className="flex items-center gap-2 px-4 pb-2 shrink-0 flex-wrap">
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
          onChange={(value) =>
            setFilters((f) => ({ ...f, assigneeId: value }))
          }
        />

        <FilterDropdown
          label="Priority"
          testId="linear-filter-priority"
          value={filters.priority !== undefined ? String(filters.priority) : undefined}
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
          onChange={(value) =>
            setFilters((f) => ({ ...f, projectId: value }))
          }
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

        {!isLoading && !error && filteredIssues.length > 0 && viewMode === "list" && (
          <LinearIssuesList
            issues={rootIssues}
            subissuesMap={issuesByState.subissues}
            kickoffIssueId={kickoffIssueId}
            onKickoff={handleKickoff}
          />
        )}

        {!isLoading && !error && filteredIssues.length > 0 && viewMode === "kanban" && (
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
        <div className="flex items-center gap-2 flex-wrap">
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
          {issue.priority_label && issue.priority !== 0 && (
            <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
              {issue.priority_label}
            </span>
          )}
          {issue.project && (
            <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
              {issue.project.name}
            </span>
          )}
          {issue.assignee && (
            <span className="text-xs text-muted-foreground">
              {issue.assignee.name}
            </span>
          )}
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

const ProjectsSection: React.FC<{ repoPath: string }> = ({ repoPath }) => {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [openDocument, setOpenDocument] = useState<LinearDocument | null>(
    null,
  );

  const {
    data: projects = [],
    isLoading,
    error,
    mutate: refetch,
  } = useSWR(
    repoPath ? ["linear-projects", repoPath] : null,
    async () => await linearListProjects(repoPath),
    { revalidateOnFocus: false },
  );

  const selectedProject =
    projects.find((p) => p.id === selectedProjectId) ?? projects[0] ?? null;

  const { data: documents = [], isLoading: isLoadingDocuments } = useSWR(
    repoPath && selectedProject
      ? ["linear-project-documents", repoPath, selectedProject.id]
      : null,
    async () =>
      await linearListProjectDocuments(repoPath, selectedProject!.id),
    { revalidateOnFocus: false },
  );

  return (
    <div className="flex-1 flex min-h-0" data-testid="linear-projects-section">
      <div className="w-72 shrink-0 border-r border-border flex flex-col min-h-0">
        <div className="flex items-center justify-between px-4 py-2 shrink-0">
          <span className="text-sm font-medium text-muted-foreground">
            Projects
          </span>
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
            <div className="p-4 text-sm text-destructive">
              {error instanceof Error
                ? error.message
                : "Failed to load projects"}
            </div>
          )}

          {!isLoading && !error && projects.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground">
              No projects found
            </div>
          )}

          <div className="divide-y divide-border">
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                data-testid={`linear-project-item-${project.id}`}
                className={cn(
                  "w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors",
                  selectedProject?.id === project.id && "bg-muted",
                )}
                onClick={() => setSelectedProjectId(project.id)}
              >
                <p className="text-sm font-medium truncate">{project.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">
                    {project.state}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {Math.round((project.progress || 0) * 100)}%
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {selectedProject ? (
          <ProjectDetail
            project={selectedProject}
            documents={documents}
            isLoadingDocuments={isLoadingDocuments}
            onOpenDocument={setOpenDocument}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Select a project
          </div>
        )}
      </div>

      <Dialog
        open={openDocument !== null}
        onOpenChange={(open) => !open && setOpenDocument(null)}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{openDocument?.title}</DialogTitle>
          </DialogHeader>
          <div className="whitespace-pre-wrap text-sm">
            {openDocument?.content || "No content"}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const ProjectDetail: React.FC<{
  project: LinearProject;
  documents: LinearDocument[];
  isLoadingDocuments: boolean;
  onOpenDocument: (document: LinearDocument) => void;
}> = ({ project, documents, isLoadingDocuments, onOpenDocument }) => (
  <div className="p-4" data-testid="linear-project-detail">
    <div className="flex items-center gap-2 flex-wrap">
      <h2 className="text-lg font-semibold">{project.name}</h2>
      <a
        href={project.url}
        target="_blank"
        rel="noreferrer"
        className="text-xs text-primary hover:underline"
      >
        Open in Linear
      </a>
    </div>
    <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground flex-wrap">
      <span className="px-1.5 py-0.5 rounded-full bg-muted capitalize">
        {project.state}
      </span>
      <span>{Math.round((project.progress || 0) * 100)}% complete</span>
      {project.lead && <span>Lead: {project.lead.name}</span>}
      {project.target_date && <span>Target: {project.target_date}</span>}
    </div>
    {project.description && (
      <p className="text-sm mt-3 whitespace-pre-wrap">{project.description}</p>
    )}

    <div className="mt-6">
      <h3 className="text-sm font-medium text-muted-foreground mb-2">
        Documents
      </h3>
      {isLoadingDocuments && (
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      )}
      {!isLoadingDocuments && documents.length === 0 && (
        <p className="text-sm text-muted-foreground">No documents</p>
      )}
      <div className="flex flex-col gap-1">
        {documents.map((doc) => (
          <button
            key={doc.id}
            type="button"
            data-testid={`linear-document-item-${doc.id}`}
            className="text-left text-sm text-primary hover:underline w-fit"
            onClick={() => onOpenDocument(doc)}
          >
            {doc.title}
          </button>
        ))}
      </div>
    </div>
  </div>
);
