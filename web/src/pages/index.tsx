import {useState, type ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import Head from '@docusaurus/Head';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import codeScreenshot from '../../../assets/screenshots/code.png';
import reviewScreenshot from '../../../assets/screenshots/review.png';
import stackScreenshot from '../../../assets/screenshots/stack.png';
import workspacesScreenshot from '../../../assets/screenshots/workspaces.png';
import terminalsScreenshot from '../../../assets/screenshots/terminals.png';
import commitsScreenshot from '../../../assets/screenshots/commits.png';
import githubScreenshot from '../../../assets/screenshots/github.png';
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
        <Heading as="h1" className={styles.heroTitle}>
          <span className={styles.heroAccent}>Stacking Agent Development Environment</span>
          {' '}that isolates each agent and rebases stacked PRs when the base moves
        </Heading>
        <p className={styles.heroLead}>
          Open a Git repo. Create one workspace per agent under{' '}
          <code>.treq/workspaces</code>. Treq rebases dependent workspaces when the
          target branch moves. Reviews stay on disk until you push.
        </p>
        <div className={styles.buttons}>
          <Link
            className={clsx('button', styles.primaryButton)}
            href={DOWNLOAD_HREF}
            target="_blank"
            rel="noopener noreferrer">
            <DownloadIcon />
            Download Treq for macOS
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
    </header>
  );
}

function AgentBar(): ReactNode {
  return (
    <section className={styles.logoBar} aria-label="Supported agents">
      <span className={styles.logoBarLabel}>Works with</span>
      <div className={styles.logoBarLogos}>
        <span>Claude Code</span>
        <span>Codex</span>
        <span>Cursor</span>
      </div>
    </section>
  );
}

function HighlightGrid(): ReactNode {
  return (
    <section className={styles.highlightSection} aria-label="Product highlights">
      <div className={styles.highlightGrid}>
        <article className={styles.highlightTint}>
          <Heading as="h2" className={styles.highlightTitle}>
            Review the diff on your machine. Send it back as Plan or Edit.
          </Heading>
          <p>
            The workspace tabs are Code, Commits, and Changes. Line comments stay
            under <code>.treq</code> until you push a Git remote.
          </p>
          <Link className={styles.highlightButton} to="/docs/concepts/changes-and-reviews">
            How reviews work
          </Link>
          <img
            className={styles.highlightCardImage}
            src={reviewScreenshot}
            alt="Changes tab with a conflicted Home.tsx and inline comments"
            width={2880}
            height={1800}
            loading="lazy"
            decoding="async"
          />
        </article>
        <article className={styles.highlightPlain}>
          <Heading as="h2" className={styles.highlightTitle}>
            When the target branch moves, dependent workspaces rebase.
          </Heading>
          <p>
            Git worktrees cannot restack a chain of branches for you. Treq colocates
            Jujutsu for that rebase. You still push and pull with Git. You never have
            to learn <code>jj</code>.
          </p>
          <Link className={styles.highlightGhost} to="/docs/concepts/workspaces">
            How workspaces work
          </Link>
          <img
            className={styles.highlightCardImage}
            src={commitsScreenshot}
            alt="Commits tab with feat/empty-event-message expanded to a client.ts diff"
            width={2880}
            height={1800}
            loading="lazy"
            decoding="async"
          />
        </article>
        <article className={styles.highlightDark}>
          <div className={styles.highlightDarkCopy}>
            <Heading as="h2" className={styles.highlightTitle}>
              Split a feature into a stack. Keep the chain current.
            </Heading>
            <p>
              Header Stack creates a workspace that targets another workspace. When
              you land the base, Treq rebases the rest. Merge locally with Regular,
              Squash, No Fast-Forward, or Fast-Forward Only.
            </p>
            <Link className={styles.highlightButtonLight} to="/docs/tutorials/merging-workspaces">
              Merging workspaces
            </Link>
          </div>
          <img
            className={styles.highlightDarkImage}
            src={stackScreenshot}
            alt="Stacked workspaces panel showing feat/empty-event-message on feat/event-ingest"
            width={2880}
            height={1800}
            loading="lazy"
            decoding="async"
          />
        </article>
      </div>
    </section>
  );
}

