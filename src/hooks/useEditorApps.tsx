import { useEditorAppsStore } from "../stores/editorAppsStore";

export const useEditorApps = () => {
  const cursor = useEditorAppsStore((s) => s.cursor);
  const vscode = useEditorAppsStore((s) => s.vscode);
  const zed = useEditorAppsStore((s) => s.zed);
  const isLoading = useEditorAppsStore((s) => s.isLoading);
  return { cursor, vscode, zed, isLoading };
};
