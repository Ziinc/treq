import { useTerminalSettingsStore } from "../stores/terminalSettingsStore";

export function useTerminalSettings() {
  const fontSize = useTerminalSettingsStore((s) => s.fontSize);
  const setFontSize = useTerminalSettingsStore((s) => s.setFontSize);
  return { fontSize, setFontSize };
}
