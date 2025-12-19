import { useEffect } from "react";
import { useTheme } from "../hooks/useTheme";

/**
 * Dynamically loads the appropriate Prism.js theme based on the current theme mode.
 * - Light mode: prism-vs.css
 * - Dark mode: prism-vsc-dark-plus.css
 */
export function PrismThemeLoader() {
  const { actualTheme } = useTheme();

  useEffect(() => {
    // Remove any existing Prism theme
    const existingLink = document.querySelector('link[data-prism-theme]');
    if (existingLink) {
      existingLink.remove();
    }

    // Determine which theme to load
    const themePath =
      actualTheme === "dark"
        ? "prism-themes/themes/prism-vsc-dark-plus.css"
        : "prism-themes/themes/prism-vs.css";

    // Create and inject the new theme stylesheet
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `/${themePath}`;
    link.setAttribute("data-prism-theme", actualTheme);
    document.head.appendChild(link);

    return () => {
      // Cleanup on unmount
      const currentLink = document.querySelector('link[data-prism-theme]');
      if (currentLink) {
        currentLink.remove();
      }
    };
  }, [actualTheme]);

  return null;
}
