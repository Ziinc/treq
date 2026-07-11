import React from 'react';
import Layout from '@theme/Layout';
import BrowserOnly from '@docusaurus/BrowserOnly';

export default function PRDCreatorPage() {
  return (
    <Layout
      title="PRD Creator"
      description="Create structured Product Requirements Documents with competitor analysis, user stories, options, and implementation plans."
    >
      <BrowserOnly fallback={<div style={{ padding: '4rem', textAlign: 'center' }}>Loading…</div>}>
        {() => {
          const { PRDCreatorContent } = require('./_PRDCreatorContent');
          return <PRDCreatorContent />;
        }}
      </BrowserOnly>
    </Layout>
  );
}
