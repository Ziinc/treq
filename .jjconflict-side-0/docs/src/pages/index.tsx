import type {ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import styles from './index.module.css';

function HomepageHeader() {
  return (
    <header className={styles.heroBanner}>
      <div className={styles.heroGlow}></div>
      <div className={styles.heroContainer}>
        <div className={styles.heroMain}>
          <Heading as="h1" className={styles.heroTitle}>
            <span className={styles.heroAccent}>Local</span> AI Coding Agent Orchestration
            <br />
          </Heading>
          <p className={styles.heroSubtitle}>
            Each Coding Agent works in a self-contained worktree and branch, with a GitHub-style code-reviews for iterating on AI output like a real Pull Request.
          </p>
          <p className={styles.heroSubtitle}>
          <strong>Plan, Implement, Review, Merge — with <span className={styles.heroAccent}>confidence</span>.</strong>
          </p>
          <div className={styles.buttons}>
            <Link
              className={clsx('button', styles.primaryButton)}
              to="/docs/intro">
              <i className="bi bi-download" style={{marginRight: '0.5rem'}} />
              Download for Desktop
            </Link>
            <Link
              className={clsx('button', styles.secondaryButton)}
              href="https://github.com/yourusername/treq">
              <i className="bi bi-star-fill" style={{marginRight: '0.5rem'}} />
              Star on GitHub
            </Link>
          </div>
          <div className={styles.platformsSupported}>
            <span>Available for</span>
            <i className={clsx('bi bi-apple', styles.platformIcon)} />
            <i className={clsx('bi bi-windows', styles.platformIcon)} />
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" className={styles.platformIcon} viewBox="0 0 16 16">
              <path d="M8.996 4.497c.104-.076.1-.168.186-.158s.022.102-.098.207c-.12.104-.308.243-.46.323-.291.152-.631.336-.993.336s-.647-.167-.853-.33c-.102-.082-.186-.162-.248-.221-.11-.086-.096-.207-.052-.204.075.01.087.109.134.153.064.06.144.137.241.214.195.154.454.304.778.304s.702-.19.932-.32c.13-.073.297-.204.433-.304M7.34 3.781c.055-.02.123-.031.174-.003.011.006.024.021.02.034-.012.038-.074.032-.11.05-.032.017-.057.052-.093.054-.034 0-.086-.012-.09-.046-.007-.044.058-.072.1-.089m.581-.003c.05-.028.119-.018.173.003.041.017.106.045.1.09-.004.033-.057.046-.09.045-.036-.002-.062-.037-.093-.053-.036-.019-.098-.013-.11-.051-.004-.013.008-.028.02-.034"/>
              <path fillRule="evenodd" d="M8.446.019c2.521.003 2.38 2.66 2.364 4.093-.01.939.509 1.574 1.04 2.244.474.56 1.095 1.38 1.45 2.32.29.765.402 1.613.115 2.465a.8.8 0 0 1 .254.152l.001.002c.207.175.271.447.329.698.058.252.112.488.224.615.344.382.494.667.48.922-.015.254-.203.43-.435.57-.465.28-1.164.491-1.586 1.002-.443.527-.99.83-1.505.871a1.25 1.25 0 0 1-1.256-.716v-.001a1 1 0 0 1-.078-.21c-.67.038-1.252-.165-1.718-.128-.687.038-1.116.204-1.506.206-.151.331-.445.547-.808.63-.5.114-1.126 0-1.743-.324-.577-.306-1.31-.278-1.85-.39-.27-.057-.51-.157-.626-.384-.116-.226-.095-.538.07-.988.051-.16.012-.398-.026-.648a2.5 2.5 0 0 1-.037-.369c0-.133.022-.265.087-.386v-.002c.14-.266.368-.377.577-.451s.397-.125.53-.258c.143-.15.27-.374.443-.56q.036-.037.073-.07c-.081-.538.007-1.105.192-1.662.393-1.18 1.223-2.314 1.811-3.014.502-.713.65-1.287.701-2.016.042-.997-.705-3.974 2.112-4.2q.168-.015.321-.013m2.596 10.866-.03.016c-.223.121-.348.337-.427.656-.08.32-.107.733-.13 1.206v.001c-.023.37-.192.824-.31 1.267s-.176.862-.036 1.128v.002c.226.452.608.636 1.051.601s.947-.304 1.36-.795c.474-.576 1.218-.796 1.638-1.05.21-.126.324-.242.333-.4.009-.157-.097-.403-.425-.767-.17-.192-.217-.462-.274-.71-.056-.247-.122-.468-.26-.585l-.001-.001c-.18-.157-.356-.17-.565-.164q-.069.001-.14.005c-.239.275-.805.612-1.197.508-.359-.09-.562-.508-.587-.918m-7.204.03H3.83c-.189.002-.314.09-.44.225-.149.158-.276.382-.445.56v.002h-.002c-.183.184-.414.239-.61.31-.195.069-.353.143-.46.35v.002c-.085.155-.066.378-.029.624.038.245.096.507.018.746v.002l-.001.002c-.157.427-.155.678-.082.822.074.143.235.22.48.272.493.103 1.26.069 1.906.41.583.305 1.168.404 1.598.305.431-.098.712-.369.75-.867v-.002c.029-.292-.195-.673-.485-1.052-.29-.38-.633-.752-.795-1.09v-.002l-.61-1.11c-.21-.286-.43-.462-.68-.5a1 1 0 0 0-.106-.008M9.584 4.85c-.14.2-.386.37-.695.467-.147.048-.302.17-.495.28a1.3 1.3 0 0 1-.74.19.97.97 0 0 1-.582-.227c-.14-.113-.25-.237-.394-.322a3 3 0 0 1-.192-.126c-.063 1.179-.85 2.658-1.226 3.511a5.4 5.4 0 0 0-.43 1.917c-.68-.906-.184-2.066.081-2.568.297-.55.343-.701.27-.649-.266.436-.685 1.13-.848 1.844-.085.372-.1.749.01 1.097.11.349.345.67.766.931.573.351.963.703 1.193 1.015s.302.584.23.777a.4.4 0 0 1-.212.22.7.7 0 0 1-.307.056l.184.235c.094.124.186.249.266.375 1.179.805 2.567.496 3.568-.218.1-.342.197-.664.212-.903.024-.474.05-.896.136-1.245s.244-.634.53-.791a1 1 0 0 1 .138-.061q.005-.045.013-.087c.082-.546.569-.572 1.18-.303.588.266.81.499.71.814h.13c.122-.398-.133-.69-.822-1.025l-.137-.06a2.35 2.35 0 0 0-.012-1.113c-.188-.79-.704-1.49-1.098-1.838-.072-.003-.065.06.081.203.363.333 1.156 1.532.727 2.644a1.2 1.2 0 0 0-.342-.043c-.164-.907-.543-1.66-.735-2.014-.359-.668-.918-2.036-1.158-2.983M7.72 3.503a1 1 0 0 0-.312.053c-.268.093-.447.286-.559.391-.022.021-.05.04-.119.091s-.172.126-.321.238q-.198.151-.13.38c.046.15.192.325.459.476.166.098.28.23.41.334a1 1 0 0 0 .215.133.9.9 0 0 0 .298.066c.282.017.49-.068.673-.173s.34-.233.518-.29c.365-.115.627-.345.709-.564a.37.37 0 0 0-.01-.309c-.048-.096-.148-.187-.318-.257h-.001c-.354-.151-.507-.162-.705-.29-.321-.207-.587-.28-.807-.279m-.89-1.122h-.025a.4.4 0 0 0-.278.135.76.76 0 0 0-.191.334 1.2 1.2 0 0 0-.051.445v.001c.01.162.041.299.102.436.05.116.109.204.183.274l.089-.065.117-.09-.023-.018a.4.4 0 0 1-.11-.161.7.7 0 0 1-.054-.22v-.01a.7.7 0 0 1 .014-.234.4.4 0 0 1 .08-.179q.056-.069.126-.073h.013a.18.18 0 0 1 .123.05c.045.04.08.09.11.162a.7.7 0 0 1 .054.22v.01a.7.7 0 0 1-.002.17 1.1 1.1 0 0 1 .317-.143 1.3 1.3 0 0 0 .002-.194V3.23a1.2 1.2 0 0 0-.102-.437.8.8 0 0 0-.227-.31.4.4 0 0 0-.268-.102m1.95-.155a.63.63 0 0 0-.394.14.9.9 0 0 0-.287.376 1.2 1.2 0 0 0-.1.51v.015q0 .079.01.152c.114.027.278.074.406.138a1 1 0 0 1-.011-.172.8.8 0 0 1 .058-.278.5.5 0 0 1 .139-.2.26.26 0 0 1 .182-.069.26.26 0 0 1 .178.081c.055.054.094.12.124.21.029.086.042.17.04.27l-.002.012a.8.8 0 0 1-.057.277c-.024.059-.089.106-.122.145.046.016.09.03.146.052a5 5 0 0 1 .248.102 1.2 1.2 0 0 0 .244-.763 1.2 1.2 0 0 0-.11-.495.9.9 0 0 0-.294-.37.64.64 0 0 0-.39-.133z"/>
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
            <div className={styles.stat}>
              <div className={styles.statValue}>1</div>
              <div className={styles.statLabel}>User</div>
            </div>
          </div>
        </div>

        <div className={styles.heroVisual}>
          <div className={styles.branchDiagram}>
            <div className={clsx(styles.branch, styles.branchMain)}>
              <div className={styles.branchLabel}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '0.5rem', display: 'inline-block', verticalAlign: 'middle'}}>
                  <line x1="6" y1="3" x2="6" y2="15"></line>
                  <circle cx="18" cy="6" r="3"></circle>
                  <circle cx="6" cy="18" r="3"></circle>
                  <path d="M18 9a9 9 0 0 1-9 9"></path>
                </svg>
                main
              </div>
              <div className={styles.branchLine}>
                <span className={styles.particle}></span>
                <span className={styles.particle}></span>
                <span className={styles.particle}></span>
                <span className={styles.particle}></span>
                <span className={styles.particle}></span>
              </div>
              <div className={styles.branchCommits}>
                <span className={styles.commit}></span>
                <span className={styles.commit}></span>
                <span className={styles.commit}></span>
                <span className={styles.commit}></span>
                <span className={styles.commit}></span>
              </div>
            </div>
            <div className={clsx(styles.branch, styles.branchFeature)}>
              <div className={styles.branchLabel}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '0.5rem', display: 'inline-block', verticalAlign: 'middle'}}>
                  <line x1="6" y1="3" x2="6" y2="15"></line>
                  <circle cx="18" cy="6" r="3"></circle>
                  <circle cx="6" cy="18" r="3"></circle>
                  <path d="M18 9a9 9 0 0 1-9 9"></path>
                </svg>
                feature/auth
              </div>
              <div className={styles.branchLine}>
                <span className={styles.particle}></span>
                <span className={styles.particle}></span>
                <span className={styles.particle}></span>
              </div>
              <div className={styles.branchCommits}>
                <span className={styles.commit}></span>
                <span className={styles.commit}></span>
              </div>
            </div>
            <div className={clsx(styles.branch, styles.branchBugfix)}>
              <div className={styles.branchLabel}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '0.5rem', display: 'inline-block', verticalAlign: 'middle'}}>
                  <line x1="6" y1="3" x2="6" y2="15"></line>
                  <circle cx="18" cy="6" r="3"></circle>
                  <circle cx="6" cy="18" r="3"></circle>
                  <path d="M18 9a9 9 0 0 1-9 9"></path>
                </svg>
                bugfix/login
              </div>
              <div className={styles.branchLine}>
                <span className={styles.particle}></span>
              </div>
              <div className={styles.branchCommits}>
                <span className={styles.commit}></span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.agentsSupported}>
        <span className={styles.agentsLabel}>Supported AI Agents</span>
        <div className={styles.agentsIcons}>
          <div className={styles.agentIcon} title="Claude Code">
            <svg xmlns="http://www.w3.org/2000/svg" width="70" height="70" fill="currentColor" className={styles.platformIcon} viewBox="0 0 16 16">
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
              Today&rsquo;s AI development workflow is basically:
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
          It&rsquo;s chaos disguised as productivity.
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
                  Iterate patches safely until they&rsquo;re right
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
