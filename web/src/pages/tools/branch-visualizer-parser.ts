// Parsers for git log and jj log output → GraphState

export const DEFAULT_COLORS = [
  '#6366f1',
  '#f59e0b',
  '#10b981',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
];

export interface Commit {
  id: string;
  label: string;
  branch: string;
  parents: string[];
}

export interface Branch {
  name: string;
  color: string;
}

export interface GraphState {
  branches: Branch[];
  commits: Commit[];
  title: string;
}

export interface ParseResult {
  state: GraphState;
  warnings: string[];
}

interface RawCommit {
  id: string;
  parentIds: string[];
  /** local branch names extracted from refs/bookmarks */
  branches: string[];
  label: string;
}

const EMPTY_STATE: GraphState = { title: '', branches: [], commits: [] };

// ── Ref parsing helpers ───────────────────────────────────────────────────────

function extractBranchesFromRefs(refs: string): string[] {
  const parts = refs.split(',').map((s) => s.trim());
  const branches: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('tag:')) continue;
    if (part.startsWith('HEAD -> ')) {
      branches.push(part.slice('HEAD -> '.length).trim());
      continue;
    }
    if (part === 'HEAD') continue;
    if (part.startsWith('origin/') || part.startsWith('upstream/')) continue;
    branches.push(part);
  }
  return branches;
}

// ── Branch assignment ─────────────────────────────────────────────────────────

// Strategy:
// 1. Pre-assign every commit that has an explicit ref/bookmark to that branch.
// 2. Walk first-parent chains from the PARENT of each branch tip, assigning the
//    branch to ancestors that haven't been claimed yet.
// 3. Anything still unassigned falls back to the first branch name (or 'main').
//
// Processing order: main/master/develop/trunk first, then others alphabetically,
// so trunk branches claim their ancestors before feature branches.
function assignBranches(rawCommits: RawCommit[]): { commits: Commit[]; branches: Branch[] } {
  if (rawCommits.length === 0) return { commits: [], branches: [] };

  const commitMap = new Map<string, RawCommit>(rawCommits.map((c) => [c.id, c]));
  const branchOf = new Map<string, string>(); // commitId → branchName

  // Collect unique branch names in appearance order
  const allBranchNames: string[] = [];
  for (const c of rawCommits) {
    for (const b of c.branches) {
      if (!allBranchNames.includes(b)) allBranchNames.push(b);
    }
  }

  // Sort: trunk branches first
  const PRIORITY = ['main', 'master', 'develop', 'trunk'];
  allBranchNames.sort((a, b) => {
    const ai = PRIORITY.indexOf(a);
    const bi = PRIORITY.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return 0;
  });

  // Step 1: pre-assign commits that carry explicit branch names
  for (const c of rawCommits) {
    if (c.branches.length > 0) branchOf.set(c.id, c.branches[0]);
  }

  // Step 2: walk first-parent chains from each branch tip's parent
  for (const branchName of allBranchNames) {
    const tip = rawCommits.find((c) => c.branches.includes(branchName));
    if (!tip) continue;

    // Start from tip's first parent (tip itself is already pre-assigned)
    let cur: string | undefined = tip.parentIds[0];
    while (cur && !branchOf.has(cur)) {
      branchOf.set(cur, branchName);
      cur = commitMap.get(cur)?.parentIds[0];
    }
  }

  // Step 3: fallback for commits unreachable from any branch
  const fallback = allBranchNames[0] ?? 'main';
  for (const c of rawCommits) {
    if (!branchOf.has(c.id)) branchOf.set(c.id, fallback);
  }

  // Build ordered branch list in the order commits appear
  const seenBranches: string[] = [];
  for (const c of rawCommits) {
    const b = branchOf.get(c.id)!;
    if (!seenBranches.includes(b)) seenBranches.push(b);
  }

  const branches: Branch[] = seenBranches.map((name, i) => ({
    name,
    color: DEFAULT_COLORS[i % DEFAULT_COLORS.length],
  }));

  const commits: Commit[] = rawCommits.map((c) => ({
    id: c.id,
    label: c.label || c.id,
    branch: branchOf.get(c.id)!,
    parents: c.parentIds.filter((p) => commitMap.has(p)),
  }));

  return { commits, branches };
}

