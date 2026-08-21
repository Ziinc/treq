import { useDiffSettingsStore } from "../stores/diffSettingsStore";

export function useDiffSettings() {
  const fontSize = useDiffSettingsStore((s) => s.fontSize);
  const setFontSize = useDiffSettingsStore((s) => s.setFontSize);
  return { fontSize, setFontSize };
}
