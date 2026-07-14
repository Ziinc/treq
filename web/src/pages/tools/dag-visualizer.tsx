import React, { lazy, Suspense } from 'react';
import Layout from '@theme/Layout';
import BrowserOnly from '@docusaurus/BrowserOnly';

const DagVisualizerContent = lazy(() =>
  import('./_DagVisualizerContent').then((m) => ({ default: m.DagVisualizerContent }))
);

const loadingFallback = <div style={{ padding: '4rem', textAlign: 'center' }}>Loading…</div>;

export default function DagVisualizerPage() {
  return (
    <Layout
      title="DAG Visualizer"
      description="Visualize AI-aided engineering workflows as interactive DAGs. Shareable via URL."
    >
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
