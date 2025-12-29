import { createContext, useContext, useEffect, useState, ReactNode, useMemo } from "react";
import { getSetting, setSetting } from "../lib/api";

interface DiffSettingsContextType {
  fontSize: number;
  setFontSize: (size: number) => Promise<void>;
}

// Default fallback for HMR edge cases where context gets disconnected
const DEFAULT_FONT_SIZE = 11;
const defaultContextValue: DiffSettingsContextType = {
  fontSize: DEFAULT_FONT_SIZE,
  setFontSize: async () => {
    console.warn("DiffSettingsProvider not found, using fallback");
  },
};

const DiffSettingsContext = createContext<DiffSettingsContextType>(defaultContextValue);

DiffSettingsContext.displayName = "DiffSettingsContext";

export function DiffSettingsProvider({ children }: { children: ReactNode }) {
  const [fontSize, setFontSizeState] = useState<number>(DEFAULT_FONT_SIZE);

  // Load saved font size from database on mount
  useEffect(() => {
    getSetting("diff_font_size").then((savedSize) => {
      if (savedSize) {
        const parsed = parseInt(savedSize, 10);
        if (!isNaN(parsed) && parsed >= 8 && parsed <= 16) {
          setFontSizeState(parsed);
        }
      }
    });
  }, []);

  const setFontSize = async (size: number) => {
    // Validate size
    if (size < 8 || size > 16 || isNaN(size)) {
      throw new Error("Font size must be between 8 and 16");
    }

    setFontSizeState(size);
    await setSetting("diff_font_size", size.toString());
  };

  const value = useMemo(() => ({ fontSize, setFontSize }), [fontSize]);

  return (
    <DiffSettingsContext.Provider value={value}>
      {children}
    </DiffSettingsContext.Provider>
  );
}

export function useDiffSettings(): DiffSettingsContextType {
  return useContext(DiffSettingsContext);
}
