import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock @tauri-apps/api/event
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

// Mock @tauri-apps/api/window
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    setTitle: vi.fn(),
    onFocusChanged: vi.fn(() => Promise.resolve(() => {})),
  })),
}));

// Mock @tauri-apps/api/webviewWindow
vi.mock('@tauri-apps/api/webviewWindow', () => ({
  WebviewWindow: vi.fn(),
}));

// Mock @tauri-apps/plugin-dialog
vi.mock('@tauri-apps/plugin-dialog', () => ({
  selectFolder: vi.fn(),
}));

// Mock @tauri-apps/plugin-opener
vi.mock('@tauri-apps/plugin-opener', () => ({
  openPath: vi.fn(),
}));

// Mock window.requestIdleCallback
global.requestIdleCallback = vi.fn((callback) => {
  setTimeout(callback, 0);
  return 0;
}) as any;

global.cancelIdleCallback = vi.fn();

// Mock useWorkspaceGitStatus hook
vi.mock('../src/hooks/useWorkspaceGitStatus', () => ({
  useWorkspaceGitStatus: vi.fn(() => ({
    status: null,
    branchInfo: null,
    divergence: null,
    lineDiffStats: null,
  })),
}));
