import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { ReactNode } from "react";
import { ToastProvider } from "../src/components/ui/toast";
import { render, RenderOptions } from "@testing-library/react";

/**
 * Creates a wrapper component with QueryClientProvider and ToastProvider
 * for testing React components that use React Query hooks and toasts.
 */
const AllTheProviders = ({ children }: { children: ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        // cacheTime: 0,
      },
    },
  });

  return (
    <ToastProvider>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ToastProvider>
  );
};

const customRender = (ui: React.ReactElement, options?: RenderOptions) =>
  render(ui, { wrapper: AllTheProviders, ...options });

// re-export everything
export * from "@testing-library/react";

// override render method
export { customRender as render };
