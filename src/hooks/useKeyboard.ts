import { useEffect } from "react";

type KeyboardHandler = (event: KeyboardEvent) => void;

export function useKeyboardShortcut(
  key: string,
  ctrlOrCmd: boolean,
  handler: () => void,
  deps: any[] = []
) {
  useEffect(() => {
    const handleKeyPress: KeyboardHandler = (event) => {
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

export function useKeyboardShortcuts() {
  const shortcuts = [
    { key: "n", mod: true, action: "New Worktree", description: "Cmd/Ctrl + N" },
    { key: "r", mod: true, action: "Refresh", description: "Cmd/Ctrl + R" },
    { key: "f", mod: true, action: "Search", description: "Cmd/Ctrl + F" },
    { key: ",", mod: true, action: "Settings", description: "Cmd/Ctrl + ," },
    { key: "Escape", mod: false, action: "Close Dialog", description: "Esc" },
  ];

  return shortcuts;
}

