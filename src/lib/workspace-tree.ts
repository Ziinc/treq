import type {
	Workspace,
	WorkspaceNode,
	WorkspaceSidebarStatus,
} from "./api";

/**
 * Represents a node in the workspace tree
 */
export interface WorkspaceTreeNode {
	status: WorkspaceSidebarStatus;
	branchName: string;
	children: WorkspaceTreeNode[];
	depth: number;
}

/**
 * Flattened node for rendering
 */
export interface FlattenedWorkspaceNode {
	status: WorkspaceSidebarStatus;
	branchName: string;
	depth: number;
	hasChildren: boolean;
	parentBranch: string | null;
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
export function buildWorkspaceTree(
	statuses: WorkspaceSidebarStatus[],
): WorkspaceTreeNode[] {
	const workspaces = statuses.map((statusEntry) => statusEntry.current);
	// Step 1: Create lookup map by branch_name
	const workspaceByBranch = new Map<string, Workspace>();
	for (const ws of workspaces) {
		workspaceByBranch.set(ws.branch_name, ws);
	}

	// Step 2: Create nodes for all workspaces
	const nodeByBranch = new Map<string, WorkspaceTreeNode>();
	for (const ws of workspaces) {
		nodeByBranch.set(ws.branch_name, {
			branchName: ws.branch_name,
			children: [],
			depth: 0,
			status: statuses.find((statusEntry) => statusEntry.current.id === ws.id)!,
		});
	}

	// Step 3: Build parent-child relationships
	for (const ws of workspaces) {
		const target = ws.target_branch;
		if (!target) continue; // No target = root node
		if (target === ws.branch_name) continue; // Ignore self-target links

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
		const targetBranch = node.status.current.target_branch;
		const hasTarget = targetBranch !== null && targetBranch !== undefined;
		const isSelfTarget = hasTarget && targetBranch === node.branchName;
		const targetExists = hasTarget && workspaceByBranch.has(targetBranch);

		if (!hasTarget || !targetExists || isSelfTarget) {
			roots.push(node);
		}
	}

	// Malformed graphs can form cycles with zero roots; degrade safely by
	// flattening to top-level roots so sidebar content never disappears.
	if (roots.length === 0) {
		for (const node of nodeByBranch.values()) {
			node.children = [];
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
	nodes.sort((nodeA, nodeB) =>
		nodeA.branchName.localeCompare(nodeB.branchName),
	);
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
	roots: WorkspaceTreeNode[],
): FlattenedWorkspaceNode[] {
	const result: FlattenedWorkspaceNode[] = [];

	function traverse(node: WorkspaceTreeNode): void {
		result.push({
			branchName: node.branchName,
			depth: node.depth,
			hasChildren: node.children.length > 0,
			parentBranch: node.status.current.target_branch ?? null,
			status: node.status,
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
	branchName: string,
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
/**
 * Recursively collect all descendant workspaces of a given branch.
 * A workspace W is a descendant of branchName if W.target_branch === branchName,
 * or W.target_branch is itself a descendant.
 */
export function getDescendants(
	workspaces: Workspace[],
	branchName: string,
): Workspace[] {
	const childrenMap = new Map<string, Workspace[]>();
	for (const ws of workspaces) {
		if (ws.target_branch) {
			const list = childrenMap.get(ws.target_branch) || [];
			list.push(ws);
			childrenMap.set(ws.target_branch, list);
		}
	}

	const result: Workspace[] = [];
	const stack = [branchName];
	const visited = new Set<string>([branchName]);

	while (stack.length > 0) {
		const current = stack.pop()!;
		const children = childrenMap.get(current) || [];
		for (const child of children) {
			if (!visited.has(child.branch_name)) {
				visited.add(child.branch_name);
				result.push(child);
				stack.push(child.branch_name);
			}
		}
	}

	return result;
}

/**
 * Follow target_branch chain upward to find the root workspace of a stack.
 * The root is a workspace whose target_branch either doesn't exist in the
 * workspace list or is null (i.e., it targets an external branch like "main").
 *
 * Returns the branch_name of the root workspace.
 */
export function getStackRoot(
	workspaces: Workspace[],
	branchName: string,
): string {
	const workspaceByBranch = new Map<string, Workspace>();
	for (const ws of workspaces) {
		workspaceByBranch.set(ws.branch_name, ws);
	}

	let current = branchName;
	const visited = new Set<string>();

	while (true) {
		visited.add(current);
		const ws = workspaceByBranch.get(current);
		if (!ws || !ws.target_branch) {
			return current;
		}
		// If target_branch is not a workspace (external branch), current is root
		if (!workspaceByBranch.has(ws.target_branch)) {
			return current;
		}
		// Cycle detection
		if (visited.has(ws.target_branch)) {
			return current;
		}
		current = ws.target_branch;
	}
}

/**
 * Get entire stack: root + all its descendants.
 * Finds the root via getStackRoot, then collects all descendants.
 */
export function getEntireStack(
	workspaces: Workspace[],
	branchName: string,
): Workspace[] {
	const rootBranch = getStackRoot(workspaces, branchName);
	const root = workspaces.find(
		(workspace) => workspace.branch_name === rootBranch,
	);
	if (!root) return [];

	const descendants = getDescendants(workspaces, rootBranch);
	return [root, ...descendants];
}

/**
 * Check if candidate is a descendant of ancestor.
 * Uses target_branch chain: follows candidate's ancestors upward looking for ancestor.
 */
export function isDescendantOf(
	workspaces: Workspace[],
	candidate: string,
	ancestor: string,
): boolean {
	if (candidate === ancestor) return false;

	const workspaceByBranch = new Map<string, Workspace>();
	for (const ws of workspaces) {
		workspaceByBranch.set(ws.branch_name, ws);
	}

	let current = candidate;
	const visited = new Set<string>();

	while (true) {
		visited.add(current);
		const ws = workspaceByBranch.get(current);
		if (!ws || !ws.target_branch) {
			return false;
		}
		if (ws.target_branch === ancestor) {
			return true;
		}
		// Cycle detection
		if (visited.has(ws.target_branch)) {
			return false;
		}
		current = ws.target_branch;
	}
}

// Tree preview helpers for split/stack dialogs

export interface TreeLine {
	depth: number;
	label: string;
	isCurrent: boolean;
	isNew: boolean;
}

/**
 * Build a tree preview from DAG nodes (used in split dialog).
 * Shows how the new workspace will be positioned relative to the current workspace.
 */
export function buildTreePreview(
	dagNodes: WorkspaceNode[],
	currentWorkspace: Workspace,
	{ position, newLabel }: { position: "before" | "after"; newLabel: string },
): TreeLine[] {
	const lines: TreeLine[] = [];

	const rootTarget =
		currentWorkspace.target_branch ??
		dagNodes.find((node) => node.depth === 0)?.status.current.branch_name ??
		"main";

	const rootNode = [...dagNodes]
		.sort((nodeA, nodeB) => nodeA.depth - nodeB.depth)
		.find((node) => node.depth === 0);
	const rootLabel = rootNode?.status.current.branch_name ?? rootTarget;
	const currentIsRoot = rootLabel === currentWorkspace.branch_name;

	const currentNode = dagNodes.find(
		(node) => node.status.current.id === currentWorkspace.id,
	);
	const currentDepth = currentIsRoot ? 0 : (currentNode?.depth ?? 1);

	const children = dagNodes.filter(
		(node) =>
			node.parent_id === currentWorkspace.id &&
			node.status.current.id !== currentWorkspace.id,
	);

	if (position === "before") {
		lines.push({ depth: 0, isCurrent: false, isNew: false, label: rootLabel });
		if (!currentIsRoot && currentDepth > 1) {
			lines.push({ depth: 1, isCurrent: false, isNew: false, label: "..." });
		}
		const newDepth = currentIsRoot ? 1 : currentDepth;
		lines.push({
			depth: newDepth,
			isCurrent: false,
			isNew: true,
			label: newLabel,
		});
		lines.push({
			depth: newDepth + 1,
			isCurrent: true,
			isNew: false,
			label: currentWorkspace.branch_name,
		});
		for (const child of children) {
			lines.push({
				depth: newDepth + 2,
				isCurrent: false,
				isNew: false,
				label: child.status.current.branch_name,
			});
		}
	} else {
		lines.push({
			depth: 0,
			isCurrent: currentIsRoot,
			isNew: false,
			label: rootLabel,
		});
		if (!currentIsRoot) {
			if (currentDepth > 1) {
				lines.push({ depth: 1, isCurrent: false, isNew: false, label: "..." });
			}
			lines.push({
				depth: currentDepth,
				isCurrent: true,
				isNew: false,
				label: currentWorkspace.branch_name,
			});
		}
		lines.push({
			depth: currentDepth + 1,
			isCurrent: false,
			isNew: true,
			label: newLabel,
		});
		for (const child of children) {
			lines.push({
				depth: currentDepth + 1,
				isCurrent: false,
				isNew: false,
				label: child.status.current.branch_name,
			});
		}
	}

	return lines;
}

/**
 * Build a tree preview from the workspace list (used in stack dialog).
 * Shows the full workspace hierarchy — no truncation.
 */
export function buildStackTreePreview(
	workspaces: Workspace[],
	parentWorkspace: Workspace | null,
	{
		newLabel,
		parentBranch,
		position,
	}: { newLabel: string; parentBranch: string; position: "before" | "after" },
): TreeLine[] {
	const parent =
		parentWorkspace ??
		workspaces.find((workspace) => workspace.branch_name === parentBranch) ??
		null;

	// Build ancestor chain from parent up to root (reversed: root first)
	const ancestorBranches: string[] = [];
	if (parent) {
		let current: Workspace | undefined = parent;
		const visited = new Set<string>([parent.branch_name]);
		while (current?.target_branch) {
			if (visited.has(current.target_branch)) break;
			visited.add(current.target_branch);
			ancestorBranches.unshift(current.target_branch);
			current = workspaces.find(
				(workspace) => workspace.branch_name === current!.target_branch,
			);
		}
		// If the top ancestor's target_branch is not in workspace list, it's an external root (e.g. "main")
		if (
			ancestorBranches.length === 0 &&
			parent.target_branch &&
			!workspaces.some(
				(workspace) => workspace.branch_name === parent.target_branch,
			)
		) {
			ancestorBranches.unshift(parent.target_branch);
		} else if (ancestorBranches.length === 0 && !parent.target_branch) {
			ancestorBranches.unshift("main");
		}
	}

	// Children of parent workspace
	const children = parent
		? workspaces.filter(
				(workspace) => workspace.target_branch === parent.branch_name,
			)
		: [];

	const lines: TreeLine[] = [];

	// Render ancestor chain (root at depth 0)
	const topRoot =
		ancestorBranches.length > 0
			? ancestorBranches[0]
			: (parent?.branch_name ?? "main");
	const isExternalRoot = !workspaces.some(
		(workspace) => workspace.branch_name === topRoot,
	);

	let depth = 0;
	if (isExternalRoot) {
		// External root like "main" — not a workspace, just a label
		lines.push({ depth: 0, isCurrent: false, isNew: false, label: topRoot });
		depth = 1;
		// Render workspace ancestors (skip the external root)
		for (let idx = 1; idx < ancestorBranches.length; idx++) {
			const branch = ancestorBranches[idx];
			lines.push({ depth, isCurrent: false, isNew: false, label: branch });
			depth++;
		}
	} else {
		// Root is a workspace
		for (const branch of ancestorBranches) {
			lines.push({ depth, isCurrent: false, isNew: false, label: branch });
			depth++;
		}
	}

	const parentDepth = depth;

	if (position === "before" && parent) {
		// [new] inserted before parent, parent pushed down
		lines.push({
			depth: parentDepth,
			isCurrent: false,
			isNew: true,
			label: newLabel,
		});
		lines.push({
			depth: parentDepth + 1,
			isCurrent: true,
			isNew: false,
			label: parent.branch_name,
		});
		for (const child of children) {
			lines.push({
				depth: parentDepth + 2,
				isCurrent: false,
				isNew: false,
				label: child.branch_name,
			});
		}
	} else {
		// parent -> [new] + children
		if (parent) {
			const parentIsAlreadyRendered = ancestorBranches.includes(
				parent.branch_name,
			);
			if (!parentIsAlreadyRendered) {
				lines.push({
					depth: parentDepth,
					isCurrent: true,
					isNew: false,
					label: parent.branch_name,
				});
			} else {
				// Mark the already-rendered parent line as current
				const parentLine = lines.find(
					(line) => line.label === parent.branch_name,
				);
				if (parentLine) parentLine.isCurrent = true;
			}
		}
		const newDepth = parent
			? ancestorBranches.includes(parent.branch_name)
				? parentDepth
				: parentDepth + 1
			: parentDepth;
		lines.push({
			depth: newDepth,
			isCurrent: false,
			isNew: true,
			label: newLabel,
		});
		for (const child of children) {
			lines.push({
				depth: newDepth,
				isCurrent: false,
				isNew: false,
				label: child.branch_name,
			});
		}
	}

	return lines;
}

export function getValidTargets(
	workspaces: Workspace[],
	currentBranch: string,
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
