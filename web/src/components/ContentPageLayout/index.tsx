import React, { useEffect, useRef, useState } from 'react';
import Layout from '@theme/Layout';
import styles from './styles.module.css';

export interface TocItem {
  id: string;
  value: string;
  level: number;
}

interface ContentPageLayoutProps {
  title: string;
  description?: string;
  toc?: TocItem[];
  children: React.ReactNode;
}

function TableOfContents({ items }: { items: TocItem[] }) {
  const [activeId, setActiveId] = useState<string>('');

  useEffect(() => {
    const headingIds = items.map((item) => item.id);
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: '0px 0px -70% 0px', threshold: 0 },
    );

    headingIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [items]);

  if (items.length === 0) return null;

  return (
    <nav className={styles.toc}>
      <ul className={styles.tocList}>
        {items.map((item) => (
          <li key={item.id} style={{ paddingLeft: `${(item.level - 2) * 0.75}rem` }}>
            <a
              href={`#${item.id}`}
              className={`${styles.tocLink} ${activeId === item.id ? styles.tocLinkActive : ''}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth' });
                setActiveId(item.id);
              }}
            >
              {item.value}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default function ContentPageLayout({
  title,
  description,
  toc = [],
  children,
}: ContentPageLayoutProps) {
  const hasToc = toc.length > 0;

  return (
    <Layout title={title} description={description}>
      <div className={styles.pageWrapper}>
        <div className={styles.card}>
          <div className={hasToc ? styles.bodyWithToc : styles.body}>
            <main className={styles.main}>{children}</main>
            {hasToc && (
              <aside className={styles.tocAside}>
                <div className={styles.tocContainer}>
                  <TableOfContents items={toc} />
                </div>
              </aside>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
