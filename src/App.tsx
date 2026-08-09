import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { Dashboard } from "./components/Dashboard";
import { ToastProvider } from "./components/ui/toast";
import { ThemeProvider } from "./hooks/useTheme";
import { TerminalSettingsProvider } from "./hooks/useTerminalSettings";
import { ZoomSettingsProvider } from "./hooks/useZoomSettings";
import { DiffSettingsProvider } from "./hooks/useDiffSettings";
import { EditorAppsProvider } from "./hooks/useEditorApps";
import { AuthProvider } from "./hooks/useAuth";
import { useSettingsPreloader } from "./hooks/useSettingsPreloader";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PrismThemeLoader } from "./components/PrismThemeLoader";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function AppContent() {
  // Pre-load all settings in a single batch request
  useSettingsPreloader();

  return (
    <div className="flex h-screen">
      <ErrorBoundary
        fallbackTitle="Dashboard crashed"
        onReset={() => {
          if (typeof window !== "undefined") {
            window.location.reload();
          }
        }}
      >
        <Dashboard />
      </ErrorBoundary>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary
      fallbackTitle="Application failed to initialize"
      onReset={() => {
        if (typeof window !== "undefined") {
          window.location.reload();
        }
      }}
    >
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ThemeProvider>
            <PrismThemeLoader />
            <ZoomSettingsProvider>
              <TerminalSettingsProvider>
                <DiffSettingsProvider>
                  <EditorAppsProvider>
                    <ToastProvider>
                      <Router hook={useHashLocation}>
                        <AppContent />
                      </Router>
                    </ToastProvider>
                  </EditorAppsProvider>
                </DiffSettingsProvider>
              </TerminalSettingsProvider>
            </ZoomSettingsProvider>
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
