import React, { createContext, useContext, useEffect, useState } from 'react';
import { getDb } from './searchDb';
const SearchDbContext = createContext(null);
export function SearchDbProvider({ children }) {
    const [db, setDb] = useState(null);
    useEffect(() => {
        getDb().then(setDb).catch(() => { });
    }, []);
    return <SearchDbContext.Provider value={db}>{children}</SearchDbContext.Provider>;
}
export function useSearchDb() {
    return useContext(SearchDbContext);
}
