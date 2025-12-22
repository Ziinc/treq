import { memo, useCallback, useEffect, useRef, useState } from "react";
import { jjGetLog, type Workspace, type JjLogCommit, type JjLogResult } from "../lib/api";

interface CommitGraphProps {
  workspacePath: string;
  targetBranch: string | null;
  workspaceBranch: string;
  repoPath: string;
  allWorkspaces: Workspace[];
}

interface ChartCommitNode {
  x: number;
  y: number;
  commit: JjLogCommit;
  lane: string;
}

interface LaneConnection {
  from: ChartCommitNode;
  to: ChartCommitNode;
}

interface WorkspaceChainItem {
  branch: string;
  path: string;
  isTarget: boolean; // Whether this is a target branch (not a workspace)
}

export const CommitGraph = memo<CommitGraphProps>(function CommitGraph({
  workspacePath,
  targetBranch,
  workspaceBranch,
  repoPath,
  allWorkspaces,
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [lanes, setLanes] = useState<Map<string, ChartCommitNode[]> | null>(null);
  const [laneConnections, setLaneConnections] = useState<LaneConnection[]>([]);
  const [chain, setChain] = useState<WorkspaceChainItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<ChartCommitNode | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Build workspace chain from current workspace up to root target branch
  const buildWorkspaceChain = useCallback((): WorkspaceChainItem[] => {
    if (!targetBranch) return [];

    // If workspace branch equals target branch, we're in the main repo
    // Just show a single lane
    if (workspaceBranch === targetBranch) {
      return [];
    }

    const chain: WorkspaceChainItem[] = [];
    let currentBranch = targetBranch;

    // Check if targetBranch is another workspace
    while (currentBranch) {
      const parentWorkspace = allWorkspaces.find(
        (w) => w.branch_name === currentBranch && w.workspace_path !== workspacePath
      );

      if (parentWorkspace) {
        // Found a parent workspace
        chain.unshift({
          branch: parentWorkspace.branch_name,
          path: parentWorkspace.workspace_path,
          isTarget: false,
        });
        currentBranch = parentWorkspace.target_branch || "";
      } else {
        // Reached root target branch (not a workspace)
        chain.unshift({
          branch: currentBranch,
          path: "", // Target branch doesn't have a workspace path
          isTarget: true,
        });
        break;
      }
    }

    return chain;
  }, [targetBranch, workspaceBranch, allWorkspaces, workspacePath]);

  // Fetch commits for all lanes
  const fetchCommitsForChain = useCallback(async (
    chain: WorkspaceChainItem[],
    effectiveTargetBranch: string
  ): Promise<Map<string, JjLogResult>> => {
    const commitsByLane = new Map<string, JjLogResult>();

    try {
      console.log("[CommitGraph] Fetching commits for workspace:", workspacePath, "target:", effectiveTargetBranch);

      // Fetch commits for current workspace/repo
      const result = await jjGetLog(workspacePath, effectiveTargetBranch);
      console.log("[CommitGraph] Got commits:", result);

      commitsByLane.set(workspaceBranch, result);

      // For multi-lane (workspace with target branch), the result contains all commits
      // We'll separate them in the transform step
    } catch (err) {
      console.error("[CommitGraph] Failed to fetch commits:", err);
      throw new Error(`Failed to fetch commits: ${err instanceof Error ? err.message : String(err)}`);
    }

    return commitsByLane;
  }, [workspacePath, workspaceBranch]);

  // Transform commits to chart data for line series
  const transformToChartData = useCallback((
    chain: WorkspaceChainItem[],
    commitsByLane: Map<string, JjLogResult>
  ): {
    nodes: ChartCommitNode[];
    lanes: Map<string, ChartCommitNode[]>;
    connectors: LaneConnection[];
  } => {
    const nodes: ChartCommitNode[] = [];
    const lanes = new Map<string, ChartCommitNode[]>();
    const nodeMap = new Map<string, ChartCommitNode>();
    const connectors: LaneConnection[] = [];

    // Get all commits (they're all in the workspace branch result)
    const logResult = commitsByLane.get(workspaceBranch);
    if (!logResult || logResult.commits.length === 0) {
      console.log("[CommitGraph] No commits found");
      return { nodes, lanes, connectors };
    }

    console.log("[CommitGraph] Processing commits:", logResult.commits.length);

    // Reverse for left-to-right (oldest to newest), limit to last 4 commits
    const allCommits = [...logResult.commits].reverse();
    const commits = allCommits.slice(-4);

    // If no chain (main repo or workspace == target), show single lane
    if (chain.length === 0) {
      const laneNodes: ChartCommitNode[] = [];
      commits.forEach((commit, xIndex) => {
        const node: ChartCommitNode = {
          x: xIndex,
          y: 1.5, // Centered vertically
          commit,
          lane: workspaceBranch,
        };
        nodes.push(node);
        nodeMap.set(commit.short_id, node);
        laneNodes.push(node);
      });
      lanes.set(workspaceBranch, laneNodes);
    } else {
      const targetBranchName = chain[0].branch;
      const commitMap = new Map<string, JjLogCommit>();
      commits.forEach((commit) => commitMap.set(commit.short_id, commit));

      const findCommitByBookmark = (bookmark: string): JjLogCommit | undefined =>
        commits.find((commit) => commit.bookmarks.includes(bookmark));

      const collectAncestors = (start?: JjLogCommit): Set<string> => {
        const visited = new Set<string>();
        if (!start) {
          return visited;
        }

        const stack: JjLogCommit[] = [start];
        while (stack.length > 0) {
          const current = stack.pop();
          if (!current || visited.has(current.short_id)) {
            continue;
          }
          visited.add(current.short_id);
          current.parent_ids.forEach((parentId) => {
            const parent = commitMap.get(parentId);
            if (parent && !visited.has(parent.short_id)) {
              stack.push(parent);
            }
          });
        }

        return visited;
      };

      const targetHead = findCommitByBookmark(targetBranchName);
      const targetAncestors = collectAncestors(targetHead);

      commits.forEach((commit, xIndex) => {
        const isTargetCommit =
          targetAncestors.has(commit.short_id) ||
          (targetAncestors.size === 0 && commit.bookmarks.includes(targetBranchName));
        const laneName = isTargetCommit ? targetBranchName : workspaceBranch;
        const yPosition = isTargetCommit ? 1.2 : 1.8; // Centered around 1.5

        const node: ChartCommitNode = {
          x: xIndex,
          y: yPosition,
          commit,
          lane: laneName,
        };

        nodes.push(node);
        nodeMap.set(commit.short_id, node);
        const laneNodes = lanes.get(laneName) ?? [];
        laneNodes.push(node);
        lanes.set(laneName, laneNodes);
      });

      nodes.forEach((node) => {
        if (node.lane !== workspaceBranch) {
          return;
        }

        const bridgeParent = node.commit.parent_ids
          .map((parentId) => nodeMap.get(parentId))
          .find((parentNode) => parentNode && parentNode.lane !== node.lane);

        if (bridgeParent) {
          connectors.push({ from: bridgeParent, to: node });
        }
      });
    }

    console.log("[CommitGraph] Created nodes:", nodes.length, "lanes:", lanes.size);
    return { nodes, lanes, connectors };
  }, [workspaceBranch]);

  // Get computed CSS color values for canvas
  const getComputedColor = useCallback((cssVar: string): string => {
    const style = getComputedStyle(document.documentElement);
    const hslValue = style.getPropertyValue(cssVar).trim();
    return hslValue ? `hsl(${hslValue})` : "#888";
  }, []);

  // Get node styling based on commit properties
  const getNodeStyle = useCallback((commit: JjLogCommit) => {
    if (commit.is_working_copy) {
      return {
        color: getComputedColor("--primary"),
        borderColor: getComputedColor("--background"),
        borderWidth: 2,
      };
    }
    if (commit.bookmarks.length > 0) {
      return {
        color: getComputedColor("--primary"),
      };
    }
    return {
      color: getComputedColor("--muted-foreground"),
    };
  }, [getComputedColor]);

  // Get lane color using theme colors
  const getLaneColor = useCallback((laneName: string, chain: WorkspaceChainItem[]) => {
    const primaryColor = getComputedColor("--primary");
    const mutedColor = getComputedColor("--muted-foreground");
    
    if (chain.length === 0) {
      return primaryColor; // Single lane uses primary
    }
    if (laneName === chain[0].branch) {
      return mutedColor; // Target branch - muted
    }
    return primaryColor; // Workspace branch - primary (active work)
  }, [getComputedColor]);

  // Draw canvas
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !lanes) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size
    const width = canvas.offsetWidth;
    const height = 56;
    canvas.width = width;
    canvas.height = height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Calculate dimensions
    const padding = { left: 20, right: 180, top: 14, bottom: 14 };
    const drawWidth = width - padding.left - padding.right;
    const drawHeight = height - padding.top - padding.bottom;

    // Get max X position
    let maxX = 0;
    lanes.forEach((laneNodes) => {
      const laneMaxX = Math.max(...laneNodes.map((n) => n.x), 0);
      maxX = Math.max(maxX, laneMaxX);
    });

    const xScale = drawWidth / (maxX + 1);
    const yScale = drawHeight / 4;

    // Draw connectors between lanes to highlight divergence points
    if (laneConnections.length > 0) {
      ctx.save();
      ctx.lineWidth = 3;

      laneConnections.forEach(({ from, to }) => {
        const fromX = padding.left + from.x * xScale;
        const fromY = padding.top + from.y * yScale;
        const toX = padding.left + to.x * xScale;
        const toY = padding.top + to.y * yScale;
        const horizontalDelta = Math.abs(toX - fromX);
        const curvature = Math.min(horizontalDelta * 0.7, 120);

        ctx.beginPath();
        ctx.strokeStyle = getLaneColor(from.lane, chain);
        ctx.moveTo(fromX, fromY);
        ctx.bezierCurveTo(
          fromX + curvature,
          fromY,
          toX - curvature,
          toY,
          toX,
          toY
        );
        ctx.stroke();
      });

      ctx.restore();
    }

    // Draw each lane
    lanes.forEach((laneNodes, laneName) => {
      const color = getLaneColor(laneName, chain);

      // Draw line connecting nodes
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();

      laneNodes.forEach((node, i) => {
        const x = padding.left + node.x * xScale;
        const y = padding.top + node.y * yScale;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.stroke();

      // Draw nodes
      laneNodes.forEach((node) => {
        const x = padding.left + node.x * xScale;
        const y = padding.top + node.y * yScale;
        const nodeStyle = getNodeStyle(node.commit);

        ctx.beginPath();
        ctx.arc(x, y, 6, 0, 2 * Math.PI);
        ctx.fillStyle = nodeStyle.color;
        ctx.fill();

        if (nodeStyle.borderWidth) {
          ctx.strokeStyle = nodeStyle.borderColor || "#fff";
          ctx.lineWidth = nodeStyle.borderWidth;
          ctx.stroke();
        }

        // Highlight hovered node
        if (hoveredNode?.commit.short_id === node.commit.short_id) {
          ctx.beginPath();
          ctx.arc(x, y, 8, 0, 2 * Math.PI);
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      });

      // Draw lane label at the end
      if (laneNodes.length > 0) {
        const lastNode = laneNodes[laneNodes.length - 1];
        const x = padding.left + lastNode.x * xScale + 20;
        const y = padding.top + lastNode.y * yScale;

        ctx.fillStyle = color;
        ctx.font = "12px -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif";
        ctx.textBaseline = "middle";
        ctx.fillText(laneName, x, y);
      }
    });
  }, [
    laneConnections,
    lanes,
    chain,
    hoveredNode,
    getLaneColor,
    getNodeStyle,
    getComputedColor,
  ]);

  // Main effect to fetch data and build chart option
  useEffect(() => {
    const effectiveTargetBranch = targetBranch || workspaceBranch;

    if (!effectiveTargetBranch) {
      console.log("[CommitGraph] Skipping - no target branch or workspace branch");
      return;
    }

    const fetchAndRender = async () => {
      setLoading(true);
      setError(null);

      try {
        console.log("[CommitGraph] Building workspace chain...");
        const builtChain = buildWorkspaceChain();
        console.log("[CommitGraph] Workspace chain:", builtChain);

        console.log("[CommitGraph] Fetching commits for:", effectiveTargetBranch);
        const commitsByLane = await fetchCommitsForChain(builtChain, effectiveTargetBranch);
        console.log("[CommitGraph] Commits by lane:", commitsByLane);

        console.log("[CommitGraph] Transforming to chart data...");
        const {
          nodes,
          lanes: fetchedLanes,
          connectors,
        } = transformToChartData(builtChain, commitsByLane);
        console.log("[CommitGraph] Chart data:", { nodes: nodes.length, lanes: fetchedLanes.size });

        setLanes(fetchedLanes);
        setLaneConnections(connectors);
        setChain(builtChain);
        console.log("[CommitGraph] Data set successfully");
      } catch (err) {
        console.error("[CommitGraph] Error:", err);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };

    fetchAndRender();
  }, [workspacePath, targetBranch, workspaceBranch, allWorkspaces]);

  // Draw canvas when data changes
  useEffect(() => {
    if (lanes) {
      drawCanvas();
    }
  }, [lanes, chain, hoveredNode, drawCanvas]);

  // Redraw on window resize
  useEffect(() => {
    const handleResize = () => {
      if (lanes) {
        drawCanvas();
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [lanes, drawCanvas]);

  // Handle mouse move for hover detection
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !lanes) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Store coordinates relative to the container so the tooltip follows the cursor
    setMousePos({ x: mouseX, y: mouseY });

    // Calculate dimensions (same as in drawCanvas)
    const width = canvas.width;
    const height = canvas.height;
    const padding = { left: 20, right: 180, top: 20, bottom: 20 };
    const drawWidth = width - padding.left - padding.right;
    const drawHeight = height - padding.top - padding.bottom;

    let maxX = 0;
    lanes.forEach((laneNodes) => {
      const laneMaxX = Math.max(...laneNodes.map((n) => n.x), 0);
      maxX = Math.max(maxX, laneMaxX);
    });

    const xScale = drawWidth / (maxX + 1);
    const yScale = drawHeight / 3;

    // Check if mouse is over any node
    let foundNode: ChartCommitNode | null = null;
    lanes.forEach((laneNodes) => {
      laneNodes.forEach((node) => {
        const x = padding.left + node.x * xScale;
        const y = padding.top + node.y * yScale;
        const distance = Math.sqrt((mouseX - x) ** 2 + (mouseY - y) ** 2);

        if (distance < 8) {
          foundNode = node;
        }
      });
    });

    setHoveredNode(foundNode);
  }, [lanes]);

  const handleMouseLeave = useCallback(() => {
    setHoveredNode(null);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[56px] text-sm text-muted-foreground">
        Loading commit history...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[56px] text-sm text-destructive">
        Error: {error}
      </div>
    );
  }

  if (!lanes) {
    return (
      <div className="flex items-center justify-center h-[56px] text-sm text-muted-foreground">
        No commits to display
      </div>
    );
  }

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ width: "100%", height: "56px", cursor: hoveredNode ? "pointer" : "default" }}
      />
      {hoveredNode && (
        <div
          className="absolute z-50 px-3 py-2 text-sm bg-popover text-popover-foreground border rounded-md shadow-md pointer-events-none"
          style={{
            left: mousePos.x + 10,
            top: mousePos.y + 10,
          }}
        >
          <div className="font-semibold">{hoveredNode.commit.short_id}</div>
          <div>{hoveredNode.commit.description}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {hoveredNode.commit.author_name}
          </div>
          <div className="text-xs text-muted-foreground">
            {hoveredNode.commit.timestamp}
          </div>
        </div>
      )}
    </div>
  );
});
