import type {ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import {RefreshCw, Layers, GitBranch} from 'lucide-react';

import styles from './index.module.css';

function HomepageHeader() {
  return (
    <header className={styles.heroBanner} aria-label="Hero">
      <div className={styles.heroGlow}></div>
      <div className={styles.heroContainer}>
        <div className={styles.heroMain}>
          <div className={styles.heroBadge}>
            <span className={styles.badgeDot}></span>
            Open-source Graphite alternative
          </div>
          <Heading as="h1" className={styles.heroTitle}>
            Your{' '}
            <span className={styles.heroAccent}>AI Code Review</span>
            {' '}Manager
          </Heading>
          <p className={styles.heroSubtitle}>
            Accelerate AI-assisted development while maintaining high quality code. Coding agents work in isolated workspaces that stay automatically rebased, so you can review, iterate, and ship with confidence.
          </p>
          <p className={styles.heroProductDescription}>
            Treq is a free, open-source desktop app for macOS.
          </p>
          <div className={styles.buttons}>
            <Link
              className={clsx('button', styles.primaryButton)}
              href="https://github.com/Ziinc/treq/releases">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download for Desktop
            </Link>
          </div>
          <div className={styles.platformsSupported}>
            <span>Available for</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" className={styles.platformIcon} viewBox="0 0 16 16" aria-label="macOS">
              <path d="M11.182.008C11.148-.03 9.923.023 8.857 1.18c-1.066 1.156-.902 2.482-.878 2.516s1.52.087 2.475-1.258.762-2.391.728-2.43m3.314 11.733c-.048-.096-2.325-1.234-2.113-3.422s1.675-2.789 1.698-2.854-.597-.79-1.254-1.157a3.7 3.7 0 0 0-1.563-.434c-.108-.003-.483-.095-1.254.116-.508.139-1.653.589-1.968.607-.316.018-1.256-.522-2.267-.665-.647-.125-1.333.131-1.824.328-.49.196-1.422.754-2.074 2.237-.652 1.482-.311 3.83-.067 4.56s.625 1.924 1.273 2.796c.576.984 1.34 1.667 1.659 1.899s1.219.386 1.843.067c.502-.308 1.408-.485 1.766-.472.357.013 1.061.154 1.782.539.571.197 1.111.115 1.652-.105.541-.221 1.324-1.059 2.238-2.758q.52-1.185.473-1.282"/>
              <path d="M11.182.008C11.148-.03 9.923.023 8.857 1.18c-1.066 1.156-.902 2.482-.878 2.516s1.52.087 2.475-1.258.762-2.391.728-2.43"/>
            </svg>
          </div>
          <div className={styles.heroStats}>
            <div className={styles.stat}>
              <div className={styles.statValue}>100%</div>
              <div className={styles.statLabel}>Open-source</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statValue}>100%</div>
              <div className={styles.statLabel}>Local control</div>
            </div>
          </div>
        </div>

        <div className={styles.heroVisual}>
          <div className={styles.screenshotPlaceholder} aria-hidden="true">
            <div className={styles.screenshotWindow}>
              <div className={styles.screenshotTitlebar}>
                <span className={styles.windowDot} style={{background: '#ff5f57'}}></span>
                <span className={styles.windowDot} style={{background: '#febc2e'}}></span>
                <span className={styles.windowDot} style={{background: '#28c840'}}></span>
                <span className={styles.windowTitle}>Treq</span>
              </div>
              <div className={styles.screenshotBody}>
                <div className={styles.screenshotSidebar}>
                  <div className={styles.mockItem} style={{width: '80%'}}></div>
                  <div className={styles.mockItem} style={{width: '60%'}}></div>
                  <div className={styles.mockItem} style={{width: '70%'}}></div>
                  <div className={styles.mockItemActive} style={{width: '90%'}}></div>
                  <div className={styles.mockItem} style={{width: '50%'}}></div>
                </div>
                <div className={styles.screenshotContent}>
                  <div className={styles.mockDiffHeader}></div>
                  <div className={styles.mockDiffLine} data-type="add"></div>
                  <div className={styles.mockDiffLine} data-type="context"></div>
                  <div className={styles.mockDiffLine} data-type="remove"></div>
                  <div className={styles.mockDiffLine} data-type="add"></div>
                  <div className={styles.mockDiffLine} data-type="context"></div>
                  <div className={styles.mockDiffLine} data-type="add"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.agentsSupported}>
        <span className={styles.agentsLabel}>Supported AI agents</span>
        <div className={styles.agentsIcons}>
          <div className={styles.agentIcon} title="Claude Code">
            <svg xmlns="http://www.w3.org/2000/svg" width="70" height="70" fill="currentColor" className={styles.platformIcon} viewBox="0 0 16 16" aria-hidden="true">
              <path d="m3.127 10.604 3.135-1.76.053-.153-.053-.085H6.11l-.525-.032-1.791-.048-1.554-.065-1.505-.08-.38-.081L0 7.832l.036-.234.32-.214.455.04 1.009.069 1.513.105 1.097.064 1.626.17h.259l.036-.105-.089-.065-.068-.064-1.566-1.062-1.695-1.121-.887-.646-.48-.327-.243-.306-.104-.67.435-.48.585.04.15.04.593.456 1.267.981 1.654 1.218.242.202.097-.068.012-.049-.109-.181-.9-1.626-.96-1.655-.428-.686-.113-.411a2 2 0 0 1-.068-.484l.496-.674L4.446 0l.662.089.279.242.411.94.666 1.48 1.033 2.014.302.597.162.553.06.17h.105v-.097l.085-1.134.157-1.392.154-1.792.052-.504.25-.605.497-.327.387.186.319.456-.045.294-.19 1.23-.37 1.93-.243 1.29h.142l.161-.16.654-.868 1.097-1.372.484-.545.565-.601.363-.287h.686l.505.751-.226.775-.707.895-.585.759-.839 1.13-.524.904.048.072.125-.012 1.897-.403 1.024-.186 1.223-.21.553.258.06.263-.218.536-1.307.323-1.533.307-2.284.54-.028.02.032.04 1.029.098.44.024h1.077l2.005.15.525.346.315.424-.053.323-.807.411-3.631-.863-.872-.218h-.12v.073l.726.71 1.331 1.202 1.667 1.55.084.383-.214.302-.226-.032-1.464-1.101-.565-.497-1.28-1.077h-.084v.113l.295.432 1.557 2.34.08.718-.112.234-.404.141-.444-.08-.911-1.28-.94-1.44-.759-1.291-.093.053-.448 4.821-.21.246-.484.186-.403-.307-.214-.496.214-.98.258-1.28.21-1.016.19-1.263.112-.42-.008-.028-.092.012-.953 1.307-1.448 1.957-1.146 1.227-.274.109-.477-.247.045-.44.266-.39 1.586-2.018.956-1.25.617-.723-.004-.105h-.036l-4.212 2.736-.75.096-.324-.302.04-.496.154-.162 1.267-.871z"/>
            </svg>
            <span>Claude Code</span>
          </div>
        </div>
      </div>
    </header>
  );
}

