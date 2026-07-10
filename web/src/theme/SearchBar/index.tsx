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
  const { createDbWorker } = await import('sql.js-httpvfs');
  workerInstance = await createDbWorker(
    [{ from: 'inline', config: { serverMode: 'full', url: '/site.db', requestChunkSize: 1024 } }],
    '/sqlite.worker.js',
    '/sql-wasm.wasm',
  );
  return workerInstance;
}

async function queryDocs(q: string): Promise<SearchResult[]> {
  const worker = await getWorker();
  return worker.db.query<SearchResult>(
    `SELECT title, url, snippet(docs_fts, 1, '<mark>', '</mark>', '…', 20) AS excerpt
     FROM docs_fts WHERE docs_fts MATCH ? LIMIT 8`,
    q + '*',
  );
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
    } catch {
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
        placeholder="Search docs…"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (results.length > 0) setOpen(true); }}
        aria-label="Search documentation"
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
              <div className={styles.resultTitle}>{r.title || r.url}</div>
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
