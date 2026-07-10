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
        {type: 'doc', id: 'concepts/ai-engineering/index', label: 'AI Engineering'},
        {type: 'doc', id: 'concepts/git/index', label: 'Git & Version Control'},
      ],
    },
    {
      type: 'category',
      label: 'Workflows',
      link: {type: 'doc', id: 'workflows/index'},
      items: [
        {type: 'doc', id: 'workflows/ai/index', label: 'AI Workflows'},
        {type: 'doc', id: 'workflows/git/index', label: 'Git Workflows'},
        {type: 'doc', id: 'workflows/stacks/index', label: 'Tech Stack Workflows'},
      ],
    },
    {type: 'doc', id: 'tutorials/index', label: 'Tutorials'},
    {type: 'doc', id: 'how-to/index', label: 'How-To'},
    {type: 'doc', id: 'troubleshooting/index', label: 'Troubleshooting'},
  ],
};

export default sidebars;
