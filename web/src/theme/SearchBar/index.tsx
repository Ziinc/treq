import React, { useState, useEffect, useRef, useCallback } from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import Link from '@docusaurus/Link';
import { useHistory } from '@docusaurus/router';
import styles from './styles.module.css';

type SearchResult = {
  title: string;
  url: string;
  excerpt: string;
};

type DbWorker = Awaited<ReturnType<typeof import('sql.js-httpvfs')['createDbWorker']>>;

let workerInstance: DbWorker | null = null;

async function getWorker(): Promise<DbWorker> {
  if (workerInstance) return workerInstance;
  const meta = await fetch('/search-meta.json').then(r => r.json()) as { url: string; fileLength: number };
  console.log('[SearchBar] loading DB from', meta.url);
  const { createDbWorker } = await import('sql.js-httpvfs');
  workerInstance = await createDbWorker(
    [{ from: 'inline', config: { serverMode: 'full', url: meta.url, requestChunkSize: 4096, fileLength: meta.fileLength } }],
    '/sqlite.worker.js',
    '/sql-wasm.wasm',
  );
  console.log('[SearchBar] worker ready');
  return workerInstance;
}

function execToObjects<T>(res: { columns: string[]; values: unknown[][] }[]): T[] {
  if (!res.length) return [];
  const { columns, values } = res[0];
  return values.map(row => Object.fromEntries(columns.map((c, i) => [c, row[i]])) as T);
}

async function queryDocs(q: string): Promise<SearchResult[]> {
  const term = q.trim().split(/\s+/).filter(Boolean).map(w => `${w}*`).join(' ');
  if (!term) return [];
  const worker = await getWorker();
  // exec() is inherited from sql.js Database but not surfaced by Comlink.Remote<T>
  const exec = (worker.db as unknown as Record<string, unknown>)['exec'] as (sql: string, params: unknown[]) => Promise<{ columns: string[]; values: unknown[][] }[]>;
  const res = await exec(
    `SELECT highlight(docs_fts, 0, '<mark>', '</mark>') AS title,
            url,
            snippet(docs_fts, 1, '<mark>', '</mark>', '…', 20) AS excerpt
     FROM docs_fts WHERE docs_fts MATCH ? LIMIT 8`,
    [term],
  );
  return execToObjects<SearchResult>(res);
}

function SearchBarInner() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const history = useHistory();

  const runQuery = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setOpen(false); return; }
    try {
      const rows = await queryDocs(q);
      setResults(rows);
      setOpen(rows.length > 0);
    } catch (err) {
      console.error('[SearchBar] query failed:', err instanceof Error ? err.stack : err);
      setResults([]);
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runQuery(query), 600);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, runQuery]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && query.trim()) {
      setOpen(false);
      history.push(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  }

  return (
    <div className={styles.container} ref={containerRef}>
      <input
        className={styles.input}
        type="search"
        placeholder="Search..."
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (results.length > 0) setOpen(true); }}
        aria-label="Search..."
      />
      {open && (
        <div className={styles.dropdown}>
          {results.map((r, i) => (
            <Link
              key={i}
              to={r.url}
              className={styles.result}
              onClick={() => { setOpen(false); setQuery(''); }}
            >
              <div
                className={styles.resultTitle}
                dangerouslySetInnerHTML={{ __html: r.title || r.url }}
              />
              {r.excerpt && (
                <div
                  className={styles.resultExcerpt}
                  dangerouslySetInnerHTML={{ __html: r.excerpt }}
                />
              )}
            </Link>
          ))}
          {query.trim() && (
            <Link
              to={`/search?q=${encodeURIComponent(query.trim())}`}
              className={styles.seeAll}
              onClick={() => setOpen(false)}
            >
              See all results for "{query}"
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

export default function SearchBar() {
  return <BrowserOnly>{() => <SearchBarInner />}</BrowserOnly>;
}
