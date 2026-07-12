import type { GraphState } from './_graph-shared';

// ── Types ─────────────────────────────────────────────────────────────────────

export type VcsTag = 'git' | 'jj' | 'shell';

export interface SimStep {
  command: string;
  vcs: VcsTag;
  description: string;
  output: string;
  graphState: GraphState;
  highlightedCommitId?: string;
  headLabel?: string;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  icon: string;
  tags: string[];
  steps: SimStep[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MAIN = { name: 'main', color: '#6366f1' };
const FEATURE = { name: 'feature/login', color: '#f59e0b' };
const FEATURE2 = { name: 'feature/login', color: '#f59e0b' };
const HOTFIX = { name: 'hotfix', color: '#ef4444' };

const JJ_MAIN = { name: 'main', color: '#6366f1' };
const JJ_FEAT = { name: 'feature', color: '#f59e0b' };

const ORIGIN_MAIN = { name: 'main', color: '#6366f1' };
const ORIGIN_FEAT = { name: 'feature/search', color: '#10b981' };

// ── Scenario 1: Git Feature Branch Workflow ───────────────────────────────────

const GIT_FEATURE_BRANCH: Scenario = {
  id: 'git-feature-branch',
  name: 'Git: Feature Branch',
  description:
    'The classic Git workflow: create a feature branch, commit changes, then merge back to main with a merge commit.',
  icon: '🌿',
  tags: ['git', 'branching', 'merge'],
  steps: [
    {
      command: 'git init my-app && cd my-app',
      vcs: 'shell',
      description: 'Initialize an empty Git repository in a new directory.',
      output:
        'hint: Using \'main\' as the name for the initial branch.\nInitialized empty Git repository in /projects/my-app/.git/',
      graphState: {
        title: 'Empty repository',
        branches: [MAIN],
        commits: [],
      },
    },
    {
      command: 'git commit --allow-empty -m "Initial commit"',
      vcs: 'git',
      description: 'Create the first commit on main. This establishes the repo root.',
      output: '[main (root-commit) a1b2c3d] Initial commit',
      graphState: {
        title: 'First commit on main',
        branches: [MAIN],
        commits: [
          {
            id: 'a1b2c3d',
            label: 'Initial commit',
            branch: 'main',
            parents: [],
            bookmarks: ['main'],
          },
        ],
      },
      highlightedCommitId: 'a1b2c3d',
      headLabel: 'HEAD',
    },
    {
      command: 'git checkout -b feature/login',
      vcs: 'git',
      description:
        'Create a new branch called feature/login and switch to it. Both branches point to the same commit for now.',
      output: "Switched to a new branch 'feature/login'",
      graphState: {
        title: 'New branch: feature/login',
        branches: [MAIN, FEATURE],
        commits: [
          {
            id: 'a1b2c3d',
            label: 'Initial commit',
            branch: 'main',
            parents: [],
            bookmarks: ['main', 'feature/login'],
          },
        ],
      },
      highlightedCommitId: 'a1b2c3d',
      headLabel: 'HEAD',
    },
    {
      command: 'git commit -m "Add login form"',
      vcs: 'git',
      description: 'Make a commit on the feature branch. main stays behind while feature/login advances.',
      output: '[feature/login d4e5f6g] Add login form\n 1 file changed, 42 insertions(+)',
      graphState: {
        title: 'First commit on feature/login',
        branches: [MAIN, FEATURE],
        commits: [
          {
            id: 'a1b2c3d',
            label: 'Initial commit',
            branch: 'main',
            parents: [],
            bookmarks: ['main'],
          },
          {
            id: 'd4e5f6g',
            label: 'Add login form',
            branch: 'feature/login',
            parents: ['a1b2c3d'],
            bookmarks: ['feature/login'],
          },
        ],
      },
      highlightedCommitId: 'd4e5f6g',
      headLabel: 'HEAD',
    },
    {
      command: 'git commit -m "Add auth middleware"',
      vcs: 'git',
      description: 'A second commit on the feature branch, building on the previous one.',
      output: '[feature/login h7i8j9k] Add auth middleware\n 2 files changed, 78 insertions(+)',
      graphState: {
        title: 'Two commits on feature/login',
        branches: [MAIN, FEATURE],
        commits: [
          {
            id: 'a1b2c3d',
            label: 'Initial commit',
            branch: 'main',
            parents: [],
            bookmarks: ['main'],
          },
          {
            id: 'd4e5f6g',
            label: 'Add login form',
            branch: 'feature/login',
            parents: ['a1b2c3d'],
          },
          {
            id: 'h7i8j9k',
            label: 'Add auth middleware',
            branch: 'feature/login',
            parents: ['d4e5f6g'],
            bookmarks: ['feature/login'],
          },
        ],
      },
      highlightedCommitId: 'h7i8j9k',
      headLabel: 'HEAD',
    },
    {
      command: 'git checkout main && git commit -m "Update dependencies"',
      vcs: 'git',
      description:
        'Switch back to main and add a commit. Now main and feature/login have diverged — they share a common ancestor but each has unique commits.',
      output:
        "Switched to branch 'main'\n[main l0m1n2o] Update dependencies\n 1 file changed, 5 insertions(+), 3 deletions(-)",
      graphState: {
        title: 'Diverged branches',
        branches: [MAIN, FEATURE],
        commits: [
          {
            id: 'a1b2c3d',
            label: 'Initial commit',
            branch: 'main',
            parents: [],
          },
          {
            id: 'd4e5f6g',
            label: 'Add login form',
            branch: 'feature/login',
            parents: ['a1b2c3d'],
          },
          {
            id: 'h7i8j9k',
            label: 'Add auth middleware',
            branch: 'feature/login',
            parents: ['d4e5f6g'],
            bookmarks: ['feature/login'],
          },
          {
            id: 'l0m1n2o',
            label: 'Update dependencies',
            branch: 'main',
            parents: ['a1b2c3d'],
            bookmarks: ['main'],
          },
        ],
      },
      highlightedCommitId: 'l0m1n2o',
      headLabel: 'HEAD',
    },
    {
      command: 'git merge feature/login',
      vcs: 'git',
      description:
        'Merge feature/login into main. Because the branches diverged, Git creates a merge commit with two parents — preserving full history.',
      output:
        "Merge made by the 'ort' strategy.\n src/auth.js  | 78 ++++++\n src/login.jsx | 42 ++++++\n 2 files changed, 120 insertions(+)",
      graphState: {
        title: 'Merged with a merge commit',
        branches: [MAIN, FEATURE],
        commits: [
          {
            id: 'a1b2c3d',
            label: 'Initial commit',
            branch: 'main',
            parents: [],
          },
          {
            id: 'd4e5f6g',
            label: 'Add login form',
            branch: 'feature/login',
            parents: ['a1b2c3d'],
          },
          {
            id: 'h7i8j9k',
            label: 'Add auth middleware',
            branch: 'feature/login',
            parents: ['d4e5f6g'],
            bookmarks: ['feature/login'],
          },
          {
            id: 'l0m1n2o',
            label: 'Update dependencies',
            branch: 'main',
            parents: ['a1b2c3d'],
          },
          {
            id: 'p3q4r5s',
            label: "Merge 'feature/login'",
            branch: 'main',
            parents: ['l0m1n2o', 'h7i8j9k'],
            bookmarks: ['main'],
          },
        ],
      },
      highlightedCommitId: 'p3q4r5s',
      headLabel: 'HEAD',
    },
    {
      command: 'git branch -d feature/login',
      vcs: 'git',
      description:
        'Delete the feature branch label. The commits are still reachable through the merge commit — only the pointer is removed.',
      output: 'Deleted branch feature/login (was h7i8j9k).',
      graphState: {
        title: 'Feature branch pointer removed',
        branches: [MAIN, FEATURE],
        commits: [
          { id: 'a1b2c3d', label: 'Initial commit', branch: 'main', parents: [] },
          {
            id: 'd4e5f6g',
            label: 'Add login form',
            branch: 'feature/login',
            parents: ['a1b2c3d'],
          },
          {
            id: 'h7i8j9k',
            label: 'Add auth middleware',
            branch: 'feature/login',
            parents: ['d4e5f6g'],
          },
          {
            id: 'l0m1n2o',
            label: 'Update dependencies',
            branch: 'main',
            parents: ['a1b2c3d'],
          },
          {
            id: 'p3q4r5s',
            label: "Merge 'feature/login'",
            branch: 'main',
            parents: ['l0m1n2o', 'h7i8j9k'],
            bookmarks: ['main'],
          },
        ],
      },
      highlightedCommitId: 'p3q4r5s',
      headLabel: 'HEAD',
    },
  ],
};

// ── Scenario 2: jj Stacked Changes ───────────────────────────────────────────

const JJ_STACKED: Scenario = {
  id: 'jj-stacked',
  name: 'jj: Stacked Changes',
  description:
    'jj treats every change as a first-class object. Stack multiple in-progress changes and edit any of them without losing context.',
  icon: '🥞',
  tags: ['jj', 'stacking', 'rebase'],
  steps: [
    {
      command: 'jj git init --colocate',
      vcs: 'jj',
      description:
        'Initialize a jj repo using the git backend. The --colocate flag keeps the .git directory so git tools still work on the same repo.',
      output:
        'Done. The colocated Git repo has been initialized.\nWorking copy now at: zzzzzzzz (empty)\nParent commit      : 000000000000 (empty) (root)',
      graphState: {
        title: 'Fresh jj repo',
        branches: [JJ_MAIN],
        commits: [
          {
            id: 'zzzzzzzz',
            label: '(empty working copy)',
            branch: 'main',
            parents: [],
            isWorkingCopy: true,
          },
        ],
      },
      highlightedCommitId: 'zzzzzzzz',
      headLabel: '@',
    },
    {
      command: 'jj describe -m "Scaffold project structure"',
      vcs: 'jj',
      description:
        'Describe the current working-copy change. In jj, you describe a change before (or after) making edits — there\'s no separate staging step.',
      output:
        'Working copy now at: qpvuntsm Scaffold project structure\nParent commit      : 000000000000 (empty) (root)',
      graphState: {
        title: 'Describe the working copy',
        branches: [JJ_MAIN],
        commits: [
          {
            id: 'qpvuntsm',
            label: 'Scaffold project structure',
            branch: 'main',
            parents: [],
            isWorkingCopy: true,
          },
        ],
      },
      highlightedCommitId: 'qpvuntsm',
      headLabel: '@',
    },
    {
      command: 'jj new -m "Add database models"',
      vcs: 'jj',
      description:
        'Create a new change on top of the current one. jj automatically moves @ to the new change, like a git commit that immediately opens the editor for the next change.',
      output:
        'Working copy now at: rlvkpnvx Add database models\nParent commit      : qpvuntsm Scaffold project structure',
      graphState: {
        title: 'Stack: 2 changes deep',
        branches: [JJ_MAIN],
        commits: [
          { id: 'qpvuntsm', label: 'Scaffold project structure', branch: 'main', parents: [] },
          {
            id: 'rlvkpnvx',
            label: 'Add database models',
            branch: 'main',
            parents: ['qpvuntsm'],
            isWorkingCopy: true,
          },
        ],
      },
      highlightedCommitId: 'rlvkpnvx',
      headLabel: '@',
    },
    {
      command: 'jj new -m "Add API routes"',
      vcs: 'jj',
      description: 'Add a third change to the stack, building on the database models.',
      output:
        'Working copy now at: mzvwutvl Add API routes\nParent commit      : rlvkpnvx Add database models',
      graphState: {
        title: 'Stack: 3 changes deep',
        branches: [JJ_MAIN],
        commits: [
          { id: 'qpvuntsm', label: 'Scaffold project structure', branch: 'main', parents: [] },
          { id: 'rlvkpnvx', label: 'Add database models', branch: 'main', parents: ['qpvuntsm'] },
          {
            id: 'mzvwutvl',
            label: 'Add API routes',
            branch: 'main',
            parents: ['rlvkpnvx'],
            isWorkingCopy: true,
          },
        ],
      },
      highlightedCommitId: 'mzvwutvl',
      headLabel: '@',
    },
    {
      command: 'jj new @-- -m "Fix: DB connection pool size"',
      vcs: 'jj',
      description:
        'Create a new change based on @-- (two levels up, the "Scaffold" change). This forks the history — jj lets you branch off any ancestor without stashing.',
      output:
        'Working copy now at: yostqsyk Fix: DB connection pool size\nParent commit      : qpvuntsm Scaffold project structure',
      graphState: {
        title: 'Fork: edit an older change',
        branches: [JJ_MAIN, JJ_FEAT],
        commits: [
          { id: 'qpvuntsm', label: 'Scaffold project structure', branch: 'main', parents: [] },
          { id: 'rlvkpnvx', label: 'Add database models', branch: 'main', parents: ['qpvuntsm'] },
          {
            id: 'mzvwutvl',
            label: 'Add API routes',
            branch: 'main',
            parents: ['rlvkpnvx'],
          },
          {
            id: 'yostqsyk',
            label: 'Fix: DB connection pool size',
            branch: 'feature',
            parents: ['qpvuntsm'],
            isWorkingCopy: true,
          },
        ],
      },
      highlightedCommitId: 'yostqsyk',
      headLabel: '@',
    },
    {
      command: 'jj rebase -s rlvkpnvx -d @',
      vcs: 'jj',
      description:
        'Rebase the "Add database models" change (and all its descendants) onto our current @. jj rewrites the entire stack in one command — no interactive rebase needed.',
      output:
        'Rebased 2 commits onto destination\nWorking copy now at: yostqsyk Fix: DB connection pool size',
      graphState: {
        title: 'Stack rebased onto the fix',
        branches: [JJ_MAIN, JJ_FEAT],
        commits: [
          { id: 'qpvuntsm', label: 'Scaffold project structure', branch: 'main', parents: [] },
          {
            id: 'yostqsyk',
            label: 'Fix: DB connection pool size',
            branch: 'feature',
            parents: ['qpvuntsm'],
            isWorkingCopy: true,
          },
          {
            id: 'rlvkpnvx',
            label: 'Add database models',
            branch: 'main',
            parents: ['yostqsyk'],
          },
          {
            id: 'mzvwutvl',
            label: 'Add API routes',
            branch: 'main',
            parents: ['rlvkpnvx'],
          },
        ],
      },
      highlightedCommitId: 'yostqsyk',
      headLabel: '@',
    },
    {
      command: 'jj squash --from yostqsyk --into rlvkpnvx',
      vcs: 'jj',
      description:
        'Squash the fix into the "Add database models" change. jj merges their content and discards the fix commit — the stack becomes linear again.',
      output:
        'Working copy now at: mzvwutvl Add API routes\nParent commit      : rlvkpnvx Add database models (squashed)',
      graphState: {
        title: 'Fix squashed into database models',
        branches: [JJ_MAIN],
        commits: [
          { id: 'qpvuntsm', label: 'Scaffold project structure', branch: 'main', parents: [] },
          {
            id: 'rlvkpnvx',
            label: 'Add database models',
            branch: 'main',
            parents: ['qpvuntsm'],
          },
          {
            id: 'mzvwutvl',
            label: 'Add API routes',
            branch: 'main',
            parents: ['rlvkpnvx'],
            isWorkingCopy: true,
            bookmarks: ['main'],
          },
        ],
      },
      highlightedCommitId: 'mzvwutvl',
      headLabel: '@',
    },
  ],
};

// ── Scenario 3: jj ↔ git Interop ─────────────────────────────────────────────

const JJ_GIT_INTEROP: Scenario = {
  id: 'jj-git-interop',
  name: 'jj ↔ git Interop',
  description:
    'Use jj on top of an existing git remote. Fetch git branches as jj bookmarks, develop with jj tools, and push back to git.',
  icon: '🔄',
  tags: ['jj', 'git', 'interop', 'remote'],
  steps: [
    {
      command: 'git clone https://github.com/org/my-app.git && cd my-app',
      vcs: 'shell',
      description:
        'Start with a regular git clone. The repo has two commits on main already.',
      output:
        "Cloning into 'my-app'...\nremote: Enumerating objects: 14, done.\nresolved to 14 objects\nDone.",
      graphState: {
        title: 'Cloned git repo',
        branches: [ORIGIN_MAIN],
        commits: [
          { id: 'f8a3c1e', label: 'Initial commit', branch: 'main', parents: [] },
          {
            id: 'b2d9e4f',
            label: 'Add CI pipeline',
            branch: 'main',
            parents: ['f8a3c1e'],
            bookmarks: ['main', 'origin/main'],
          },
        ],
      },
      highlightedCommitId: 'b2d9e4f',
      headLabel: 'HEAD',
    },
    {
      command: 'jj git init --colocate',
      vcs: 'jj',
      description:
        'Wrap the git repo with jj. All existing git branches become jj bookmarks and the full history is available via jj log.',
      output:
        'Done. The colocated Git repo has been initialized.\nWorking copy now at: mrsqvxot (empty)\nParent commit      : b2d9e4f Add CI pipeline',
      graphState: {
        title: 'jj wraps the git repo',
        branches: [ORIGIN_MAIN],
        commits: [
          { id: 'f8a3c1e', label: 'Initial commit', branch: 'main', parents: [] },
          {
            id: 'b2d9e4f',
            label: 'Add CI pipeline',
            branch: 'main',
            parents: ['f8a3c1e'],
            bookmarks: ['main', 'origin/main'],
          },
          {
            id: 'mrsqvxot',
            label: '(empty working copy)',
            branch: 'main',
            parents: ['b2d9e4f'],
            isWorkingCopy: true,
          },
        ],
      },
      highlightedCommitId: 'mrsqvxot',
      headLabel: '@',
    },
    {
      command: 'jj new -m "Add search feature"',
      vcs: 'jj',
      description: 'Start a new change for our feature work.',
      output:
        'Working copy now at: kxvzptqn Add search feature\nParent commit      : b2d9e4f Add CI pipeline',
      graphState: {
        title: 'New change on top of main',
        branches: [ORIGIN_MAIN, ORIGIN_FEAT],
        commits: [
          { id: 'f8a3c1e', label: 'Initial commit', branch: 'main', parents: [] },
          {
            id: 'b2d9e4f',
            label: 'Add CI pipeline',
            branch: 'main',
            parents: ['f8a3c1e'],
            bookmarks: ['main', 'origin/main'],
          },
          {
            id: 'kxvzptqn',
            label: 'Add search feature',
            branch: 'feature/search',
            parents: ['b2d9e4f'],
            isWorkingCopy: true,
          },
        ],
      },
      highlightedCommitId: 'kxvzptqn',
      headLabel: '@',
    },
    {
      command: 'jj git fetch',
      vcs: 'jj',
      description:
        "Fetch updates from the git remote. A teammate pushed a new commit to main while we were working. jj represents this as origin/main moving forward.",
      output:
        'branch changes after fetch:\n  main@origin: b2d9e4f -> c5f1a8b',
      graphState: {
        title: 'Remote advanced: origin/main moved',
        branches: [ORIGIN_MAIN, ORIGIN_FEAT],
        commits: [
          { id: 'f8a3c1e', label: 'Initial commit', branch: 'main', parents: [] },
          { id: 'b2d9e4f', label: 'Add CI pipeline', branch: 'main', parents: ['f8a3c1e'], bookmarks: ['main'] },
          {
            id: 'c5f1a8b',
            label: 'Add rate limiting',
            branch: 'main',
            parents: ['b2d9e4f'],
            bookmarks: ['origin/main'],
          },
          {
            id: 'kxvzptqn',
            label: 'Add search feature',
            branch: 'feature/search',
            parents: ['b2d9e4f'],
            isWorkingCopy: true,
          },
        ],
      },
      highlightedCommitId: 'kxvzptqn',
      headLabel: '@',
    },
    {
      command: 'jj rebase -d main@origin',
      vcs: 'jj',
      description:
        "Rebase our work onto the fetched origin/main. Unlike git rebase, jj doesn't require you to switch branches first — it rebases @ in-place.",
      output:
        'Rebased 1 commits\nWorking copy now at: kxvzptqn Add search feature\nParent commit      : c5f1a8b Add rate limiting',
      graphState: {
        title: 'Our change rebased onto origin/main',
        branches: [ORIGIN_MAIN, ORIGIN_FEAT],
        commits: [
          { id: 'f8a3c1e', label: 'Initial commit', branch: 'main', parents: [] },
          { id: 'b2d9e4f', label: 'Add CI pipeline', branch: 'main', parents: ['f8a3c1e'] },
          {
            id: 'c5f1a8b',
            label: 'Add rate limiting',
            branch: 'main',
            parents: ['b2d9e4f'],
            bookmarks: ['main', 'origin/main'],
          },
          {
            id: 'kxvzptqn',
            label: 'Add search feature',
            branch: 'feature/search',
            parents: ['c5f1a8b'],
            isWorkingCopy: true,
          },
        ],
      },
      highlightedCommitId: 'kxvzptqn',
      headLabel: '@',
    },
    {
      command: 'jj bookmark set feature/search -r @',
      vcs: 'jj',
      description:
        'Create a bookmark named feature/search pointing at our current change. jj bookmarks map 1:1 to git branches when pushing.',
      output: "Created bookmark feature/search pointing to kxvzptqn",
      graphState: {
        title: 'Bookmark set for push',
        branches: [ORIGIN_MAIN, ORIGIN_FEAT],
        commits: [
          { id: 'f8a3c1e', label: 'Initial commit', branch: 'main', parents: [] },
          { id: 'b2d9e4f', label: 'Add CI pipeline', branch: 'main', parents: ['f8a3c1e'] },
          {
            id: 'c5f1a8b',
            label: 'Add rate limiting',
            branch: 'main',
            parents: ['b2d9e4f'],
            bookmarks: ['main', 'origin/main'],
          },
          {
            id: 'kxvzptqn',
            label: 'Add search feature',
            branch: 'feature/search',
            parents: ['c5f1a8b'],
            isWorkingCopy: true,
            bookmarks: ['feature/search'],
          },
        ],
      },
      highlightedCommitId: 'kxvzptqn',
      headLabel: '@',
    },
    {
      command: 'jj git push --bookmark feature/search',
      vcs: 'jj',
      description:
        'Push the bookmark to the git remote as a regular git branch. Your teammates can now open a PR against it using standard git tooling.',
      output:
        'Branch changes to push to origin:\n  Add bookmark feature/search => kxvzptqn\nPushed 1 bookmarks to origin',
      graphState: {
        title: 'Pushed to remote',
        branches: [ORIGIN_MAIN, ORIGIN_FEAT],
        commits: [
          { id: 'f8a3c1e', label: 'Initial commit', branch: 'main', parents: [] },
          { id: 'b2d9e4f', label: 'Add CI pipeline', branch: 'main', parents: ['f8a3c1e'] },
          {
            id: 'c5f1a8b',
            label: 'Add rate limiting',
            branch: 'main',
            parents: ['b2d9e4f'],
            bookmarks: ['main', 'origin/main'],
          },
          {
            id: 'kxvzptqn',
            label: 'Add search feature',
            branch: 'feature/search',
            parents: ['c5f1a8b'],
            isWorkingCopy: true,
            bookmarks: ['feature/search', 'origin/feature/search'],
          },
        ],
      },
      highlightedCommitId: 'kxvzptqn',
      headLabel: '@',
    },
  ],
};

// ── Scenario 4: Git Rebase vs Merge ──────────────────────────────────────────

const GIT_REBASE: Scenario = {
  id: 'git-rebase',
  name: 'Git: Rebase vs Merge',
  description:
    'Compare two integration strategies: merge preserves the full history fork, while rebase replays commits for a linear history.',
  icon: '🔀',
  tags: ['git', 'rebase', 'merge'],
  steps: [
    {
      command: 'git init && git commit --allow-empty -m "Initial commit"',
      vcs: 'git',
      description: 'Create a repository with one commit on main.',
      output: '[main (root-commit) a1b2c3d] Initial commit',
      graphState: {
        title: 'Starting point',
        branches: [{ name: 'main', color: '#6366f1' }],
        commits: [{ id: 'a1b2c3d', label: 'Initial commit', branch: 'main', parents: [], bookmarks: ['main'] }],
      },
      highlightedCommitId: 'a1b2c3d',
      headLabel: 'HEAD',
    },
    {
      command: 'git checkout -b feature && git commit -m "Feature: step 1"',
      vcs: 'git',
      description: 'Branch off main and commit on feature.',
      output: "Switched to a new branch 'feature'\n[feature b3c4d5e] Feature: step 1",
      graphState: {
        title: 'Feature branch: one commit',
        branches: [{ name: 'main', color: '#6366f1' }, { name: 'feature', color: '#f59e0b' }],
        commits: [
          { id: 'a1b2c3d', label: 'Initial commit', branch: 'main', parents: [], bookmarks: ['main'] },
          { id: 'b3c4d5e', label: 'Feature: step 1', branch: 'feature', parents: ['a1b2c3d'], bookmarks: ['feature'] },
        ],
      },
      highlightedCommitId: 'b3c4d5e',
      headLabel: 'HEAD',
    },
    {
      command: 'git commit -m "Feature: step 2"',
      vcs: 'git',
      description: 'A second commit on feature.',
      output: '[feature c5d6e7f] Feature: step 2\n 1 file changed, 15 insertions(+)',
      graphState: {
        title: 'Feature: two commits',
        branches: [{ name: 'main', color: '#6366f1' }, { name: 'feature', color: '#f59e0b' }],
        commits: [
          { id: 'a1b2c3d', label: 'Initial commit', branch: 'main', parents: [], bookmarks: ['main'] },
          { id: 'b3c4d5e', label: 'Feature: step 1', branch: 'feature', parents: ['a1b2c3d'] },
          { id: 'c5d6e7f', label: 'Feature: step 2', branch: 'feature', parents: ['b3c4d5e'], bookmarks: ['feature'] },
        ],
      },
      highlightedCommitId: 'c5d6e7f',
      headLabel: 'HEAD',
    },
    {
      command: 'git checkout main && git commit -m "Hotfix on main"',
      vcs: 'git',
      description: 'Meanwhile, main gets a commit. The branches have now diverged.',
      output: "Switched to branch 'main'\n[main d7e8f9a] Hotfix on main",
      graphState: {
        title: 'Diverged: main got a hotfix',
        branches: [{ name: 'main', color: '#6366f1' }, { name: 'feature', color: '#f59e0b' }],
        commits: [
          { id: 'a1b2c3d', label: 'Initial commit', branch: 'main', parents: [] },
          { id: 'b3c4d5e', label: 'Feature: step 1', branch: 'feature', parents: ['a1b2c3d'] },
          { id: 'c5d6e7f', label: 'Feature: step 2', branch: 'feature', parents: ['b3c4d5e'], bookmarks: ['feature'] },
          { id: 'd7e8f9a', label: 'Hotfix on main', branch: 'main', parents: ['a1b2c3d'], bookmarks: ['main'] },
        ],
      },
      highlightedCommitId: 'd7e8f9a',
      headLabel: 'HEAD',
    },
    {
      command: '# Option A: git merge feature',
      vcs: 'git',
      description:
        'MERGE: Integrates feature into main with a new merge commit that has two parents. History is preserved exactly — you can see the fork and when it was resolved.',
      output:
        "Merge made by the 'ort' strategy.\n 1 file changed, 15 insertions(+)",
      graphState: {
        title: 'After git merge: merge commit',
        branches: [{ name: 'main', color: '#6366f1' }, { name: 'feature', color: '#f59e0b' }],
        commits: [
          { id: 'a1b2c3d', label: 'Initial commit', branch: 'main', parents: [] },
          { id: 'b3c4d5e', label: 'Feature: step 1', branch: 'feature', parents: ['a1b2c3d'] },
          { id: 'c5d6e7f', label: 'Feature: step 2', branch: 'feature', parents: ['b3c4d5e'], bookmarks: ['feature'] },
          { id: 'd7e8f9a', label: 'Hotfix on main', branch: 'main', parents: ['a1b2c3d'] },
          { id: 'e9f0a1b', label: "Merge 'feature'", branch: 'main', parents: ['d7e8f9a', 'c5d6e7f'], bookmarks: ['main'] },
        ],
      },
      highlightedCommitId: 'e9f0a1b',
      headLabel: 'HEAD',
    },
    {
      command: '# Option B: git rebase main (on feature branch)',
      vcs: 'git',
      description:
        'REBASE: Instead of merging, replay the feature commits on top of main. This rewrites commit IDs but produces a clean linear history with no merge commit.',
      output:
        "Successfully rebased and updated refs/heads/feature.\n[detached HEAD c5d6e7f] Feature: step 2",
      graphState: {
        title: 'After git rebase: linear history',
        branches: [{ name: 'main', color: '#6366f1' }, { name: 'feature', color: '#f59e0b' }],
        commits: [
          { id: 'a1b2c3d', label: 'Initial commit', branch: 'main', parents: [] },
          { id: 'd7e8f9a', label: 'Hotfix on main', branch: 'main', parents: ['a1b2c3d'], bookmarks: ['main'] },
          { id: 'b3c4d5e', label: "Feature: step 1 (rebased)", branch: 'feature', parents: ['d7e8f9a'] },
          { id: 'c5d6e7f', label: "Feature: step 2 (rebased)", branch: 'feature', parents: ['b3c4d5e'], bookmarks: ['feature'] },
        ],
      },
      highlightedCommitId: 'c5d6e7f',
      headLabel: 'HEAD',
    },
    {
      command: 'git checkout main && git merge feature  # fast-forward',
      vcs: 'git',
      description:
        'Now that feature is directly ahead of main, the merge is a fast-forward — main simply moves its pointer forward. No merge commit, perfectly linear history.',
      output: "Updating d7e8f9a..c5d6e7f\nFast-forward\n 1 file changed, 15 insertions(+)",
      graphState: {
        title: 'Fast-forward: linear history achieved',
        branches: [{ name: 'main', color: '#6366f1' }, { name: 'feature', color: '#f59e0b' }],
        commits: [
          { id: 'a1b2c3d', label: 'Initial commit', branch: 'main', parents: [] },
          { id: 'd7e8f9a', label: 'Hotfix on main', branch: 'main', parents: ['a1b2c3d'] },
          { id: 'b3c4d5e', label: 'Feature: step 1 (rebased)', branch: 'feature', parents: ['d7e8f9a'] },
          {
            id: 'c5d6e7f',
            label: 'Feature: step 2 (rebased)',
            branch: 'feature',
            parents: ['b3c4d5e'],
            bookmarks: ['main', 'feature'],
          },
        ],
      },
      highlightedCommitId: 'c5d6e7f',
      headLabel: 'HEAD',
    },
  ],
};

// ── Export ────────────────────────────────────────────────────────────────────

export const SCENARIOS: Scenario[] = [
  GIT_FEATURE_BRANCH,
  GIT_REBASE,
  JJ_STACKED,
  JJ_GIT_INTEROP,
];
