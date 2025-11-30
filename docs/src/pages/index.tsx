import type {ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import styles from './index.module.css';

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={styles.heroBanner}>
      <div className={styles.heroGlow}></div>
      <div className={styles.heroContainer}>
        <div className={styles.heroMain}>
          <div className={styles.heroBadge}>
            <span className={styles.badgeDot}></span>
            Local AI-Powered Code Review
          </div>
          <Heading as="h1" className={styles.heroTitle}>
            <span className={styles.heroAccent}>Local</span> AI-Powered Code Review.
            <br />
            Zero noise. Zero cloud. Zero risk.
          </Heading>
          <p className={styles.heroSubtitle}>
            AI-generated code is messy. Treq cleans it up.
            Each patch becomes a self-contained worktree with a GitHub-style diff and real code-review tools — comments, annotations, and controlled iteration — all running locally on your machine.
          </p>
          <p className={styles.heroSubtitle}>
            Review AI output like a real Pull Request.
            Refine it. Approve it. Merge it — with confidence.
          </p>
          <div className={styles.buttons}>
            <Link
              className={clsx('button', styles.primaryButton)}
              to="/docs/intro">
              → Download the MVP (macOS / Windows / Linux)
            </Link>
            <Link
              className={clsx('button', styles.secondaryButton)}
              href="https://github.com/yourusername/treq">
              <span>⭐</span> Star on GitHub
            </Link>
          </div>
          <div className={styles.heroStats}>
            <div className={styles.stat}>
              <div className={styles.statValue}>Zero</div>
              <div className={styles.statLabel}>Cloud dependencies</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statValue}>100%</div>
              <div className={styles.statLabel}>Local control</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statValue}>∞</div>
              <div className={styles.statLabel}>Review precision</div>
            </div>
          </div>
        </div>

        <div className={styles.heroVisual}>
          <div className={styles.branchDiagram}>
            <div className={clsx(styles.branch, styles.branchMain)}>
              <div className={styles.branchLabel}>main</div>
              <div className={styles.branchLine}></div>
              <div className={styles.branchCommits}>
                <span className={styles.commit}></span>
                <span className={styles.commit}></span>
                <span className={styles.commit}></span>
              </div>
            </div>
            <div className={clsx(styles.branch, styles.branchFeature)}>
              <div className={styles.branchLabel}>feature/auth</div>
              <div className={styles.branchLine}></div>
              <div className={styles.branchCommits}>
                <span className={styles.commit}></span>
                <span className={styles.commit}></span>
              </div>
            </div>
            <div className={clsx(styles.branch, styles.branchBugfix)}>
              <div className={styles.branchLabel}>bugfix/login</div>
              <div className={styles.branchLine}></div>
              <div className={styles.branchCommits}>
                <span className={styles.commit}></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function ProblemSection(): ReactNode {
  return (
    <section className={styles.problemSection}>
      <div className={styles.problemContainer}>
        <Heading as="h2" className={styles.problemHeading}>
          AI tools write code faster than you can review it.
        </Heading>

        <p className={styles.problemSubheading}>
          And the results?
        </p>
        <p className={styles.problemHeading} style={{fontSize: '1.5rem', marginBottom: '1rem'}}>
          Conflicts, noisy diffs, half-finished patches, and polluted branches.
        </p>

        <div className={styles.problemList}>
          <div className={styles.problemListTitle}>
            Today's AI development workflow is basically:
          </div>
          <div className={styles.problemItem}>
            copy/paste patches into editors
          </div>
          <div className={styles.problemItem}>
            manually diff changes
          </div>
          <div className={styles.problemItem}>
            run AI again and again
          </div>
          <div className={styles.problemItem}>
            try not to break your main branch
          </div>
        </div>

        <p className={styles.problemConclusion}>
          It's chaos disguised as productivity.
        </p>
      </div>
    </section>
  );
}

type FeatureItem = {
  title: string;
  icon: string;
  description: string;
  bgColor: string;
};

