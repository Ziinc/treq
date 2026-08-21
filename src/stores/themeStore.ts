import { create } from "zustand";
import { setSetting } from "../lib/api";

export type Theme = "system" | "light" | "dark";

export interface ThemeState {
  theme: Theme;
  systemTheme: "light" | "dark";
  setTheme: (theme: Theme) => Promise<void>;
  setSystemTheme: (theme: "light" | "dark") => void;
  hydrateTheme: (theme: Theme) => void;
  actualTheme: () => "light" | "dark";
}

export const defaultThemeState = {
  theme: "system" as Theme,
  systemTheme: "light" as const,
};

export const useThemeStore = create<ThemeState>((set, get) => ({
  ...defaultThemeState,
  setSystemTheme: (systemTheme) => set({ systemTheme }),
  hydrateTheme: (theme) => set({ theme }),
  actualTheme: () => {
    const { theme, systemTheme } = get();
    return theme === "system" ? systemTheme : theme;
  },
  setTheme: async (theme) => {
    set({ theme });
    await setSetting("theme", theme);
  },
}));