const SOLUTION_CARDS = [
  {
    title: 'Isolated workspaces',
    body: 'New Workspace creates a working copy at .treq/workspaces/<name>. An uncommitted change in one workspace never shows up in another.',
    image: workspacesScreenshot,
    alt: 'Dashboard listing isolated workspaces including stacked feat/empty-event-message',
  },
  {
    title: 'Local review',
    body: 'Read the diff on Changes. Leave comments on line ranges. Finish review, Plan, Edit, Copy, or Discard. Comments are not Git history.',
    image: reviewScreenshot,
    alt: 'Changes tab reviewing a conflicted Home.tsx',
  },
  {
    title: 'Auto-rebase',
    body: 'Treq rebases dependent workspaces when their target moves. Conflicts surface in the UI. Resolve conflicts starts the fix. It is not a silent merge.',
    image: commitsScreenshot,
    alt: 'Commits tab showing stacked commit history after a rebase',
  },
  {
    title: 'Stacked workspaces',
    body: 'A stack is a chain of workspaces. Create stacked workspace from the current one. Treq tracks the target and restacks the rest.',
    image: stackScreenshot,
    alt: 'Stack panel with feat/empty-event-message on feat/event-ingest',
  },
  {
    title: 'Agent sessions',
    body: 'The Code tab starts Claude, Codex, or Cursor in the workspace directory. Plan and Edit send review comments back to that agent.',
    image: terminalsScreenshot,
    alt: 'Terminal pane with Claude Code, Codex, and Cursor Agent sessions',
  },
  {
    title: 'GitHub pull requests',
    body: 'Create PR and View PR call gh. CI status for the branch shows in the workspace header. Reviews on disk are not GitHub review comments until you push.',
    image: githubScreenshot,
    alt: 'Workspace header with View PR and CI status for a stacked branch',
  },
];

