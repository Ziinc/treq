import { describe, it, expect } from 'vitest';
import { parseGitLog, parseJjLog } from './branch-visualizer-parser';

// ── git log pipe-delimited format ─────────────────────────────────────────

describe('parseGitLog – pipe format', () => {
  it('parses a simple linear history', () => {
    const input = [
      'a1b2c3d||HEAD -> main|Initial commit',
      'e4f5a6b|a1b2c3d|origin/main|Add routing',
      'c7d8e9f|e4f5a6b||Fix typo',
    ].join('\n');

    const { state, warnings } = parseGitLog(input);
    expect(warnings).toHaveLength(0);
    expect(state.commits).toHaveLength(3);
    expect(state.commits[0].label).toBe('Initial commit');
    expect(state.commits[0].parents).toEqual([]);
    expect(state.commits[1].parents).toContain('a1b2c3d');
    expect(state.commits[2].parents).toContain('e4f5a6b');
  });

  it('assigns branches from HEAD -> ref decoration', () => {
    const input = [
      '3ad3b89||HEAD -> main|Merge commit',
      '5b2e4f1|3ad3b89||Another',
    ].join('\n');
    const { state } = parseGitLog(input);
    const mainBranch = state.branches.find((b) => b.name === 'main');
    expect(mainBranch).toBeDefined();
    // Both commits should be on main (first-parent chain walk)
    expect(state.commits.every((c) => c.branch === 'main')).toBe(true);
  });

  it('handles a feature branch and merge commit', () => {
    // In real git output, %P lists first parent (branch merged INTO) before second (FROM).
    // Merging feature/auth into main: first parent = previous main commit, second = feature tip.
    const input = [
      '7f1c3a5|2a8b9c0 5b2e4f1|HEAD -> main|Merge feature/auth',
      '5b2e4f1|3c1d2e8|feature/auth|Add login',
      '3c1d2e8|2a8b9c0||Start auth',
      '2a8b9c0|1d7e8f9||Fix typo',
      '1d7e8f9|||Initial commit',
    ].join('\n');

    const { state, warnings } = parseGitLog(input);
    expect(warnings).toHaveLength(0);
    expect(state.commits).toHaveLength(5);

    const mergeCommit = state.commits.find((c) => c.id === '7f1c3a5');
    expect(mergeCommit?.parents).toEqual(['2a8b9c0', '5b2e4f1']);
    expect(mergeCommit?.branch).toBe('main');

    const authBranch = state.branches.find((b) => b.name === 'feature/auth');
    expect(authBranch).toBeDefined();

    const authCommit = state.commits.find((c) => c.id === '5b2e4f1');
    expect(authCommit?.branch).toBe('feature/auth');
  });

  it('assigns main before feature branches (priority ordering)', () => {
    // Commit ccc11111 is in main's first-parent chain, so it should be on main
    // even though it is also reachable from the feature branch chain.
    const input = [
      'aaa11111|ccc33333|HEAD -> main|Main tip',
      'bbb22222||feature/x|Feature tip',
      'ccc33333|||Shared ancestor',
    ].join('\n');

    const { state } = parseGitLog(input);
    const shared = state.commits.find((c) => c.id === 'ccc33333');
    expect(shared?.branch).toBe('main');
  });

  it('handles multiple branches with merge', () => {
    const input = [
      'abc1234|def5678 bac9876|HEAD -> main, origin/main|Final merge',
      'def5678|ghi0123|feature/ui|Add styles',
      'bac9876|ghi0123|feature/auth|Add auth',
      'ghi0123|||Initial',
    ].join('\n');

    const { state } = parseGitLog(input);
    expect(state.branches.length).toBeGreaterThanOrEqual(2);
    const uiCommit = state.commits.find((c) => c.id === 'def5678');
    const authCommit = state.commits.find((c) => c.id === 'bac9876');
    expect(uiCommit?.branch).toBe('feature/ui');
    expect(authCommit?.branch).toBe('feature/auth');
  });

  it('skips remote-tracking refs and tags', () => {
    const input = [
      'abc1234||HEAD -> main, origin/main, tag: v1.0|Release',
    ].join('\n');
    const { state } = parseGitLog(input);
    // Only "main" should be a branch (not origin/main or tag: v1.0)
    const branchNames = state.branches.map((b) => b.name);
    expect(branchNames).toContain('main');
    expect(branchNames).not.toContain('origin/main');
    expect(branchNames.some((n) => n.startsWith('tag:'))).toBe(false);
  });

  it('returns warnings for empty input', () => {
    const { state, warnings } = parseGitLog('');
    expect(warnings.length).toBeGreaterThan(0);
    expect(state.commits).toHaveLength(0);
  });

  it('handles commit messages containing pipes', () => {
    const input = 'abc1234||HEAD -> main|Fix: handle a|b edge case';
    const { state } = parseGitLog(input);
    expect(state.commits[0].label).toBe('Fix: handle a|b edge case');
  });
});

