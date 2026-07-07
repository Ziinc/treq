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
        'concepts/workspaces',
        'concepts/reviews',
        'concepts/terminal-sessions',
        'concepts/commit-management',
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