function ProblemSection(): ReactNode {
  return (
    <section className={styles.problemSection} aria-label="The problem">
      <div className={styles.problemContainer}>
        <Heading as="h2" className={styles.problemHeading}>
          AI agents write code fast. Managing the output is the hard part.
        </Heading>

        <div className={styles.problemList}>
          <div className={styles.problemItem}>
            Your agent finishes a task, but now you're reviewing a 500-line diff with no context.
          </div>
          <div className={styles.problemItem}>
            You want multiple agents working in parallel, but they'd step on each other's changes.
          </div>
          <div className={styles.problemItem}>
            Your branches go stale while you're iterating on reviews, and rebasing is a chore.
          </div>
          <div className={styles.problemItem}>
            A large feature needs to be broken into smaller PRs, but keeping them in sync is painful.
          </div>
        </div>

        <p className={styles.problemConclusion}>
          You need a workspace manager built for AI-assisted development.
        </p>
      </div>
    </section>
  );
}

function FeaturesSection(): ReactNode {
  return (
    <section className={styles.featuresSection} aria-label="Features">
      <div className={styles.featuresContainer}>
        <div className={styles.sectionHeader}>
          <Heading as="h2" className={styles.featuresHeading}>
            Workspace management for parallelized AI development
          </Heading>
          <p className={styles.featuresSubheading}>
            Coding agents work in isolated copies of your codebase that stay automatically rebased. Review diffs like a GitHub PR, annotate code, and send it back to the agent for changes.
          </p>
        </div>

        {/* Core Feature: Automatic rebasing */}
        <div className={styles.featureRow}>
          <div className={styles.featureText}>
            <div className={styles.featureBadge}>Core</div>
            <div className={styles.featureIconInline}><RefreshCw size={28} /></div>
            <Heading as="h3" className={styles.featureHeading}>
              Automatic rebasing
            </Heading>
            <p className={styles.featureDescription}>
              Workspaces are isolated but never go stale. When the underlying code changes, Treq rebases dependent workspaces automatically in the background. Got a conflict? Send it to the agent to handle the grunt work.
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

        {/* Core Feature: Stacked workspaces */}
        <div className={clsx(styles.featureRow, styles.featureRowReverse)}>
          <div className={styles.featureText}>
            <div className={styles.featureBadge}>Core</div>
            <div className={styles.featureIconInline}><Layers size={28} /></div>
            <Heading as="h3" className={styles.featureHeading}>
              Stacked workspaces
            </Heading>
            <p className={styles.featureDescription}>
              Got a large feature but need to break it up for easier review? Split development into stacks, where features are built incrementally over smaller branches and shipped in bite-sized chunks. Treq keeps the entire stack rebased and in sync.
            </p>
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
                  <div className={styles.mockStackItem} data-level="0">
                    <div className={styles.mockStackConnector}></div>
                    <div className={styles.mockStackCard} data-type="main">
                      <div className={styles.mockItem} style={{width: '40%'}}></div>
                    </div>
                  </div>
                  <div className={styles.mockStackItem} data-level="1">
                    <div className={styles.mockStackConnector}></div>
                    <div className={styles.mockStackCard} data-type="pr">
                      <div className={styles.mockItem} style={{width: '70%'}}></div>
                      <div className={styles.mockStackPrBadge}>PR #1</div>
                    </div>
                  </div>
                  <div className={styles.mockStackItem} data-level="2">
                    <div className={styles.mockStackConnector}></div>
                    <div className={styles.mockStackCard} data-type="pr">
                      <div className={styles.mockItem} style={{width: '60%'}}></div>
                      <div className={styles.mockStackPrBadge}>PR #2</div>
                    </div>
                  </div>
                  <div className={styles.mockStackItem} data-level="3">
                    <div className={styles.mockStackConnector}></div>
                    <div className={styles.mockStackCard} data-type="active">
                      <div className={styles.mockItem} style={{width: '55%'}}></div>
                      <div className={styles.mockStackPrBadge}>PR #3</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Feature: Isolated workspaces */}
        <div className={styles.featureRow}>
          <div className={styles.featureText}>
            <div className={styles.featureIconInline}><GitBranch size={28} /></div>
            <Heading as="h3" className={styles.featureHeading}>
              Isolated workspaces
            </Heading>
            <p className={styles.featureDescription}>
              Coding agents work in isolated copies of the codebase, ensuring changes are independent from each other while keeping your current repository clean for planning.
            </p>
          </div>
          <div className={styles.featureScreenshot}>
            <div className={styles.screenshotWindow} aria-hidden="true">
              <div className={styles.screenshotTitlebar}>
                <span className={styles.windowDot} style={{background: '#ff5f57'}}></span>
                <span className={styles.windowDot} style={{background: '#febc2e'}}></span>
                <span className={styles.windowDot} style={{background: '#28c840'}}></span>
                <span className={styles.windowTitle}>Workspaces</span>
              </div>
              <div className={styles.screenshotBody}>
                <div className={styles.screenshotSidebar}>
                  <div className={styles.mockItemActive} style={{width: '90%'}}></div>
                  <div className={styles.mockItem} style={{width: '70%'}}></div>
                  <div className={styles.mockItem} style={{width: '80%'}}></div>
                  <div className={styles.mockItem} style={{width: '60%'}}></div>
                  <div className={styles.mockItem} style={{width: '75%'}}></div>
                </div>
                <div className={styles.screenshotContent}>
                  <div className={styles.mockDiffHeader}></div>
                  <div className={styles.mockItem} style={{width: '90%'}}></div>
                  <div className={styles.mockItem} style={{width: '70%'}}></div>
                  <div className={styles.mockItem} style={{width: '85%'}}></div>
                  <div className={styles.mockItem} style={{width: '60%'}}></div>
                </div>
              </div>
            </div>
          </div>
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
          Ship AI-generated code with confidence.
        </Heading>
        <p className={styles.closingCTASubheading}>
          Treq is free, open-source, and runs entirely on your machine. Treq was used to build Treq.
        </p>
        <div className={styles.closingCTAButtons}>
          <Link
            className={styles.closingCTAButton}
            href="https://github.com/Ziinc/treq/releases">
            Download Treq — Free &amp; Open Source
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={siteConfig.title}
      description="Your AI Code Review Manager. Accelerate AI-assisted development with isolated workspaces, automatic rebasing, and stacked PRs. Free, open-source desktop app for macOS.">
      <HomepageHeader />
      <ProblemSection />
      <FeaturesSection />
      <ClosingCTA />
    </Layout>
  );
}
