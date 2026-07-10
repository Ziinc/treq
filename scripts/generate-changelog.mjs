#!/usr/bin/env node
/**
 * Fetches published GitHub releases for Ziinc/treq and generates:
 *   web/src/pages/changelog.md — standalone page served at /changelog
 *
 * Usage:
 *   node scripts/generate-changelog.mjs
 *   GITHUB_TOKEN=ghp_xxx node scripts/generate-changelog.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const REPO = 'Ziinc/treq';
const API_BASE = 'https://api.github.com';
const PER_PAGE = 100;

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

async function fetchReleases() {
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
    releases.push(...batch);
    if (batch.length < PER_PAGE) break;
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
  console.log(`Fetching releases for ${REPO}…`);

  const raw = await fetchReleases();
  const entries = raw
    .filter(r => !r.draft)
    .map(toEntry)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  console.log(`  ${entries.length} release(s) fetched`);

  mkdirSync(dirname(MD_OUT), { recursive: true });
  writeFileSync(MD_OUT, buildMarkdown(entries), 'utf8');
  console.log(`  Written: ${MD_OUT}`);

  console.log('Done.');
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
