/**
 * Shared setup logic between unit tests (setup.ts) and integration tests
 * (setup.integration.ts). Import this file from each setup file.
 *
 * Includes: DOM polyfills, browser API mocks, Tauri plugin stubs, and hook mocks
 * that are identical across both test suites.
 *
 * NOT included here: @tauri-apps/api/core mock (differs: vi.fn() vs napi dispatch).
 */

import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// ── Cleanup ───────────────────────────────────────────────────────────────────

afterEach(() => {
	cleanup();
});

// ── DOM polyfills / browser API stubs ────────────────────────────────────────

(global as any).ResizeObserver = class ResizeObserver {
	constructor(cb: any) {
		(this as any).cb = cb;
	}

	observe() {
		(this as any).cb([{ borderBoxSize: { inlineSize: 0, blockSize: 0 } }]);
	}

	unobserve() {}
	disconnect() {}
};

(global as any).DOMRect = {
	fromRect: () => ({
		top: 0,
		left: 0,
		bottom: 0,
		right: 0,
		width: 0,
		height: 0,
	}),
};
// Stub HTMLCanvasElement.getContext to silence jsdom "not implemented" warnings
HTMLCanvasElement.prototype.getContext = vi.fn(
	() => null,
) as typeof HTMLCanvasElement.prototype.getContext;

Element.prototype.scrollIntoView = vi.fn();

global.requestIdleCallback = vi.fn((callback) => {
	setTimeout(callback, 0);
	return 0;
}) as unknown as typeof requestIdleCallback;

global.cancelIdleCallback = vi.fn();

if (!("requestAnimationFrame" in globalThis)) {
	global.requestAnimationFrame = ((callback: FrameRequestCallback) =>
		setTimeout(() => callback(Date.now()), 0)) as typeof requestAnimationFrame;
}

if (!("cancelAnimationFrame" in globalThis)) {
	global.cancelAnimationFrame = ((handle: number) =>
		clearTimeout(handle)) as typeof cancelAnimationFrame;
}

Object.defineProperty(window, "matchMedia", {
	writable: true,
	value: vi.fn().mockImplementation((query: string) => ({
		matches: false,
		media: query,
		onchange: null,
		addListener: vi.fn(),
		removeListener: vi.fn(),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		dispatchEvent: vi.fn(),
	})),
});

if (!navigator.clipboard) {
	Object.defineProperty(navigator, "clipboard", {
		value: { writeText: async (_text: string) => {} },
		writable: true,
		configurable: true,
	});
}
vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);

// ── Tauri API / plugin stubs (identical in both suites) ───────────────────────

vi.mock("@tauri-apps/api/event", () => ({
	listen: vi.fn(() => Promise.resolve(() => {})),
	emit: vi.fn(),
}));

vi.mock("@tauri-apps/api/window", () => ({
	getCurrentWindow: vi.fn(() => ({
		setTitle: vi.fn(),
		onFocusChanged: vi.fn(() => Promise.resolve(() => {})),
	})),
	WebviewWindow: vi.fn(),
}));

vi.mock("@tauri-apps/api/webviewWindow", () => ({
	WebviewWindow: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
	selectFolder: vi.fn(),
	open: vi.fn(),
	ask: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
	openPath: vi.fn(),
	revealItemInDir: vi.fn(),
	openUrl: vi.fn(),
}));

// Mock Radix/cmdk/Popover to avoid Portal/floating-ui issues in test env
vi.mock(
	"../src/components/ui/popover",
	async () => await import("./mocks/popover"),
);
vi.mock("cmdk", async () => await import("./mocks/cmdk"));
vi.mock(
	"@radix-ui/react-dialog",
	async () => await import("./mocks/radix-dialog"),
);

// ── Hook mocks ────────────────────────────────────────────────────────────────

vi.mock("../src/hooks/useWorkspaceGitStatus", () => ({
	useWorkspaceGitStatus: vi.fn(() => ({
		status: null,
		branchInfo: null,
		divergence: null,
		lineDiffStats: null,
	})),
}));

vi.mock("../src/hooks/useCachedWorkspaceChanges", () => ({
	useCachedWorkspaceChanges: vi.fn(() => ({
		changes: [],
		isLoading: false,
		error: null,
		refresh: vi.fn(),
	})),
}));
