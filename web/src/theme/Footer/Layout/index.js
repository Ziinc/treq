import clsx from 'clsx';
import styles from './styles.module.css';
export default function FooterLayout({ style, links, logo, copyright, }) {
    return (<footer className={clsx('theme-layout-footer footer', `footer--${style}`)}>
      <div className={clsx('container', styles.footerTop)}>
        <div className={styles.footerIntro}>
          <div className={styles.footerBrand}>
            <img src="/assets/combined-horizontal.png" alt="Treq"/>
          </div>
          <p>
            Treq is a desktop AI workspace manager.
          </p>
        </div>
        <div className={styles.footerLinks}>{links}</div>
      </div>
      {logo}
      {copyright}
    </footer>);
}
