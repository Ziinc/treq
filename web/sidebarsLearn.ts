import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  learnSidebar: [
    {
      type: 'doc',
      id: 'index',
      label: 'Overview',
    },
    {
      type: 'category',
      label: 'Concepts',
      link: {type: 'doc', id: 'concepts/index'},
      items: [
        {
          type: 'category',
          label: 'AI Engineering',
          link: {type: 'doc', id: 'concepts/ai-engineering/index'},
          items: [
            'concepts/ai-engineering/ai-assisted-software-engineering',
            'concepts/ai-engineering/human-in-the-loop-development',
            'concepts/ai-engineering/coding-agents',
            'concepts/ai-engineering/ai-code-review',
            'concepts/ai-engineering/agent-orchestration',
          ],
        },
        {
          type: 'category',
          label: 'Git & Version Control',
          link: {type: 'doc', id: 'concepts/git/index'},
          items: [
            'concepts/git/git-worktrees',
            'concepts/git/stacked-prs',
            'concepts/git/git-worktrees-vs-clones',
            'concepts/git/cherry-pick-vs-rebase',
            'concepts/git/merge-vs-rebase',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Workflows',
      link: {type: 'doc', id: 'workflows/index'},
      items: [
        {
          type: 'category',
          label: 'AI Workflows',
          link: {type: 'doc', id: 'workflows/ai/index'},
          items: [
            'workflows/ai/ai-feature-development',
            'workflows/ai/ai-bug-fix',
            'workflows/ai/ai-refactoring',
            'workflows/ai/ai-code-review',
          ],
        },
        {
          type: 'category',
          label: 'Git Workflows',
          link: {type: 'doc', id: 'workflows/git/index'},
          items: [
            'workflows/git/stacked-pr',
            'workflows/git/parallel-development',
            'workflows/git/human-in-the-loop-review',
          ],
        },
        {
          type: 'category',
          label: 'Tech Stack Workflows',
          link: {type: 'doc', id: 'workflows/stacks/index'},
          items: [
            'workflows/stacks/react-development',
            'workflows/stacks/tauri-development',
            'workflows/stacks/elixir-ai',
            'workflows/stacks/rust-refactoring',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Tutorials',
      link: {type: 'doc', id: 'tutorials/index'},
      items: [
        'tutorials/using-treq-with-git-repo',
        'tutorials/creating-terminal-sessions',
        'tutorials/managing-workspaces',
        'tutorials/committing-changes',
        'tutorials/code-review-workflow',
        'tutorials/merging-workspaces',
      ],
    },
    {
      type: 'category',
      label: 'How-To',
      link: {type: 'doc', id: 'how-to/index'},
      items: [
        'how-to/pushing-to-remote',
        'how-to/discarding-changes',
        'how-to/moving-files-between-workspaces',
        'how-to/customizing-settings',
      ],
    },
    {
      type: 'category',
      label: 'Troubleshooting',
      link: {type: 'doc', id: 'troubleshooting/index'},
      items: [],
    },
  ],
};

export default sidebars;
