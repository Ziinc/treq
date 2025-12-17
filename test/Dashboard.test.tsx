import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from './test-utils';
import { Dashboard } from '../src/components/Dashboard';
import * as api from '../src/lib/api';
import React from 'react';

// Mock Tauri APIs
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn(),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn().mockReturnValue({
    setTitle: vi.fn(),
    onFocusChanged: vi.fn().mockResolvedValue(() => {}),
  }),
  WebviewWindow: vi.fn(),
}));

// Mock the API module and set default return values
vi.mock('../src/lib/api', async () => {
  const actual = await vi.importActual('../src/lib/api');
  return {
    ...actual,
    getSetting: vi.fn().mockResolvedValue('/Users/test/repo'),
    getRepoSetting: vi.fn().mockResolvedValue(null),
    isGitRepository: vi.fn().mockResolvedValue(true),
    gitGetCurrentBranch: vi.fn().mockResolvedValue('main'),
    gitGetStatus: vi.fn().mockResolvedValue({
      modified: 0,
      added: 0,
      deleted: 0,
      untracked: 0,
      conflicted: 0,
    }),
    gitGetBranchInfo: vi.fn().mockResolvedValue({
      name: 'main',
      ahead: 0,
      behind: 0,
      upstream: undefined,
    }),
    gitGetLineDiffStats: vi.fn().mockResolvedValue({
      lines_added: 0,
      lines_deleted: 0,
    }),
    gitGetChangedFiles: vi.fn().mockResolvedValue([]),
    gitGetBranchDivergence: vi.fn().mockResolvedValue({
      ahead: 0,
      behind: 0,
    }),
    getWorkspaces: vi.fn().mockResolvedValue([]),
    getSessions: vi.fn().mockResolvedValue([]),
    rebuildWorkspaces: vi.fn().mockResolvedValue([]),
    createSession: vi.fn().mockResolvedValue(1),
    updateSessionAccess: vi.fn().mockResolvedValue(undefined),
    setSessionModel: vi.fn().mockResolvedValue(undefined),
    listDirectory: vi.fn().mockResolvedValue([]),
    readFile: vi.fn().mockRejectedValue(new Error('README.md not found')),
    preloadWorkspaceGitData: vi.fn().mockResolvedValue(undefined),
    invalidateGitCache: vi.fn().mockResolvedValue(undefined),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Dashboard', () => {

  describe('Initial State (No Repository)', () => {

    beforeEach(() => {
      vi.mocked(api.getSetting).mockResolvedValue(null);
    });
    it('renders setup UI when no repository is configured', async () => {
      render(<Dashboard />);

      await waitFor(() => {
        expect(screen.getByText('Set repository path')).toBeInTheDocument();
        expect(screen.getByText('Configure Repository')).toBeInTheDocument();
      });
    });
  });

  describe('ShowWorkspace Display', () => {
    beforeEach(() => {
      vi.mocked(api.getSetting).mockResolvedValue('/Users/test/repo');
      vi.mocked(api.listDirectory).mockResolvedValue([
        { name: 'src', path: '/Users/test/repo/src', is_directory: true },
        { name: 'package.json', path: '/Users/test/repo/package.json', is_directory: false },
        { name: 'README.md', path: '/Users/test/repo/README.md', is_directory: false },
      ]);
      vi.mocked(api.readFile).mockResolvedValue('# Test Repository\n\nThis is a test README.');
    });

    it('displays ShowWorkspace without creating a session', async () => {
      render(<Dashboard />);

      // Wait for ShowWorkspace to load (it's lazy loaded with Suspense)
      await waitFor(() => {
        // ShowWorkspace should be rendered - check for Overview tab
        expect(screen.getByText('Overview')).toBeInTheDocument();
      }, { timeout: 3000 });

      // Verify no session was created
      expect(api.createSession).not.toHaveBeenCalled();
    });

    it('registers Home button listener without creating sessions', async () => {
      const { listen } = await import('@tauri-apps/api/event');

      render(<Dashboard />);

      // Wait for component to mount and listeners to be set up
      await waitFor(() => {
        expect(listen).toHaveBeenCalled();
      });

      // Verify the navigate-to-dashboard listener was registered
      expect(listen).toHaveBeenCalledWith('navigate-to-dashboard', expect.any(Function));

      // Verify no session was created
      expect(api.createSession).not.toHaveBeenCalled();
    });

    it('displays terminal pane for main repo view', async () => {
      render(<Dashboard />);

      // Wait for ShowWorkspace to load
      await waitFor(() => {
        expect(screen.getByText('Overview')).toBeInTheDocument();
      }, { timeout: 3000 });

      // Check that terminal pane is rendered (collapsed)
      // Look for the "Terminals" text which is part of the terminal pane header
      await waitFor(() => {
        expect(screen.getByText(/Terminals/i)).toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });

});