const features: FeatureItem[] = [
  {
    title: 'Never stash again',
    icon: '🎯',
    description: 'Switch between features without stashing or committing WIP changes. Each worktree is its own workspace.',
    bgColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  },
  {
    title: 'Side-by-side terminals',
    icon: '⚡',
    description: 'Run builds, tests, and commands in parallel across worktrees. Watch your productivity multiply.',
    bgColor: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  },
  {
    title: 'Visual diffs, instantly',
    icon: '👁️',
    description: 'Monaco-powered diff viewer shows what changed across all worktrees. No more git diff confusion.',
    bgColor: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  },
  {
    title: 'Smart branch tracking',
    icon: '🧭',
    description: 'See commits ahead/behind, modified files, and merge status at a glance. Stay in control, always.',
    bgColor: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  },
  {
    title: 'One-click IDE launch',
    icon: '🚀',
    description: 'Jump straight into Cursor, VS Code, or any editor with worktree context already loaded.',
    bgColor: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  },
  {
    title: 'Built for speed',
    icon: '⚙️',
    description: 'Native Rust backend with React frontend. Fast, lightweight, and runs locally. Your code never leaves your machine.',
    bgColor: 'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
  },
];

function Feature({title, icon, description, bgColor}: FeatureItem) {
  return (
    <div className={styles.featureCard} style={{backgroundColor: bgColor}}>
      <div className={styles.featureIcon}>{icon}</div>
      <Heading as="h3" className={styles.featureTitle}>{title}</Heading>
      <p className={styles.featureDescription}>{description}</p>
    </div>
  );
}

function FeaturesSection(): ReactNode {
  return (
    <section className={styles.featuresSection}>
      <div className={styles.featuresContainer}>
        <div className={styles.solutionSection}>
          <Heading as="h2" className={styles.solutionHeading}>
            Treq brings order to AI-driven development.
          </Heading>

          <div className={styles.solutionGrid}>
            <div className={styles.solutionItem}>
              Isolated worktrees for every AI patch
            </div>
            <div className={styles.solutionItem}>
              GitHub-style diff review
            </div>
            <div className={styles.solutionItem}>
              Inline comments & annotations
            </div>
            <div className={styles.solutionItem}>
              Claude Code–ready terminal per branch
            </div>
            <div className={styles.solutionItem}>
              Iterate patches safely until they're right
            </div>
            <div className={styles.solutionItem}>
              Merge only when approved
            </div>
          </div>

          <div className={styles.solutionTagline}>
            <div className={styles.taglineItem}>
              Your code stays private.
            </div>
            <div className={styles.taglineItem}>
              Your workflow gets structure.
            </div>
            <div className={styles.taglineItem}>
              Your AI output becomes controllable.
            </div>
          </div>
        </div>

        <div className={styles.sectionHeader}>
          <Heading as="h2" className={styles.featuresHeading}>
            Why developers choose Treq
          </Heading>
          <p className={styles.featuresSubheading}>
            Built by developers who were tired of branch-switching hell. Treq turns Git worktrees from a hidden feature into your secret weapon.
          </p>
        </div>

        <div className={styles.featuresGrid}>
          {features.map((feature, idx) => (
            <Feature key={idx} {...feature} />
          ))}
        </div>

      </div>
    </section>
  );
}

function ClosingCTA(): ReactNode {
  return (
    <section className={styles.closingCTA}>
      <div className={styles.closingCTAContainer}>
        <Heading as="h2" className={styles.closingCTAHeading}>
          Stop drowning in AI-generated diffs.
          <br />
          Start reviewing them like a pro.
        </Heading>
        <Link
          className={styles.closingCTAButton}
          to="/docs/intro">
          → Download Treq (Alpha)
        </Link>
      </div>
    </section>
  );
}

function Footer(): ReactNode {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerContainer}>
        <Link to="/" className={styles.footerBrand}>
          <span className={styles.footerLogo}>treq</span>
        </Link>
        <div className={styles.footerLinks}>
          <Link className={styles.footerLink} href="https://github.com/yourusername/treq">
            GitHub
          </Link>
          <Link className={styles.footerLink} to="/docs/intro">
            Documentation
          </Link>
          <Link className={styles.footerLink} to="/blog">
            Blog
          </Link>
          <Link className={styles.footerLink} href="https://discord.gg/treq">
            Discord
          </Link>
          <Link className={styles.footerLink} href="https://twitter.com/treq">
            Twitter
          </Link>
        </div>
      </div>
    </footer>
  );
}

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={siteConfig.title}
      description="Local AI-Powered Code Review. Zero noise. Zero cloud. Zero risk.">
      <HomepageHeader />
      <ProblemSection />
      <FeaturesSection />
      <ClosingCTA />
      <Footer />
    </Layout>
  );
}
