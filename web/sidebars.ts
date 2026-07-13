import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    {
      type: 'doc',
      id: 'intro',
      label: 'Overview',
    },
    {
      type: 'category',
      label: 'Getting Started',
      collapsed: false,
      items: [
        'getting-started/installation',
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
      label: 'Guides',
      link: {type: 'doc', id: 'guides/index'},
      items: [],
    },
    {
      type: 'category',
      label: 'Concepts',
      link: {type: 'doc', id: 'concepts/index'},
      items: [
        'concepts/workspaces',
        'concepts/changes-and-reviews',
        'concepts/agent-sessions',
        'concepts/terminal-sessions',
        'concepts/commit-management',
      ],
    },
    {
      type: 'doc',
      id: 'under-the-hood/index',
      label: 'Under the Hood',
    },
    {
      type: 'category',
      label: 'Reference',
      items: [
        'reference/cli',
        'reference/keyboard-shortcuts',
        'reference/contributing',
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
