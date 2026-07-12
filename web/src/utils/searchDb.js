// Fetch the SQLite DB once as a binary blob and query it with sql.js in-memory.
// Lazy: init only when preWarm() or getDb() is first called.
let dbPromise = null;
export function getDb() {
    if (!dbPromise) {
        dbPromise = (async () => {
            const [{ url }, initSqlJs] = await Promise.all([
                fetch('/search-meta.json').then(r => r.json()),
                import('sql.js').then(m => m.default ?? m),
            ]);
            const [SQL, buf] = await Promise.all([
                initSqlJs({ locateFile: (f) => `/${f}` }),
                fetch(url).then(r => r.arrayBuffer()),
            ]);
            return new SQL.Database(new Uint8Array(buf));
        })().catch(err => { dbPromise = null; throw err; });
    }
    return dbPromise;
}
export function preWarm() {
    getDb().catch(() => { });
}
export function execSearch(db, q) {
    const term = q.trim().split(/\s+/).filter(Boolean).map(w => `${w}*`).join(' ');
    if (!term)
        return [];
    const res = db.exec(`SELECT snippet(docs_fts, '<mark>', '</mark>', '', 0, 10) AS title,
            url,
            snippet(docs_fts, '<mark>', '</mark>', '…', 1, 20) AS excerpt
     FROM docs_fts WHERE docs_fts MATCH ? LIMIT 8`, [term]);
    if (!res.length)
        return [];
    const { columns, values } = res[0];
    return values.map(row => Object.fromEntries(columns.map((c, i) => [c, row[i]])));
}
