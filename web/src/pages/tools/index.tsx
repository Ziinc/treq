import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import styles from './index.module.css';

const tools = [
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
