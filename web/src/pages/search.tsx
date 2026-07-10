import React, { useState, useEffect } from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import BrowserOnly from '@docusaurus/BrowserOnly';
import styles from './search.module.css';

type SearchResult = {
  title: string;
  url: string;
  excerpt: string;
};

type DbWorker = Awaited<ReturnType<typeof import('sql.js-httpvfs')['createDbWorker']>>;

let workerInstance: DbWorker | null = null;

async function getWorker(): Promise<DbWorker> {
  if (workerInstance) return workerInstance;
  const meta = await fetch('/search-meta.json').then(r => r.json()) as { url: string };
  const { createDbWorker } = await import('sql.js-httpvfs');
  workerInstance = await createDbWorker(
    [{ from: 'inline', config: { serverMode: 'full', url: meta.url, requestChunkSize: 4096 } }],
    '/sqlite.worker.js',
    '/sql-wasm.wasm',
  );
  return workerInstance;
}

function SearchResults({ query }: { query: string }) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(false);
    const term = query.trim().split(/\s+/).filter(Boolean).map(w => `${w}*`).join(' ');
    if (!term) { setSearched(true); setLoading(false); return; }
    getWorker()
      .then(worker => {
        // exec() is inherited from sql.js Database but not surfaced by Comlink.Remote<T>
        const exec = (worker.db as unknown as Record<string, unknown>)['exec'] as (sql: string, params: unknown[]) => Promise<{ columns: string[]; values: unknown[][] }[]>;
        return exec(
          `SELECT highlight(docs_fts, 0, '<mark>', '</mark>') AS title,
                  url,
                  snippet(docs_fts, 1, '<mark>', '</mark>', '…', 32) AS excerpt
           FROM docs_fts WHERE docs_fts MATCH ? LIMIT 20`,
          [term],
        );
      })
      .then(res => {
        const rows: SearchResult[] = res.length
          ? res[0].values.map(row => Object.fromEntries(res[0].columns.map((c, i) => [c, row[i]])) as SearchResult)
          : [];
        setResults(rows);
        setSearched(true);
      })
      .catch(() => { setResults([]); setSearched(true); })
      .finally(() => setLoading(false));
  }, [query]);

  if (!query.trim()) return null;
  if (loading) return <p className={styles.status}>Searching…</p>;
  if (searched && results.length === 0) {
    return <p className={styles.status}>No results found for "<strong>{query}</strong>".</p>;
  }

  return (
    <ul className={styles.results}>
      {results.map((r, i) => (
        <li key={i} className={styles.result}>
          <Link
            to={r.url}
            className={styles.resultTitle}
            dangerouslySetInnerHTML={{ __html: r.title || r.url }}
          />
          <div className={styles.resultUrl}>{r.url}</div>
          {r.excerpt && (
            <p
              className={styles.resultExcerpt}
              dangerouslySetInnerHTML={{ __html: r.excerpt }}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

function SearchPage() {
  const params = new URLSearchParams(window.location.search);
  const query = params.get('q') ?? '';

  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>
        {query ? <>Search results for "<strong>{query}</strong>"</> : 'Search'}
      </h1>
      <SearchResults query={query} />
    </div>
  );
}

export default function Search() {
  return (
    <Layout title="Search" description="Search the Treq documentation">
      <main className={styles.main}>
        <BrowserOnly>{() => <SearchPage />}</BrowserOnly>
      </main>
    </Layout>
  );
}
