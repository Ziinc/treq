import React, { useEffect, useState } from 'react';
import Link from '@docusaurus/Link';
import styles from './styles.module.css';
function Breadcrumbs({ items }) {
    if (items.length === 0)
        return null;
    return (<nav aria-label="Breadcrumbs" className={styles.breadcrumbsContainer}>
      <ul className="breadcrumbs">
        {items.map((item, idx) => {
            const isLast = idx === items.length - 1;
            return (<li key={idx} className={`breadcrumbs__item${isLast ? ' breadcrumbs__item--active' : ''}`}>
              {item.href && !isLast ? (<Link href={item.href} className="breadcrumbs__link">
                  {item.label}
                </Link>) : (<span className="breadcrumbs__link">{item.label}</span>)}
            </li>);
        })}
      </ul>
    </nav>);
}
function TableOfContents({ items }) {
    const [activeId, setActiveId] = useState('');
    useEffect(() => {
        const headingIds = items.map((item) => item.id);
        const observer = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (entry.isIntersecting) {
                    setActiveId(entry.target.id);
                }
            }
        }, { rootMargin: '0px 0px -70% 0px', threshold: 0 });
        headingIds.forEach((id) => {
            const el = document.getElementById(id);
            if (el)
                observer.observe(el);
        });
        return () => observer.disconnect();
    }, [items]);
    if (items.length === 0)
        return null;
    return (<nav className={styles.toc}>
      <ul className={styles.tocList}>
        {items.map((item) => (<li key={item.id} style={{ paddingLeft: `${(item.level - 2) * 0.75}rem` }}>
            <a href={`#${item.id}`} className={`${styles.tocLink} ${activeId === item.id ? styles.tocLinkActive : ''}`} onClick={(e) => {
                e.preventDefault();
                document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth' });
                setActiveId(item.id);
            }}>
              {item.value}
            </a>
          </li>))}
      </ul>
    </nav>);
}
export default function ContentPageLayout({ toc = [], breadcrumbs = [], children, }) {
    const hasToc = toc.length > 0;
    return (<div className={styles.pageWrapper}>
      <div className={styles.card}>
        {breadcrumbs.length > 0 && <Breadcrumbs items={breadcrumbs}/>}
        <div className={hasToc ? styles.bodyWithToc : styles.body}>
          <main className={styles.main}>{children}</main>
          {hasToc && (<aside className={styles.tocAside}>
              <div className={styles.tocContainer}>
                <TableOfContents items={toc}/>
              </div>
            </aside>)}
        </div>
      </div>
    </div>);
}
