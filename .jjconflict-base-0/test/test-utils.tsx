import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { ReactNode } from "react";
import { ToastProvider } from "../src/components/ui/toast";
import { TerminalSettingsProvider } from "../src/hooks/useTerminalSettings";
import { ThemeProvider } from "../src/hooks/useTheme";
import { DiffSettingsProvider } from "../src/hooks/useDiffSettings";
import {
	RenderOptions,
	act,
	render,
	screen as rtlScreen,
	fireEvent,
} from "@testing-library/react";

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
		<ThemeProvider>
			<ToastProvider>
				<QueryClientProvider client={queryClient}>
					<DiffSettingsProvider>
						<TerminalSettingsProvider>{children}</TerminalSettingsProvider>
					</DiffSettingsProvider>
				</QueryClientProvider>
			</ToastProvider>
		</ThemeProvider>
	);
};

const customRender = (ui: React.ReactElement, options?: RenderOptions) =>
	render(ui, { wrapper: AllTheProviders, ...options });

const settleReactUpdates = async () => {
	await act(async () => {
		await Promise.resolve();
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
	});
};

const screen = {
	...rtlScreen,
	clickByText: async (text: string | RegExp) => {
		const el = await rtlScreen.findByText(text);
		fireEvent.click(el);
	},
	clickByRole: async (role: string, options?: Record<string, unknown>) => {
		const el = options
			? await rtlScreen.findByRole(role, options)
			: await rtlScreen.findByRole(role);
		fireEvent.click(el);
	},
};

// re-export everything
export * from "@testing-library/react";

// override render method and screen
export { customRender as render, screen, settleReactUpdates };
