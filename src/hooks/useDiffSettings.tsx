import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { getSetting, setSetting } from "../lib/api";

interface DiffSettingsContextType {
  fontSize: number;
  setFontSize: (size: number) => Promise<void>;
}

const DiffSettingsContext = createContext<DiffSettingsContextType | undefined>(undefined);

export function DiffSettingsProvider({ children }: { children: ReactNode }) {
  const [fontSize, setFontSizeState] = useState<number>(11);

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

  return (
    <DiffSettingsContext.Provider value={{ fontSize, setFontSize }}>
      {children}
    </DiffSettingsContext.Provider>
  );
}

export function useDiffSettings() {
  const context = useContext(DiffSettingsContext);
  if (context === undefined) {
    throw new Error("useDiffSettings must be used within a DiffSettingsProvider");
  }
  return context;
}
