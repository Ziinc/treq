import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { getSetting, setSetting } from "../lib/api";

interface TerminalSettingsContextType {
  fontSize: number;
  setFontSize: (size: number) => Promise<void>;
}

const TerminalSettingsContext = createContext<TerminalSettingsContextType | undefined>(undefined);

export function TerminalSettingsProvider({ children }: { children: ReactNode }) {
  const [fontSize, setFontSizeState] = useState<number>(14);

  // Load saved font size from database on mount
  useEffect(() => {
    getSetting("terminal_font_size").then((savedSize) => {
      if (savedSize) {
        const parsed = parseInt(savedSize, 10);
        if (!isNaN(parsed) && parsed >= 8 && parsed <= 32) {
          setFontSizeState(parsed);
        }
      }
    });
  }, []);

  const setFontSize = async (size: number) => {
    // Validate size
    if (size < 8 || size > 32 || isNaN(size)) {
      throw new Error("Font size must be between 8 and 32");
    }

    setFontSizeState(size);
    await setSetting("terminal_font_size", size.toString());
  };

  return (
    <TerminalSettingsContext.Provider value={{ fontSize, setFontSize }}>
      {children}
    </TerminalSettingsContext.Provider>
  );
}

export function useTerminalSettings() {
  const context = useContext(TerminalSettingsContext);
  if (context === undefined) {
    throw new Error("useTerminalSettings must be used within a TerminalSettingsProvider");
  }
  return context;
}

