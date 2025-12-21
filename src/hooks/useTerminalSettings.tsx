import { createContext, useContext, useEffect, useState, ReactNode, useMemo } from "react";
import { getSetting, setSetting } from "../lib/api";

interface TerminalSettingsContextType {
  fontSize: number;
  setFontSize: (size: number) => Promise<void>;
}

// Default fallback for HMR edge cases where context gets disconnected
const DEFAULT_FONT_SIZE = 12;
const defaultContextValue: TerminalSettingsContextType = {
  fontSize: DEFAULT_FONT_SIZE,
  setFontSize: async () => {
    console.warn("TerminalSettingsProvider not found, using fallback");
  },
};

const TerminalSettingsContext = createContext<TerminalSettingsContextType>(defaultContextValue);

// Mark as a component for React Fast Refresh
TerminalSettingsContext.displayName = "TerminalSettingsContext";

export function TerminalSettingsProvider({ children }: { children: ReactNode }) {
  const [fontSize, setFontSizeState] = useState<number>(DEFAULT_FONT_SIZE);

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
    // Update html element font-size (affects all rem units)
    document.documentElement.style.fontSize = `${size}px`;
    await setSetting("terminal_font_size", size.toString());
  };

  const value = useMemo(() => ({ fontSize, setFontSize }), [fontSize]);

  return (
    <TerminalSettingsContext.Provider value={value}>
      {children}
    </TerminalSettingsContext.Provider>
  );
}

export function useTerminalSettings(): TerminalSettingsContextType {
  return useContext(TerminalSettingsContext);
}

