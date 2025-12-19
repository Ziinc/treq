import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Dashboard } from "./components/Dashboard";
import { ToastProvider } from "./components/ui/toast";
import { ThemeProvider } from "./hooks/useTheme";
import { TerminalSettingsProvider } from "./hooks/useTerminalSettings";
import { DiffSettingsProvider } from "./hooks/useDiffSettings";
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
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <PrismThemeLoader />
        <TerminalSettingsProvider>
          <DiffSettingsProvider>
            <ToastProvider>
              <AppContent />
            </ToastProvider>
          </DiffSettingsProvider>
        </TerminalSettingsProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