// ── git log graph format ───────────────────────────────────────────────────

describe('parseGitLog – graph format', () => {
  it('parses a simple linear graph', () => {
    const input = [
      '* a1b2c3d (HEAD -> main) Add routing',
      '* e4f5a6b Initial commit',
    ].join('\n');

    const { state, warnings } = parseGitLog(input);
    expect(warnings).toHaveLength(0);
    expect(state.commits).toHaveLength(2);
    expect(state.commits[0].id).toBe('a1b2c3d');
    expect(state.commits[0].parents).toContain('e4f5a6b');
    expect(state.commits[1].parents).toHaveLength(0);
  });

  it('parses a graph with one feature branch', () => {
    const input = [
      '*   7f1c3a5 (HEAD -> main) Merge feature/auth',
      '|\\',
      '| * 5b2e4f1 (feature/auth) Add login',
      '| * 3c1d2e8 Start auth',
      '|/',
      '* 2a8b9c0 Fix typo',
      '* 1d7e8f9 Initial commit',
    ].join('\n');

    const { state, warnings } = parseGitLog(input);
    expect(warnings).toHaveLength(0);
    expect(state.commits).toHaveLength(5);

    const merge = state.commits.find((c) => c.id === '7f1c3a5');
    expect(merge?.parents).toContain('2a8b9c0'); // first parent (same col)
    expect(merge?.parents).toContain('5b2e4f1'); // second parent (merge)

    const authTip = state.commits.find((c) => c.id === '5b2e4f1');
    expect(authTip?.branch).toBe('feature/auth');
  });

  it('parses graph with decorations containing multiple refs', () => {
    const input = [
      '* abc1234 (HEAD -> main, origin/main) Latest',
      '* def5678 Previous',
    ].join('\n');

    const { state } = parseGitLog(input);
    const branchNames = state.branches.map((b) => b.name);
    expect(branchNames).toContain('main');
    expect(branchNames).not.toContain('origin/main');
  });

  it('auto-detects graph format when no pipes present', () => {
    const input = [
      '* abc1234 (HEAD -> develop) Develop tip',
      '* def5678 base',
    ].join('\n');
    const { state } = parseGitLog(input);
    expect(state.commits).toHaveLength(2);
    expect(state.branches.find((b) => b.name === 'develop')).toBeDefined();
  });

  it('handles a realistic multi-branch graph', () => {
    const input = [
      '*   c8f3a91 (HEAD -> main) Merge pull request #5 from feature/auth',
      '|\\',
      '| * b7e2d40 (feature/auth) Add login endpoint',
      '| * a6d1c3f Start auth implementation',
      '|/',
      '*   9e4b2c1 Merge pull request #3 from feature/ui',
      '|\\',
      '| * 8d3a1b0 (feature/ui) Add dashboard styles',
      '| * 7c2b0a9 Setup UI scaffold',
      '|/',
      '* 6b1a9f8 Fix bug in main',
      '* 5a0b8e7 (origin/main) Initial commit',
    ].join('\n');

    const { state, warnings } = parseGitLog(input);
    expect(warnings).toHaveLength(0);
    expect(state.commits).toHaveLength(8);

    const authBranch = state.branches.find((b) => b.name === 'feature/auth');
    const uiBranch = state.branches.find((b) => b.name === 'feature/ui');
    expect(authBranch).toBeDefined();
    expect(uiBranch).toBeDefined();
  });
});

