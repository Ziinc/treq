import { create } from "zustand";

export interface EditorAppsState {
  cursor: boolean;
  vscode: boolean;
  zed: boolean;
  isLoading: boolean;
  setEditorApps: (
    apps: Pick<EditorAppsState, "cursor" | "vscode" | "zed">,
  ) => void;
  setLoading: (isLoading: boolean) => void;
}

export const defaultEditorAppsState = {
  cursor: false,
  vscode: false,
  zed: false,
  isLoading: true,
};

export const useEditorAppsStore = create<EditorAppsState>((set) => ({
  ...defaultEditorAppsState,
  setEditorApps: (apps) => set({ ...apps, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),
}));
