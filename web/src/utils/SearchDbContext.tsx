import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Database } from 'sql.js';
import { getDb } from './searchDb';

const SearchDbContext = createContext<Database | null>(null);

export function SearchDbProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<Database | null>(null);

  useEffect(() => {
    getDb().then(setDb).catch(() => {});
  }, []);

  return <SearchDbContext.Provider value={db}>{children}</SearchDbContext.Provider>;
}

export function useSearchDb(): Database | null {
  return useContext(SearchDbContext);
}
