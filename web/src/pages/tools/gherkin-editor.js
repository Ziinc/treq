import React from 'react';
import Layout from '@theme/Layout';
import BrowserOnly from '@docusaurus/BrowserOnly';
export default function GherkinEditorPage() {
    return (<Layout title="Gherkin BDD Editor" description="Write BDD specs in a structured form and export to .feature files. Features are saved locally in your browser.">
      <BrowserOnly fallback={<div style={{ padding: '4rem', textAlign: 'center' }}>Loading…</div>}>
        {() => {
            const { GherkinEditorContent } = require('./_GherkinEditorContent');
            return <GherkinEditorContent />;
        }}
      </BrowserOnly>
    </Layout>);
}
