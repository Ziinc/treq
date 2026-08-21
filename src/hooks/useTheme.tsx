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