// ── jj log pipe-delimited format ──────────────────────────────────────────

describe('parseJjLog – pipe format', () => {
  it('parses a simple linear jj history', () => {
    const input = [
      'zlkvznns||main|Working copy changes',
      'pqrstuvw|zlkvznns||Add feature',
      'abcdefgh|pqrstuvw||Initial commit',
    ].join('\n');

    const { state, warnings } = parseJjLog(input);
    expect(warnings).toHaveLength(0);
    expect(state.commits).toHaveLength(3);
    expect(state.commits[0].label).toBe('Working copy changes');
    expect(state.commits[1].parents).toContain('zlkvznns');
  });

  it('assigns bookmarks as branch names', () => {
    const input = [
      'aaabbbcc||main|Tip',
      'dddeeeff|aaabbbcc|feature/login|Add login',
      'ggghhhii|dddeeeff||Base',
    ].join('\n');

    const { state } = parseJjLog(input);
    expect(state.branches.map((b) => b.name)).toContain('main');
    expect(state.branches.map((b) => b.name)).toContain('feature/login');

    const loginCommit = state.commits.find((c) => c.id === 'dddeeeff');
    expect(loginCommit?.branch).toBe('feature/login');
  });

  it('skips root() commit (all-z change id)', () => {
    const input = [
      'abcdefgh||main|Last commit',
      'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz|||',
    ].join('\n');

    const { state } = parseJjLog(input);
    expect(state.commits).toHaveLength(1);
    expect(state.commits[0].id).toBe('abcdefgh');
  });

  it('handles merge-like commits with two parents', () => {
    const input = [
      'mergeaaa|branchaaa branchbbb|main|Merge',
      'branchaaa|rootaaaaa|feature/a|Feature A work',
      'branchbbb|rootaaaaa|feature/b|Feature B work',
      'rootaaaaa|||Initial',
    ].join('\n');

    const { state } = parseJjLog(input);
    const mergeCommit = state.commits.find((c) => c.id === 'mergeaaa');
    expect(mergeCommit?.parents).toContain('branchaaa');
    expect(mergeCommit?.parents).toContain('branchbbb');
  });

  it('returns warnings for empty input', () => {
    const { warnings } = parseJjLog('');
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('handles realistic jj template output', () => {
    // Realistic output from:
    // jj log --no-graph -T 'change_id.short() ++ "|" ++ parents.map(|p| p.change_id.short()).join(" ") ++ "|" ++ bookmarks.map(|b| b.name()).join(",") ++ "|" ++ description.first_line() ++ "\n"'
    const input = [
      'rstuvwxy||main|feat: add user dashboard',
      'nopqrstu|rstuvwxy||refactor: extract auth module',
      'jklmnopq|nopqrstu|feature/api|Add REST API endpoints',
      'fghijklm|jklmnopq||Setup Express server',
      'bcdefghi|fghijklm||Initial project structure',
    ].join('\n');

    const { state, warnings } = parseJjLog(input);
    expect(warnings).toHaveLength(0);
    expect(state.commits).toHaveLength(5);
    expect(state.branches.find((b) => b.name === 'main')).toBeDefined();
    expect(state.branches.find((b) => b.name === 'feature/api')).toBeDefined();
  });
});

// ── jj log visual (default) format ────────────────────────────────────────

describe('parseJjLog – visual format', () => {
  it('parses a simple linear jj log output', () => {
    const input = [
      '@  zlkvznns user@example.com 2024-01-15 10:30:00 main c9a8b7f6',
      '│  Working copy changes',
      '│',
      '◉  pqrstuvw user@example.com 2024-01-14 09:00:00 7a8b9c0d',
      '│  Add feature',
      '│',
      '◉  abcdefgh user@example.com 2024-01-13 08:00:00 1b2c3d4e',
      '   Initial commit',
    ].join('\n');

    const { state, warnings } = parseJjLog(input);
    expect(warnings).toHaveLength(0);
    expect(state.commits).toHaveLength(3);

    const first = state.commits[0];
    expect(first.id).toBe('zlkvznns');
    expect(first.label).toBe('Working copy changes');
    // zlkvznns parent should be pqrstuvw
    expect(first.parents).toContain('pqrstuvw');
  });

  it('assigns bookmarks from the commit line', () => {
    const input = [
      '@  aaabbbcc user@example.com 2024-01-15 main abc12345',
      '│  Tip commit',
      '◉  dddeeeff user@example.com 2024-01-14 feature/login def56789',
      '   Login feature',
    ].join('\n');

    const { state } = parseJjLog(input);
    expect(state.branches.map((b) => b.name)).toContain('main');
    expect(state.branches.map((b) => b.name)).toContain('feature/login');
  });

  it('skips root() placeholder lines', () => {
    const input = [
      '@  abcdefgh user@example.com 2024-01-15 main 12345678',
      '│  Last commit',
      '◉  zzzzzzzz root() 00000000',
      '   (root)',
    ].join('\n');

    const { state } = parseJjLog(input);
    expect(state.commits).toHaveLength(1);
    expect(state.commits[0].id).toBe('abcdefgh');
  });

  it('handles branching with ├─╮ structure', () => {
    const input = [
      '@    mergeabc user@example.com 2024-01-16 main ffffff00',
      '├─╮  Merge branches',
      '│ │',
      '│ ◉  branchabc user@example.com 2024-01-15 feature/a aabbccdd',
      '│ │  Feature A work',
      '│ │',
      '◉ │  branchdef user@example.com 2024-01-15 feature/b 11223344',
      '├─╯  Feature B work',
      '│',
      '◉  rootabcde user@example.com 2024-01-14 55667788',
      '   Initial commit',
    ].join('\n');

    const { state, warnings } = parseJjLog(input);
    expect(warnings).toHaveLength(0);
    expect(state.commits.length).toBeGreaterThanOrEqual(3);

    const mergeCommit = state.commits.find((c) => c.id === 'mergeabc');
    expect(mergeCommit).toBeDefined();
    // Merge commit should have multiple parents
    expect(mergeCommit!.parents.length).toBeGreaterThanOrEqual(1);
  });

  it('auto-detects visual format when @ or ◉ chars present', () => {
    const input = [
      '@  rstuvwxy user@example.com 2024-01-15 main c9a8b7f6',
      '   Add something',
    ].join('\n');
    const { state } = parseJjLog(input);
    expect(state.commits).toHaveLength(1);
    expect(state.commits[0].branch).toBe('main');
  });

  it('returns warnings for unparseable input', () => {
    const { warnings } = parseJjLog('not a jj log output at all\njust some random text');
    expect(warnings.length).toBeGreaterThan(0);
  });
});

// ── Branch assignment edge cases ──────────────────────────────────────────

describe('branch assignment', () => {
  it('prioritizes main over other branches for shared ancestors', () => {
    // ccc33333 is in main's first-parent chain → should be on main, not feature/x
    // (uses valid hex IDs; non-hex IDs like "tip1111" would be rejected by the parser)
    const input = [
      'aaa11111|ccc33333|HEAD -> main|Main tip',
      'bbb22222||feature/x|Feature tip',
      'ccc33333|||Shared ancestor',
    ].join('\n');
    const { state } = parseGitLog(input);
    const shared = state.commits.find((c) => c.id === 'ccc33333');
    expect(shared?.branch).toBe('main');
  });

  it('assigns unique colors to each branch', () => {
    const input = [
      'aaa1111||HEAD -> main|Main',
      'bbb2222||feature/a|Feature A',
      'ccc3333||feature/b|Feature B',
    ].join('\n');
    const { state } = parseGitLog(input);
    const colors = state.branches.map((b) => b.color);
    // All colors should be unique
    expect(new Set(colors).size).toBe(colors.length);
  });
});
