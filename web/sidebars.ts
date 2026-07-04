import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.
 */
const sidebars: SidebarsConfig = {
  // User Guides Sidebar (Primary)
  guidesSidebar: [
    {
      type: 'doc',
      id: 'guides/index',
      label: 'Overview',
    },
    {
      type: 'category',
      label: 'Getting Started',
      collapsed: false,
      items: [
        'guides/getting-started/installation',
        'guides/getting-started/your-first-workspace',
      ],
    },
    {
      type: 'category',
      label: 'Core Workflows',
      items: [
        'guides/core-workflows/using-treq-with-git-repo',
        'guides/core-workflows/creating-terminal-sessions',
        'guides/core-workflows/committing-changes',
        'guides/core-workflows/code-review-workflow',
        'guides/core-workflows/merging-workspaces',
      ],
    },
    {
      type: 'category',
      label: 'Common Tasks',
      items: [
        'guides/common-tasks/pushing-to-remote',
        'guides/common-tasks/discarding-changes',
        'guides/common-tasks/moving-files-between-workspaces',
      ],
    },
    {
      type: 'category',
      label: 'Tips & Tricks',
      items: [
        'guides/tips-and-tricks/customizing-settings',
      ],
    },
  ],

  // Technical Documentation Sidebar
  docsSidebar: [
    {
      type: 'doc',
      id: 'intro',
      label: 'Overview',
    },
    {
      type: 'category',
      label: 'Workspaces',
      collapsed: false,
      collapsible: false,
      link: {
        type: 'doc',
        id: 'features/workspaces',
      },
      items: [
        'features/commit-management',
        'features/reviews',
      ],
    },
    'features/terminal-sessions',
    'cli',
    'keyboard-shortcuts',
    'contributing',
  ],
};

export default sidebars;
