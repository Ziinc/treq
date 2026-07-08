import Link from '@docusaurus/Link';
import Heading from '@theme/Heading';
import type {ReactNode} from 'react';
import styles from './styles.module.css';

type DirectoryLink = {
  label: string;
  href: string;
};

type DirectorySection = {
  title: string;
  description: string;
  links: DirectoryLink[];
};

type LearnDirectoryProps = {
  sections: DirectorySection[];
};

function DirectoryCard({title, description, links}: DirectorySection): ReactNode {
  return (
    <article className={styles.card}>
      <div>
        <Heading as="h2" className={styles.cardTitle}>
          {title}
        </Heading>
        <p className={styles.cardDescription}>{description}</p>
      </div>
      <ul className={styles.linkList}>
        {links.map((link) => (
          <li key={link.href} className={styles.linkItem}>
            <Link className={styles.link} to={link.href}>
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </article>
  );
}

export default function LearnDirectory({sections}: LearnDirectoryProps): ReactNode {
  return (
    <section className={styles.directory} aria-label="Learn directory">
      {sections.map((section) => (
        <DirectoryCard key={section.title} {...section} />
      ))}
    </section>
  );
}
