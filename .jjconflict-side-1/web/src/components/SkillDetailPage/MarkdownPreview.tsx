import React, { useMemo } from 'react';
import clsx from 'clsx';
import { renderMarkdownToHtml } from './markdown';
import styles from './styles.module.css';

export function MarkdownPreview({ content }: { content: string }) {
  const html = useMemo(() => renderMarkdownToHtml(content), [content]);
  // The "markdown" class picks up Infima's default doc-content styling
  // (headings, tables, code blocks) so the preview matches the rest of the site.
  return (
    <div
      className={clsx('markdown', styles.markdownPreview)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
