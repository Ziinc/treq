import type { ReactNode } from "react";
import { useThemeStore } from "../stores/themeStore";

export const useTheme = () => {
  const theme = useThemeStore((s) => s.theme);
  const systemTheme = useThemeStore((s) => s.systemTheme);
  const setTheme = useThemeStore((s) => s.setTheme);
  return {
    theme,
    setTheme,
    actualTheme: (theme === "system" ? systemTheme : theme) as "light" | "dark",
  };
};

/** No-op: theme lives in Zustand. Kept for existing test wrappers. */
export const ThemeProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => children;
