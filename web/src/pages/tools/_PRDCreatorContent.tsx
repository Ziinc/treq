import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Plus, X, ChevronDown, FileText, Image, ClipboardCopy, Trash2,
} from 'lucide-react';
import styles from './prd-creator.module.css';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Competitor {
  name: string;
  strengths: string;
  weaknesses: string;
  notes: string;
}

interface UserStory {
  persona: string;
  action: string;
  benefit: string;
}

interface PRDOption {
  title: string;
  description: string;
  pros: string[];
  cons: string[];
}

interface Phase {
  phase: string;
  description: string;
  timeline: string;
}

interface CheckItem {
  text: string;
  done: boolean;
}

interface PRD {
  id: string;
  title: string;
  created: number;
  modified: number;
  overview: string;
  competitors: Competitor[];
  userStories: UserStory[];
  options: PRDOption[];
  plan: Phase[];
  criteria: CheckItem[];
  tasks: CheckItem[];
  notes: string;
  collapsed: Record<string, boolean>;
}

// ── Storage helpers ───────────────────────────────────────────────────────────

const STORE_KEY = 'prd-studio-v1';

function loadPRDs(): PRD[] {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]') as PRD[];
  } catch {
    return [];
  }
}

function savePRDs(prds: PRD[]) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(prds));
  } catch {}
}

function mkId() {
  return 'prd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
}

function mkPRD(): PRD {
  return {
    id: mkId(),
    title: '',
    created: Date.now(),
    modified: Date.now(),
    overview: '',
    competitors: [{ name: '', strengths: '', weaknesses: '', notes: '' }],
    userStories: [{ persona: '', action: '', benefit: '' }],
    options: [{ title: '', description: '', pros: [''], cons: [''] }],
    plan: [{ phase: '', description: '', timeline: '' }],
    criteria: [{ text: '', done: false }],
    tasks: [{ text: '', done: false }],
    notes: '',
    collapsed: {},
  };
}

function fmtDate(ts: number) {
  const d = new Date(ts);
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return Math.floor(diff / 60_000) + 'm ago';
  if (diff < 86_400_000) return Math.floor(diff / 3_600_000) + 'h ago';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Auto-resize textarea hook ─────────────────────────────────────────────────

function useAutoResize(dep: unknown) {
  useEffect(() => {
    document.querySelectorAll<HTMLTextAreaElement>('textarea[data-auto]').forEach((el) => {
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
    });
  }, [dep]);
}

// ── Section wrapper ───────────────────────────────────────────────────────────

interface SectionProps {
  num: number;
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function Section({ num, title, collapsed, onToggle, children }: SectionProps) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionHead} onClick={onToggle}>
        <span className={styles.sectionNum}>{String(num).padStart(2, '0')}</span>
        <span className={styles.sectionTitle}>{title}</span>
        <ChevronDown
          size={14}
          className={styles.sectionCaret}
          style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
        />
      </div>
      {!collapsed && <div className={styles.sectionBody}>{children}</div>}
    </div>
  );
}

// ── Markdown export ───────────────────────────────────────────────────────────

function toMarkdown(p: PRD): string {
  let md = `# ${p.title || 'Untitled PRD'}\n_${new Date(p.created).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}_\n\n`;

  if (p.overview?.trim())
    md += `## Overview\n\n${p.overview}\n\n`;

  const comps = p.competitors.filter((c) => c.name?.trim());
  if (comps.length) {
    md += `## Competitor Analysis\n\n| Competitor | Strengths | Weaknesses | Notes |\n|---|---|---|---|\n`;
    comps.forEach((c) => { md += `| ${c.name} | ${c.strengths ?? ''} | ${c.weaknesses ?? ''} | ${c.notes ?? ''} |\n`; });
    md += '\n';
  }

  const stories = p.userStories.filter((s) => s.persona?.trim() || s.action?.trim());
  if (stories.length) {
    md += `## User Stories\n\n`;
    stories.forEach((s) => { md += `- As a **${s.persona || '…'}**, I want to **${s.action || '…'}**, so that **${s.benefit || '…'}**\n`; });
    md += '\n';
  }

  const opts = p.options.filter((o) => o.title?.trim());
  if (opts.length) {
    md += `## Options\n\n`;
    opts.forEach((o, i) => {
      md += `### Option ${i + 1}: ${o.title}\n\n`;
      if (o.description?.trim()) md += `${o.description}\n\n`;
      const pros = o.pros.filter((x) => x?.trim());
      const cons = o.cons.filter((x) => x?.trim());
      if (pros.length) { md += `**Pros**\n`; pros.forEach((x) => { md += `- ${x}\n`; }); md += '\n'; }
      if (cons.length) { md += `**Cons**\n`; cons.forEach((x) => { md += `- ${x}\n`; }); md += '\n'; }
    });
  }

  const phases = p.plan.filter((ph) => ph.phase?.trim());
  if (phases.length) {
    md += `## Implementation Plan\n\n`;
    phases.forEach((ph, i) => {
      md += `### Phase ${i + 1}: ${ph.phase}${ph.timeline ? ` _(${ph.timeline})_` : ''}\n\n`;
      if (ph.description?.trim()) md += `${ph.description}\n\n`;
    });
  }

  const crit = p.criteria.filter((c) => c.text?.trim());
  if (crit.length) {
    md += `## Completion Criteria\n\n`;
    crit.forEach((c) => { md += `- [${c.done ? 'x' : ' '}] ${c.text}\n`; });
    md += '\n';
  }

  const tasks = p.tasks.filter((t) => t.text?.trim());
  if (tasks.length || p.notes?.trim()) {
    md += `## Follow-up\n\n`;
    if (tasks.length) { md += `### Tasks\n\n`; tasks.forEach((t) => { md += `- [${t.done ? 'x' : ' '}] ${t.text}\n`; }); md += '\n'; }
    if (p.notes?.trim()) md += `### Notes\n\n${p.notes}\n\n`;
  }

  return md;
}

