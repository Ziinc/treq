import React, { lazy, Suspense } from 'react';
import Layout from '@theme/Layout';
import Head from '@docusaurus/Head';
import BrowserOnly from '@docusaurus/BrowserOnly';

const DagVisualizerContent = lazy(() =>
  import('./_DagVisualizerContent').then((m) => ({ default: m.DagVisualizerContent }))
);

const loadingFallback = <div style={{ padding: '4rem', textAlign: 'center' }}>Loading…</div>;

const SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'DAG Visualizer',
  description:
    'Visualize AI-aided engineering workflows as interactive DAGs. Shareable via URL.',
  url: 'https://treq.dev/tools/dag-visualizer',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Any',
  isAccessibleForFree: true,
  provider: {
    '@type': 'Organization',
    name: 'Treq',
    url: 'https://treq.dev',
  },
};

export default function DagVisualizerPage() {
  return (
    <Layout
      title="DAG Visualizer"
      description="Visualize AI-aided engineering workflows as interactive DAGs. Shareable via URL."
    >
      <Head>
        <script type="application/ld+json">{JSON.stringify(SCHEMA)}</script>
      </Head>
      <BrowserOnly fallback={loadingFallback}>
        {() => (
          <Suspense fallback={loadingFallback}>
            <DagVisualizerContent />
          </Suspense>
        )}
      </BrowserOnly>
    </Layout>
  );
}
