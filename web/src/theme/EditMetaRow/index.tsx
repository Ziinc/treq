import React, {useState, type ReactNode} from 'react';
import clsx from 'clsx';
import EditThisPage from '@theme/EditThisPage';
import LastUpdated from '@theme/LastUpdated';
import type {Props} from '@theme/EditMetaRow';
import {useDoc} from '@docusaurus/plugin-content-docs/client';
import {usePluginData} from '@docusaurus/useGlobalData';
import styles from './styles.module.css';

export default function EditMetaRow({
  className,
  editUrl,
  lastUpdatedAt,
  lastUpdatedBy,
}: Props): ReactNode {
  const [label, setLabel] = useState('Copy as Markdown');
  const {metadata} = useDoc();
  const markdownData = usePluginData('raw-markdown-plugin') as Record<string, string>;

  const handleCopy = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    try {
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
    <div className={clsx('row', className)}>
      <div className={clsx('col', styles.noPrint)}>
        {editUrl && <EditThisPage editUrl={editUrl} />}
        {editUrl && ' · '}
        <a href="#" onClick={handleCopy} className="theme-edit-this-page">
          {label}
        </a>
      </div>
      <div className={clsx('col', styles.lastUpdated)}>
        {(lastUpdatedAt || lastUpdatedBy) && (
          <LastUpdated
            lastUpdatedAt={lastUpdatedAt}
            lastUpdatedBy={lastUpdatedBy}
          />
        )}
      </div>
    </div>
  );
}
