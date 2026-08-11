import { useEffect } from "react";
import { useTheme } from "../hooks/useTheme";
import prismVsUrl from "prism-themes/themes/prism-vs.css?url";
import prismVscDarkPlusUrl from "prism-themes/themes/prism-vsc-dark-plus.css?url";

/**
 * Dynamically loads the appropriate Prism.js theme based on the current theme mode.
 * - Light mode: prism-vs.css
 * - Dark mode: prism-vsc-dark-plus.css
 *
 * Theme CSS is resolved through Vite (`?url`) so the files are emitted into the
 * build instead of relying on a non-existent `/prism-themes/...` public path.
 */
export function PrismThemeLoader() {
  const { actualTheme } = useTheme();

  useEffect(() => {
    // Remove any existing Prism theme
    const existingLink = document.querySelector("link[data-prism-theme]");
    if (existingLink) {
      existingLink.remove();
    }

    const themeHref = actualTheme === "dark" ? prismVscDarkPlusUrl : prismVsUrl;

    // Create and inject the new theme stylesheet
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = themeHref;
    link.setAttribute("data-prism-theme", actualTheme);
    document.head.appendChild(link);

    return () => {
      // Cleanup on unmount
      const currentLink = document.querySelector("link[data-prism-theme]");
      if (currentLink) {
        currentLink.remove();
      }
    };
  }, [actualTheme]);

  return null;
}
