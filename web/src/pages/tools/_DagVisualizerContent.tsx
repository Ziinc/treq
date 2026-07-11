import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  KeyboardEvent,
} from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  Handle,
  Position,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  MarkerType,
} from '@xyflow/react';
import type {
  Node,
  Edge,
  Connection,
  OnConnect,
  NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useLocation, useHistory } from '@docusaurus/router';
import dagre from '@dagrejs/dagre';
import styles from './dag-visualizer.module.css';

// ── Types ─────────────────────────────────────────────────────────────────────

export type WorkflowNodeData = {
  name: string;
  prompt: string;
  skills: string[];
};

type WorkflowNode = Node<WorkflowNodeData, 'workflow'>;

interface SerializedState {
  nodes: Array<{ id: string; position: { x: number; y: number }; data: WorkflowNodeData }>;
  edges: Array<{ id: string; source: string; target: string }>;
}

// ── Skill suggestions ─────────────────────────────────────────────────────────

const SKILL_SUGGESTIONS = [
  '/code-review',
  '/run-tests',
  '/lint',
  '/deploy',
  '/summarize',
  '/generate-docs',
  '/security-review',
  '/optimize',
  '/refactor',
  '/document',
  '/analyze',
  '/plan',
  '/branch-visualizer',
];

// ── Dagre auto-layout ─────────────────────────────────────────────────────────

const NODE_W = 240;
const NODE_H = 130;

function applyDagreLayout<T extends Node>(
  nodes: T[],
  edges: Edge[],
): T[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', ranksep: 80, nodesep: 40 });

  nodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  edges.forEach((e) => g.setEdge(e.source, e.target));

  dagre.layout(g);

  return nodes.map((n) => {
    const { x, y } = g.node(n.id);
    return { ...n, position: { x: x - NODE_W / 2, y: y - NODE_H / 2 } };
  });
}

// ── Default state ─────────────────────────────────────────────────────────────

const DEFAULT_NODES: WorkflowNode[] = [
  {
    id: 'n1',
    type: 'workflow',
    position: { x: 0, y: 80 },
    data: {
      name: 'Requirements',
      prompt:
        'Analyze the user story and acceptance criteria. Identify ambiguities and list open questions.',
      skills: ['/analyze', '/summarize'],
    },
  },
  {
    id: 'n2',
    type: 'workflow',
    position: { x: 320, y: 80 },
    data: {
      name: 'Architecture',
      prompt:
        'Design the system architecture. Choose appropriate patterns and data models.',
      skills: ['/plan', '/document'],
    },
  },
  {
    id: 'n3',
    type: 'workflow',
    position: { x: 640, y: 20 },
    data: {
      name: 'Implementation',
      prompt:
        'Write the feature code following the architecture spec. Keep functions small and testable.',
      skills: ['/lint', '/optimize'],
    },
  },
  {
    id: 'n4',
    type: 'workflow',
    position: { x: 640, y: 160 },
    data: {
      name: 'Tests',
      prompt:
        'Write unit and integration tests covering happy paths and edge cases.',
      skills: ['/run-tests', '/generate-docs'],
    },
  },
  {
    id: 'n5',
    type: 'workflow',
    position: { x: 960, y: 80 },
    data: {
      name: 'Code Review',
      prompt:
        'Review the diff for correctness, security issues, and style violations.',
      skills: ['/code-review', '/security-review'],
    },
  },
  {
    id: 'n6',
    type: 'workflow',
    position: { x: 1280, y: 80 },
    data: {
      name: 'Deploy',
      prompt:
        'Deploy to staging, run smoke tests, then promote to production.',
      skills: ['/deploy', '/run-tests'],
    },
  },
];

const DEFAULT_EDGES: Edge[] = [
  { id: 'e1-2', source: 'n1', target: 'n2' },
  { id: 'e2-3', source: 'n2', target: 'n3' },
  { id: 'e2-4', source: 'n2', target: 'n4' },
  { id: 'e3-5', source: 'n3', target: 'n5' },
  { id: 'e4-5', source: 'n4', target: 'n5' },
  { id: 'e5-6', source: 'n5', target: 'n6' },
];

const EDGE_DEFAULTS = {
  type: 'smoothstep' as const,
  animated: true,
  markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' },
  style: { stroke: '#6366f1', strokeWidth: 2 },
};

// ── URL serialisation ─────────────────────────────────────────────────────────