// ── Canvas export ─────────────────────────────────────────────────────────────

function renderToCanvas(p: PRD): HTMLCanvasElement {
  const SC = 2, W = 960, M = 60, CW = W - M * 2;
  const LH = 1.6;

  const C = {
    bg: '#FFFFFF', text: '#1A1816', sub: '#6B6560', light: '#9E9890',
    accent: '#1A5C40', mid: '#2D8A62', alight: '#EAF4EE',
    danger: '#B83B2A', border: '#E2DED8',
  };

  const mc = document.createElement('canvas');
  mc.width = W; mc.height = 200;
  const mx = mc.getContext('2d')!;

  function countLines(ctx: CanvasRenderingContext2D, text: string, maxW: number, font: string) {
    if (!text?.trim()) return 0;
    ctx.font = font;
    const words = text.trim().split(/\s+/);
    let lines = 1, line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) { lines++; line = w; } else line = t;
    }
    return lines;
  }

  function textH(ctx: CanvasRenderingContext2D, text: string, maxW: number, sz: number) {
    return countLines(ctx, text, maxW, `${sz}px system-ui`) * sz * LH;
  }

  let H = M + 40 + 20 + 1 + 24;
  if (p.overview?.trim()) H += 36 + textH(mx, p.overview, CW, 14) + 20;
  const comps = p.competitors.filter((c) => c.name?.trim());
  if (comps.length) { H += 36 + 20 + comps.length * 48 + 20; }
  const stories = p.userStories.filter((s) => s.persona?.trim() || s.action?.trim());
  stories.forEach((s) => { H += textH(mx, `As a ${s.persona||'…'}, I want to ${s.action||'…'}, so that ${s.benefit||'…'}.`, CW - 16, 13) + 12; });
  if (stories.length) H += 36 + 20;
  const opts = p.options.filter((o) => o.title?.trim());
  if (opts.length) {
    H += 36 + 8;
    opts.forEach((o) => {
      H += 32 + (o.description?.trim() ? textH(mx, o.description, CW, 13) + 8 : 0) +
           Math.max(o.pros.filter((x) => x?.trim()).length, o.cons.filter((x) => x?.trim()).length) * 20 + 40;
    });
    H += 12;
  }
  const phases = p.plan.filter((ph) => ph.phase?.trim());
  if (phases.length) {
    H += 36 + 8;
    phases.forEach((ph) => { H += 28 + (ph.description?.trim() ? textH(mx, ph.description, CW - 32, 13) + 4 : 0) + 16; });
    H += 12;
  }
  const crit = p.criteria.filter((c) => c.text?.trim());
  if (crit.length) H += 36 + 8 + crit.length * 22 + 20;
  const tasks = p.tasks.filter((t) => t.text?.trim());
  if (tasks.length || p.notes?.trim()) {
    H += 36 + 8;
    if (tasks.length) H += tasks.length * 22 + 12;
    if (p.notes?.trim()) H += 20 + textH(mx, p.notes, CW, 13) + 8;
    H += 12;
  }
  H += M;

  const canvas = document.createElement('canvas');
  canvas.width = W * SC; canvas.height = H * SC;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SC, SC);
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);

  function drawText(text: string, x: number, y: number, maxW: number, sz: number, weight: string, color: string, lh = LH) {
    if (!text?.trim()) return y;
    ctx.font = `${weight} ${sz}px system-ui`;
    ctx.fillStyle = color;
    const words = text.trim().split(/\s+/);
    let line = '', cy = y;
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, cy); cy += sz * lh; line = w; } else line = t;
    }
    if (line) { ctx.fillText(line, x, cy); cy += sz * lh; }
    return cy;
  }

  function secHeader(label: string, y: number) {
    ctx.fillStyle = C.accent; ctx.fillRect(M, y, 3, 24);
    ctx.font = 'bold 14px Georgia,serif'; ctx.fillStyle = C.text;
    ctx.fillText(label, M + 12, y + 17);
    ctx.fillStyle = C.border; ctx.fillRect(M, y + 26, CW, 1);
    return y + 36;
  }

  function checkbox(x: number, y: number, checked: boolean) {
    ctx.strokeStyle = checked ? C.accent : C.border;
    ctx.lineWidth = 1.5; ctx.strokeRect(x, y, 14, 14);
    if (checked) {
      ctx.fillStyle = C.accent; ctx.fillRect(x, y, 14, 14);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 3, y + 7); ctx.lineTo(x + 6, y + 11); ctx.lineTo(x + 11, y + 4); ctx.stroke();
    }
    ctx.lineWidth = 1;
  }

  let y = M;

  ctx.font = 'bold 28px Georgia,serif'; ctx.fillStyle = C.text;
  ctx.fillText(p.title || 'Untitled PRD', M, y + 28); y += 42;
  ctx.font = '12px system-ui'; ctx.fillStyle = C.light;
  ctx.fillText('PRD · ' + new Date(p.created).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), M, y);
  y += 18; ctx.fillStyle = C.border; ctx.fillRect(M, y, CW, 1); y += 24;

  if (p.overview?.trim()) {
    y = secHeader('Overview', y);
    y = drawText(p.overview, M, y + 2, CW, 14, 'normal', C.text) + 16;
  }

  if (comps.length) {
    y = secHeader('Competitor Analysis', y); y += 4;
    const cw = [CW * 0.22, CW * 0.30, CW * 0.30, CW * 0.18];
    const cx = [M, M + cw[0], M + cw[0] + cw[1], M + cw[0] + cw[1] + cw[2]];
    ctx.font = 'bold 9px system-ui'; ctx.fillStyle = C.light;
    ['COMPETITOR', 'STRENGTHS', 'WEAKNESSES', 'NOTES'].forEach((h, i) => ctx.fillText(h, cx[i], y));
    y += 4; ctx.fillStyle = C.border; ctx.fillRect(M, y, CW, 1); y += 12;
    comps.forEach((comp) => {
      ctx.font = 'bold 13px system-ui'; ctx.fillStyle = C.text; ctx.fillText(comp.name, cx[0], y + 13);
      const sY = drawText(comp.strengths, cx[1], y + 2, cw[1] - 12, 12, 'normal', C.mid);
      const wY = drawText(comp.weaknesses, cx[2], y + 2, cw[2] - 12, 12, 'normal', C.danger);
      drawText(comp.notes, cx[3], y + 2, cw[3] - 4, 12, 'normal', C.sub);
      y = Math.max(y + 28, sY, wY) + 10;
      ctx.fillStyle = C.border; ctx.fillRect(M, y - 4, CW, 1);
    });
    y += 16;
  }

  if (stories.length) {
    y = secHeader('User Stories', y); y += 4;
    stories.forEach((s) => {
      ctx.fillStyle = C.mid; ctx.beginPath(); ctx.arc(M + 5, y + 7, 3.5, 0, Math.PI * 2); ctx.fill();
      const line = `As a ${s.persona || '…'}, I want to ${s.action || '…'}, so that ${s.benefit || '…'}.`;
      y = drawText(line, M + 16, y, CW - 16, 13, 'normal', C.text) + 10;
    });
    y += 10;
  }

  if (opts.length) {
    y = secHeader('Options', y); y += 8;
    opts.forEach((o, i) => {
      ctx.fillStyle = C.alight; ctx.fillRect(M, y, CW, 28);
      ctx.font = 'bold 9px system-ui'; ctx.fillStyle = C.mid; ctx.fillText(`OPTION ${i + 1}`, M + 12, y + 18);
      ctx.font = 'bold 13px Georgia,serif'; ctx.fillStyle = C.text; ctx.fillText(o.title, M + 80, y + 18);
      y += 32;
      if (o.description?.trim()) y = drawText(o.description, M, y + 2, CW, 13, 'normal', C.sub) + 10;
      const pros = o.pros.filter((x) => x?.trim());
      const cons = o.cons.filter((x) => x?.trim());
      const hw = (CW - 20) / 2, px = M, cx2 = M + hw + 20;
      let py = y, cy2 = y;
      ctx.font = 'bold 10px system-ui'; ctx.fillStyle = C.mid; ctx.fillText('PROS', px, py); py += 16;
      pros.forEach((pr) => { ctx.fillStyle = C.mid; ctx.beginPath(); ctx.arc(px + 5, py + 3, 3, 0, Math.PI * 2); ctx.fill(); py = drawText(pr, px + 14, py - 2, hw - 14, 12, 'normal', C.text) + 4; });
      ctx.font = 'bold 10px system-ui'; ctx.fillStyle = C.danger; ctx.fillText('CONS', cx2, cy2); cy2 += 16;
      cons.forEach((co) => { ctx.fillStyle = C.danger; ctx.beginPath(); ctx.arc(cx2 + 5, cy2 + 3, 3, 0, Math.PI * 2); ctx.fill(); cy2 = drawText(co, cx2 + 14, cy2 - 2, hw - 14, 12, 'normal', C.text) + 4; });
      y = Math.max(py, cy2) + 16;
      if (i < opts.length - 1) { ctx.fillStyle = C.border; ctx.fillRect(M, y - 8, CW, 1); }
    });
    y += 12;
  }

  if (phases.length) {
    y = secHeader('Implementation Plan', y); y += 8;
    phases.forEach((ph, i) => {
      ctx.fillStyle = C.accent; ctx.beginPath(); ctx.arc(M + 11, y + 13, 11, 0, Math.PI * 2); ctx.fill();
      ctx.font = 'bold 11px system-ui'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), M + 11, y + 17); ctx.textAlign = 'left';
      ctx.font = 'bold 14px Georgia,serif'; ctx.fillStyle = C.text; ctx.fillText(ph.phase, M + 28, y + 18);
      if (ph.timeline) {
        ctx.font = '11px system-ui'; ctx.fillStyle = C.light;
        const tw = ctx.measureText(ph.phase).width;
        ctx.fillText(' · ' + ph.timeline, M + 28 + tw + 4, y + 18);
      }
      y += 28;
      if (ph.description?.trim()) y = drawText(ph.description, M + 28, y, CW - 28, 13, 'normal', C.sub) + 6;
      y += 14;
    });
    y += 8;
  }

  if (crit.length) {
    y = secHeader('Completion Criteria', y); y += 8;
    crit.forEach((c) => { checkbox(M, y + 2, c.done); ctx.font = '13px system-ui'; ctx.fillStyle = c.done ? C.light : C.text; ctx.fillText(c.text, M + 22, y + 14); y += 22; });
    y += 12;
  }

  if (tasks.length || p.notes?.trim()) {
    y = secHeader('Follow-up Tasks & Notes', y); y += 8;
    tasks.forEach((t) => { checkbox(M, y + 2, t.done); ctx.font = '13px system-ui'; ctx.fillStyle = t.done ? C.light : C.text; ctx.fillText(t.text, M + 22, y + 14); y += 22; });
    if (tasks.length) y += 8;
    if (p.notes?.trim()) {
      ctx.font = 'bold 10px system-ui'; ctx.fillStyle = C.light; ctx.fillText('NOTES', M, y); y += 16;
      drawText(p.notes, M, y, CW, 13, 'normal', C.sub);
    }
    y += 12;
  }

  ctx.fillStyle = C.border; ctx.fillRect(M, y + 4, CW, 1); y += 14;
  ctx.font = '11px system-ui'; ctx.fillStyle = C.light;
  ctx.fillText('Generated by PRD Studio', M, y);
  ctx.textAlign = 'right';
  ctx.fillText(new Date().toLocaleDateString(), M + CW, y);
  ctx.textAlign = 'left';

  return canvas;
}

