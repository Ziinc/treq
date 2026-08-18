import type { GhReviewThread, PrCiStatus, PrInfo } from "../../src/lib/api-types";
import {
  MARKETING_BRANCH,
  SIBLING_BRANCHES,
  STACK_PARENT_BRANCH,
} from "./readme-fixture";

export const MARKETING_REMOTE = {
  owner: "lorem-ipsum",
  repo: "event-bus",
  full_name: "lorem-ipsum/event-bus",
};

function pr(overrides: Partial<PrInfo>): PrInfo {
  return {
    number: 1,
    title: "Demo PR",
    state: "OPEN",
    url: "https://github.com/lorem-ipsum/event-bus/pull/1",
    head_ref_name: MARKETING_BRANCH,
    base_ref_name: "main",
    merge_state_status: "CLEAN",
    is_draft: false,
    ...overrides,
  };
}

function ci(overrides: Partial<PrCiStatus> = {}): PrCiStatus {
  return {
    state: "success",
    total: 4,
    passed: 4,
    failed: 0,
    pending: 0,
    checks: [
      {
        name: "build",
        bucket: "pass",
        link: "https://github.com/lorem-ipsum/event-bus/actions/runs/1",
        duration_secs: 3 * 60 + 12,
      },
      {
        name: "test",
        bucket: "pass",
        link: "https://github.com/lorem-ipsum/event-bus/actions/runs/2",
        duration_secs: 8 * 60 + 44,
      },
      {
        name: "lint",
        bucket: "pass",
        link: "https://github.com/lorem-ipsum/event-bus/actions/runs/3",
        duration_secs: 41,
      },
      {
        name: "typecheck",
        bucket: "pass",
        link: "https://github.com/lorem-ipsum/event-bus/actions/runs/4",
        duration_secs: 92,
      },
    ],
    ...overrides,
  };
}

/** Stacked PRs: child targets the parent branch, not main. */
export function marketingPrByBranch(): Record<string, PrInfo | null> {
  return {
    [STACK_PARENT_BRANCH]: pr({
      number: 412,
      title: "feat: ingest Discord and Slack events",
      head_ref_name: STACK_PARENT_BRANCH,
      base_ref_name: "main",
      url: "https://github.com/lorem-ipsum/event-bus/pull/412",
    }),
    [MARKETING_BRANCH]: pr({
      number: 418,
      title: "feat: handle empty event messages",
      head_ref_name: MARKETING_BRANCH,
      base_ref_name: STACK_PARENT_BRANCH,
      url: "https://github.com/lorem-ipsum/event-bus/pull/418",
      merge_state_status: "UNSTABLE",
    }),
    [SIBLING_BRANCHES[0]]: pr({
      number: 401,
      title: "feat: keyvalues cache",
      head_ref_name: SIBLING_BRANCHES[0],
      url: "https://github.com/lorem-ipsum/event-bus/pull/401",
    }),
    [SIBLING_BRANCHES[1]]: pr({
      number: 388,
      title: "feat: alerting logs",
      state: "MERGED",
      head_ref_name: SIBLING_BRANCHES[1],
      url: "https://github.com/lorem-ipsum/event-bus/pull/388",
    }),
  };
}

export function marketingGhPullRequests() {
  return Object.values(marketingPrByBranch())
    .filter((item): item is PrInfo => item !== null)
    .map((item) => ({
      number: item.number,
      title: item.title,
      state: item.state,
      url: item.url,
      body: null,
      author: { login: "octocat", avatar_url: null },
      labels: [],
      head_ref_name: item.head_ref_name,
      base_ref_name: item.base_ref_name,
      merge_state_status: item.merge_state_status,
      created_at: "2026-08-01T10:00:00Z",
      updated_at: "2026-08-12T10:00:00Z",
      comments: [],
      is_draft: item.is_draft ?? false,
    }));
}

export function marketingGhIssues() {
  return [
    {
      number: 77,
      title: "Empty event payloads drop the Discord body",
      state: "OPEN",
      url: "https://github.com/lorem-ipsum/event-bus/issues/77",
      body: "Create a workspace for this fix.",
      author: { login: "alice", avatar_url: null },
      labels: [],
      created_at: "2026-08-10T10:00:00Z",
      updated_at: "2026-08-10T10:00:00Z",
      comments: null,
    },
    {
      number: 81,
      title: "Document retry/backoff for ingest",
      state: "OPEN",
      url: "https://github.com/lorem-ipsum/event-bus/issues/81",
      body: null,
      author: { login: "bob", avatar_url: null },
      labels: [],
      created_at: "2026-08-11T10:00:00Z",
      updated_at: "2026-08-11T10:00:00Z",
      comments: null,
    },
  ];
}

export function marketingCiByBranch(): Record<string, PrCiStatus | null> {
  return {
    [STACK_PARENT_BRANCH]: ci(),
    [MARKETING_BRANCH]: ci({
      state: "pending",
      passed: 2,
      pending: 1,
      failed: 1,
      checks: [
        {
          name: "build",
          bucket: "pass",
          link: "https://github.com/lorem-ipsum/event-bus/actions/runs/11",
          duration_secs: 4 * 60 + 8,
        },
        {
          name: "test",
          bucket: "fail",
          link: "https://github.com/lorem-ipsum/event-bus/actions/runs/12",
          duration_secs: 2 * 60 + 17,
        },
        {
          name: "lint",
          bucket: "pass",
          link: "https://github.com/lorem-ipsum/event-bus/actions/runs/13",
          duration_secs: 38,
        },
        {
          name: "typecheck",
          bucket: "pending",
          link: "https://github.com/lorem-ipsum/event-bus/actions/runs/14",
          duration_secs: 12,
        },
      ],
    }),
    [SIBLING_BRANCHES[0]]: ci({
      state: "success",
      total: 3,
      passed: 3,
      checks: [
        {
          name: "build",
          bucket: "pass",
          link: "https://github.com/lorem-ipsum/event-bus/actions/runs/21",
          duration_secs: 2 * 60,
        },
        {
          name: "test",
          bucket: "pass",
          link: "https://github.com/lorem-ipsum/event-bus/actions/runs/22",
          duration_secs: 5 * 60,
        },
        {
          name: "lint",
          bucket: "pass",
          link: "https://github.com/lorem-ipsum/event-bus/actions/runs/23",
          duration_secs: 22,
        },
      ],
    }),
    [SIBLING_BRANCHES[1]]: ci(),
  };
}

/** Resolved GitHub review thread on the marketing client.ts commit. */
export function marketingReviewThreads(): GhReviewThread[] {
  return [
    {
      id: "PRRT_client_stringify",
      is_resolved: true,
      is_outdated: false,
      path: "packages/web/src/lib/client.ts",
      line: 7,
      diff_side: "RIGHT",
      comments: [
        {
          id: "PRRC_client_stringify",
          body: "JSON.stringify is the right fallback when event_message is empty.",
          author: { login: "octocat", avatar_url: null },
          created_at: "2026-08-12T14:22:00Z",
          diff_hunk:
            "@@ -0,0 +1,14 @@\n+import type { EventBody } from \"../../../api/src/schema\";\n+\n+export async function postEvent(body: EventBody): Promise<Response> {\n+  const message =\n+    typeof body.event_message === \"string\" && body.event_message.length > 0\n+      ? body.event_message\n+      : JSON.stringify(body);",
          url: "https://github.com/lorem-ipsum/event-bus/pull/418#discussion_r1",
        },
      ],
    },
  ];
}