// ── Git: pipe-delimited format ─────────────────────────────────────────────
// Command: git log --all --format="%h|%P|%D|%s"
// Line:    abc1234|def5678 bac9876|HEAD -> main, origin/main|Commit message

function parseGitPipeFormat(lines: string[], warnings: string[]): ParseResult {
  const rawCommits: RawCommit[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split('|');
    if (parts.length < 2) continue;

    const id = parts[0].trim();
    if (!/^[0-9a-f]{4,40}$/i.test(id)) continue;

    const parentIds = parts[1].trim().split(/\s+/).filter(Boolean);
    const refs = parts[2]?.trim() ?? '';
    const label = parts.slice(3).join('|').trim();

    rawCommits.push({ id, parentIds, label, branches: extractBranchesFromRefs(refs) });
  }

  if (rawCommits.length === 0) {
    warnings.push('No commits found. Make sure to use: git log --all --format="%h|%P|%D|%s"');
    return { state: EMPTY_STATE, warnings };
  }

  const { commits, branches } = assignBranches(rawCommits);
  return { state: { title: 'Imported from git log', branches, commits }, warnings };
}

// ── Git: oneline graph format ──────────────────────────────────────────────
// Command: git log --all --oneline --graph --decorate
// Tracks commit column positions; infers parents from lane structure.

