import React, {useState, type ReactNode} from 'react';
import OriginalDocItemTOCDesktop from '@theme-original/DocItem/TOCDesktop';
import type {Props} from '@theme/DocItem/TOCDesktop';
import {useDoc} from '@docusaurus/plugin-content-docs/client';
import {usePluginData} from '@docusaurus/core/client';

export default function TocSide(props: Props): ReactNode {
  const [label, setLabel] = useState('Copy as Markdown');
  const {metadata} = useDoc();
  const markdownData = usePluginData('raw-markdown-plugin') as Record<string, string>;

  const handleCopy = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    try {
      // metadata.source is like '@site/docs/guides/index.md'
      const docPath = metadata.source.replace('@site/', '');
      const markdown = markdownData?.[docPath];
      if (markdown) {
        await navigator.clipboard.writeText(markdown);
        setLabel('Copied!');
        setTimeout(() => setLabel('Copy as Markdown'), 2000);
      }
    } catch {
      // silently fail if clipboard is unavailable
    }
  };

  return (
    <>
      <OriginalDocItemTOCDesktop {...props} />
      <div style={{paddingLeft: '1rem', marginTop: '0.75rem'}}>
        <button
          className="button button--secondary button--sm"
          onClick={handleCopy}
          style={{width: '100%'}}
          type="button"
        >
          {label}
        </button>
      </div>
    </>
  );
}
