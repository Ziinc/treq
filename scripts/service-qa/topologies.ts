/**
 * Queue topologies for service-qa / UI drain specs.
 *
 * Stacking is expressed via each PR's `baseBranch` (GitHub PR base). The
 * labeled webhook puts each PR on the merge queue keyed by that base, and
 * `get_repo_branch_queue_statuses` returns `q.target_branch` so the desktop
 * `buildQueueStacks` helper can regroup them.
 */
import type { WorkspacePr } from "./webhook";

/** One PR in a topology, with an explicit base (stack parent or default branch). */
export type TopologyPr = WorkspacePr & { baseBranch: string };

/**
 * Two-stack + independent PR + three-level stack with a sibling on the mid tier:
 *
 *   feat/two-base  → main
 *   feat/two-top   → feat/two-base          (stack of 2)
 *   fix/solo       → main                  (independent)
 *   feat/three-base → main
 *   feat/three-mid  → feat/three-base
 *   feat/three-sib  → feat/three-base      (sibling of mid)
 *   feat/three-top  → feat/three-mid       (stack of 3 via mid)
 */
export const TWO_PLUS_INDEPENDENT_PLUS_THREE_WITH_SIBLING: TopologyPr[] = [
  {
    number: 301,
    branch: "feat/two-base",
    headSha: "30130130130130130130130101",
    baseBranch: "main",
    title: "Two-stack base",
  },
  {
    number: 302,
    branch: "feat/two-top",
    headSha: "3023023023023023023023023023023023023022",
    baseBranch: "feat/two-base",
    title: "Two-stack top",
  },
  {
    number: 303,
    branch: "fix/solo",
    headSha: "3033033033033033033033033033033033033033",
    baseBranch: "main",
    title: "Independent",
  },
  {
    number: 304,
    branch: "feat/three-base",
    headSha: "3043043043043043043043043043043043043044",
    baseBranch: "main",
    title: "Three-stack base",
  },
  {
    number: 305,
    branch: "feat/three-mid",
    headSha: "3053053053053053053053053053053053053055",
    baseBranch: "feat/three-base",
    title: "Three-stack mid",
  },
  {
    number: 306,
    branch: "feat/three-sib",
    headSha: "3063063063063063063063063063063063063066",
    baseBranch: "feat/three-base",
    title: "Three-stack sibling of mid",
  },
  {
    number: 307,
    branch: "feat/three-top",
    headSha: "3073073073073073073073073073073073073077",
    baseBranch: "feat/three-mid",
    title: "Three-stack top",
  },
];
