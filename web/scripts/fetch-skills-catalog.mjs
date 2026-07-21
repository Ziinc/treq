// Regenerates web/src/data/skills.json by cloning curated Agent Skill repos
// (shallow, to a scratch dir) and parsing each SKILL.md's frontmatter.
//
// Run manually with `npm run build:skills-catalog`, or automatically by the
// "Update Skills Catalog" GitHub Action (see .github/workflows).
import { execFileSync } from 'child_process';
import { mkdtempSync, readdirSync, statSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { join, relative, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const webRoot = join(__dirname, '..');
const outPath = join(webRoot, 'src', 'data', 'skills.json');

// Curated sources. Each repo is expected to hold its skills under
// `skillsRoot`, one `SKILL.md` per skill folder, per the Agent Skills spec:
// https://github.com/anthropics/skills
const SOURCES = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    org: 'anthropics',
    repo: 'skills',
    branch: 'main',
    skillsRoot: 'skills',
    excludeCategories: [],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    org: 'openai',
    repo: 'skills',
    branch: 'main',
    skillsRoot: 'skills',
    excludeCategories: [],
  },
  {
    id: 'mattpocock',
    name: 'Matt Pocock',
    org: 'mattpocock',
    repo: 'skills',
    branch: 'main',
    skillsRoot: 'skills',
    // Skills the author has explicitly marked as superseded/unfinished.
    excludeCategories: ['deprecated'],
  },
];

function humanize(segment) {
  return segment
    .replace(/^\./, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function findSkillFiles(dir, results = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === '.git') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      findSkillFiles(full, results);
    } else if (entry === 'SKILL.md') {
      results.push(full);
    }
  }
  return results;
}

function cloneSource(source, scratchDir) {
  const dest = join(scratchDir, source.id);
  execFileSync(
    'git',
    ['clone', '--depth', '1', '--branch', source.branch, `https://github.com/${source.org}/${source.repo}.git`, dest],
    { stdio: 'inherit' },
  );
  return dest;
}

function extractSkills(source, cloneDir) {
  const skillsRoot = join(cloneDir, source.skillsRoot);
  const skills = [];

  for (const skillFile of findSkillFiles(skillsRoot)) {
    const skillDir = dirname(skillFile);
    const relDir = relative(skillsRoot, skillDir).replace(/\\/g, '/');
    const segments = relDir.split('/');
    const category = segments.length > 1 ? segments[0] : null;

    if (category && source.excludeCategories.includes(category)) continue;

    const raw = readFileSync(skillFile, 'utf8');
    const { data: frontmatter } = matter(raw);
    if (!frontmatter.name || !frontmatter.description) continue;

    const repoRelPath = relative(cloneDir, skillDir).replace(/\\/g, '/');

    skills.push({
      id: `${source.id}/${relDir}`,
      name: frontmatter.name,
      description: String(frontmatter.description).trim(),
      source: source.id,
      category: category ? humanize(category) : null,
      license: frontmatter.license ? String(frontmatter.license).trim() : null,
      path: repoRelPath,
      url: `https://github.com/${source.org}/${source.repo}/tree/${source.branch}/${repoRelPath}`,
    });
  }

  return skills;
}

async function main() {
  const scratchDir = mkdtempSync(join(tmpdir(), 'skills-catalog-'));
  const allSkills = [];
  const sourceMeta = [];

  try {
    for (const source of SOURCES) {
      console.log(`Fetching ${source.org}/${source.repo}...`);
      const cloneDir = cloneSource(source, scratchDir);
      const skills = extractSkills(source, cloneDir);
      allSkills.push(...skills);
      sourceMeta.push({
        id: source.id,
        name: source.name,
        url: `https://github.com/${source.org}/${source.repo}`,
        skillCount: skills.length,
      });
      console.log(`  found ${skills.length} skills`);
    }
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }

  allSkills.sort((a, b) =>
    a.source.localeCompare(b.source) ||
    (a.category ?? '').localeCompare(b.category ?? '') ||
    a.name.localeCompare(b.name),
  );

  const catalog = {
    generatedAt: new Date().toISOString(),
    sources: sourceMeta,
    skills: allSkills,
  };

  writeFileSync(outPath, JSON.stringify(catalog, null, 2) + '\n');
  console.log(`\nWrote ${allSkills.length} skills from ${sourceMeta.length} sources to ${relative(webRoot, outPath)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
