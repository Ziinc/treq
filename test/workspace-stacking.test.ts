import { describe, test, expect, vi, beforeEach } from 'vitest';
import { generateStackedIntent, generateStackedBranchName } from '../src/lib/utils';
import { renderHook, waitFor } from '@testing-library/react';
import { useCreateStackedWorkspace } from '../src/hooks/useCreateStackedWorkspace';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock the API module
vi.mock('../src/lib/api', () => ({
  createWorkspace: vi.fn(),
  setWorkspaceTargetBranch: vi.fn(),
  getRepoSetting: vi.fn(),
  getWorkspaces: vi.fn(),
}));

// Mock the toast hook
vi.mock('../src/components/ui/toast', () => ({
  useToast: () => ({
    addToast: vi.fn(),
  }),
}));

describe('generateStackedIntent', () => {
  test('generates intent with parent intent', () => {
    const result = generateStackedIntent('Add dark mode', 'feature/dark-mode');
    expect(result).toBe('Add dark mode\n\nStacked from feature/dark-mode');
  });

  test('generates intent without parent intent', () => {
    const result = generateStackedIntent(null, 'main');
    expect(result).toBe('Stacked from main');
  });
});

describe('generateStackedBranchName', () => {
  test('generates branch name with enumeration starting at 1', () => {
    const result = generateStackedBranchName('treq/{name}', 'feature/auth', 1);
    expect(result).toBe('treq/featureauth-stack-1');
  });

  test('generates branch name with higher enumeration index', () => {
    const result = generateStackedBranchName('treq/{name}', 'feature/auth', 2);
    expect(result).toBe('treq/featureauth-stack-2');
  });

  test('generates branch name with multi-digit enumeration', () => {
    const result = generateStackedBranchName('treq/{name}', 'feature/auth', 13);
    expect(result).toBe('treq/featureauth-stack-13');
  });
});

describe('useCreateStackedWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => {
    const queryClient = new QueryClient();
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children
    );
  };

  test('creates stacked workspace from parent workspace', async () => {
    const { createWorkspace, getRepoSetting, getWorkspaces, setWorkspaceTargetBranch } = await import(
      '../src/lib/api'
    );

    (getRepoSetting as any).mockResolvedValue('treq/{name}');
    (getWorkspaces as any).mockResolvedValue([]);
    (createWorkspace as any).mockResolvedValue(1);
    (setWorkspaceTargetBranch as any).mockResolvedValue({});

    const { result } = renderHook(() => useCreateStackedWorkspace(), { wrapper });

    const parentWorkspace = {
      id: 1,
      repo_path: '/test/repo',
      workspace_name: 'ws1',
      workspace_path: '/test/repo/ws1',
      branch_name: 'feature/auth',
      created_at: '2024-01-01',
      metadata: JSON.stringify({ intent: 'Add auth' }),
      target_branch: 'main',
      has_conflicts: false,
    };

    const workspaceId = await result.current.createStackedWorkspace({
      repoPath: '/test/repo',
      parentBranch: 'feature/auth',
      parentWorkspace,
    });

    expect(workspaceId).toBe(1);
  });

  test('creates stacked workspace from home repo', async () => {
    const { createWorkspace, getRepoSetting, getWorkspaces, setWorkspaceTargetBranch } = await import(
      '../src/lib/api'
    );

    (getRepoSetting as any).mockResolvedValue('treq/{name}');
    (getWorkspaces as any).mockResolvedValue([]);
    (createWorkspace as any).mockResolvedValue(2);
    (setWorkspaceTargetBranch as any).mockResolvedValue({});

    const { result } = renderHook(() => useCreateStackedWorkspace(), { wrapper });

    const workspaceId = await result.current.createStackedWorkspace({
      repoPath: '/test/repo',
      parentBranch: 'main',
      parentWorkspace: null,
    });

    expect(workspaceId).toBe(2);
  });
});
