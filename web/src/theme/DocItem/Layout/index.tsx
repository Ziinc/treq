import React from 'react';
import DocItemLayout from '@theme-original/DocItem/Layout';
import type {Props} from '@theme/DocItem/Layout';
import Head from '@docusaurus/Head';
import {useDoc} from '@docusaurus/plugin-content-docs/client';

const SITE_URL = 'https://treq.dev';

export default function DocItemLayoutWrapper(props: Props): JSX.Element {
  const {metadata} = useDoc();
  const isLearn = metadata.permalink.startsWith('/learn/');

  const schema = isLearn
    ? {
        '@context': 'https://schema.org',
        '@type': 'LearningResource',
        name: metadata.title,
        ...(metadata.description ? {description: metadata.description} : {}),
        url: `${SITE_URL}${metadata.permalink}`,
        ...(metadata.lastUpdatedAt
          ? {dateModified: new Date(metadata.lastUpdatedAt * 1000).toISOString()}
          : {}),
        educationalLevel: 'Beginner',
        provider: {
          '@type': 'Organization',
          name: 'Treq',
          url: SITE_URL,
        },
      }
    : {
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        headline: metadata.title,
        ...(metadata.description ? {description: metadata.description} : {}),
        url: `${SITE_URL}${metadata.permalink}`,
        ...(metadata.lastUpdatedAt
          ? {dateModified: new Date(metadata.lastUpdatedAt * 1000).toISOString()}
          : {}),
        publisher: {
          '@type': 'Organization',
          name: 'Treq',
          url: SITE_URL,
        },
      };

  return (
    <>
      <Head>
        <script type="application/ld+json">{JSON.stringify(schema)}</script>
      </Head>
      <DocItemLayout {...props} />
    </>
  );
}
