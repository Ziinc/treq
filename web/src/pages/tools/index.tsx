import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import styles from './index.module.css';

const tools = [
  {
    name: 'VCS Simulator',
    slug: 'vcs-simulator',
    description:
      'Step through git and jj commands interactively, watching the commit graph update in real time. Covers branching, rebasing, stacking, and git-jj interop.',
    icon: '🎮',
    tags: ['git', 'jj', 'interactive'],
  },
  {
    name: 'Branch Visualizer',
    slug: 'branch-visualizer',
    description:
      'Sketch git branch diagrams with a hand-drawn aesthetic. Shareable via URL.',
    icon: '🌿',
    tags: ['git', 'visualization'],
  },
  {
    name: 'DAG Visualizer',
    slug: 'dag-visualizer',
    description:
      'Map AI-aided engineering workflows as interactive DAGs. Edit prompts and slash skills per node.',
    icon: '🔀',
    tags: ['ai', 'workflow', 'dag'],
  },
  {
    name: 'Gherkin BDD Editor',
    slug: 'gherkin-editor',
    description:
      'Write BDD specs using a structured form. Organise features and scenarios, then export to .feature files. Saved locally in your browser.',
    icon: '🥒',
    tags: ['bdd', 'testing', 'gherkin'],
  },
  {
    name: 'Vibe Idea Generator',
    slug: 'vibe-idea-generator',
    description:
      'Throw buzzword-packed vibe coding ideas at the wall and see what sticks. A potato helps.',
    icon: '🥔',
    tags: ['fun', 'ideas', 'vibes'],
  },
  {
    name: 'Rubber Duck Debugger',
    slug: 'rubber-duck',
    description:
      'Explain your bug to a giant rubber duck. The duck will quack. You will solve it yourself.',
    icon: '🦆',
    tags: ['fun', 'debugging', 'rubber-duck'],
  },
];

export default function ToolsPage() {
  return (
    <Layout title="Tools" description="Developer tools built by the Treq team.">
      <div className={styles.page}>
        <div className={styles.header}>
          <h1 className={styles.title}>Tools</h1>
          <p className={styles.subtitle}>
            Handy utilities for developers. All free, all open source.
          </p>
        </div>
        <div className={styles.grid}>
          {tools.map((tool) => (
            <Link key={tool.slug} to={`/tools/${tool.slug}`} className={styles.card}>
              <div className={styles.cardIcon}>{tool.icon}</div>
              <div className={styles.cardBody}>
                <h2 className={styles.cardTitle}>{tool.name}</h2>
                <p className={styles.cardDesc}>{tool.description}</p>
                <div className={styles.tags}>
                  {tool.tags.map((t) => (
                    <span key={t} className={styles.tag}>{t}</span>
                  ))}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </Layout>
  );
}
