import { describe, test, expect, vi, beforeEach } from "vitest";
import {
	generateStackedIntent,
	generateStackedBranchName,
	sanitizeForBranchName,
	applyBranchNamePattern,
} from "../src/lib/utils";
import { renderHook } from "@testing-library/react";
import { useCreateStackedWorkspace } from "../src/hooks/useCreateStackedWorkspace";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Mock the API module
vi.mock("../src/lib/api", () => ({
	createWorkspace: vi.fn(),
	setWorkspaceTargetBranch: vi.fn(),
	getRepoSetting: vi.fn(),
	getWorkspaces: vi.fn(),
}));

// Mock the toast hook
vi.mock("../src/components/ui/toast", () => ({
	useToast: () => ({
		addToast: vi.fn(),
	}),
}));

describe("generateStackedIntent", () => {
	test("generates intent with parent intent", () => {
		const result = generateStackedIntent("Add dark mode", "feature/dark-mode");
		expect(result).toBe("Add dark mode\n\nStacked from feature/dark-mode");
	});

	test("generates intent without parent intent", () => {
		const result = generateStackedIntent(null, "main");
		expect(result).toBe("Stacked from main");
	});
});

describe("sanitizeForBranchName", () => {
	test("basic sanitization", () => {
		expect(sanitizeForBranchName("Add dark mode")).toBe("add-dark-mode");
	});

	test("truncation does not leave trailing hyphen", () => {
		// 50 chars of 'a' + '-b' would truncate to 50 chars ending in '-'
		const longText = "a".repeat(49) + "-b extra";
		const result = sanitizeForBranchName(longText);
		expect(result).not.toMatch(/-$/);
	});

	test("removes trailing single-character alphabetic part", () => {
		// 'r' is a middle part here, not trailing — no stripping
		expect(sanitizeForBranchName("add r feature")).toBe("add-r-feature");
		// 'r' is the trailing part here — should be stripped
		expect(sanitizeForBranchName("feat-thing-r")).toBe("feat-thing");
		// numeric trailing part should NOT be stripped (e.g. stack index)
		expect(sanitizeForBranchName("stack-1")).toBe("stack-1");
	});

	test("returns unnamed for empty/whitespace input", () => {
		expect(sanitizeForBranchName("")).toBe("unnamed");
		expect(sanitizeForBranchName("   ")).toBe("unnamed");
	});
});

describe("applyBranchNamePattern", () => {
	test("applies pattern correctly", () => {
		expect(applyBranchNamePattern("treq/{name}", "add dark mode")).toBe(
			"treq/add-dark-mode",
		);
	});

	test("no trailing slash when name is empty after sanitization", () => {
		const result = applyBranchNamePattern("treq/{name}", "");
		expect(result).not.toMatch(/[/.-]$/);
	});

	test("strips trailing separator from pattern result", () => {
		// pattern with trailing separator after name
		const result = applyBranchNamePattern("{name}/", "add-feature");
		expect(result).not.toMatch(/[/.-]$/);
	});

	test("strips trailing single-char alphabetic part after pattern separator", () => {
		expect(applyBranchNamePattern("treq/{name}", "feat-thing-r")).toBe(
			"treq/feat-thing",
		);
		// numeric single-char should NOT be stripped
		expect(applyBranchNamePattern("treq/{name}", "stack-1")).toBe(
			"treq/stack-1",
		);
	});
});

describe("generateStackedBranchName", () => {
	test("generates branch name with enumeration starting at 1", () => {
		const result = generateStackedBranchName("treq/{name}", "feature/auth", 1);
		expect(result).toBe("treq/featureauth-stack-1");
	});

	test("generates branch name with higher enumeration index", () => {
		const result = generateStackedBranchName("treq/{name}", "feature/auth", 2);
		expect(result).toBe("treq/featureauth-stack-2");
	});

	test("generates branch name with multi-digit enumeration", () => {
		const result = generateStackedBranchName("treq/{name}", "feature/auth", 13);
		expect(result).toBe("treq/featureauth-stack-13");
	});
});

describe("useCreateStackedWorkspace", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	const wrapper = ({ children }: { children: React.ReactNode }) => {
		const queryClient = new QueryClient();
		return React.createElement(
			QueryClientProvider,
			{ client: queryClient },
			children,
		);
	};

	test("creates stacked workspace from parent workspace", async () => {
		const {
			createWorkspace,
			getRepoSetting,
			getWorkspaces,
			setWorkspaceTargetBranch,
		} = await import("../src/lib/api");

		(getRepoSetting as any).mockResolvedValue("treq/{name}");
		(getWorkspaces as any).mockResolvedValue([]);
		(createWorkspace as any).mockResolvedValue(1);
		(setWorkspaceTargetBranch as any).mockResolvedValue({});

		const { result } = renderHook(() => useCreateStackedWorkspace(), {
			wrapper,
		});

		const parentWorkspace = {
			id: 1,
			repo_path: "/test/repo",
			workspace_name: "ws1",
			workspace_path: "/test/repo/ws1",
			branch_name: "feature/auth",
			created_at: "2024-01-01",
			metadata: JSON.stringify({ intent: "Add auth" }),
			target_branch: "main",
			has_conflicts: false,
		};

		const workspaceId = await result.current.createStackedWorkspace({
			repoPath: "/test/repo",
			parentBranch: "feature/auth",
			parentWorkspace,
		});

		expect(workspaceId).toBe(1);
	});

	test("creates stacked workspace from home repo", async () => {
		const {
			createWorkspace,
			getRepoSetting,
			getWorkspaces,
			setWorkspaceTargetBranch,
		} = await import("../src/lib/api");

		(getRepoSetting as any).mockResolvedValue("treq/{name}");
		(getWorkspaces as any).mockResolvedValue([]);
		(createWorkspace as any).mockResolvedValue(2);
		(setWorkspaceTargetBranch as any).mockResolvedValue({});

		const { result } = renderHook(() => useCreateStackedWorkspace(), {
			wrapper,
		});

		const workspaceId = await result.current.createStackedWorkspace({
			repoPath: "/test/repo",
			parentBranch: "main",
			parentWorkspace: null,
		});

		expect(workspaceId).toBe(2);
	});
});
