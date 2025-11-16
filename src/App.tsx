import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Dashboard } from "./components/Dashboard";
import { ToastProvider } from "./components/ui/toast";
import { ThemeProvider } from "./hooks/useTheme";
import { TerminalSettingsProvider } from "./hooks/useTerminalSettings";
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
          <ToastProvider>
            <Dashboard />
          </ToastProvider>
        </TerminalSettingsProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
