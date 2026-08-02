import React, {type ReactNode} from 'react';
import clsx from 'clsx';
import {ThemeClassNames} from '@docusaurus/theme-common';
import Heading from '@theme/Heading';
import Text from '@theme/DocCard/Heading/Text';
import type {Props} from '@theme/DocCard/Heading';

import styles from './styles.module.css';

export default function DocCardHeading({item, title}: Props): ReactNode {
  return (
    <Heading
      as="h2"
      className={clsx(ThemeClassNames.docs.docCard.heading, styles.cardTitle)}
      title={title}>
      <Text item={item} title={title} />
    </Heading>
  );
}
