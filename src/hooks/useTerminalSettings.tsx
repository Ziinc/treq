import type { ReactNode } from "react";
import { useTerminalSettingsStore } from "../stores/terminalSettingsStore";

export function useTerminalSettings() {
  const fontSize = useTerminalSettingsStore((s) => s.fontSize);
  const setFontSize = useTerminalSettingsStore((s) => s.setFontSize);
  return { fontSize, setFontSize };
}

export function TerminalSettingsProvider({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
