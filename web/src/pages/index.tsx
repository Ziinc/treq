import {useState, type ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import Head from '@docusaurus/Head';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import codeScreenshot from '../../../assets/screenshots/code.png';
import reviewScreenshot from '../../../assets/screenshots/review.png';
import styles from './index.module.css';

const DOWNLOAD_HREF = 'https://github.com/Ziinc/treq/releases';

function DownloadIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  );
}

function HomepageHeader() {
  return (
    <header className={styles.heroBanner} aria-label="Hero">
      <Head>
        <link rel="preload" as="image" href={codeScreenshot} fetchPriority="high" />
      </Head>
      <div className={styles.heroContainer}>
        <p className={styles.heroEyebrow}>The open source Graphite alternative</p>
        <Heading as="h1" className={styles.heroTitle}>
          <span className={styles.heroAccent}>Stacking Agent Development Environment</span>
          {' '}for teams that run agents in parallel
        </Heading>
        <p className={styles.heroLead}>
          Review, rebase, and ship stacked work without sharing one checkout.
          Treq keeps each agent in its own workspace and rebases the stack when the base moves.
        </p>
        <div className={styles.buttons}>
          <Link
            className={clsx('button', styles.primaryButton)}
            href={DOWNLOAD_HREF}
            target="_blank"
            rel="noopener noreferrer">
            <DownloadIcon />
            Download for Desktop
          </Link>
          <Link
            className={clsx('button', styles.secondaryButton)}
            to="/docs/getting-started/installation">
            Read the docs
          </Link>
        </div>
        <div className={styles.platformsSupported}>
          <span>Available for</span>
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" className={styles.platformIcon} viewBox="0 0 16 16" aria-label="macOS">
            <path d="M11.182.008C11.148-.03 9.923.023 8.857 1.18c-1.066 1.156-.902 2.482-.878 2.516s1.52.087 2.475-1.258.762-2.391.728-2.43m3.314 11.733c-.048-.096-2.325-1.234-2.113-3.422s1.675-2.789 1.698-2.854-.597-.79-1.254-1.157a3.7 3.7 0 0 0-1.563-.434c-.108-.003-.483-.095-1.254.116-.508.139-1.653.589-1.968.607-.316.018-1.256-.522-2.267-.665-.647-.125-1.333.131-1.824.328-.49.196-1.422.754-2.074 2.237-.652 1.482-.311 3.83-.067 4.56s.625 1.924 1.273 2.796c.576.984 1.34 1.667 1.659 1.899s1.219.386 1.843.067c.502-.308 1.408-.485 1.766-.472.357.013 1.061.154 1.782.539.571.197 1.111.115 1.652-.105.541-.221 1.324-1.059 2.238-2.758q.52-1.185.473-1.282"/>
            <path d="M11.182.008C11.148-.03 9.923.023 8.857 1.18c-1.066 1.156-.902 2.482-.878 2.516s1.52.087 2.475-1.258.762-2.391.728-2.43"/>
          </svg>
        </div>
        <div className={styles.heroVisual}>
          <img
            className={styles.heroScreenshot}
            src={codeScreenshot}
            alt="Treq code overview screenshot"
            width={2880}
            height={1800}
            loading="eager"
            decoding="async"
            fetchPriority="high"
          />
        </div>
      </div>

      <div className={styles.agentsSupported}>
        <span className={styles.agentsLabel}>Works with your agents</span>
        <div className={styles.agentsIcons}>
          <div className={styles.agentIcon} title="Claude Code">
            <svg xmlns="http://www.w3.org/2000/svg" width="70" height="70" fill="currentColor" className={styles.platformIcon} viewBox="0 0 16 16" aria-hidden="true">
              <path d="m3.127 10.604 3.135-1.76.053-.153-.053-.085H6.11l-.525-.032-1.791-.048-1.554-.065-1.505-.08-.38-.081L0 7.832l.036-.234.32-.214.455.04 1.009.069 1.513.105 1.097.064 1.626.17h.259l.036-.105-.089-.065-.068-.064-1.566-1.062-1.695-1.121-.887-.646-.48-.327-.243-.306-.104-.67.435-.48.585.04.15.04.593.456 1.267.981 1.654 1.218.242.202.097-.068.012-.049-.109-.181-.9-1.626-.96-1.655-.428-.686-.113-.411a2 2 0 0 1-.068-.484l.496-.674L4.446 0l.662.089.279.242.411.94.666 1.48 1.033 2.014.302.597.162.553.06.17h.105v-.097l.085-1.134.157-1.392.154-1.792.052-.504.25-.605.497-.327.387.186.319.456-.045.294-.19 1.23-.37 1.93-.243 1.29h.142l.161-.16.654-.868 1.097-1.372.484-.545.565-.601.363-.287h.686l.505.751-.226.775-.707.895-.585.759-.839 1.13-.524.904.048.072.125-.012 1.897-.403 1.024-.186 1.223-.21.553.258.06.263-.218.536-1.307.323-1.533.307-2.284.54-.028.02.032.04 1.029.098.44.024h1.077l2.005.15.525.346.315.424-.053.323-.807.411-3.631-.863-.872-.218h-.12v.073l.726.71 1.331 1.202 1.667 1.55.084.383-.214.302-.226-.032-1.464-1.101-.565-.497-1.28-1.077h-.084v.113l.295.432 1.557 2.34.08.718-.112.234-.404.141-.444-.08-.911-1.28-.94-1.44-.759-1.291-.093.053-.448 4.821-.21.246-.484.186-.403-.307-.214-.496.214-.98.258-1.28.21-1.016.19-1.263.112-.42-.008-.028-.092.012-.953 1.307-1.448 1.957-1.146 1.227-.274.109-.477-.247.045-.44.266-.39 1.586-2.018.956-1.25.617-.723-.004-.105h-.036l-4.212 2.736-.75.096-.324-.302.04-.496.154-.162 1.267-.871z"/>
            </svg>
            <span>Claude</span>
          </div>
          <div className={styles.agentIcon} title="Codex">
            <svg xmlns="http://www.w3.org/2000/svg" width="70" height="70" fill="currentColor" className={styles.platformIcon} viewBox="0 0 320 320" aria-hidden="true">
              <path d="m297.06 130.97c7.26-21.79 4.76-45.66-6.85-65.48-17.46-30.4-52.56-46.04-86.84-38.68-15.25-17.18-37.16-26.95-60.13-26.81-35.04-.08-66.13 22.48-76.91 55.82-22.51 4.61-41.94 18.7-53.31 38.67-17.59 30.32-13.58 68.54 9.92 94.54-7.26 21.79-4.76 45.66 6.85 65.48 17.46 30.4 52.56 46.04 86.84 38.68 15.24 17.18 37.16 26.95 60.13 26.8 35.06.09 66.16-22.49 76.94-55.86 22.51-4.61 41.94-18.7 53.31-38.67 17.57-30.32 13.55-68.51-9.94-94.51zm-120.28 168.11c-14.03.02-27.62-4.89-38.39-13.88.49-.26 1.34-.73 1.89-1.07l63.72-36.8c3.26-1.85 5.26-5.32 5.24-9.07v-89.83l26.93 15.55c.29.14.48.42.52.74v74.39c-.04 33.08-26.83 59.9-59.91 59.97zm-128.84-55.03c-7.03-12.14-9.56-26.37-7.15-40.18.47.28 1.3.79 1.89 1.13l63.72 36.8c3.23 1.89 7.23 1.89 10.47 0l77.79-44.92v31.1c.02.32-.13.63-.38.83l-64.41 37.19c-28.69 16.52-65.33 6.7-81.92-21.95zm-16.77-139.09c7-12.16 18.05-21.46 31.21-26.29 0 .55-.03 1.52-.03 2.2v73.61c-.02 3.74 1.98 7.21 5.23 9.06l77.79 44.91-26.93 15.55c-.27.18-.61.21-.91.08l-64.42-37.22c-28.63-16.58-38.45-53.21-21.95-81.89zm221.26 51.49-77.79-44.92 26.93-15.54c.27-.18.61-.21.91-.08l64.42 37.19c28.68 16.57 38.51 53.26 21.94 81.94-7.01 12.14-18.05 21.44-31.2 26.28v-75.81c.03-3.74-1.96-7.2-5.2-9.06zm26.8-40.34c-.47-.29-1.3-.79-1.89-1.13l-63.72-36.8c-3.23-1.89-7.23-1.89-10.47 0l-77.79 44.92v-31.1c-.02-.32.13-.63.38-.83l64.41-37.16c28.69-16.55 65.37-6.7 81.91 22 6.99 12.12 9.52 26.31 7.15 40.1zm-168.51 55.43-26.94-15.55c-.29-.14-.48-.42-.52-.74v-74.39c.02-33.12 26.89-59.96 60.01-59.94 14.01 0 27.57 4.92 38.34 13.88-.49.26-1.33.73-1.89 1.07l-63.72 36.8c-3.26 1.85-5.26 5.31-5.24 9.06l-.04 89.79zm14.63-31.54 34.65-20.01 34.65 20v40.01l-34.65 20-34.65-20z"/>
            </svg>
            <span>Codex</span>
          </div>
          <div className={styles.agentIcon} title="Cursor">
            <svg xmlns="http://www.w3.org/2000/svg" width="70" height="70" fill="currentColor" className={styles.platformIcon} viewBox="0 0 466.73 532.09" aria-hidden="true">
              <path d="M457.43,125.94L244.42,2.96c-6.84-3.95-15.28-3.95-22.12,0L9.3,125.94c-5.75,3.32-9.3,9.46-9.3,16.11v247.99c0,6.65,3.55,12.79,9.3,16.11l213.01,122.98c6.84,3.95,15.28,3.95,22.12,0l213.01-122.98c5.75-3.32,9.3-9.46,9.3-16.11v-247.99c0-6.65-3.55-12.79-9.3-16.11h-.01ZM444.05,151.99l-205.63,356.16c-1.39,2.4-5.06,1.42-5.06-1.36v-233.21c0-4.66-2.49-8.97-6.53-11.31L24.87,145.67c-2.4-1.39-1.42-5.06,1.36-5.06h411.26c5.84,0,9.49,6.33,6.57,11.39h-.01Z"/>
            </svg>
            <span>Cursor</span>
          </div>
        </div>
      </div>
    </header>
  );
}

