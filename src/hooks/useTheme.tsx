import { createContext, useContext, useEffect, useState, useMemo } from "react";
import { getSetting, setSetting } from "../lib/api";

type Theme = "system" | "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  actualTheme: "light" | "dark";
}

// Default fallback for HMR edge cases where context gets disconnected
const defaultContextValue: ThemeContextType = {
  theme: "system",
  setTheme: () => {
    console.warn("ThemeProvider not found, using fallback");
  },
  actualTheme: "light",
};

const ThemeContext = createContext<ThemeContextType>(defaultContextValue);

ThemeContext.displayName = "ThemeContext";

export const useTheme = (): ThemeContextType => {
  return useContext(ThemeContext);
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>("system");
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">("light");

  // Detect system preference
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemTheme(mediaQuery.matches ? "dark" : "light");

    const handler = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? "dark" : "light");
    };

    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  // Load saved theme preference
  useEffect(() => {
    getSetting("theme").then((savedTheme) => {
      if (savedTheme === "light" || savedTheme === "dark" || savedTheme === "system") {
        setThemeState(savedTheme);
      }
    });
  }, []);

  // Compute actual theme
  const actualTheme: "light" | "dark" = 
    theme === "system" ? systemTheme : theme;

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;
    if (actualTheme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [actualTheme]);

  const setTheme = async (newTheme: Theme) => {
    setThemeState(newTheme);
    await setSetting("theme", newTheme);
  };

  const value = useMemo(() => ({ theme, setTheme, actualTheme }), [theme, actualTheme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

