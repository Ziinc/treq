import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "./test-utils";
import userEvent from "@testing-library/user-event";
import { BranchSwitcher } from "../src/components/BranchSwitcher";
import * as api from "../src/lib/api";

// Mock the API
vi.mock("../src/lib/api", async () => {
  const actual = await vi.importActual("../src/lib/api");
  return {
    ...actual,
    jjGetBranches: vi.fn(),
    jjEditBookmark: vi.fn(),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("BranchSwitcher - Click Interaction Bug", () => {
  const mockBranches = [
    { name: "main", is_current: true },
    { name: "feature-branch", is_current: false },
    { name: "another-branch", is_current: false },
  ];

  beforeEach(() => {
    vi.mocked(api.jjGetBranches).mockResolvedValue(mockBranches);
    vi.mocked(api.jjEditBookmark).mockResolvedValue(undefined);
  });

  it("should use correct Tailwind selector for disabled state", async () => {
    render(
      <BranchSwitcher
        open={true}
        onOpenChange={vi.fn()}
        repoPath="/test/repo"
      />
    );

    // Wait for branches to load
    await waitFor(() => {
      expect(screen.getByText("feature-branch")).toBeInTheDocument();
    });

    const branchItem = screen.getByText("feature-branch");
    const commandItem = branchItem.closest("[cmdk-item]");

    // THIS TEST REPRODUCES THE BUG:
    // The buggy Tailwind selector data-[disabled]:pointer-events-none matches ANY data-disabled attribute
    // After the fix, it should be data-[disabled='true']:pointer-events-none to match only true disabled items
    const className = commandItem!.className;

    // Before fix: className includes "data-[disabled]:pointer-events-none" (matches any data-disabled)
    // After fix: className should include "data-[disabled='true']:pointer-events-none" (matches only true)
    expect(className).toContain("data-[disabled='true']:pointer-events-none");
  });

  it("should allow clicking on non-disabled branch items", async () => {
    const user = userEvent.setup();
    const onBranchChanged = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <BranchSwitcher
        open={true}
        onOpenChange={onOpenChange}
        repoPath="/test/repo"
        onBranchChanged={onBranchChanged}
      />
    );

    // Wait for branches to load
    await waitFor(() => {
      expect(screen.getByText("feature-branch")).toBeInTheDocument();
    });

    const branchItem = screen.getByText("feature-branch");

    // Click the branch
    await user.click(branchItem);

    // Verify the click triggered the expected behavior
    await waitFor(() => {
      expect(api.jjEditBookmark).toHaveBeenCalledWith("/test/repo", "feature-branch");
      expect(onBranchChanged).toHaveBeenCalledWith("feature-branch");
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("should not allow clicking on disabled items when switching is in progress", async () => {
    const user = userEvent.setup();

    // Make the API call slow to keep switching state active
    vi.mocked(api.jjEditBookmark).mockImplementation(
      () => new Promise(resolve => setTimeout(resolve, 500))
    );

    const onOpenChange = vi.fn();

    render(
      <BranchSwitcher
        open={true}
        onOpenChange={onOpenChange}
        repoPath="/test/repo"
      />
    );

    await waitFor(() => {
      expect(screen.getByText("feature-branch")).toBeInTheDocument();
    });

    // Click first branch to start switching
    const firstBranch = screen.getByText("feature-branch");
    await user.click(firstBranch);

    // Try to click another branch while switching
    const secondBranch = screen.getByText("another-branch");
    const commandItem = secondBranch.closest("[cmdk-item]");

    // Verify items are now disabled (should have data-disabled="true" during switching)
    await waitFor(() => {
      expect(commandItem).toHaveAttribute("data-disabled", "true");
    });

    // Second click should be blocked (pointer-events: none should apply)
    await user.click(secondBranch);

    // Should only be called once (first click)
    expect(api.jjEditBookmark).toHaveBeenCalledTimes(1);
  });

  it("should display current branch correctly", async () => {
    vi.mocked(api.jjGetBranches).mockResolvedValue([
      { name: "main", is_current: true },
      { name: "feature", is_current: false },
    ]);

    render(
      <BranchSwitcher
        open={true}
        onOpenChange={vi.fn()}
        repoPath="/test/repo"
      />
    );

    await waitFor(() => {
      expect(screen.getByText("current")).toBeInTheDocument();
    });

    expect(screen.getByText("main")).toBeInTheDocument();
  });

  it("should load branches when modal opens", async () => {
    const jjGetBranchesMock = vi.mocked(api.jjGetBranches);

    render(
      <BranchSwitcher
        open={true}
        onOpenChange={vi.fn()}
        repoPath="/test/repo"
      />
    );

    await waitFor(() => {
      expect(jjGetBranchesMock).toHaveBeenCalledWith("/test/repo");
    });
  });
});
