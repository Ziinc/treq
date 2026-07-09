import React, {useState, type ReactNode} from 'react';
import clsx from 'clsx';
import EditThisPage from '@theme/EditThisPage';
import LastUpdated from '@theme/LastUpdated';
import type {Props} from '@theme/EditMetaRow';
import {useDoc} from '@docusaurus/plugin-content-docs/client';
import {usePluginData} from '@docusaurus/useGlobalData';
import styles from './styles.module.css';

function IconMarkdown(): ReactNode {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 208 128"
      fill="currentColor"
      aria-hidden="true"
      style={{marginRight: '0.3rem', verticalAlign: 'middle', flexShrink: 0}}
    >
      <rect
        width="198"
        height="118"
        x="5"
        y="5"
        ry="10"
        stroke="currentColor"
        strokeWidth="10"
        fill="none"
      />
      <path d="M30 98V30h20l20 25 20-25h20v68H90V59L70 84 50 59v39zm125 0l-30-33h20V30h20v35h20z" />
    </svg>
  );
}

/**
 * Resolve relative and site-absolute markdown links to full URLs.
 * Uses window.location.origin so it works on any host (prod, preview, local).
 * Matches [text](url) and ![alt](url), with an optional "title" after the url.
 * Leaves already-absolute URLs, mailto:, and anchor-only links untouched.
 */
function resolveLinks(markdown: string, permalink: string): string {
  const base = new URL(permalink, window.location.origin).href;
  return markdown.replace(
    /(!?\[[^\]]*\])\(([^)]+)\)/g,
    (match, bracketPart, urlAndTitle) => {
      // Split optional title: 'url "title"' or "url 'title'"
      const parsed = urlAndTitle.match(/^(\S+)(\s+["'][^"']*["'])?$/);
      if (!parsed) return match;
      const [, url, title = ''] = parsed;
      if (/^(https?:|mailto:|ftp:|#)/.test(url)) return match;
      try {
        return `${bracketPart}(${new URL(url, base).href}${title})`;
      } catch {
        return match;
      }
    },
  );
}

export default function EditMetaRow({
  className,
  editUrl,
  lastUpdatedAt,
  lastUpdatedBy,
}: Props): ReactNode {
  const [copied, setCopied] = useState(false);
  const {metadata} = useDoc();
  const markdownData = usePluginData('raw-markdown-plugin') as Record<string, string>;

  const handleCopy = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    try {
      const docPath = metadata.source.replace('@site/', '');
      const markdown = markdownData?.[docPath];
      if (markdown) {
        const resolved = resolveLinks(markdown, metadata.permalink);
        await navigator.clipboard.writeText(resolved);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // silently fail if clipboard is unavailable
    }
  };

  const markdownUrl = `${metadata.permalink.replace(/\/$/, '')}.md`;

  return (
    <div className={clsx('row', className)}>
      <div className={clsx('col', styles.noPrint)}>
        <div className={styles.editLinks}>
          {editUrl && <EditThisPage editUrl={editUrl} />}
          <a href="#" onClick={handleCopy} className="theme-edit-this-page">
            <IconMarkdown />
            {copied ? 'Copied!' : 'Copy as Markdown'}
          </a>
          <a href={markdownUrl} className="theme-edit-this-page" target="_blank" rel="noopener noreferrer">
            <IconMarkdown />
            View as Markdown
          </a>
        </div>
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
