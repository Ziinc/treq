import React, { useEffect, useState } from 'react';
import Layout from '@theme/Layout';
import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import { useColorMode } from '@docusaurus/theme-common';
import { Highlight, themes } from 'prism-react-renderer';
import { FileTree } from './FileTree';
import type { Skill, SkillFile } from './types';
import { formatBytes, getPrismLanguage } from './utils';
import styles from './styles.module.css';

const SOURCE_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  mattpocock: 'Matt Pocock',
};

// Files above this size aren't fetched for inline preview — the GitHub link
// still works, this just avoids pulling multi-MB blobs into the browser.
const MAX_PREVIEW_BYTES = 500 * 1024;

function pickDefaultFile(files: SkillFile[]): SkillFile | null {
  return files.find((f) => f.path === 'SKILL.md') ?? files.find((f) => !f.binary) ?? null;
}

export default function SkillDetailPage({ skill }: { skill: Skill }) {
  return (
    <Layout title={skill.name} description={skill.description}>
      <Head>
        <link rel="canonical" href={skill.url} />
      </Head>
      <SkillDetailContent skill={skill} />
    </Layout>
  );
}

// useColorMode() needs a ColorModeProvider ancestor, which <Layout> only
// establishes for its *children* — so this must be a component Layout
// renders, not the component that renders Layout.
function SkillDetailContent({ skill }: { skill: Skill }) {
  const [selected, setSelected] = useState<SkillFile | null>(() => pickDefaultFile(skill.files));
  const [content, setContent] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const { colorMode } = useColorMode();

  // File contents are fetched live from GitHub's raw CDN when a file is
  // selected — never bundled into the site or indexed for search.
  useEffect(() => {
    setContent(null);
    if (!selected || selected.binary || selected.size > MAX_PREVIEW_BYTES) {
      setStatus('idle');
      return;
    }
    let cancelled = false;
    setStatus('loading');
    fetch(selected.rawUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        if (!cancelled) {
          setContent(text);
          setStatus('idle');
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const language = selected ? getPrismLanguage(selected.path) : null;
  const sourceLabel = SOURCE_LABELS[skill.source] ?? skill.source;

  return (
    <div className={styles.page}>
      <div className={styles.breadcrumbs}>
        <Link to="/skills">Skills Library</Link>
        <span className={styles.sep}>/</span>
        <span>{sourceLabel}</span>
        <span className={styles.sep}>/</span>
        <span>{skill.name}</span>
      </div>

      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{skill.name}</h1>
          <p className={styles.description}>{skill.description}</p>
          <div className={styles.meta}>
            <span className={styles.badge} data-source={skill.source}>{sourceLabel}</span>
            {skill.category && <span className={styles.badge}>{skill.category}</span>}
            {skill.license && <span className={styles.badge}>{skill.license}</span>}
          </div>
        </div>
        <a
          className={styles.githubButton}
          href={skill.url}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="repo-github-link"
        >
          View on GitHub ↗
        </a>
      </div>

      <div className={styles.browser} data-testid="skill-file-browser">
        <div className={styles.tree}>
          <FileTree files={skill.files} selectedPath={selected?.path ?? null} onSelect={setSelected} />
        </div>
        <div className={styles.viewer}>
          {!selected ? (
            <div className={styles.empty}>Select a file to view its contents</div>
          ) : (
            <>
              <div className={styles.viewerHeader}>
                <span className={styles.viewerPath} data-testid="viewer-path">{selected.path}</span>
                <span className={styles.viewerSize}>{formatBytes(selected.size)}</span>
                <a
                  className={styles.viewerGithub}
                  href={selected.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="viewer-github-link"
                >
                  View on GitHub ↗
                </a>
              </div>
              <div className={styles.viewerBody} data-testid="viewer-body">
                {selected.binary ? (
                  <p className={styles.notice}>Binary file — preview isn't available. View it on GitHub instead.</p>
                ) : selected.size > MAX_PREVIEW_BYTES ? (
                  <p className={styles.notice}>File is too large to preview here. View it on GitHub instead.</p>
                ) : status === 'loading' ? (
                  <p className={styles.notice}>Loading…</p>
                ) : status === 'error' ? (
                  <p className={styles.notice}>Failed to load this file. View it on GitHub instead.</p>
                ) : content !== null ? (
                  <CodeView content={content} language={language} dark={colorMode === 'dark'} />
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CodeView({ content, language, dark }: { content: string; language: string | null; dark: boolean }) {
  const trimmed = content.replace(/\n$/, '');

  if (!language) {
    return (
      <pre className={styles.code}>
        {trimmed.split('\n').map((line, i) => (
          <div key={i} className={styles.codeLine}>
            <span className={styles.lineNumber}>{i + 1}</span>
            <span>{line}</span>
          </div>
        ))}
      </pre>
    );
  }

  return (
    <Highlight code={trimmed} language={language} theme={dark ? themes.dracula : themes.github}>
      {({ style, tokens, getLineProps, getTokenProps }) => (
        <pre className={styles.code} style={style}>
          {tokens.map((line, i) => (
            <div key={i} {...getLineProps({ line })} className={styles.codeLine}>
              <span className={styles.lineNumber}>{i + 1}</span>
              <span>
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </span>
            </div>
          ))}
        </pre>
      )}
    </Highlight>
  );
}
