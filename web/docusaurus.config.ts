import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import pkg from '../package.json';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const featureFlags = pkg.featureFlags;
const isProduction = process.env.NODE_ENV === 'production';

const config: Config = {
  title: 'Treq',
  tagline: 'The Open Source Graphite Alternative',
  favicon: 'img/favicon.svg',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  // Set the production url of your site here
  url: 'https://treq.dev',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'Ziinc', // Usually your GitHub org/user name.
  projectName: 'treq', // Usually your repo name.

  customFields: {
    featureFlags,
  },

  onBrokenLinks: 'throw',

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            'https://github.com/Ziinc/treq/tree/main/docs/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
        ...(isProduction ? {
          gtag: {
            trackingID: 'G-V9MPP2ZWZF',
            anonymizeIP: true,
          },
        } : {}),
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    // Replace with your project's social card
    // TODO: Replace with branded Treq social card (1200x630)
    image: 'img/treq-social-card.png',
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      hideOnScroll: true,
      logo: {
        alt: 'Treq Logo',
        src: 'assets/combined-horizontal.png',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'guidesSidebar',
          position: 'left',
          label: 'Guides',
        },
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Reference',
        },
        ...(featureFlags.pro ? [{
          to: '/dashboard',
          label: 'Dashboard',
          position: 'right' as const,
        }] : []),
        {
          href: 'https://github.com/Ziinc/treq',
          label: 'GitHub',
          position: 'right',
        },
        {
          type: 'html',
          position: 'right',
          value: '<a href="/docs/guides/getting-started/installation" class="button button--primary button--sm">Get Started</a>',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Installation',
              href: 'https://github.com/Ziinc/treq/releases',
            },
            {
              label: 'Getting Started',
              to: '/docs/guides/getting-started/installation',
            },
            {
              label: 'Guides',
              to: '/docs/guides',
            },
            {
              label: 'Features',
              to: '/docs/features/workspaces',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/Ziinc/treq',
            },
            {
              label: 'Issues',
              href: 'https://github.com/Ziinc/treq/issues',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Treq.<br />Treq is licensed under Apache License 2.0.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
