import React from 'react';
import Layout from '@theme/Layout';
import BrowserOnly from '@docusaurus/BrowserOnly';
export default function DagVisualizerPage() {
    return (<Layout title="DAG Visualizer" description="Visualize AI-aided engineering workflows as interactive DAGs. Shareable via URL.">
      <BrowserOnly fallback={<div style={{ padding: '4rem', textAlign: 'center' }}>Loading…</div>}>
        {() => {
            const { DagVisualizerContent } = require('./_DagVisualizerContent');
            return <DagVisualizerContent />;
        }}
      </BrowserOnly>
    </Layout>);
}
