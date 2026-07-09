import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const article = (id: string) => ({type: 'doc' as const, id, className: 'hidden-sidebar-article'});

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
            article('concepts/ai-engineering/ai-assisted-software-engineering'),
            article('concepts/ai-engineering/human-in-the-loop-development'),
            article('concepts/ai-engineering/coding-agents'),
            article('concepts/ai-engineering/ai-code-review'),
            article('concepts/ai-engineering/agent-orchestration'),
          ],
        },
        {
          type: 'category',
          label: 'Git & Version Control',
          link: {type: 'doc', id: 'concepts/git/index'},
          items: [
            article('concepts/git/git-worktrees'),
            article('concepts/git/stacked-prs'),
            article('concepts/git/git-worktrees-vs-clones'),
            article('concepts/git/cherry-pick-vs-rebase'),
            article('concepts/git/merge-vs-rebase'),
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
            article('workflows/ai/ai-feature-development'),
            article('workflows/ai/ai-bug-fix'),
            article('workflows/ai/ai-refactoring'),
            article('workflows/ai/ai-code-review'),
          ],
        },
        {
          type: 'category',
          label: 'Git Workflows',
          link: {type: 'doc', id: 'workflows/git/index'},
          items: [
            article('workflows/git/stacked-pr'),
            article('workflows/git/parallel-development'),
            article('workflows/git/human-in-the-loop-review'),
          ],
        },
        {
          type: 'category',
          label: 'Tech Stack Workflows',
          link: {type: 'doc', id: 'workflows/stacks/index'},
          items: [
            article('workflows/stacks/react-development'),
            article('workflows/stacks/tauri-development'),
            article('workflows/stacks/elixir-ai'),
            article('workflows/stacks/rust-refactoring'),
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Tutorials',
      link: {type: 'doc', id: 'tutorials/index'},
      items: [
        article('tutorials/using-treq-with-git-repo'),
        article('tutorials/creating-terminal-sessions'),
        article('tutorials/managing-workspaces'),
        article('tutorials/committing-changes'),
        article('tutorials/code-review-workflow'),
        article('tutorials/merging-workspaces'),
      ],
    },
    {
      type: 'category',
      label: 'How-To',
      link: {type: 'doc', id: 'how-to/index'},
      items: [
        article('how-to/pushing-to-remote'),
        article('how-to/discarding-changes'),
        article('how-to/moving-files-between-workspaces'),
        article('how-to/customizing-settings'),
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