function parseGitGraphFormat(lines: string[], warnings: string[]): ParseResult {
  type Entry = { id: string; refs: string; label: string; col: number; lineIdx: number };
  const entries: Entry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match optional graph prefix chars, then *, then hash
    const m = line.match(/^([ |\/\\*]*)\*[ ]+([0-9a-f]{4,40})(.*)/i);
    if (!m) continue;

    const prefix = m[1];
    const hash = m[2];
    const rest = m[3].trim();

    // Each lane is 2 chars wide ("| "), so col = prefix.length / 2
    const col = Math.floor(prefix.length / 2);

    let refs = '';
    let label = rest;
    const refM = rest.match(/^\(([^)]+)\)\s*(.*)/);
    if (refM) {
      refs = refM[1];
      label = refM[2];
    }

    entries.push({ id: hash, refs, label, col, lineIdx: i });
  }

  if (entries.length === 0) {
    warnings.push('No commits found in graph output.');
    return { state: EMPTY_STATE, warnings };
  }

  const rawCommits: RawCommit[] = entries.map((entry, i) => {
    const parentIds: string[] = [];

    // First parent: next entry in the same column.
    // For feature lanes (col > 0), reject candidates where |/ appears between them —
    // that signals the lane closed and a later col-n is an independent lane.
    // The trunk lane (col 0) is never closed by |/, so no filtering needed there.
    const nextSameCol = entries.slice(i + 1).find((e) => {
      if (e.col !== entry.col) return false;
      if (entry.col === 0) return true; // trunk lane never closes
      const between = lines.slice(entry.lineIdx + 1, e.lineIdx);
      return !between.some((l) => /\|[ ]*\//.test(l) || l.trim() === '|/');
    });
    if (nextSameCol) parentIds.push(nextSameCol.id);

    // Second parent (merge): a |\ line between this entry and next-same-col signals
    // that the next commit in the right lane is a second parent
    const nextSameColLine = nextSameCol?.lineIdx ?? lines.length;
    const between = lines.slice(entry.lineIdx + 1, nextSameColLine);
    const hasMergeOpen = between.some((l) => /\|\s*\\/.test(l) || /\*\s*\\/.test(l));
    if (hasMergeOpen) {
      const mergeParent = entries.slice(i + 1).find((e) => e.col === entry.col + 1);
      if (mergeParent) parentIds.push(mergeParent.id);
    }

    // For col > 0 entries with no parent yet: find where the lane merges back (|/)
    if (entry.col > 0 && parentIds.length === 0) {
      const mergeLineOffset = lines
        .slice(entry.lineIdx + 1)
        .findIndex((l) => /\|[ ]*\//.test(l) || l.trim() === '|/');

      if (mergeLineOffset >= 0) {
        const mergeAbsLine = entry.lineIdx + 1 + mergeLineOffset;
        // Only use this |/ if there's no other commit in our lane between us and it
        const blockedByOwnLane = entries.some(
          (e) => e.col === entry.col && e.lineIdx > entry.lineIdx && e.lineIdx < mergeAbsLine,
        );
        if (!blockedByOwnLane) {
          const leftParent = entries.find(
            (e) => e.col === entry.col - 1 && e.lineIdx > mergeAbsLine,
          );
          if (leftParent) parentIds.push(leftParent.id);
        }
      }
    }

    return {
      id: entry.id,
      parentIds,
      label: entry.label,
      branches: extractBranchesFromRefs(entry.refs),
    };
  });

  const { commits, branches } = assignBranches(rawCommits);
  return { state: { title: 'Imported from git log', branches, commits }, warnings };
}

// ── Git public entry point ─────────────────────────────────────────────────

/**
 * Parses git log output. Supports two formats:
 *
 * Structured (recommended):
 *   git log --all --format="%h|%P|%D|%s"
 *
 * Graph (auto-detected):
 *   git log --all --oneline --graph --decorate
 */
export function parseGitLog(input: string): ParseResult {
  const warnings: string[] = [];
  const lines = input.split('\n').filter((l) => l.trim());

  if (!lines.length) {
    warnings.push('Input is empty.');
    return { state: EMPTY_STATE, warnings };
  }

  // Detect pipe-delimited format: first non-graph line starts with hex chars then |
  const firstDataLine = lines.find((l) => /^[0-9a-f]{4,}/i.test(l.trim()));
  if (firstDataLine && firstDataLine.includes('|')) {
    return parseGitPipeFormat(lines, warnings);
  }

  return parseGitGraphFormat(lines, warnings);
}

// ── jj: pipe-delimited format ─────────────────────────────────────────────
// Command: jj log --no-graph -T 'change_id.short() ++ "|" ++ parents.map(|p| p.change_id.short()).join(" ") ++ "|" ++ bookmarks.map(|b| b.name()).join(",") ++ "|" ++ description.first_line() ++ "\n"'
// Line:    pqrstuvw|abcdefgh klmnopqr|main|Add feature

function parseJjPipeFormat(lines: string[], warnings: string[]): ParseResult {
  const rawCommits: RawCommit[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split('|');
    if (parts.length < 2) continue;

    const id = parts[0].trim();
    if (!/^[a-z0-9]{4,}$/.test(id)) continue;
    // Skip root() commit (all z's)
    if (/^z{6,}$/.test(id)) continue;

    const parentIds = parts[1]
      .trim()
      .split(/\s+/)
      .filter((p) => p && !/^z{6,}$/.test(p));
    const bookmarkStr = parts[2]?.trim() ?? '';
    const label = parts.slice(3).join('|').trim();

    const branches = bookmarkStr.split(',').map((s) => s.trim()).filter(Boolean);

    rawCommits.push({ id, parentIds, label, branches });
  }

  if (rawCommits.length === 0) {
    warnings.push(
      'No commits found. Make sure to use the jj log template that outputs pipe-delimited lines.',
    );
    return { state: EMPTY_STATE, warnings };
  }

  const { commits, branches } = assignBranches(rawCommits);
  return { state: { title: 'Imported from jj log', branches, commits }, warnings };
}

// ── jj: default visual format ─────────────────────────────────────────────
// Command: jj log
// Parses lines with node chars (@, ◉, ○) and infers parents from column positions.

const JJ_NODE_RE =
  /^([\s│├─╮╯╰╭┤┬┼\\/|]+)?[@◉○●◌]\s{1,4}([a-z0-9]{6,})\s+(\S+@\S+)\s+(\d{4}-\d{2}-\d{2})(.*)/u;

function parseJjVisualFormat(lines: string[], warnings: string[]): ParseResult {
  type Entry = {
    id: string;
    col: number;
    lineIdx: number;
    bookmarks: string[];
    label: string;
  };
  const entries: Entry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(JJ_NODE_RE);
    if (!m) continue;

    const graphPrefix = m[1] ?? '';
    const changeId = m[2];
    const rest = m[5]?.trim() ?? '';

    // Skip root() commit
    if (/^z{6,}$/.test(changeId)) continue;

    // Column: count lane-separator chars before the node char
    const col = Math.floor(graphPrefix.replace(/[^│|├]/gu, '').length);

    // Collect bookmarks from the rest of the line (non-hex, non-time tokens)
    const restParts = rest.split(/\s+/).filter(Boolean);
    const bookmarks: string[] = [];
    for (const part of restParts) {
      if (/^[0-9a-f]{6,}$/.test(part)) continue; // short commit hash
      if (/^\d{2}:\d{2}/.test(part)) continue; // time component
      bookmarks.push(part);
    }

    // Description: next non-graph line after the commit header
    let label = '';
    if (i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      const descM = nextLine.match(/^[\s│|├─╮╯╰╭┤┬┼\\/]*\s{2,}(.*)/u);
      if (descM && descM[1] && !/^[a-z0-9]{6,}\s/.test(descM[1].trim())) {
        label = descM[1].trim();
      }
    }

    entries.push({ id: changeId, col, lineIdx: i, bookmarks, label });
  }

  if (entries.length === 0) {
    warnings.push('No commits found. Paste the output of "jj log" or use the structured template.');
    return { state: EMPTY_STATE, warnings };
  }

  const rawCommits: RawCommit[] = entries.map((entry, i) => {
    const parentIds: string[] = [];

    // First parent: next entry in same column (jj shows newest first, so lower = older = parent)
    const nextSameCol = entries.slice(i + 1).find((e) => e.col === entry.col);
    if (nextSameCol) parentIds.push(nextSameCol.id);

    // Second parent: if merge chars appear between this and next same-col
    const nextSameColLine = nextSameCol?.lineIdx ?? lines.length;
    const between = lines.slice(entry.lineIdx + 1, nextSameColLine);
    const hasMerge = between.some((l) => /[├╮╯]/.test(l));
    if (hasMerge) {
      const adjacentParent = entries
        .slice(i + 1)
        .find((e) => e.col !== entry.col && e.lineIdx < nextSameColLine);
      if (adjacentParent) parentIds.push(adjacentParent.id);
    }

    return {
      id: entry.id,
      parentIds,
      label: entry.label || entry.id.slice(0, 8),
      branches: [...entry.bookmarks],
    };
  });

  const { commits, branches } = assignBranches(rawCommits);
  return { state: { title: 'Imported from jj log', branches, commits }, warnings };
}

// ── jj public entry point ─────────────────────────────────────────────────

/**
 * Parses jj log output. Supports two formats:
 *
 * Structured (recommended):
 *   jj log --no-graph -T 'change_id.short() ++ "|" ++ parents.map(|p| p.change_id.short()).join(" ") ++ "|" ++ bookmarks.map(|b| b.name()).join(",") ++ "|" ++ description.first_line() ++ "\n"'
 *
 * Visual (default jj log output, auto-detected):
 *   jj log
 */
export function parseJjLog(input: string): ParseResult {
  const warnings: string[] = [];
  const lines = input.split('\n').filter((l) => l.trim());

  if (!lines.length) {
    warnings.push('Input is empty.');
    return { state: EMPTY_STATE, warnings };
  }

  // Detect pipe-delimited: first data line has lowercase alphanumeric ID then |
  const firstDataLine = lines.find((l) => /^[a-z0-9]{4,}\|/.test(l.trim()));
  if (firstDataLine) {
    return parseJjPipeFormat(lines, warnings);
  }

  return parseJjVisualFormat(lines, warnings);
}