const SOLUTIONS = [
  {
    id: 'workspaces',
    title: 'Workspaces',
    subtitle: 'Give each agent its own checkout',
    body: 'Treq creates an isolated working copy under .treq/workspaces. Agents can write in parallel without colliding on the same files. Delete a workspace when the work is merged or discarded.',
    href: '/docs/concepts/workspaces',
  },
  {
    id: 'review',
    title: 'Code review',
    subtitle: 'Inspect diffs before they leave your machine',
    body: 'Read the change like a pull request. Leave comments on line ranges and send them back to the agent. Reviews stay local unless you open a GitHub pull request and choose to work with remote threads.',
    href: '/docs/how-to/creating-and-viewing-pull-requests',
  },
  {
    id: 'stacks',
    title: 'Stacked workspaces',
    subtitle: 'Ship a large change as a chain of small PRs',
    body: 'Split a feature into stacked branches. Treq tracks how they depend on each other and rebases the rest of the stack when you land the base.',
    href: '/docs/concepts/workspaces',
  },
  {
    id: 'rebase',
    title: 'Auto-rebase',
    subtitle: 'Keep dependent workspaces current',
    body: 'When the target branch moves, Treq rebases dependent workspaces in the background. Send conflicts to the agent instead of resolving them by hand.',
    href: '/docs/how-to/moving-files-between-workspaces',
  },
  {
    id: 'queue',
    title: 'Merge queue',
    subtitle: 'Land stacked PRs in order',
    body: 'Pro can enqueue workspaces so GitHub merges them in stack order. The desktop app still owns the local review and rebase work.',
    href: '/docs/how-to/using-the-merge-queue',
  },
];

