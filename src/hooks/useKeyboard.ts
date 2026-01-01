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
  deps: unknown[] = [],
  options?: { shift?: boolean; option?: boolean; requireBothCmdAndCtrl?: boolean }
) {
  useEffect(() => {
    const handleKeyPress: KeyboardHandler = (event) => {
      const target = event.target as HTMLElement | null;
      const activeElement = document.activeElement as HTMLElement | null;

      // Don't intercept events in input elements
      if (target?.tagName === "INPUT" ||
          target?.tagName === "TEXTAREA" ||
          (target && typeof (target as HTMLElement).getAttribute === "function" &&
           (target as HTMLElement).getAttribute("contenteditable") === "true")) {
        return;
      }

      // Allow specific global shortcuts to work even when terminal is focused
      const allowInTerminal = ['k', 'j', 'n', 'p', 'Escape', ']', '\\'];
      const shouldAllow = (ctrlOrCmd && allowInTerminal.includes(key)) ||
                          (!ctrlOrCmd && key === 'Escape');

      if (!shouldAllow && (isWithinTerminal(target) || isWithinTerminal(activeElement))) {
        return;
      }

      const isModifierPressed = event.ctrlKey || event.metaKey;
      const shiftRequired = options?.shift ?? false;
      const optionRequired = options?.option ?? false;
      const requireBothCmdAndCtrl = options?.requireBothCmdAndCtrl ?? false;

      if (event.key.toLowerCase() === key.toLowerCase()) {
        // Special case: require both Cmd/Meta AND Ctrl
        if (requireBothCmdAndCtrl) {
          if (!event.metaKey || !event.ctrlKey) return;
          // When requireBothCmdAndCtrl, also check shift and alt are not pressed unless required
          if (!shiftRequired && event.shiftKey) return;
          if (!optionRequired && event.altKey) return;
        } else {
          if (ctrlOrCmd && !isModifierPressed) return;
          if (!ctrlOrCmd && isModifierPressed) return;

          // IMPORTANT: When NOT requiring both Cmd+Ctrl, ensure we DON'T have both
          // This prevents Cmd+J from firing when Cmd+Control+J is pressed
          if (ctrlOrCmd && event.metaKey && event.ctrlKey) return;

          // Check shift key requirements
          if (shiftRequired && !event.shiftKey) return;
          if (!shiftRequired && event.shiftKey) return;
          // Check option/alt key requirements
          if (optionRequired && !event.altKey) return;
          if (!optionRequired && event.altKey) return;
        }

        event.preventDefault();
        handler();
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [key, ctrlOrCmd, options?.shift, options?.option, options?.requireBothCmdAndCtrl, ...deps]);
}

