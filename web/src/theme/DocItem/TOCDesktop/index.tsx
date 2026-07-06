import React, {type ReactNode} from 'react';
import OriginalDocItemTOCDesktop from '@theme-original/DocItem/TOCDesktop';
import type {Props} from '@theme/DocItem/TOCDesktop';

export default function TocSide(props: Props): ReactNode {
  return <OriginalDocItemTOCDesktop {...props} />;
}
