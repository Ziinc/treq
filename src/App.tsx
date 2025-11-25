import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Dashboard } from "./components/Dashboard";
import { ToastProvider } from "./components/ui/toast";
import { ThemeProvider } from "./hooks/useTheme";
import { TerminalSettingsProvider } from "./hooks/useTerminalSettings";
import { DiffSettingsProvider } from "./hooks/useDiffSettings";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TerminalSettingsProvider>
          <DiffSettingsProvider>
            <ToastProvider>
            <div className="flex h-screen">
              <ErrorBoundary
                fallbackTitle="Dashboard crashed"
                onGoDashboard={() => {
                  if (typeof window !== "undefined") {
                    window.location.reload();
                  }
                }}
              >
                <Dashboard />
              </ErrorBoundary>
            </div>
            </ToastProvider>
          </DiffSettingsProvider>
        </TerminalSettingsProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
