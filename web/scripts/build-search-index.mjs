import { readFileSync, readdirSync, statSync, existsSync, unlinkSync, copyFileSync, renameSync, writeFileSync } from 'fs';
import { join, relative, extname } from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import Database from 'sqlite3';
import matter from 'gray-matter';
import { remark } from 'remark';
import stripMarkdown from 'strip-markdown';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const webRoot = join(__dirname, '..');
const dbPath = join(webRoot, 'static', 'site.db');

function walkMd(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...walkMd(full));
    } else if (extname(entry) === '.md' || extname(entry) === '.mdx') {
      results.push(full);
    }
  }
  return results;
}

async function stripMd(content) {
  const file = await remark().use(stripMarkdown).process(content);
  return String(file).replace(/\s+/g, ' ').trim();
}

function fileToUrl(filePath, base, routeBase) {
  const rel = relative(base, filePath)
    .replace(/\\/g, '/')
    .replace(/\.mdx?$/, '');
  if (rel === 'index' || rel.endsWith('/index')) {
    return '/' + routeBase + rel.replace(/\/?index$/, '');
  }
  return '/' + routeBase + rel;
}

async function main() {
  if (existsSync(dbPath)) unlinkSync(dbPath);

  const db = new Database.Database(dbPath);

  db.serialize(() => {
    db.run('PRAGMA journal_mode = delete');
    db.run(`CREATE VIRTUAL TABLE docs_fts USING fts5(title, body, url)`);
  });

  const files = [
    ...walkMd(join(webRoot, 'docs')).map(f => ({ file: f, base: join(webRoot, 'docs'), route: 'docs/' })),
    ...walkMd(join(webRoot, 'learn')).map(f => ({ file: f, base: join(webRoot, 'learn'), route: 'learn/' })),
  ];

  const insert = db.prepare('INSERT INTO docs_fts(title, body, url) VALUES (?, ?, ?)');

  for (const { file, base, route } of files) {
    const raw = readFileSync(file, 'utf8');
    const { data: frontmatter, content } = matter(raw);
    const title = frontmatter.title || content.match(/^#\s+(.+)/m)?.[1] || '';
    const body = await stripMd(content);
    const url = fileToUrl(file, base, route);
    insert.run(title, body, url);
  }

  insert.finalize(() => {
  db.run('VACUUM', () => {
    db.close();

    // Compute md5 hash of the built DB for cache-busting filename
    const hash = createHash('md5').update(readFileSync(dbPath)).digest('hex');
    const hashedName = `site-${hash}.db`;
    const hashedPath = join(webRoot, 'static', hashedName);

    // Remove stale hashed DB files before renaming
    for (const f of readdirSync(join(webRoot, 'static'))) {
      if (/^site-[a-f0-9]{32}\.db$/.test(f)) unlinkSync(join(webRoot, 'static', f));
    }
    renameSync(dbPath, hashedPath);

    // Write manifest so the browser knows which URL and exact byte size to pass to sql.js-httpvfs
    // (Cloudflare Pages omits Content-Length on HTTP/3; fileSize bypasses that requirement)
    const fileSize = statSync(hashedPath).size;
    writeFileSync(
      join(webRoot, 'static', 'search-meta.json'),
      JSON.stringify({ url: `/${hashedName}`, fileLength: fileSize }),
    );

    // Copy sql.js-httpvfs runtime assets so they're served as static files
    const sqlJsDist = join(webRoot, 'node_modules', 'sql.js-httpvfs', 'dist');
    const workerDest = join(webRoot, 'static', 'sqlite.worker.js');
    copyFileSync(join(sqlJsDist, 'sqlite.worker.js'), workerDest);
    // Patch worker: in serverMode:'full' the upstream code hardcodes fileLength:void 0,
    // preventing the config's fileLength from reaching createLazyFile. Fix it to pass
    // e.fileLength so Cloudflare's HTTP/3 (no Content-Length on HEAD) doesn't break init.
    const workerSrc = readFileSync(workerDest, 'utf8');
    const patched = workerSrc.replace(
      'fileLength:"chunked"===e.serverMode?e.databaseLengthBytes:void 0',
      'fileLength:"chunked"===e.serverMode?e.databaseLengthBytes:e.fileLength',
    );
    if (patched === workerSrc) throw new Error('Worker patch failed: target string not found');
    writeFileSync(workerDest, patched);
    copyFileSync(join(sqlJsDist, 'sql-wasm.wasm'), join(webRoot, 'static', 'sql-wasm.wasm'));
    console.log(`Search index built: ${hashedPath} (${files.length} docs)`);
  });
  });
}

main().catch(e => { console.error(e); process.exit(1); });
