import type { ReactNode } from "react";
import { useDiffSettingsStore } from "../stores/diffSettingsStore";

export function useDiffSettings() {
  const fontSize = useDiffSettingsStore((s) => s.fontSize);
  const setFontSize = useDiffSettingsStore((s) => s.setFontSize);
  return { fontSize, setFontSize };
}

export function DiffSettingsProvider({ children }: { children: ReactNode }) {
  return children;
}
