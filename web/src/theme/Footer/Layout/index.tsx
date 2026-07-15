import clsx from 'clsx';

import styles from './styles.module.css';

type Props = {
  style: 'light' | 'dark';
  links: React.ReactNode;
  logo: React.ReactNode;
  copyright: React.ReactNode;
};

export default function FooterLayout({
  style,
  links,
  logo,
  copyright,
}: Props) {
  return (
    <footer className={clsx('theme-layout-footer footer', `footer--${style}`)}>
      <div className={clsx('container', styles.footerTop)}>
        <div className={styles.footerIntro}>
          <div className={styles.footerBrand}>
            <img src="/assets/combined-horizontal.png" alt="Treq" />
          </div>
          <p>
            Treq is a Git-native workspace and review manager for AI-assisted development.
          </p>
        </div>
        <div className={styles.footerLinks}>{links}</div>
      </div>
      {logo}
      {copyright}
    </footer>
  );
}
