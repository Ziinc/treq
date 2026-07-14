import type {ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import Head from '@docusaurus/Head';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import styles from './pricing.module.css';

const PRICING_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'Treq',
  description:
    'AI workspace manager for developers. Free for public GitHub repos. Pro adds private repos and merge queue.',
  url: 'https://treq.dev/pricing',
  brand: {
    '@type': 'Brand',
    name: 'Treq',
  },
  offers: [
    {
      '@type': 'Offer',
      name: 'Free',
      price: '0',
      priceCurrency: 'USD',
      description:
        'Desktop app with GitHub integration for public repositories. No other integrations. No merge queue.',
    },
    {
      '@type': 'Offer',
      name: 'Pro',
      price: '15',
      priceCurrency: 'USD',
      unitText: 'user/month',
      description:
        'GitHub integration for all repositories, plus merge queue. Billed per user per month.',
    },
  ],
};

type PlanFeature = {
  text: string;
  included: boolean;
};

const FREE_FEATURES: PlanFeature[] = [
  {text: 'Full desktop app', included: true},
  {text: 'Integrations', included: false},
  {text: 'GitHub integration for public repos only', included: true},
  {text: 'Merge queue', included: false},
];

const PRO_FEATURES: PlanFeature[] = [
  {text: 'Full desktop app', included: true},
  {text: 'GitHub integration for all repos', included: true},
  {text: 'Merge queue', included: true},
];

function FeatureList({features}: {features: PlanFeature[]}): ReactNode {
  return (
    <ul className={styles.featureList}>
      {features.map((feature) => (
        <li
          key={feature.text}
          className={clsx(
            styles.featureItem,
            feature.included ? styles.featureIncluded : styles.featureExcluded,
          )}
        >
          <span className={styles.featureMark} aria-hidden="true">
            {feature.included ? '✓' : '–'}
          </span>
          <span>{feature.text}</span>
        </li>
      ))}
    </ul>
  );
}

function PlansSection(): ReactNode {
  return (
    <section className={styles.plans} aria-label="Plans">
      <article className={styles.plan}>
        <Heading as="h2" className={styles.planName}>
          Free
        </Heading>
        <p className={styles.planPrice}>
          <span className={styles.priceAmount}>$0</span>
        </p>
        <p className={styles.planSummary}>
          Use the full desktop app at no cost. Free includes GitHub for public
          repositories only. Integrations and merge queue are not included.
        </p>
        <FeatureList features={FREE_FEATURES} />
        <Link
          className={clsx('button', styles.planButton, styles.planButtonSecondary)}
          to="/docs/getting-started/installation"
        >
          Get started
        </Link>
      </article>

      <article className={clsx(styles.plan, styles.planPro)}>
        <Heading as="h2" className={styles.planName}>
          Pro
        </Heading>
        <p className={styles.planPrice}>
          <span className={styles.priceAmount}>$15</span>
          <span className={styles.priceUnit}>/user/month</span>
        </p>
        <p className={styles.planSummary}>
          GitHub for every repository you work in, public or private, plus merge
          queue.
        </p>
        <FeatureList features={PRO_FEATURES} />
        <Link
          className={clsx('button', styles.planButton, styles.planButtonPrimary)}
          to="/login"
        >
          Upgrade to Pro
        </Link>
      </article>
    </section>
  );
}

function ComparisonSection(): ReactNode {
  return (
    <section className={styles.comparison} aria-label="Feature comparison">
      <Heading as="h2" className={styles.sectionHeading}>
        Feature comparison
      </Heading>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Feature</th>
              <th scope="col">Free</th>
              <th scope="col">Pro</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Desktop app</th>
              <td>Included</td>
              <td>Included</td>
            </tr>
            <tr>
              <th scope="row">GitHub integration</th>
              <td>Public repos only</td>
              <td>All repos</td>
            </tr>
            <tr>
              <th scope="row">Integrations</th>
              <td>Not included</td>
              <td>-</td>
            </tr>
            <tr>
              <th scope="row">Merge queue</th>
              <td>Not included</td>
              <td>Included</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FaqSection(): ReactNode {
  return (
    <section className={styles.faq} aria-label="Frequently asked questions">
      <Heading as="h2" className={styles.sectionHeading}>
        Frequently asked questions
      </Heading>

      <div className={styles.faqList}>
        <div className={styles.faqItem}>
          <Heading as="h3" className={styles.faqQuestion}>
            Who is Free for?
          </Heading>
          <p className={styles.faqAnswer}>
            Free is for developers who want the desktop workspace manager and
            only need GitHub on public repositories. Open source projects fit
            this plan.
          </p>
        </div>

        <div className={styles.faqItem}>
          <Heading as="h3" className={styles.faqQuestion}>
            What does Pro add?
          </Heading>
          <p className={styles.faqAnswer}>
            Pro adds GitHub access for private repositories and merge queue.
            Billing is $15 per user each month.
          </p>
        </div>

        <div className={styles.faqItem}>
          <Heading as="h3" className={styles.faqQuestion}>
            Is the desktop app still free on Pro?
          </Heading>
          <p className={styles.faqAnswer}>
            Yes. Pro is a cloud subscription on top of the same open source
            desktop app. Your local workspaces stay on your machine either way.
          </p>
        </div>

        <div className={styles.faqItem}>
          <Heading as="h3" className={styles.faqQuestion}>
            How do I upgrade?
          </Heading>
          <p className={styles.faqAnswer}>
            Create an account, then start a Pro subscription from the dashboard.
            You can move back to Free if you cancel.
          </p>
        </div>
      </div>
    </section>
  );
}

export default function PricingPage(): ReactNode {
  return (
    <Layout
      title="Pricing"
      description="Treq pricing. Free for public GitHub repos. Pro is $15/user/month for all repos and merge queue."
    >
      <Head>
        <script type="application/ld+json">
          {JSON.stringify(PRICING_SCHEMA)}
        </script>
      </Head>
      <main className={styles.page}>
        <header className={styles.header}>
          <Heading as="h1" className={styles.title}>
            Pricing
          </Heading>
          <p className={styles.subtitle}>
            Local by default. Pay when you need private GitHub repos and merge
            queue.
          </p>
          <p className={styles.intro}>
            The Treq desktop app is free and open source. You run it on your
            machine. Cloud features are optional and billed per user.
          </p>
        </header>

        <PlansSection />
        <ComparisonSection />
        <FaqSection />
      </main>
    </Layout>
  );
}