// ── Main component ────────────────────────────────────────────────────────────

export function PRDCreatorContent() {
  const [prds, setPRDs] = useState<PRD[]>(() => loadPRDs());
  const [currentId, setCurrentId] = useState<string | null>(() => {
    const stored = loadPRDs();
    return stored.length ? stored[0].id : null;
  });
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [exportOpen, setExportOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, forceUpdate] = useState(0);

  const current = prds.find((p) => p.id === currentId) ?? null;

  useAutoResize(current);

  // Save to localStorage whenever prds changes
  useEffect(() => { savePRDs(prds); }, [prds]);

  const scheduleSave = useCallback(() => {
    setSaveStatus('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setPRDs((prev) => {
        const next = prev.map((p) =>
          p.id === currentId ? { ...p, modified: Date.now() } : p
        );
        savePRDs(next);
        return next;
      });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }, 900);
  }, [currentId]);

  function showToast(msg: string) {
    setToastMsg(msg);
    setToastVisible(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastVisible(false), 2400);
  }

  // Mutate current PRD's field immutably
  function updateCurrent(updater: (p: PRD) => PRD) {
    setPRDs((prev) => prev.map((p) => (p.id === currentId ? updater(p) : p)));
    scheduleSave();
  }

  function newPRD() {
    const p = mkPRD();
    setPRDs((prev) => [p, ...prev]);
    setCurrentId(p.id);
    setTimeout(() => document.getElementById('prd-title-input')?.focus(), 50);
  }

  function deletePRD(id: string) {
    if (!window.confirm('Delete this PRD?')) return;
    setPRDs((prev) => prev.filter((p) => p.id !== id));
    if (currentId === id) {
      const remaining = prds.filter((p) => p.id !== id);
      setCurrentId(remaining.length ? remaining[0].id : null);
    }
    showToast('PRD deleted');
  }

  function toggleSection(key: string) {
    if (!current) return;
    updateCurrent((p) => ({ ...p, collapsed: { ...p.collapsed, [key]: !p.collapsed[key] } }));
  }

  // ── Competitor helpers ──────────────────────────────────────────────────────

  function setCompField(i: number, field: keyof Competitor, val: string) {
    updateCurrent((p) => {
      const competitors = p.competitors.map((c, idx) => idx === i ? { ...c, [field]: val } : c);
      return { ...p, competitors };
    });
  }

  function addComp() { updateCurrent((p) => ({ ...p, competitors: [...p.competitors, { name: '', strengths: '', weaknesses: '', notes: '' }] })); }
  function delComp(i: number) {
    if ((current?.competitors.length ?? 0) <= 1) return;
    updateCurrent((p) => ({ ...p, competitors: p.competitors.filter((_, idx) => idx !== i) }));
  }

  // ── Story helpers ───────────────────────────────────────────────────────────

  function setStoryField(i: number, field: keyof UserStory, val: string) {
    updateCurrent((p) => {
      const userStories = p.userStories.map((s, idx) => idx === i ? { ...s, [field]: val } : s);
      return { ...p, userStories };
    });
  }

  function addStory() { updateCurrent((p) => ({ ...p, userStories: [...p.userStories, { persona: '', action: '', benefit: '' }] })); }
  function delStory(i: number) {
    if ((current?.userStories.length ?? 0) <= 1) return;
    updateCurrent((p) => ({ ...p, userStories: p.userStories.filter((_, idx) => idx !== i) }));
  }

  // ── Option helpers ──────────────────────────────────────────────────────────

  function setOptField(i: number, field: 'title' | 'description', val: string) {
    updateCurrent((p) => {
      const options = p.options.map((o, idx) => idx === i ? { ...o, [field]: val } : o);
      return { ...p, options };
    });
  }

  function setBullet(i: number, type: 'pros' | 'cons', j: number, val: string) {
    updateCurrent((p) => {
      const options = p.options.map((o, idx) => {
        if (idx !== i) return o;
        const list = [...o[type]];
        list[j] = val;
        return { ...o, [type]: list };
      });
      return { ...p, options };
    });
  }

  function addBullet(i: number, type: 'pros' | 'cons') {
    updateCurrent((p) => {
      const options = p.options.map((o, idx) =>
        idx === i ? { ...o, [type]: [...o[type], ''] } : o
      );
      return { ...p, options };
    });
  }

  function delBullet(i: number, type: 'pros' | 'cons', j: number) {
    updateCurrent((p) => {
      const options = p.options.map((o, idx) => {
        if (idx !== i || o[type].length <= 1) return o;
        return { ...o, [type]: o[type].filter((_, k) => k !== j) };
      });
      return { ...p, options };
    });
  }

  function addOpt() { updateCurrent((p) => ({ ...p, options: [...p.options, { title: '', description: '', pros: [''], cons: [''] }] })); }
  function delOpt(i: number) {
    if ((current?.options.length ?? 0) <= 1) return;
    updateCurrent((p) => ({ ...p, options: p.options.filter((_, idx) => idx !== i) }));
  }

  // ── Plan helpers ────────────────────────────────────────────────────────────

  function setPhaseField(i: number, field: keyof Phase, val: string) {
    updateCurrent((p) => {
      const plan = p.plan.map((ph, idx) => idx === i ? { ...ph, [field]: val } : ph);
      return { ...p, plan };
    });
  }

  function addPhase() { updateCurrent((p) => ({ ...p, plan: [...p.plan, { phase: '', description: '', timeline: '' }] })); }
  function delPhase(i: number) {
    if ((current?.plan.length ?? 0) <= 1) return;
    updateCurrent((p) => ({ ...p, plan: p.plan.filter((_, idx) => idx !== i) }));
  }

  // ── Criteria / task helpers ─────────────────────────────────────────────────

  function setCheckField(section: 'criteria' | 'tasks', i: number, field: 'text' | 'done', val: string | boolean) {
    updateCurrent((p) => {
      const list = p[section].map((c, idx) => idx === i ? { ...c, [field]: val } : c);
      return { ...p, [section]: list };
    });
  }

  function addCheck(section: 'criteria' | 'tasks') {
    updateCurrent((p) => ({ ...p, [section]: [...p[section], { text: '', done: false }] }));
  }

  function delCheck(section: 'criteria' | 'tasks', i: number) {
    if ((current?.[section].length ?? 0) <= 1) return;
    updateCurrent((p) => ({ ...p, [section]: p[section].filter((_, idx) => idx !== i) }));
  }

  // ── Exports ─────────────────────────────────────────────────────────────────

  function copyMarkdown() {
    if (!current) return;
    const md = toMarkdown(current);
    navigator.clipboard.writeText(md)
      .then(() => showToast('Markdown copied to clipboard'))
      .catch(() => {
        const ta = document.createElement('textarea');
        ta.value = md; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
        showToast('Markdown copied');
      });
  }

  function exportImage(fmt: 'png' | 'jpeg') {
    if (!current) return;
    showToast('Generating image…');
    setTimeout(() => {
      try {
        const canvas = renderToCanvas(current);
        const type = fmt === 'jpeg' ? 'image/jpeg' : 'image/png';
        const url = canvas.toDataURL(type, 0.95);
        const a = document.createElement('a');
        a.download = (current.title || 'prd').replace(/[^a-z0-9]/gi, '-').toLowerCase() + '.' + fmt;
        a.href = url; a.click();
        showToast('Exported successfully');
      } catch (err) {
        showToast('Export failed');
      }
    }, 50);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const sorted = [...prds].sort((a, b) => b.modified - a.modified);

  return (
    <div className={styles.app}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHead}>
          <div className={styles.sidebarLogo}>PRD<span>Studio</span></div>
          <button className={styles.btnNew} onClick={newPRD}>
            <Plus size={13} /> New PRD
          </button>
        </div>

        <div className={styles.sidebarLabel}>Documents</div>

        <div className={styles.sidebarList}>
          {sorted.length === 0 && (
            <div className={styles.sidebarEmpty}>
              No documents yet.<br />Click <b>New PRD</b> to begin.
            </div>
          )}
          {sorted.map((p) => (
            <div
              key={p.id}
              className={`${styles.sidebarItem} ${p.id === currentId ? styles.sidebarItemActive : ''}`}
              onClick={() => setCurrentId(p.id)}
            >
              <div className={styles.sidebarItemBody}>
                <div className={styles.sidebarItemTitle}>{p.title || 'Untitled PRD'}</div>
                <div className={styles.sidebarItemDate}>{fmtDate(p.modified)}</div>
              </div>
              <button
                className={styles.sidebarDel}
                onClick={(e) => { e.stopPropagation(); deletePRD(p.id); }}
                title="Delete"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Main */}
      <main className={styles.main}>
        {current ? (
          <>
            {/* Topbar */}
            <div className={styles.topbar}>
              <input
                id="prd-title-input"
                className={styles.titleInput}
                type="text"
                placeholder="Name your PRD…"
                maxLength={100}
                value={current.title}
                onChange={(e) => updateCurrent((p) => ({ ...p, title: e.target.value }))}
              />
              <div className={`${styles.savePill} ${saveStatus === 'saving' ? styles.savePillSaving : saveStatus === 'saved' ? styles.savePillSaved : ''}`}>
                {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : ''}
              </div>
              <div className={styles.topbarBtns}>
                <button className={styles.btn} onClick={copyMarkdown}>
                  <ClipboardCopy size={13} /> Copy Markdown
                </button>
                <div className={styles.dropdown}>
                  <button className={styles.btn} onClick={() => setExportOpen((o) => !o)}>
                    <Image size={13} /> Export <ChevronDown size={11} />
                  </button>
                  {exportOpen && (
                    <div className={styles.dropdownMenu}>
                      <div className={styles.dropdownItem} onClick={() => { setExportOpen(false); exportImage('png'); }}>
                        <FileText size={13} /> Export as PNG
                      </div>
                      <div className={styles.dropdownItem} onClick={() => { setExportOpen(false); exportImage('jpeg'); }}>
                        <FileText size={13} /> Export as JPEG
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Sections */}
            <div className={styles.contentWrap} onClick={() => setExportOpen(false)}>
              <div className={styles.contentInner}>

                {/* 1. Overview */}
                <Section num={1} title="Overview" collapsed={!!current.collapsed.overview} onToggle={() => toggleSection('overview')}>
                  <textarea
                    data-auto
                    className={styles.textarea}
                    placeholder="What problem does this solve? Who is it for? What does success look like?"
                    rows={4}
                    value={current.overview}
                    onChange={(e) => updateCurrent((p) => ({ ...p, overview: e.target.value }))}
                  />
                </Section>

                {/* 2. Competitor Analysis */}
                <Section num={2} title="Competitor Analysis" collapsed={!!current.collapsed.competitors} onToggle={() => toggleSection('competitors')}>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th style={{ width: '18%' }}>Competitor</th>
                          <th style={{ width: '28%' }}>Strengths</th>
                          <th style={{ width: '28%' }}>Weaknesses</th>
                          <th>Notes</th>
                          <th style={{ width: '32px' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {current.competitors.map((c, i) => (
                          <tr key={i}>
                            <td>
                              <input className={styles.tdInput} type="text" placeholder="Name" value={c.name}
                                onChange={(e) => setCompField(i, 'name', e.target.value)} />
                            </td>
                            <td>
                              <textarea data-auto className={styles.tdTextarea} placeholder="What they do well…" value={c.strengths}
                                onChange={(e) => setCompField(i, 'strengths', e.target.value)} />
                            </td>
                            <td>
                              <textarea data-auto className={styles.tdTextarea} placeholder="Gaps & pain points…" value={c.weaknesses}
                                onChange={(e) => setCompField(i, 'weaknesses', e.target.value)} />
                            </td>
                            <td>
                              <input className={styles.tdInput} type="text" placeholder="Positioning…" value={c.notes}
                                onChange={(e) => setCompField(i, 'notes', e.target.value)} />
                            </td>
                            <td className={styles.tdDel}>
                              <button className={styles.delRowBtn} onClick={() => delComp(i)} title="Remove">
                                <X size={12} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button className={styles.addItem} onClick={addComp}>
                    <Plus size={13} /> Add competitor
                  </button>
                </Section>

                {/* 3. User Stories */}
                <Section num={3} title="User Stories" collapsed={!!current.collapsed.stories} onToggle={() => toggleSection('stories')}>
                  <div className={styles.cardsStack}>
                    {current.userStories.map((s, i) => (
                      <div key={i} className={styles.storyCard}>
                        <button className={styles.cardDel} onClick={() => delStory(i)} title="Remove"><X size={12} /></button>
                        <div className={styles.storyFields}>
                          <div className={styles.storyField}>
                            <div className={styles.storyPrefix}>As a…</div>
                            <input className={styles.input} type="text" placeholder="user type / persona" value={s.persona}
                              onChange={(e) => setStoryField(i, 'persona', e.target.value)} />
                          </div>
                          <div className={styles.storyField}>
                            <div className={styles.storyPrefix}>I want to…</div>
                            <input className={styles.input} type="text" placeholder="accomplish this goal" value={s.action}
                              onChange={(e) => setStoryField(i, 'action', e.target.value)} />
                          </div>
                          <div className={styles.storyField}>
                            <div className={styles.storyPrefix}>So that…</div>
                            <input className={styles.input} type="text" placeholder="I can achieve this benefit" value={s.benefit}
                              onChange={(e) => setStoryField(i, 'benefit', e.target.value)} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button className={styles.addItem} onClick={addStory}>
                    <Plus size={13} /> Add user story
                  </button>
                </Section>

                {/* 4. Options */}
                <Section num={4} title="Options" collapsed={!!current.collapsed.options} onToggle={() => toggleSection('options')}>
                  <div className={styles.cardsStack}>
                    {current.options.map((o, i) => (
                      <div key={i} className={styles.optCard}>
                        <button className={styles.cardDel} onClick={() => delOpt(i)} title="Remove"><X size={12} /></button>
                        <div className={styles.optHead}>
                          <span className={styles.optBadge}>OPTION {i + 1}</span>
                          <input
                            className={styles.optTitleInput}
                            type="text"
                            placeholder="Option name"
                            value={o.title}
                            onChange={(e) => setOptField(i, 'title', e.target.value)}
                          />
                        </div>
                        <div className={styles.optBody}>
                          <div>
                            <div className={styles.fieldLabel}>Description</div>
                            <textarea data-auto className={styles.textarea} placeholder="Describe this approach…"
                              value={o.description} onChange={(e) => setOptField(i, 'description', e.target.value)} />
                          </div>
                          <div className={styles.pcRow}>
                            <div className={styles.pcCol}>
                              <div className={styles.prosLabel}>Pros</div>
                              <div className={styles.bulletList}>
                                {o.pros.map((pr, j) => (
                                  <div key={j} className={styles.bulletRow}>
                                    <div className={`${styles.bulletDot} ${styles.dotPro}`} />
                                    <input className={styles.bulletInput} type="text" placeholder="Advantage…"
                                      value={pr} onChange={(e) => setBullet(i, 'pros', j, e.target.value)} />
                                    <button className={styles.bulletDel} onClick={() => delBullet(i, 'pros', j)} title="Remove"><X size={11} /></button>
                                  </div>
                                ))}
                              </div>
                              <button className={styles.addBullet} onClick={() => addBullet(i, 'pros')}>
                                <Plus size={11} /> Add pro
                              </button>
                            </div>
                            <div className={styles.pcCol}>
                              <div className={styles.consLabel}>Cons</div>
                              <div className={styles.bulletList}>
                                {o.cons.map((co, j) => (
                                  <div key={j} className={styles.bulletRow}>
                                    <div className={`${styles.bulletDot} ${styles.dotCon}`} />
                                    <input className={styles.bulletInput} type="text" placeholder="Drawback or risk…"
                                      value={co} onChange={(e) => setBullet(i, 'cons', j, e.target.value)} />
                                    <button className={styles.bulletDel} onClick={() => delBullet(i, 'cons', j)} title="Remove"><X size={11} /></button>
                                  </div>
                                ))}
                              </div>
                              <button className={styles.addBullet} onClick={() => addBullet(i, 'cons')}>
                                <Plus size={11} /> Add con
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button className={styles.addItem} onClick={addOpt}>
                    <Plus size={13} /> Add option
                  </button>
                </Section>

                {/* 5. Implementation Plan */}
                <Section num={5} title="Implementation Plan" collapsed={!!current.collapsed.plan} onToggle={() => toggleSection('plan')}>
                  <div className={styles.cardsStack}>
                    {current.plan.map((ph, i) => (
                      <div key={i} className={styles.phaseCard}>
                        <button className={styles.cardDel} onClick={() => delPhase(i)} title="Remove"><X size={12} /></button>
                        <div className={styles.phaseHead}>
                          <div className={styles.phaseBadge}>{i + 1}</div>
                          <input
                            className={styles.phaseTitleInput}
                            type="text"
                            placeholder="Phase name"
                            value={ph.phase}
                            onChange={(e) => setPhaseField(i, 'phase', e.target.value)}
                          />
                        </div>
                        <div className={styles.phaseBody}>
                          <textarea data-auto className={styles.textarea} placeholder="What happens in this phase…"
                            value={ph.description} onChange={(e) => setPhaseField(i, 'description', e.target.value)} />
                          <div>
                            <div className={styles.fieldLabel}>Timeline estimate</div>
                            <input className={styles.input} type="text" placeholder="e.g. 2 weeks"
                              value={ph.timeline} onChange={(e) => setPhaseField(i, 'timeline', e.target.value)} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button className={styles.addItem} onClick={addPhase}>
                    <Plus size={13} /> Add phase
                  </button>
                </Section>

                {/* 6. Completion Criteria */}
                <Section num={6} title="Completion Criteria" collapsed={!!current.collapsed.criteria} onToggle={() => toggleSection('criteria')}>
                  <div className={styles.checkList}>
                    {current.criteria.map((c, i) => (
                      <div key={i} className={styles.checkRow}>
                        <input
                          type="checkbox"
                          className={styles.checkbox}
                          checked={c.done}
                          onChange={(e) => setCheckField('criteria', i, 'done', e.target.checked)}
                        />
                        <input
                          className={styles.checkInput}
                          type="text"
                          placeholder="Criterion…"
                          value={c.text}
                          onChange={(e) => setCheckField('criteria', i, 'text', e.target.value)}
                        />
                        <button className={styles.bulletDel} onClick={() => delCheck('criteria', i)} title="Remove"><X size={12} /></button>
                      </div>
                    ))}
                  </div>
                  <button className={styles.addItem} onClick={() => addCheck('criteria')}>
                    <Plus size={13} /> Add criterion
                  </button>
                </Section>

                {/* 7. Follow-up Tasks & Notes */}
                <Section num={7} title="Follow-up Tasks & Notes" collapsed={!!current.collapsed.followup} onToggle={() => toggleSection('followup')}>
                  <div>
                    <div className={styles.fieldLabel}>Tasks</div>
                    <div className={styles.checkList}>
                      {current.tasks.map((t, i) => (
                        <div key={i} className={styles.checkRow}>
                          <input
                            type="checkbox"
                            className={styles.checkbox}
                            checked={t.done}
                            onChange={(e) => setCheckField('tasks', i, 'done', e.target.checked)}
                          />
                          <input
                            className={styles.checkInput}
                            type="text"
                            placeholder="Task…"
                            value={t.text}
                            onChange={(e) => setCheckField('tasks', i, 'text', e.target.value)}
                          />
                          <button className={styles.bulletDel} onClick={() => delCheck('tasks', i)} title="Remove"><X size={12} /></button>
                        </div>
                      ))}
                    </div>
                    <button className={styles.addItem} style={{ marginTop: 8 }} onClick={() => addCheck('tasks')}>
                      <Plus size={13} /> Add task
                    </button>
                  </div>
                  <div>
                    <div className={styles.fieldLabel}>Notes</div>
                    <textarea
                      data-auto
                      className={styles.textarea}
                      placeholder="Open questions, deferred decisions, links, context for later…"
                      rows={4}
                      value={current.notes}
                      onChange={(e) => updateCurrent((p) => ({ ...p, notes: e.target.value }))}
                    />
                  </div>
                </Section>

              </div>
            </div>
          </>
        ) : (
          /* Empty state */
          <div className={styles.contentWrap}>
            <div className={styles.empty}>
              <FileText size={52} className={styles.emptyIcon} />
              <h3 className={styles.emptyTitle}>No PRD open</h3>
              <p className={styles.emptyDesc}>Create a new PRD or select one from the sidebar to get started.</p>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={newPRD}>
                <Plus size={13} /> New PRD
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Toast */}
      <div className={`${styles.toast} ${toastVisible ? styles.toastShow : ''}`}>
        {toastMsg}
      </div>
    </div>
  );
}