function SolutionsCarousel(): ReactNode {
  const [start, setStart] = useState(0);
  const visible = 3;
  const maxStart = Math.max(0, SOLUTION_CARDS.length - visible);
  const slice = SOLUTION_CARDS.slice(start, start + visible);

  return (
    <section className={styles.carouselSection} aria-label="Solutions">
      <div className={styles.carouselHeader}>
        <Heading as="h2" className={styles.carouselHeading}>
          Isolate the agent. Review the change. Rebase the stack.
        </Heading>
        <div className={styles.carouselNav}>
          <button
            type="button"
            className={styles.carouselArrow}
            aria-label="Previous solutions"
            disabled={start === 0}
            onClick={() => setStart((s) => Math.max(0, s - 1))}>
            ←
          </button>
          <button
            type="button"
            className={styles.carouselArrow}
            aria-label="Next solutions"
            disabled={start >= maxStart}
            onClick={() => setStart((s) => Math.min(maxStart, s + 1))}>
            →
          </button>
        </div>
      </div>
      <div className={styles.carouselTrack}>
        {slice.map((card) => (
          <article key={card.title} className={styles.carouselCard}>
            <img
              className={styles.carouselCardImage}
              src={card.image}
              alt={card.alt}
              width={2880}
              height={1800}
              loading="lazy"
              decoding="async"
            />
            <Heading as="h3" className={styles.carouselCardTitle}>{card.title}</Heading>
            <p>{card.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

const FACTS = [
  {
    value: 'Local',
    label: 'Diffs, comments, and terminal metadata live under .treq and the app database. The base app does not upload your code.',
  },
  {
    value: 'Apache 2.0',
    label: 'The desktop app is open source. You can read every command it runs.',
  },
  {
    value: 'jj + Git',
    label: 'Push and pull stay on Git. Jujutsu sits beside it so Treq can rebase workspace branches when targets move.',
  },
  {
    value: 'macOS',
    label: 'Download the desktop build from GitHub Releases and open a Git repository you already have.',
  },
  {
    value: 'No telemetry',
    label: 'The app does not send feature usage, crash reports, or performance metrics. Docs-site analytics is separate.',
  },
];

function StatsSection(): ReactNode {
  const [active, setActive] = useState(0);
  return (
    <section className={styles.statsSection} aria-label="Product facts">
      <div className={styles.statsSplit}>
        <div className={styles.statsNumbers} role="list">
          {FACTS.map((fact, i) => (
            <button
              key={fact.value}
              type="button"
              role="listitem"
              className={clsx(styles.statsNumber, i === active && styles.statsNumberActive)}
              onClick={() => setActive(i)}>
              {fact.value}
            </button>
          ))}
        </div>
        <div className={styles.statsCopy}>
          <p className={styles.kicker}>Facts</p>
          <Heading as="h2" className={styles.statsCopyHeading}>
            The constraints that make the product honest
          </Heading>
          <p>{FACTS[active].label}</p>
        </div>
      </div>
    </section>
  );
}

function ShowcaseSection(): ReactNode {
  return (
    <section className={styles.showcaseSection} aria-label="Review showcase">
      <p className={styles.showcaseKicker}>Changes</p>
      <Heading as="h2" className={styles.showcaseHeading}>
        Read the whole change, or one commit, on the same screen
      </Heading>
      <p className={styles.showcaseLead}>
        File navigation, the diff, inline comments, and commit history stay together.
        When a workspace has an open GitHub pull request, the Changes tab can also
        show GitHub review threads. Quoting a thread does not reply on GitHub.
      </p>
      <Link className={styles.showcaseCta} to="/docs/concepts/changes-and-reviews">
        Changes and reviews
      </Link>
      <img
        className={styles.showcaseImage}
        src={reviewScreenshot}
        alt="Treq Changes tab with a conflicted Home.tsx and inline comments"
        width={2880}
        height={1800}
        loading="lazy"
        decoding="async"
      />
    </section>
  );
}

function ProofSection(): ReactNode {
  return (
    <section className={styles.proofSection} aria-label="How isolation works">
      <article className={styles.proofDark}>
        <p>
          An uncommitted change in one workspace never shows up in another. That is
          the point of <code>.treq/workspaces</code>. Agents can write in parallel
          without sharing your main checkout.
        </p>
        <p className={styles.proofAttr}>From the Workspaces docs</p>
        <img
          className={styles.proofImage}
          src={workspacesScreenshot}
          alt="Repo dashboard with isolated workspaces in the sidebar"
          width={2880}
          height={1800}
          loading="lazy"
          decoding="async"
        />
      </article>
      <article className={styles.proofLight}>
        <p className={styles.proofStat}>0</p>
        <p className={styles.proofStatLabel}>telemetry events from the desktop app</p>
      </article>
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
            Review the diff on Changes. Rebase the stack when the target moves. Keep
            agents off the same working tree.
          </p>
        </div>

        <div className={styles.featureRow}>
          <div className={styles.featureText}>
            <Heading as="h3" className={styles.featureHeading}>
              Code reviews
            </Heading>
            <p className={styles.featureDescription}>
              Inspect every change before it leaves the machine. Read diffs like a
              GitHub pull request, annotate line ranges, and send comments back with
              Plan or Edit.
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
              Isolated workspaces
            </Heading>
            <p className={styles.featureDescription}>
              Each agent gets its own checkout under <code>.treq/workspaces</code>.
              An uncommitted change in one workspace never shows up in another.
            </p>
          </div>
          <div className={styles.featureScreenshot}>
            <img
              className={styles.featureImage}
              src={workspacesScreenshot}
              alt="Treq dashboard listing isolated stacked workspaces"
              width={2880}
              height={1800}
              loading="lazy"
              decoding="async"
            />
          </div>
        </div>

        <div className={styles.featureRow}>
          <div className={styles.featureText}>
            <Heading as="h3" className={styles.featureHeading}>
              Auto-rebase
            </Heading>
            <p className={styles.featureDescription}>
              Workspaces stay isolated and current. When the base moves, Treq rebases
              dependent workspaces. Start Resolve conflicts from the Commits tab when
              a rebase stops.
            </p>
          </div>
          <div className={styles.featureScreenshot}>
            <img
              className={styles.featureImage}
              src={commitsScreenshot}
              alt="Treq Commits tab with stacked commit history and a file diff"
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
              Stacked workspaces
            </Heading>
            <p className={styles.featureDescription}>
              Split a large feature into a chain of smaller pull requests. Treq keeps
              the whole chain rebased so later work sits on what you already shipped.
            </p>
            <div className={styles.inlineStackViz} aria-label="Linear stacked pull requests">
              <div className={styles.inlineStackNode}>main</div>
              <div className={styles.inlineStackNode}>PR 1</div>
              <div className={styles.inlineStackNode}>PR 2</div>
              <div className={styles.inlineStackNode} data-active="true">PR 3</div>
            </div>
          </div>
          <div className={styles.featureScreenshot}>
            <img
              className={styles.featureImage}
              src={stackScreenshot}
              alt="Stacked workspaces panel showing feat/empty-event-message on feat/event-ingest"
              width={2880}
              height={1800}
              loading="lazy"
              decoding="async"
            />
          </div>
        </div>

        <div className={styles.featureRow}>
          <div className={styles.featureText}>
            <Heading as="h3" className={styles.featureHeading}>
              Agent terminals
            </Heading>
            <p className={styles.featureDescription}>
              The Code tab starts Claude, Codex, or Cursor in the workspace directory.
              Plan and Edit send review comments back to that agent. Extra shells stay
              running when you switch tabs.
            </p>
          </div>
          <div className={styles.featureScreenshot}>
            <img
              className={styles.featureImage}
              src={terminalsScreenshot}
              alt="Treq terminal pane running Claude Code, Codex, and Cursor Agent"
              width={2880}
              height={900}
              loading="lazy"
              decoding="async"
            />
          </div>
        </div>

        <div className={clsx(styles.featureRow, styles.featureRowReverse)}>
          <div className={styles.featureText}>
            <Heading as="h3" className={styles.featureHeading}>
              GitHub PRs and CI
            </Heading>
            <p className={styles.featureDescription}>
              Create PR and View PR call <code>gh</code>. CI for the branch shows in
              the workspace header. Local review comments are not GitHub review
              comments until you push.
            </p>
          </div>
          <div className={styles.featureScreenshot}>
            <img
              className={styles.featureImage}
              src={githubScreenshot}
              alt="Workspace header showing View PR and CI for a stacked branch"
              width={2880}
              height={400}
              loading="lazy"
              decoding="async"
            />
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
          Install, then read how the workflow works
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
            <p>Public milestones. Merge queue and Pro billing are still in progress.</p>
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
          Download Treq for macOS. Reviews stay local until you push.
        </Heading>
        <p className={styles.closingCTASubheading}>
          The desktop app is Apache 2.0. Treq was used to build Treq.
        </p>
        <div className={styles.closingCTAButtons}>
          <Link
            className={styles.closingCTAButton}
            href={DOWNLOAD_HREF}
            target="_blank"
            rel="noopener noreferrer">
            Download Treq for macOS
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
    'Stacking Agent Development Environment that isolates each agent and rebases stacked PRs when the base moves.',
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
      description="Stacking Agent Development Environment that isolates each agent and rebases stacked PRs when the base moves.">
      <Head>
        <script type="application/ld+json">{JSON.stringify(SOFTWARE_APP_SCHEMA)}</script>
      </Head>
      <HomepageHeader />
      <AgentBar />
      <HighlightGrid />
      <SolutionsCarousel />
      <StatsSection />
      <ShowcaseSection />
      <ProofSection />
      <FeaturesSection />
      <ResourcesSection />
      <ClosingCTA />
    </Layout>
  );
}
