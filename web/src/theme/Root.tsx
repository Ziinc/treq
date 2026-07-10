import React from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import { SearchDbProvider } from '@site/src/utils/SearchDbContext';

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <BrowserOnly fallback={<>{children}</>}>
      {() => <SearchDbProvider>{children}</SearchDbProvider>}
    </BrowserOnly>
  );
}
