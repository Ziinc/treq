import { readFileSync, readdirSync, statSync, existsSync, unlinkSync, copyFileSync, renameSync, writeFileSync } from 'fs';
import { join, relative, extname } from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';
import { remark } from 'remark';
import stripMarkdown from 'strip-markdown';
import initSqlJs from 'sql.js';

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
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  db.run('PRAGMA journal_mode = delete');
  db.run('CREATE VIRTUAL TABLE docs_fts USING fts4(title, body, url)');

  const files = [
    ...walkMd(join(webRoot, 'docs')).map(f => ({ file: f, base: join(webRoot, 'docs'), route: 'docs/' })),
    ...walkMd(join(webRoot, 'learn')).map(f => ({ file: f, base: join(webRoot, 'learn'), route: 'learn/' })),
  ];

  const stmt = db.prepare('INSERT INTO docs_fts(title, body, url) VALUES (?, ?, ?)');
  for (const { file, base, route } of files) {
    const raw = readFileSync(file, 'utf8');
    const { data: frontmatter, content } = matter(raw);
    const title = frontmatter.title || content.match(/^#\s+(.+)/m)?.[1] || '';
    const body = await stripMd(content);
    const url = fileToUrl(file, base, route);
    stmt.run([title, body, url]);
  }

  const skillsPath = join(webRoot, 'src', 'data', 'skills.json');
  if (existsSync(skillsPath)) {
    const { skills } = JSON.parse(readFileSync(skillsPath, 'utf8'));
    for (const skill of skills) {
      const body = [skill.description, skill.category, skill.source].filter(Boolean).join(' — ');
      stmt.run([skill.name, body, `/skills?q=${encodeURIComponent(skill.name)}`]);
    }
  }
  stmt.free();

  db.run('VACUUM');
  const buf = db.export();
  db.close();

  // Remove stale hashed DB files
  for (const f of readdirSync(join(webRoot, 'static'))) {
    if (/^site(-[a-f0-9]{32})?\.db$/.test(f)) unlinkSync(join(webRoot, 'static', f));
  }

  writeFileSync(dbPath, buf);

  const hash = createHash('md5').update(buf).digest('hex');
  const hashedName = `site-${hash}.db`;
  const hashedPath = join(webRoot, 'static', hashedName);
  renameSync(dbPath, hashedPath);

  writeFileSync(
    join(webRoot, 'static', 'search-meta.json'),
    JSON.stringify({ url: `/${hashedName}` }),
  );

  // Copy sql.js browser WASM so the browser can load it at /sql-wasm-browser.wasm
  copyFileSync(
    join(webRoot, 'node_modules', 'sql.js', 'dist', 'sql-wasm-browser.wasm'),
    join(webRoot, 'static', 'sql-wasm-browser.wasm'),
  );
  console.log(`Search index built: ${hashedPath} (${files.length} docs)`);
}

main().catch(e => { console.error(e); process.exit(1); });
