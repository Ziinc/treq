import { createContext, useContext, useEffect, useState, useMemo, ReactNode } from "react";
import { detectEditorApps } from "../lib/api";

interface EditorAppsContextType {
  cursor: boolean;
  vscode: boolean;
  zed: boolean;
  isLoading: boolean;
}

const defaultContextValue: EditorAppsContextType = {
  cursor: false,
  vscode: false,
  zed: false,
  isLoading: true,
};

const EditorAppsContext = createContext<EditorAppsContextType>(defaultContextValue);

EditorAppsContext.displayName = "EditorAppsContext";

export const useEditorApps = (): EditorAppsContextType => {
  return useContext(EditorAppsContext);
};

export const EditorAppsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [editorApps, setEditorApps] = useState({
    cursor: false,
    vscode: false,
    zed: false,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Detect editor apps on mount
    detectEditorApps()
      .then((apps) => {
        setEditorApps(apps);
        setIsLoading(false);
      })
      .catch((error) => {
        console.error("Failed to detect editor apps:", error);
        setIsLoading(false);
        // Keep defaults (all false) on error
      });
  }, []);

  const value = useMemo(
    () => ({
      ...editorApps,
      isLoading,
    }),
    [editorApps, isLoading]
  );

  return (
    <EditorAppsContext.Provider value={value}>
      {children}
    </EditorAppsContext.Provider>
  );
};
