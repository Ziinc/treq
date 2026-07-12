import React from 'react';
import Layout from '@theme/Layout';
import BrowserOnly from '@docusaurus/BrowserOnly';
export default function BingoCardPage() {
    return (<Layout title="Bingo Card Generator" description="Generate bingo cards for PR reviews, AI slop, and vibe coding. Shuffle and mark squares as you spot them.">
      <BrowserOnly fallback={<div style={{ padding: '4rem', textAlign: 'center' }}>Loading…</div>}>
        {() => {
            const { BingoCardContent } = require('./_BingoCardContent');
            return <BingoCardContent />;
        }}
      </BrowserOnly>
    </Layout>);
}
