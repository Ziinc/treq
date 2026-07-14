import React, { lazy, Suspense } from 'react';
import Layout from '@theme/Layout';
import BrowserOnly from '@docusaurus/BrowserOnly';

const GherkinEditorContent = lazy(() =>
  import('./_GherkinEditorContent').then((m) => ({ default: m.GherkinEditorContent }))
);

const loadingFallback = <div style={{ padding: '4rem', textAlign: 'center' }}>Loading…</div>;

export default function GherkinEditorPage() {
  return (
    <Layout
      title="Gherkin BDD Editor"
      description="Write BDD specs in a structured form and export to .feature files. Features are saved locally in your browser."
    >
      <BrowserOnly fallback={loadingFallback}>
        {() => (
          <Suspense fallback={loadingFallback}>
            <GherkinEditorContent />
          </Suspense>
        )}
      </BrowserOnly>
    </Layout>
  );
}
