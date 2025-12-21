import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(() => {
  cleanup();
});

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(() => ({
    setTitle: vi.fn(),
    onFocusChanged: vi.fn(() => Promise.resolve(() => {})),
  })),
}));

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  selectFolder: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openPath: vi.fn(),
}));

global.requestIdleCallback = vi.fn((callback) => {
  setTimeout(callback, 0);
  return 0;
}) as any;

global.cancelIdleCallback = vi.fn();

// Mock window.matchMedia for theme detection
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
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