function encodeState(nodes: Node[], edges: Edge[]): string {
  const state: SerializedState = {
    nodes: nodes.map((n) => ({
      id: n.id,
      position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
      data: n.data as WorkflowNodeData,
    })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
  };
  return btoa(encodeURIComponent(JSON.stringify(state)));
}

function decodeState(raw: string): SerializedState | null {
  try {
    return JSON.parse(decodeURIComponent(atob(raw)));
  } catch {
    return null;
  }
}

function stateToNodes(s: SerializedState): WorkflowNode[] {
  return s.nodes.map((n) => ({
    id: n.id,
    type: 'workflow' as const,
    position: n.position,
    data: n.data,
  }));
}

function stateToEdges(s: SerializedState): Edge[] {
  return s.edges.map((e) => ({ ...e, ...EDGE_DEFAULTS }));
}

// ── Custom WorkflowNode ───────────────────────────────────────────────────────

function WorkflowNode({ data, selected }: NodeProps<WorkflowNode>) {
  return (
    <div className={`${styles.node} ${selected ? styles.nodeSelected : ''}`}>
      <Handle type="target" position={Position.Left} className={styles.handle} />

      <div className={styles.nodeHeader}>
        <span className={styles.nodeName}>{data.name}</span>
      </div>

      {data.prompt && (
        <div className={styles.nodePrompt}>
          {data.prompt.length > 80 ? data.prompt.slice(0, 77) + '…' : data.prompt}
        </div>
      )}

      {data.skills.length > 0 && (
        <div className={styles.nodeSkills}>
          {data.skills.map((s) => (
            <span key={s} className={styles.skill}>{s}</span>
          ))}
        </div>
      )}

      <Handle type="source" position={Position.Right} className={styles.handle} />
    </div>
  );
}

const nodeTypes = { workflow: WorkflowNode };

// ── Skill input with autocomplete ─────────────────────────────────────────────

function SkillInput({ onAdd }: { onAdd: (skill: string) => void }) {
  const [val, setVal] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = val
    ? SKILL_SUGGESTIONS.filter(
        (s) => s.includes(val.toLowerCase()) || val.toLowerCase().includes(s.slice(1, 4)),
      )
    : SKILL_SUGGESTIONS;

  const commit = (s: string) => {
    const trimmed = s.trim();
    if (!trimmed) return;
    onAdd(trimmed.startsWith('/') ? trimmed : `/${trimmed}`);
    setVal('');
    setOpen(false);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commit(val);
    if (e.key === 'Escape') setOpen(false);
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as HTMLElement)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className={styles.skillInputWrap} ref={ref}>
      <div className={styles.skillInputRow}>
        <input
          className={styles.skillInput}
          value={val}
          placeholder="/skill-name"
          onChange={(e) => { setVal(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
        />
        <button className={styles.addSkillBtn} onClick={() => commit(val)}>Add</button>
      </div>
      {open && filtered.length > 0 && (
        <div className={styles.skillDropdown}>
          {filtered.map((s) => (
            <div
              key={s}
              className={styles.skillOption}
              onMouseDown={() => commit(s)}
            >
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Node detail panel ─────────────────────────────────────────────────────────

interface PanelProps {
  node: WorkflowNode;
  onChange: (id: string, data: Partial<WorkflowNodeData>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

function NodeDetailPanel({ node, onChange, onDelete, onClose }: PanelProps) {
  const { data, id } = node;

  return (
    <div className={styles.detailPanel}>
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>Edit Node</span>
        <button className={styles.panelClose} onClick={onClose} aria-label="Close panel">✕</button>
      </div>

      <div className={styles.panelBody}>
        <label className={styles.fieldLabel}>Name</label>
        <input
          className={styles.fieldInput}
          value={data.name}
          onChange={(e) => onChange(id, { name: e.target.value })}
        />

        <label className={styles.fieldLabel}>Prompt</label>
        <textarea
          className={styles.fieldTextarea}
          rows={6}
          value={data.prompt}
          onChange={(e) => onChange(id, { prompt: e.target.value })}
          placeholder="Describe what the AI agent should do at this step…"
        />

        <label className={styles.fieldLabel}>Slash Skills</label>
        <div className={styles.skillTags}>
          {data.skills.map((s) => (
            <span key={s} className={styles.skillTag}>
              {s}
              <button
                className={styles.skillRemove}
                onClick={() => onChange(id, { skills: data.skills.filter((x) => x !== s) })}
                aria-label={`Remove ${s}`}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
        <SkillInput
          onAdd={(skill) => {
            if (!data.skills.includes(skill)) onChange(id, { skills: [...data.skills, skill] });
          }}
        />
      </div>

      <div className={styles.panelFooter}>
        <button
          className={styles.deleteBtn}
          onClick={() => onDelete(id)}
        >
          Delete node
        </button>
      </div>
    </div>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const show = useCallback((m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 2500);
  }, []);
  return { msg, show };
}

// ── Canvas (needs to be inside ReactFlowProvider) ─────────────────────────────

function DagCanvas() {
  const location = useLocation();
  const history = useHistory();
  const { fitView } = useReactFlow();
  const { msg: toast, show: showToast } = useToast();

  // Initialise from URL or default (computed once on mount)
  const initialNodes = useMemo<WorkflowNode[]>(() => {
    const params = new URLSearchParams(location.search);
    const raw = params.get('s');
    if (raw) { const s = decodeState(raw); if (s) return stateToNodes(s); }
    return DEFAULT_NODES;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initialEdges = useMemo<Edge[]>(() => {
    const params = new URLSearchParams(location.search);
    const raw = params.get('s');
    if (raw) { const s = decodeState(raw); if (s) return stateToEdges(s); }
    return DEFAULT_EDGES.map((e) => ({ ...e, ...EDGE_DEFAULTS }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedNode = nodes.find((n) => n.id === selectedId) as WorkflowNode | undefined;

  // Sync state → URL (debounced)
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      const params = new URLSearchParams();
      params.set('s', encodeState(nodes, edges));
      history.replace({ search: params.toString() });
    }, 600);
    return () => { if (syncTimer.current) clearTimeout(syncTimer.current); };
  }, [nodes, edges]);

  // Connect handler
  const onConnect: OnConnect = useCallback(
    (conn: Connection) =>
      setEdges((eds) =>
        addEdge({ ...conn, ...EDGE_DEFAULTS, id: `e${conn.source}-${conn.target}` }, eds),
      ),
    [setEdges],
  );

  // Add node
  const addNode = useCallback(() => {
    const maxX = nodes.reduce((m, n) => Math.max(m, n.position.x), 0);
    const id = `n${Date.now()}`;
    const newNode: WorkflowNode = {
      id,
      type: 'workflow',
      position: { x: maxX + 320, y: 80 },
      data: { name: 'New Step', prompt: '', skills: [] },
    };
    setNodes((nds) => [...nds, newNode]);
    setSelectedId(id);
  }, [nodes, setNodes]);

  // Update node data
  const updateNode = useCallback((id: string, patch: Partial<WorkflowNodeData>) => {
    setNodes((nds) =>
      nds.map((n) => (n.id === id ? { ...n, data: { ...n.data as WorkflowNodeData, ...patch } } : n)),
    );
  }, [setNodes]);

  // Delete node
  const deleteNode = useCallback((id: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    setSelectedId(null);
  }, [setNodes, setEdges]);

  // Auto-layout (dagre LR)
  const formatLayout = useCallback(() => {
    setNodes((nds) => applyDagreLayout(nds, edges));
    requestAnimationFrame(() => fitView({ padding: 0.12, duration: 400 }));
  }, [edges, setNodes, fitView]);

  // Copy shareable link
  const copyLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href).then(() =>
      showToast('Link copied to clipboard!'),
    );
  }, [showToast]);

  // Deselect on canvas click
  const onPaneClick = useCallback(() => setSelectedId(null), []);

  // Select node on click
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedId(node.id);
  }, []);

  return (
    <div className={`${styles.workspace} ${selectedNode ? styles.hasPanel : ''}`}>
      {toast && <div className={styles.toast}>{toast}</div>}

      <div className={styles.flowContainer}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.12 }}
          deleteKeyCode="Delete"
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="var(--ifm-color-emphasis-300)" />
          <Controls />
          <MiniMap
            nodeColor={() => '#6366f1'}
            maskColor="rgba(0,0,0,0.06)"
          />

          <Panel position="top-left" className={styles.toolbar}>
            <button className={styles.toolbarBtn} onClick={addNode}>
              + Add node
            </button>
            <button className={styles.toolbarBtn} onClick={formatLayout}>
              ⊞ Format
            </button>
            <button className={styles.toolbarBtn} onClick={copyLink}>
              🔗 Copy link
            </button>
          </Panel>
        </ReactFlow>
      </div>

      {selectedNode && (
        <NodeDetailPanel
          node={selectedNode}
          onChange={updateNode}
          onDelete={deleteNode}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

// ── Public export (wrapped in provider) ──────────────────────────────────────

export function DagVisualizerContent() {
  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div className={styles.breadcrumb}>
          <a href="/tools">Tools</a>
          <span> / </span>
          <span>DAG Visualizer</span>
        </div>
        <h1 className={styles.pageTitle}>DAG Visualizer</h1>
        <p className={styles.pageSubtitle}>
          Map AI-aided engineering workflows as interactive graphs. Drag nodes and edges to reshape.
          Click any node to edit its prompt and slash skills. Share via URL.
        </p>
      </div>

      <ReactFlowProvider>
        <DagCanvas />
      </ReactFlowProvider>
    </div>
  );
}
