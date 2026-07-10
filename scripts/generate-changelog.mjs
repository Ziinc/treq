#!/usr/bin/env node
/**
 * Fetches GitHub releases for Ziinc/treq and generates:
 *   web/static/changelog.json  — intermediate structured data
 *   web/src/pages/changelog.md — standalone page served at /changelog
 *
 * Usage:
 *   node scripts/generate-changelog.mjs
 *   GITHUB_TOKEN=ghp_xxx node scripts/generate-changelog.mjs
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const REPO = 'Ziinc/treq';
const API_BASE = 'https://api.github.com';
const PER_PAGE = 100;

const JSON_OUT = resolve(ROOT, 'web/static/changelog.json');
const MD_OUT = resolve(ROOT, 'web/src/pages/changelog.md');

// ── GitHub API ────────────────────────────────────────────────────────────────

function headers() {
  const h = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'treq-changelog-script',
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

function loadKnownVersions() {
  if (!existsSync(JSON_OUT)) return new Set();
  try {
    const existing = JSON.parse(readFileSync(JSON_OUT, 'utf8'));
    return new Set(existing.map(e => e.version));
  } catch {
    return new Set();
  }
}

async function fetchReleases(knownVersions) {
  const releases = [];
  let page = 1;

  while (true) {
    const url = `${API_BASE}/repos/${REPO}/releases?per_page=${PER_PAGE}&page=${page}`;
    const res = await fetch(url, { headers: headers() });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GitHub API error ${res.status}: ${body}`);
    }

    const batch = await res.json();
    if (batch.length === 0) break;

    // GitHub returns releases newest-first. Stop as soon as we hit a version
    // that's already in the JSON so we don't re-fetch the entire history.
    let done = false;
    for (const release of batch) {
      if (knownVersions.has(release.tag_name)) { done = true; break; }
      releases.push(release);
    }
    if (done || batch.length < PER_PAGE) break;
    page++;
  }

  return releases;
}

// ── Transform ─────────────────────────────────────────────────────────────────

function toEntry(release) {
  return {
    version: release.tag_name,
    name: release.name || release.tag_name,
    date: release.published_at ? release.published_at.slice(0, 10) : null,
    url: release.html_url,
    prerelease: release.prerelease,
    body: (release.body || '').replace(/\n\n\*\*Full Changelog\*\*:.*$/s, '').trim(),
  };
}

// ── Markdown generation ───────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

function entryToMarkdown(entry) {
  const badge = entry.prerelease ? ' `pre-release`' : '';
  const dateStr = entry.date ? ` — ${formatDate(entry.date)}` : '';
  const lines = [
    `## [${entry.version}](${entry.url})${badge}`,
    '',
    `*${entry.name}*${dateStr}`,
  ];
  if (entry.body) {
    lines.push('', entry.body);
  }
  return lines.join('\n');
}

function buildMarkdown(entries) {
  const sections = entries.map(entryToMarkdown).join('\n\n---\n\n');
  return [
    '---',
    'title: Changelog',
    'description: Release history for Treq',
    'hide_table_of_contents: true',
    '---',
    '',
    '# Changelog',
    '',
    `> Full release history for [Treq](https://github.com/${REPO}/releases).`,
    '',
    sections,
    '',
  ].join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const knownVersions = loadKnownVersions();
  console.log(`Fetching releases for ${REPO}… (${knownVersions.size} already cached)`);

  const existingEntries = knownVersions.size > 0
    ? JSON.parse(readFileSync(JSON_OUT, 'utf8'))
    : [];

  const raw = await fetchReleases(knownVersions);
  const newEntries = raw.filter(r => !r.draft).map(toEntry);

  console.log(`  ${newEntries.length} new release(s) fetched`);

  const entries = [...newEntries, ...existingEntries]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // Write JSON
  mkdirSync(dirname(JSON_OUT), { recursive: true });
  writeFileSync(JSON_OUT, JSON.stringify(entries, null, 2) + '\n', 'utf8');
  console.log(`  Written: ${JSON_OUT}`);

  // Write markdown
  mkdirSync(dirname(MD_OUT), { recursive: true });
  writeFileSync(MD_OUT, buildMarkdown(entries), 'utf8');
  console.log(`  Written: ${MD_OUT}`);

  console.log('Done.');
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
