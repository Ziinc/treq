import React, { useEffect, useMemo, useState } from 'react';
import Layout from '@theme/Layout';
import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import catalog from '@site/src/data/skills.json';
import styles from './index.module.css';

type Skill = {
  id: string;
  name: string;
  description: string;
  source: string;
  category: string | null;
  license: string | null;
  path: string;
  url: string;
};

const skills = catalog.skills as Skill[];
const sources = catalog.sources as { id: string; name: string; url: string; skillCount: number }[];

const SKILLS_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: 'Skills Library',
  description: 'A searchable catalog of Agent Skills curated from Anthropic, OpenAI, Matt Pocock, and other trusted sources.',
  url: 'https://treq.dev/skills',
  publisher: {
    '@type': 'Organization',
    name: 'Treq',
    url: 'https://treq.dev',
  },
};

function matches(skill: Skill, query: string): boolean {
  if (!query) return true;
  const haystack = `${skill.name} ${skill.description} ${skill.category ?? ''}`.toLowerCase();
  return haystack.includes(query.toLowerCase());
}

export default function SkillsPage() {
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Deep-link support: /skills?q=<name> (used by the sitewide search index).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q');
    if (q) setQuery(q);
  }, []);

  const categories = useMemo(() => {
    const scoped = sourceFilter === 'all' ? skills : skills.filter((s) => s.source === sourceFilter);
    return Array.from(new Set(scoped.map((s) => s.category).filter((c): c is string => !!c))).sort();
  }, [sourceFilter]);

  const filtered = useMemo(() => {
    return skills.filter((s) => {
      if (sourceFilter !== 'all' && s.source !== sourceFilter) return false;
      if (categoryFilter !== 'all' && s.category !== categoryFilter) return false;
      return matches(s, query);
    });
  }, [query, sourceFilter, categoryFilter]);

  return (
    <Layout
      title="Skills Library"
      description="A searchable catalog of Agent Skills curated from Anthropic, OpenAI, Matt Pocock, and other trusted sources."
    >
      <Head>
        <script type="application/ld+json">{JSON.stringify(SKILLS_SCHEMA)}</script>
      </Head>
      <div className={styles.page}>
        <div className={styles.header}>
          <h1 className={styles.title}>Skills Library</h1>
          <p className={styles.subtitle}>
            A searchable catalog of{' '}
            <a href="https://github.com/anthropics/skills" target="_blank" rel="noopener noreferrer">
              Agent Skills
            </a>{' '}
            curated from {sources.map((s) => s.name).join(', ')}. Every card links to the original source
            repository — clone from there to use a skill.
          </p>
        </div>

        <div className={styles.controls}>
          <input
            type="search"
            className={styles.search}
            placeholder="Search skills by name or description…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search skills"
          />
          <div className={styles.filterRow}>
            <div className={styles.chips}>
              <button
                type="button"
                className={sourceFilter === 'all' ? styles.chipActive : styles.chip}
                onClick={() => {
                  setSourceFilter('all');
                  setCategoryFilter('all');
                }}
              >
                All sources
              </button>
              {sources.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={sourceFilter === s.id ? styles.chipActive : styles.chip}
                  onClick={() => {
                    setSourceFilter(s.id);
                    setCategoryFilter('all');
                  }}
                >
                  {s.name} <span className={styles.chipCount}>{s.skillCount}</span>
                </button>
              ))}
            </div>
            {categories.length > 0 && (
              <select
                className={styles.categorySelect}
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                aria-label="Filter by category"
              >
                <option value="all">All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        <p className={styles.resultCount}>
          {filtered.length} of {skills.length} skills
        </p>

        {filtered.length === 0 ? (
          <p className={styles.empty}>No skills match your search.</p>
        ) : (
          <div className={styles.grid}>
            {filtered.map((skill) => (
              <Link
                key={skill.id}
                to={skill.url}
                className={styles.card}
                target="_blank"
                rel="noopener noreferrer"
              >
                <div className={styles.cardHead}>
                  <h2 className={styles.cardTitle}>{skill.name}</h2>
                  <span className={styles.sourceBadge} data-source={skill.source}>
                    {sources.find((s) => s.id === skill.source)?.name ?? skill.source}
                  </span>
                </div>
                <p className={styles.cardDesc}>{skill.description}</p>
                <div className={styles.tags}>
                  {skill.category && <span className={styles.tag}>{skill.category}</span>}
                  {skill.license && <span className={styles.tag}>{skill.license}</span>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
