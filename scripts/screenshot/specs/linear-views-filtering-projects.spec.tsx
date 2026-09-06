/**
 * Verifies the Linear panel's standard-view subtabs, AND-combined issue
 * filters (assignee/priority/label/project), and the new Projects tab with
 * its dual-column project list + detail (including document viewing).
 */

import userEvent from "@testing-library/user-event";
import { it, vi } from "vitest";
import { LinearPanel } from "../../../src/components/LinearPanel";
import type {
  LinearComment,
  LinearDocument,
  LinearIssue,
  LinearProject,
  LinearTeam,
  LinearUser,
} from "../../../src/lib/api-linear";
import { render, screen, within } from "../../../test/test-utils";
import { createTestRepo } from "../../../test/utils";
import { captureDocument } from "../capture";

const {
  mockLinearListTeams,
  mockLinearListIssues,
  mockLinearGetViewer,
  mockLinearListProjects,
  mockLinearListProjectDocuments,
  mockLinearListIssueComments,
  mockLinearListProjectComments,
  mockLinearListDocumentComments,
} = vi.hoisted(() => ({
  mockLinearListTeams: vi.fn(),
  mockLinearListIssues: vi.fn(),
  mockLinearGetViewer: vi.fn(),
  mockLinearListProjects: vi.fn(),
  mockLinearListProjectDocuments: vi.fn(),
  mockLinearListIssueComments: vi.fn(),
  mockLinearListProjectComments: vi.fn(),
  mockLinearListDocumentComments: vi.fn(),
}));

vi.mock("../../../src/lib/api-linear", async () => {
  const actual = await vi.importActual<
    typeof import("../../../src/lib/api-linear")
  >("../../../src/lib/api-linear");
  return {
    ...actual,
    linearListTeams: mockLinearListTeams,
    linearListIssues: mockLinearListIssues,
    linearGetViewer: mockLinearGetViewer,
    linearListProjects: mockLinearListProjects,
    linearListProjectDocuments: mockLinearListProjectDocuments,
    linearListIssueComments: mockLinearListIssueComments,
    linearListProjectComments: mockLinearListProjectComments,
    linearListDocumentComments: mockLinearListDocumentComments,
  };
});

const TEAMS: LinearTeam[] = [{ id: "team-1", key: "ENG", name: "Engineering" }];

const VIEWER: LinearUser = { id: "user-me", name: "Ty" };
const ALICE: LinearUser = { id: "user-alice", name: "Alice" };

const PROJECT_A = { id: "project-a", name: "Search Revamp" };
const PROJECT_B = { id: "project-b", name: "Billing" };

const ISSUES: LinearIssue[] = [
  {
    id: "issue-1",
    identifier: "ENG-101",
    title: "Rework the ranking pipeline",
    description: "",
    state: { name: "In Progress", type: "started" },
    labels: ["backend"],
    branch_name: "eng-101",
    parent_id: null,
    sub_issue_ids: [],
    url: "https://linear.app/treq/issue/ENG-101",
    assignee: VIEWER,
    priority: 1,
    priority_label: "Urgent",
    project: PROJECT_A,
  },
  {
    id: "issue-2",
    identifier: "ENG-102",
    title: "Add typo tolerance to search",
    description: "",
    state: { name: "Todo", type: "unstarted" },
    labels: ["frontend"],
    branch_name: "eng-102",
    parent_id: null,
    sub_issue_ids: [],
    url: "https://linear.app/treq/issue/ENG-102",
    assignee: ALICE,
    priority: 2,
    priority_label: "High",
    project: PROJECT_A,
  },
  {
    id: "issue-3",
    identifier: "ENG-103",
    title: "Investigate invoice rounding error",
    description: "",
    state: { name: "Backlog", type: "backlog" },
    labels: ["bug"],
    branch_name: "eng-103",
    parent_id: null,
    sub_issue_ids: [],
    url: "https://linear.app/treq/issue/ENG-103",
    assignee: null,
    priority: 3,
    priority_label: "Medium",
    project: PROJECT_B,
  },
];

const PROJECTS: LinearProject[] = [
  {
    id: "project-a",
    name: "Search Revamp",
    description: "Improve search relevance and latency.",
    state: "started",
    target_date: "2026-12-01",
    progress: 0.4,
    url: "https://linear.app/treq/project/search-revamp",
    lead: VIEWER,
  },
  {
    id: "project-b",
    name: "Billing",
    description: "Overhaul the billing subsystem.",
    state: "planned",
    target_date: "2027-01-15",
    progress: 0.05,
    url: "https://linear.app/treq/project/billing",
    lead: ALICE,
  },
];

const DOCUMENTS: LinearDocument[] = [
  {
    id: "doc-1",
    title: "Search Revamp - Design Doc",
    content:
      "## Goals\n\nCut p95 search latency in half and improve relevance for typo-heavy queries.",
    url: "https://linear.app/treq/document/search-revamp-design",
    updated_at: "2026-08-01T00:00:00Z",
  },
];

const ISSUE_COMMENTS: LinearComment[] = [
  {
    id: "comment-1",
    body: "Started profiling the ranking pipeline, **p95 is 800ms** today.",
    user: VIEWER,
    created_at: "2026-08-02T10:00:00Z",
  },
];

