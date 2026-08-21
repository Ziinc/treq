import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { Dashboard } from "./components/Dashboard";
import { TreqSendProvider } from "./hooks/useTreqSend";
import { ToastProvider } from "./components/ui/toast";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PrismThemeLoader } from "./components/PrismThemeLoader";
import { AppStoreEffects } from "./stores/AppStoreEffects";
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
        <AppStoreEffects />
        <PrismThemeLoader />
        <TreqSendProvider>
          <ToastProvider>
            <Router hook={useHashLocation}>
              <AppContent />
            </Router>
          </ToastProvider>
        </TreqSendProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