function SolutionsSection(): ReactNode {
  const [openId, setOpenId] = useState(SOLUTIONS[0].id);

  return (
    <section className={styles.solutionsSection} aria-label="Solutions">
      <div className={styles.sectionInner}>
        <p className={styles.kicker}>Solutions</p>
        <Heading as="h2" className={styles.sectionHeading}>
          Get the change reviewed. Get the stack rebased. Ship the PR.
        </Heading>
        <p className={styles.sectionLead}>
          Treq is the desktop environment that sits between your agents and GitHub.
          You keep the review. The stack stays in sync.
        </p>
        <div className={styles.accordion}>
          {SOLUTIONS.map((item) => {
            const open = item.id === openId;
            return (
              <article key={item.id} className={clsx(styles.accordionItem, open && styles.accordionItemOpen)}>
                <button
                  type="button"
                  className={styles.accordionButton}
                  aria-expanded={open}
                  onClick={() => setOpenId(item.id)}>
                  <span>
                    <span className={styles.accordionTitle}>{item.title}</span>
                    <span className={styles.accordionSubtitle}>{item.subtitle}</span>
                  </span>
                  <span className={styles.accordionToggle} aria-hidden="true">
                    {open ? '−' : '+'}
                  </span>
                </button>
                {open && (
                  <div className={styles.accordionBody}>
                    <p>{item.body}</p>
                    <Link to={item.href}>Open the docs</Link>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function StatsSection(): ReactNode {
  return (
    <section className={styles.statsSection} aria-label="Product facts">
      <div className={styles.sectionInner}>
        <p className={styles.kicker}>Facts</p>
        <Heading as="h2" className={styles.sectionHeading}>
          Built to run on your machine
        </Heading>
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <p className={styles.statValue}>Local</p>
            <p className={styles.statLabel}>Code, diffs, and comments stay on disk unless you push.</p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statValue}>Apache 2.0</p>
            <p className={styles.statLabel}>The desktop app is open source. You can read every command it runs.</p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statValue}>jj + Git</p>
            <p className={styles.statLabel}>Git remotes stay Git. Jujutsu supplies the rebase model underneath.</p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statValue}>macOS</p>
            <p className={styles.statLabel}>Download the desktop build and open a repo you already have.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeaturesSection(): ReactNode {
  return (
    <section className={styles.featuresSection} aria-label="Features">
      <div className={styles.featuresContainer}>
        <div className={styles.sectionHeader}>
          <p className={styles.kicker}>Product</p>
          <Heading as="h2" className={styles.featuresHeading}>
            Features
          </Heading>
          <p className={styles.featuresSubheading}>
            Review the diff. Rebase the stack. Keep agents off the same working tree.
          </p>
        </div>

        <div className={styles.featureRow}>
          <div className={styles.featureText}>
            <Heading as="h3" className={styles.featureHeading}>
              Code reviews
            </Heading>
            <p className={styles.featureDescription}>
              Inspect every change in a human-in-the-loop workflow. Read diffs like a GitHub pull request, annotate code, and send comments back to the agent.
            </p>
          </div>
          <div className={styles.featureScreenshot}>
            <img
              className={styles.featureImage}
              src={reviewScreenshot}
              alt="Treq code review screenshot showing comments sent to Claude"
              width={2880}
              height={1800}
              loading="lazy"
              decoding="async"
            />
          </div>
        </div>

        <div className={clsx(styles.featureRow, styles.featureRowReverse)}>
          <div className={styles.featureText}>
            <Heading as="h3" className={styles.featureHeading}>
              Auto-rebase and Auto-resolve
            </Heading>
            <p className={styles.featureDescription}>
              Workspaces stay isolated and current. When the base moves, Treq rebases dependent workspaces in the background. Send a conflict to the agent instead of resolving it by hand.
            </p>
          </div>
          <div className={styles.featureScreenshot}>
            <div className={styles.screenshotWindow} aria-hidden="true">
              <div className={styles.screenshotTitlebar}>
                <span className={styles.windowDot} style={{background: '#ff5f57'}}></span>
                <span className={styles.windowDot} style={{background: '#febc2e'}}></span>
                <span className={styles.windowDot} style={{background: '#28c840'}}></span>
                <span className={styles.windowTitle}>Auto Rebase</span>
              </div>
              <div className={styles.screenshotContent} style={{padding: '16px'}}>
                <div className={styles.mockRebaseStack}>
                  <div className={styles.mockRebaseBranch}>
                    <div className={styles.mockRebaseLabel} data-type="main"></div>
                    <div className={styles.mockRebaseLine} data-type="main"></div>
                    <div className={styles.mockRebaseCommit} data-type="main"></div>
                    <div className={styles.mockRebaseCommit} data-type="main"></div>
                    <div className={styles.mockRebaseCommit} data-type="main"></div>
                  </div>
                  <div className={styles.mockRebaseBranch}>
                    <div className={styles.mockRebaseLabel} data-type="workspace"></div>
                    <div className={styles.mockRebaseLine} data-type="workspace"></div>
                    <div className={styles.mockRebaseCommit} data-type="workspace"></div>
                    <div className={styles.mockRebaseCommit} data-type="workspace"></div>
                    <div className={styles.mockRebaseStatus}>rebased</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.featureRow}>
          <div className={styles.featureText}>
            <Heading as="h3" className={styles.featureHeading}>
              Stacked workspaces
            </Heading>
            <p className={styles.featureDescription}>
              Split a large feature into a stack of smaller pull requests. Treq keeps the whole chain rebased so later work sits on what you already shipped.
            </p>
            <div className={styles.inlineStackViz} aria-label="Linear stacked pull requests">
              <div className={styles.inlineStackNode}>main</div>
              <div className={styles.inlineStackNode}>PR 1</div>
              <div className={styles.inlineStackNode}>PR 2</div>
              <div className={styles.inlineStackNode} data-active="true">PR 3</div>
            </div>
          </div>
          <div className={styles.featureScreenshot}>
            <div className={styles.screenshotWindow} aria-hidden="true">
              <div className={styles.screenshotTitlebar}>
                <span className={styles.windowDot} style={{background: '#ff5f57'}}></span>
                <span className={styles.windowDot} style={{background: '#febc2e'}}></span>
                <span className={styles.windowDot} style={{background: '#28c840'}}></span>
                <span className={styles.windowTitle}>Stacked PRs</span>
              </div>
              <div className={styles.screenshotContent} style={{padding: '16px'}}>
                <div className={styles.mockStackList}>
                  <div className={styles.mockStackItem} data-level="3">
                    <div className={styles.mockStackConnector}></div>
                    <div className={styles.mockStackCard} data-type="active">
                      <div className={styles.mockItem} style={{width: '74%'}}></div>
                      <div className={styles.mockStackPrBadge}>PR #3</div>
                    </div>
                  </div>
                  <div className={styles.mockStackItem} data-level="2">
                    <div className={styles.mockStackConnector}></div>
                    <div className={styles.mockStackCard} data-type="pr">
                      <div className={styles.mockItem} style={{width: '58%'}}></div>
                      <div className={styles.mockStackPrBadge}>PR #2</div>
                    </div>
                  </div>
                  <div className={styles.mockStackItem} data-level="1">
                    <div className={styles.mockStackConnector}></div>
                    <div className={styles.mockStackCard} data-type="pr">
                      <div className={styles.mockItem} style={{width: '42%'}}></div>
                      <div className={styles.mockStackPrBadge}>PR #1</div>
                    </div>
                  </div>
                  <div className={styles.mockStackItem} data-level="0">
                    <div className={styles.mockStackConnector}></div>
                    <div className={styles.mockStackCard} data-type="main">
                      <div className={styles.mockItem} style={{width: '28%'}}></div>
                      <div className={styles.mockStackPrBadge}>main</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ResourcesSection(): ReactNode {
  return (
    <section className={styles.resourcesSection} aria-label="Resources">
      <div className={styles.sectionInner}>
        <p className={styles.kicker}>Resources</p>
        <Heading as="h2" className={styles.sectionHeading}>
          Stay current on the workflow
        </Heading>
        <div className={styles.resourceGrid}>
          <Link className={styles.resourceCard} to="/docs/getting-started/installation">
            <span className={styles.resourceKind}>Docs</span>
            <Heading as="h3" className={styles.resourceTitle}>Install Treq and open a repo</Heading>
            <p>Download the macOS app, point it at a Git repository, and create your first workspace.</p>
          </Link>
          <Link className={styles.resourceCard} to="/learn">
            <span className={styles.resourceKind}>Learn</span>
            <Heading as="h3" className={styles.resourceTitle}>Stacked PRs, worktrees, and agents</Heading>
            <p>Concept articles that explain the workflow Treq is built around.</p>
          </Link>
          <Link className={styles.resourceCard} to="/skills">
            <span className={styles.resourceKind}>Skills</span>
            <Heading as="h3" className={styles.resourceTitle}>Agent skills catalog</Heading>
            <p>Reusable instructions you can drop into Claude, Codex, or Cursor sessions.</p>
          </Link>
          <Link className={styles.resourceCard} to="/roadmap">
            <span className={styles.resourceKind}>Roadmap</span>
            <Heading as="h3" className={styles.resourceTitle}>What ships next</Heading>
            <p>Public milestones for GitHub integration, merge queue, and desktop work.</p>
          </Link>
        </div>
      </div>
    </section>
  );
}

function ClosingCTA(): ReactNode {
  return (
    <section className={styles.closingCTA} aria-label="Download">
      <div className={styles.closingCTAContainer}>
        <Heading as="h2" className={styles.closingCTAHeading}>
          Run agents in parallel. Keep the review.
        </Heading>
        <p className={styles.closingCTASubheading}>
          Treq runs on your machine and is private by default. Treq was used to build Treq.
        </p>
        <div className={styles.closingCTAButtons}>
          <Link
            className={styles.closingCTAButton}
            href={DOWNLOAD_HREF}
            target="_blank"
            rel="noopener noreferrer">
            Download Treq
          </Link>
          <Link className={styles.closingCTASecondary} to="/pricing">
            See pricing
          </Link>
        </div>
      </div>
    </section>
  );
}

const SOFTWARE_APP_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Treq',
  description:
    'Stacking Agent Development Environment (ADE) for teams that run agents in parallel. The open source Graphite alternative.',
  url: 'https://treq.dev',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'macOS',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
  downloadUrl: DOWNLOAD_HREF,
  codeRepository: 'https://github.com/Ziinc/treq',
  license: 'https://www.apache.org/licenses/LICENSE-2.0',
};

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={siteConfig.title}
      description="The open source Graphite alternative. Review, rebase, and ship stacked work without sharing one checkout.">
      <Head>
        <script type="application/ld+json">{JSON.stringify(SOFTWARE_APP_SCHEMA)}</script>
      </Head>
      <HomepageHeader />
      <SolutionsSection />
      <StatsSection />
      <FeaturesSection />
      <ResourcesSection />
      <ClosingCTA />
    </Layout>
  );
}