const DOCUMENT_COMMENTS: LinearComment[] = [
  {
    id: "comment-2",
    body: "Looks good, one nit on the caching section.",
    user: ALICE,
    created_at: "2026-08-03T09:00:00Z",
  },
];

it("filters issues by standard view and AND-combined filters, and browses projects/documents", async () => {
  const { repoPath } = createTestRepo(false);

  mockLinearListTeams.mockResolvedValue(TEAMS);
  mockLinearListIssues.mockResolvedValue(ISSUES);
  mockLinearGetViewer.mockResolvedValue(VIEWER);
  mockLinearListProjects.mockResolvedValue(PROJECTS);
  mockLinearListProjectDocuments.mockResolvedValue(DOCUMENTS);
  mockLinearListIssueComments.mockResolvedValue(ISSUE_COMMENTS);
  mockLinearListProjectComments.mockResolvedValue([]);
  mockLinearListDocumentComments.mockResolvedValue(DOCUMENT_COMMENTS);

  const user = userEvent.setup();
  render(<LinearPanel repoPath={repoPath} />);

  await screen.findByText("Rework the ranking pipeline");

  await captureDocument(document, {
    name: "linear-views-filtering-01-issues-default",
    expectations: [
      'The Issues tab is active with standard-view subtabs "All Issues", "Active", "My Issues", "Backlog" visible above a row that combines the List/Kanban toggle with the team and filter dropdowns.',
      "All three issues (ENG-101, ENG-102, ENG-103) are visible in the list, each without a Kick off button.",
    ],
  });

  await user.click(screen.getByText("Rework the ranking pipeline"));
  await screen.findByTestId("linear-issue-expanded");

  await captureDocument(document, {
    name: "linear-views-filtering-01b-issue-expanded",
    expectations: [
      "Clicking issue ENG-101 expanded an inline panel below it showing an \"Activity\" section.",
      'The activity panel shows a comment from "Ty" with bolded text "p95 is 800ms".',
    ],
  });

  await user.click(screen.getByText("Rework the ranking pipeline"));

  await user.click(screen.getByRole("tab", { name: "Active" }));
  await screen.findByText("Rework the ranking pipeline");

  await captureDocument(document, {
    name: "linear-views-filtering-02-active-view",
    expectations: [
      'With the "Active" standard view selected, only the started/unstarted issues ENG-101 and ENG-102 are shown.',
      "The backlog issue ENG-103 is not visible in the list.",
    ],
  });

  const projectFilter = screen.getByTestId("linear-filter-project");
  await user.click(projectFilter);
  const projectMenu = await screen.findByRole("menu");
  await user.click(within(projectMenu).getByText("Search Revamp"));
  await screen.findByText("Rework the ranking pipeline");

  await captureDocument(document, {
    name: "linear-views-filtering-03-project-filter-applied",
    expectations: [
      'The Project filter button reads "Project: Search Revamp" and a "Clear filters" button is now visible.',
      "Only issues belonging to the Search Revamp project (ENG-101, ENG-102) are listed.",
    ],
  });

  await user.click(screen.getByRole("tab", { name: "Projects" }));
  await screen.findByTestId("linear-project-detail");

  await captureDocument(document, {
    name: "linear-views-filtering-04-projects-dual-column",
    expectations: [
      "A dual-column Projects layout is visible: a project list on the left (Search Revamp, Billing) and a detail panel on the right for the selected project, with its description rendered below the metadata row and a Comments section below Documents.",
      'The Documents section shows "Search Revamp - Design Doc" as a rounded pill/chip button, not a plain underlined link.',
    ],
  });

  await user.click(screen.getByTestId("linear-project-filter-button"));
  const statusFilterGroup = await screen.findByTestId(
    "linear-project-filter-status",
  );

  await captureDocument(document, {
    name: "linear-views-filtering-06-project-filter-popover",
    expectations: [
      "A popover is open below the filter icon button in the left project-list column header, titled \"Filters\", with \"Status\" and \"Lead\" filter groups.",
      'The Status group lists "planned" and "started" as options (the two project states in the fixture data).',
    ],
  });

  await user.click(within(statusFilterGroup).getByText("planned"));
  await screen.findByTestId("linear-project-item-project-b");

  await captureDocument(document, {
    name: "linear-views-filtering-07-project-filter-applied",
    expectations: [
      "With the Status filter set to \"planned\" (checkmarked in the popover), only the Billing project is listed in the left column -- Search Revamp is gone.",
      'A "Clear" button is now visible in the popover header next to "Filters".',
    ],
  });

  await user.click(await screen.findByText("Clear"));
  await user.keyboard("{Escape}");
  await screen.findByTestId("linear-project-item-project-a");

  const projectDetail = screen.getByTestId("linear-project-detail");
  await user.click(
    within(projectDetail).getByText("Search Revamp - Design Doc"),
  );
  await screen.findByText(/Cut p95 search latency/);

  await captureDocument(document, {
    name: "linear-views-filtering-05-document-dialog",
    expectations: [
      'A dialog is open titled "Search Revamp - Design Doc" showing the document content rendered as formatted markdown (a "Goals" heading, not raw "## Goals" text).',
      'A Comments section below the content shows a comment from "Alice" about "the caching section".',
    ],
  });
}, 60000);
