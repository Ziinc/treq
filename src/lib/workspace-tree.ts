import type { Workspace } from "./api";

/**
 * Represents a node in the workspace tree
 */
export interface WorkspaceTreeNode {
  workspace: Workspace;
  branchName: string;
  children: WorkspaceTreeNode[];
  depth: number;
}

/**
 * Flattened node for rendering
 */
export interface FlattenedWorkspaceNode {
  workspace: Workspace;
  branchName: string;
  depth: number;
  hasChildren: boolean;
}

/**
 * Build a hierarchical tree from flat workspace list
 *
 * Algorithm:
 * 1. Create a map of branch_name → workspace for quick lookup
 * 2. For each workspace, find parent by matching its target_branch to another workspace's branch_name
 * 3. Build parent-child relationships
 * 4. Roots = workspaces whose target_branch has no matching workspace (or is null)
 * 5. Sort alphabetically at each level
 *
 * @param workspaces Flat list of workspaces
 * @returns Array of root nodes forming a forest
 */
export function buildWorkspaceTree(workspaces: Workspace[]): WorkspaceTreeNode[] {
  // Step 1: Create lookup map by branch_name
  const workspaceByBranch = new Map<string, Workspace>();
  for (const ws of workspaces) {
    workspaceByBranch.set(ws.branch_name, ws);
  }

  // Step 2: Create nodes for all workspaces
  const nodeByBranch = new Map<string, WorkspaceTreeNode>();
  for (const ws of workspaces) {
    nodeByBranch.set(ws.branch_name, {
      workspace: ws,
      branchName: ws.branch_name,
      children: [],
      depth: 0,
    });
  }

  // Step 3: Build parent-child relationships
  for (const ws of workspaces) {
    const target = ws.target_branch;
    if (!target) continue; // No target = root node

    const parentNode = nodeByBranch.get(target);
    const childNode = nodeByBranch.get(ws.branch_name);

    if (parentNode && childNode) {
      // Valid parent-child relationship
      parentNode.children.push(childNode);
    }
    // If parent doesn't exist (targets external branch like origin/main), it becomes a root
  }

  // Step 4: Find root nodes (workspaces with no target or target not in workspace list)
  const roots: WorkspaceTreeNode[] = [];
  for (const node of nodeByBranch.values()) {
    const targetBranch = node.workspace.target_branch;
    const hasTarget = targetBranch !== null && targetBranch !== undefined;
    const targetExists = hasTarget && workspaceByBranch.has(targetBranch);

    if (!hasTarget || !targetExists) {
      roots.push(node);
    }
  }

  // Step 5: Compute depths and sort
  for (const root of roots) {
    computeDepths(root, 0);
  }
  sortTreeAlphabetically(roots);

  return roots;
}

/**
 * Recursively compute depths for all nodes in the tree
 */
function computeDepths(node: WorkspaceTreeNode, depth: number): void {
  node.depth = depth;
  for (const child of node.children) {
    computeDepths(child, depth + 1);
  }
}

/**
 * Sort tree nodes alphabetically at each level
 */
function sortTreeAlphabetically(nodes: WorkspaceTreeNode[]): void {
  nodes.sort((a, b) => a.branchName.localeCompare(b.branchName));
  for (const node of nodes) {
    sortTreeAlphabetically(node.children);
  }
}

/**
 * Flatten tree for rendering (depth-first traversal)
 *
 * @param roots Array of root nodes
 * @returns Flattened list in display order with depth info
 */
export function flattenWorkspaceTree(
  roots: WorkspaceTreeNode[]
): FlattenedWorkspaceNode[] {
  const result: FlattenedWorkspaceNode[] = [];

  function traverse(node: WorkspaceTreeNode): void {
    result.push({
      workspace: node.workspace,
      branchName: node.branchName,
      depth: node.depth,
      hasChildren: node.children.length > 0,
    });

    for (const child of node.children) {
      traverse(child);
    }
  }

  for (const root of roots) {
    traverse(root);
  }

  return result;
}

/**
 * Get the ancestor chain for a given branch
 * Used for detecting circular references
 *
 * @param workspaces Flat list of workspaces
 * @param branchName Starting branch name
 * @returns Array of ancestor branch names (from immediate parent to root)
 */
export function getAncestorChain(
  workspaces: Workspace[],
  branchName: string
): string[] {
  const ancestors: string[] = [];
  const workspaceByBranch = new Map<string, Workspace>();

  for (const ws of workspaces) {
    workspaceByBranch.set(ws.branch_name, ws);
  }

  let current = workspaceByBranch.get(branchName);
  const visited = new Set<string>([branchName]);

  while (current?.target_branch) {
    const target = current.target_branch;

    // Detect cycle
    if (visited.has(target)) {
      break;
    }

    ancestors.push(target);
    visited.add(target);
    current = workspaceByBranch.get(target);
  }

  return ancestors;
}

/**
 * Get valid target branches for a workspace (excluding those that would create cycles)
 *
 * @param workspaces All workspaces
 * @param currentBranch The branch we're setting a target for
 * @returns List of valid target branch names
 */
export function getValidTargets(
  workspaces: Workspace[],
  currentBranch: string
): string[] {
  const validTargets: string[] = [];

  for (const ws of workspaces) {
    // Can't target self
    if (ws.branch_name === currentBranch) {
      continue;
    }

    // Check if currentBranch is in this workspace's ancestor chain
    const ancestors = getAncestorChain(workspaces, ws.branch_name);
    if (ancestors.includes(currentBranch)) {
      // Would create a cycle
      continue;
    }

    validTargets.push(ws.branch_name);
  }

  return validTargets;
}
