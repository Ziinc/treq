// Fetch the SQLite DB once as a binary blob and query it with sql.js in-memory.
// Lazy: init only when preWarm() or query() is first called.

let dbPromise: Promise<import('sql.js').Database> | null = null;

function init(): Promise<import('sql.js').Database> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const [{ url }, initSqlJs] = await Promise.all([
        fetch('/search-meta.json').then(r => r.json()) as Promise<{ url: string }>,
        import('sql.js').then(m => m.default ?? m),
      ]);
      const [SQL, buf] = await Promise.all([
        initSqlJs({ locateFile: (f: string) => `/${f}` }),
        fetch(url).then(r => r.arrayBuffer()),
      ]);
      return new SQL.Database(new Uint8Array(buf));
    })().catch(err => { dbPromise = null; throw err; });
  }
  return dbPromise;
}

export function preWarm(): void {
  init().catch(() => {});
}

export type SearchResult = { title: string; url: string; excerpt: string };

export async function queryDocs(q: string): Promise<SearchResult[]> {
  const term = q.trim().split(/\s+/).filter(Boolean).map(w => `${w}*`).join(' ');
  if (!term) return [];
  const db = await init();
  const res = db.exec(
    `SELECT highlight(docs_fts, 0, '<mark>', '</mark>') AS title,
            url,
            snippet(docs_fts, 1, '<mark>', '</mark>', '…', 20) AS excerpt
     FROM docs_fts WHERE docs_fts MATCH ? LIMIT 8`,
    [term],
  );
  if (!res.length) return [];
  const { columns, values } = res[0];
  return values.map(row => Object.fromEntries(columns.map((c, i) => [c, row[i]])) as SearchResult);
}
