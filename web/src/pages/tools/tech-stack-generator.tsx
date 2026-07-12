import React, { useState, useCallback } from 'react';
import Layout from '@theme/Layout';
import styles from './tech-stack-generator.module.css';

const TECHNOLOGIES = [
  // Frontend
  { name: 'React', category: 'frontend' },
  { name: 'Vue', category: 'frontend' },
  { name: 'Svelte', category: 'frontend' },
  { name: 'Next.js', category: 'frontend' },
  { name: 'Angular', category: 'frontend' },
  { name: 'WASM', category: 'frontend' },
  { name: 'Solid.js', category: 'frontend' },
  { name: 'Astro', category: 'frontend' },
  { name: 'Remix', category: 'frontend' },
  { name: 'Nuxt', category: 'frontend' },
  { name: 'Qwik', category: 'frontend' },
  // Backend
  { name: 'Rust', category: 'backend' },
  { name: 'Go', category: 'backend' },
  { name: 'Python', category: 'backend' },
  { name: 'Node.js', category: 'backend' },
  { name: 'Elixir', category: 'backend' },
  { name: 'Zig', category: 'backend' },
  { name: 'Java', category: 'backend' },
  { name: 'C#', category: 'backend' },
  { name: 'Ruby', category: 'backend' },
  { name: 'Scala', category: 'backend' },
  { name: 'Kotlin', category: 'backend' },
  { name: 'Haskell', category: 'backend' },
  { name: 'OCaml', category: 'backend' },
  { name: 'Gleam', category: 'backend' },
  // Database
  { name: 'PostgreSQL', category: 'database' },
  { name: 'MySQL', category: 'database' },
  { name: 'MongoDB', category: 'database' },
  { name: 'Redis', category: 'database' },
  { name: 'ClickHouse', category: 'database' },
  { name: 'Neo4j', category: 'database' },
  { name: 'CockroachDB', category: 'database' },
  { name: 'DynamoDB', category: 'database' },
  { name: 'SQLite', category: 'database' },
  { name: 'Cassandra', category: 'database' },
  { name: 'TigerBeetle', category: 'database' },
  { name: 'SurrealDB', category: 'database' },
  { name: 'Valkey', category: 'database' },
  // Messaging
  { name: 'Kafka', category: 'messaging' },
  { name: 'RabbitMQ', category: 'messaging' },
  { name: 'NATS', category: 'messaging' },
  { name: 'Pulsar', category: 'messaging' },
  { name: 'SQS', category: 'messaging' },
  { name: 'Redpanda', category: 'messaging' },
  // Orchestration
  { name: 'Temporal', category: 'orchestration' },
  { name: 'Airflow', category: 'orchestration' },
  { name: 'Prefect', category: 'orchestration' },
  { name: 'Dagster', category: 'orchestration' },
  // Infrastructure
  { name: 'Kubernetes', category: 'infra' },
  { name: 'Docker', category: 'infra' },
  { name: 'Terraform', category: 'infra' },
  { name: 'AWS', category: 'infra' },
  { name: 'GCP', category: 'infra' },
  { name: 'Azure', category: 'infra' },
  { name: 'Vercel', category: 'infra' },
  { name: 'Fly.io', category: 'infra' },
  { name: 'Pulumi', category: 'infra' },
  { name: 'Nomad', category: 'infra' },
  // Observability
  { name: 'Prometheus', category: 'observability' },
  { name: 'Grafana', category: 'observability' },
  { name: 'Datadog', category: 'observability' },
  { name: 'OpenTelemetry', category: 'observability' },
  { name: 'Jaeger', category: 'observability' },
  { name: 'Sentry', category: 'observability' },
  { name: 'Honeycomb', category: 'observability' },
] as const;

type Tech = (typeof TECHNOLOGIES)[number];

const ARCHETYPES = [
  'The Over-Engineered Startup',
  'The Pragmatic Monolith',
  'The Distributed Nightmare',
  'The Cloud Native Dream',
  'The Budget FAANG',
  "The 10x Dev's Weekend Project",
  'The Enterprise Abomination',
  "The Hacker's Delight",
  'The Microservices Graveyard',
  'The Serverless Gamble',
  'The Resume-Driven Development Stack',
  'The Boring Tech Stack',
  'The Kubernetes Maximalist',
  'The "We Read the HN Comments" Stack',
  'The "Just Ship It" Stack',
  'The Conference Talk Bingo Card',
  "The SRE's Anxiety Dream",
  'The "It Worked on My Machine" Special',
  'The 3 AM Incident Response Stack',
  'The Eternal Rewrite',
];

const CATEGORY_LABELS: Record<string, string> = {
  frontend: 'frontend',
  backend: 'backend',
  database: 'database',
  messaging: 'messaging',
  orchestration: 'orchestration',
  infra: 'infra',
  observability: 'observability',
};

function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateStack() {
  const size = Math.floor(Math.random() * 7) + 4; // 4–10
  const archetype = ARCHETYPES[Math.floor(Math.random() * ARCHETYPES.length)];
  const stack = shuffle(TECHNOLOGIES).slice(0, size);
  return { stack, archetype, key: Date.now() };
}

type StackResult = ReturnType<typeof generateStack>;

export default function TechStackGenerator() {
  const [result, setResult] = useState<StackResult | null>(null);

  const generate = useCallback(() => {
    setResult(generateStack());
  }, []);

  return (
    <Layout
      title="Tech Stack Generator"
      description="Generate a random tech stack. Because why not."
    >
      <div className={styles.page}>
        <div className={styles.header}>
          <h1 className={styles.title}>Tech Stack Generator</h1>
          <p className={styles.subtitle}>
            Because every project deserves an unnecessarily complex infrastructure.
          </p>
        </div>

        <div className={styles.legend}>
          {Object.entries(CATEGORY_LABELS).map(([cat, label]) => (
            <span key={cat} className={styles.legendItem} data-category={cat}>
              {label}
            </span>
          ))}
        </div>

        <div className={styles.center}>
          <button className={styles.generateBtn} onClick={generate}>
            {result ? '🎲 Regenerate' : '🎲 Generate Stack'}
          </button>
        </div>

        {result && (
          <div key={result.key} className={styles.result}>
            <p className={styles.archetype}>"{result.archetype}"</p>
            <div className={styles.badgeGrid}>
              {result.stack.map((tech: Tech, i: number) => (
                <span
                  key={tech.name}
                  className={styles.badge}
                  data-category={tech.category}
                  style={{ animationDelay: `${i * 55}ms` }}
                >
                  {tech.name}
                </span>
              ))}
            </div>
            <p className={styles.hint}>{result.stack.length} technologies</p>
          </div>
        )}
      </div>
    </Layout>
  );
}
