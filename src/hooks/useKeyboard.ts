import { useEffect } from "react";

type KeyboardHandler = (event: KeyboardEvent) => void;

function isWithinTerminal(element: HTMLElement | null): boolean {
  if (!element) return false;
  // Check for terminal containers (ghostty-web or xterm for backwards compatibility)
  return element.closest('.xterm, [data-terminal]') !== null;
}

export function useKeyboardShortcut(
  key: string,
  ctrlOrCmd: boolean,
  handler: () => void,
  deps: unknown[] = []
) {
  useEffect(() => {
    const handleKeyPress: KeyboardHandler = (event) => {
      const target = event.target as HTMLElement | null;
      const activeElement = document.activeElement as HTMLElement | null;

      // Don't intercept events in input elements
      if (target?.tagName === "INPUT" ||
          target?.tagName === "TEXTAREA" ||
          target?.getAttribute("contenteditable") === "true") {
        return;
      }

      // Allow specific global shortcuts to work even when terminal is focused
      const allowInTerminal = ['k', 'j', 'n', 'Escape'];
      const shouldAllow = (ctrlOrCmd && allowInTerminal.includes(key)) ||
                          (!ctrlOrCmd && key === 'Escape');

      if (!shouldAllow && (isWithinTerminal(target) || isWithinTerminal(activeElement))) {
        return;
      }

      const isModifierPressed = event.ctrlKey || event.metaKey;

      if (event.key.toLowerCase() === key.toLowerCase()) {
        if (ctrlOrCmd && !isModifierPressed) return;
        if (!ctrlOrCmd && isModifierPressed) return;

        event.preventDefault();
        handler();
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [key, ctrlOrCmd, ...deps]);
}

