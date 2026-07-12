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
  {
    name: 'Gherkin BDD Editor',
    slug: 'gherkin-editor',
    description:
      'Write BDD specs using a structured form. Organise features and scenarios, then export to .feature files. Saved locally in your browser.',
    icon: '🥒',
    tags: ['bdd', 'testing', 'gherkin'],
  },
  {
    name: 'Tech Stack Generator',
    slug: 'tech-stack-generator',
    description:
      'Generate a random tech stack of variable size. Frontend, backend, databases, infra, and more — shuffled fresh every click.',
    icon: '🎲',
    tags: ['fun', 'random', 'tech'],
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
