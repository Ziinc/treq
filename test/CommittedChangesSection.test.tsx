import { describe, expect, it, vi } from "vitest";
import { render, screen } from "./test-utils";
import userEvent from "@testing-library/user-event";
import { CommittedChangesSection } from "../src/components/CommittedChangesSection";
import type { JjFileChange } from "../src/lib/api";

describe("CommittedChangesSection", () => {
  const mockFiles: JjFileChange[] = [
    { path: "src/file1.ts", status: "M" },
    { path: "src/file2.ts", status: "A" },
    { path: "src/file3.ts", status: "D" },
  ];

  it("should render section with file count", () => {
    render(
      <CommittedChangesSection
        files={mockFiles}
        isCollapsed={false}
        onToggleCollapse={vi.fn()}
        activeFilePath={null}
        onFileSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("Committed")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("should not render when files array is empty", () => {
    render(
      <CommittedChangesSection
        files={[]}
        isCollapsed={false}
        onToggleCollapse={vi.fn()}
        activeFilePath={null}
        onFileSelect={vi.fn()}
      />,
    );

    // Should not render the "Committed" header
    expect(screen.queryByText("Committed")).not.toBeInTheDocument();
  });

  it("should render file list when not collapsed", () => {
    render(
      <CommittedChangesSection
        files={mockFiles}
        isCollapsed={false}
        onToggleCollapse={vi.fn()}
        activeFilePath={null}
        onFileSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("file1.ts")).toBeInTheDocument();
    expect(screen.getByText("file2.ts")).toBeInTheDocument();
    expect(screen.getByText("file3.ts")).toBeInTheDocument();
  });

  it("should hide file list when collapsed", () => {
    render(
      <CommittedChangesSection
        files={mockFiles}
        isCollapsed={true}
        onToggleCollapse={vi.fn()}
        activeFilePath={null}
        onFileSelect={vi.fn()}
      />,
    );

    expect(screen.queryByText("file1.ts")).not.toBeInTheDocument();
    expect(screen.queryByText("file2.ts")).not.toBeInTheDocument();
    expect(screen.queryByText("file3.ts")).not.toBeInTheDocument();
  });

  it("should toggle collapse when header is clicked", async () => {
    const user = userEvent.setup();
    const onToggleCollapse = vi.fn();

    render(
      <CommittedChangesSection
        files={mockFiles}
        isCollapsed={false}
        onToggleCollapse={onToggleCollapse}
        activeFilePath={null}
        onFileSelect={vi.fn()}
      />,
    );

    const header = screen.getByRole("button", { name: /committed/i });
    await user.click(header);

    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  });

  it("should call onFileSelect when file is clicked", async () => {
    const user = userEvent.setup();
    const onFileSelect = vi.fn();

    render(
      <CommittedChangesSection
        files={mockFiles}
        isCollapsed={false}
        onToggleCollapse={vi.fn()}
        activeFilePath={null}
        onFileSelect={onFileSelect}
      />,
    );

    const file = screen.getByText("file1.ts");
    await user.click(file);

    expect(onFileSelect).toHaveBeenCalledWith(
      "src/file1.ts",
      expect.any(Object),
    );
  });

  it("should highlight active file", () => {
    render(
      <CommittedChangesSection
        files={mockFiles}
        isCollapsed={false}
        onToggleCollapse={vi.fn()}
        activeFilePath="src/file2.ts"
        onFileSelect={vi.fn()}
      />,
    );

    // GitFileRow should apply active styling (text-blue-500) to active file
    const file2Name = screen.getByText("file2.ts");
    expect(file2Name).toHaveClass("text-blue-500");
  });

  it("should show chevron right when collapsed", () => {
    const { container } = render(
      <CommittedChangesSection
        files={mockFiles}
        isCollapsed={true}
        onToggleCollapse={vi.fn()}
        activeFilePath={null}
        onFileSelect={vi.fn()}
      />,
    );

    // Check for ChevronRight icon
    const chevronRight = container.querySelector("svg.lucide-chevron-right");
    expect(chevronRight).toBeInTheDocument();
  });

  it("should show chevron down when not collapsed", () => {
    const { container } = render(
      <CommittedChangesSection
        files={mockFiles}
        isCollapsed={false}
        onToggleCollapse={vi.fn()}
        activeFilePath={null}
        onFileSelect={vi.fn()}
      />,
    );

    // Check for ChevronDown icon
    const chevronDown = container.querySelector("svg.lucide-chevron-down");
    expect(chevronDown).toBeInTheDocument();
  });

  it("should not show action buttons (read-only)", () => {
    render(
      <CommittedChangesSection
        files={mockFiles}
        isCollapsed={false}
        onToggleCollapse={vi.fn()}
        activeFilePath={null}
        onFileSelect={vi.fn()}
      />,
    );

    // Should not have discard or move buttons
    expect(
      screen.queryByRole("button", { name: /discard/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /move/i }),
    ).not.toBeInTheDocument();
  });

  it("renders a right-aligned Show button with eye icon when toggle handlers are provided", () => {
    render(
      <CommittedChangesSection
        files={mockFiles}
        isCollapsed={false}
        onToggleCollapse={vi.fn()}
        activeFilePath={null}
        onFileSelect={vi.fn()}
        showCommittedChanges={true}
        onToggleShowCommitted={vi.fn()}
      />,
    );

    const showButton = screen.getByRole("button", { name: /^Show$/ });
    expect(showButton).toBeInTheDocument();
    expect(
      showButton.querySelector("svg.lucide-eye, svg.lucide-eye-off"),
    ).toBeTruthy();
  });

  it("calls onToggleShowCommitted when Show is clicked without collapsing", async () => {
    const user = userEvent.setup();
    const onToggleShowCommitted = vi.fn();
    const onToggleCollapse = vi.fn();

    render(
      <CommittedChangesSection
        files={mockFiles}
        isCollapsed={false}
        onToggleCollapse={onToggleCollapse}
        activeFilePath={null}
        onFileSelect={vi.fn()}
        showCommittedChanges={true}
        onToggleShowCommitted={onToggleShowCommitted}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^Show$/ }));

    expect(onToggleShowCommitted).toHaveBeenCalledTimes(1);
    expect(onToggleCollapse).not.toHaveBeenCalled();
  });

  it("hides the file list when showCommittedChanges is false", () => {
    render(
      <CommittedChangesSection
        files={mockFiles}
        isCollapsed={false}
        onToggleCollapse={vi.fn()}
        activeFilePath={null}
        onFileSelect={vi.fn()}
        showCommittedChanges={false}
        onToggleShowCommitted={vi.fn()}
      />,
    );

    expect(screen.getByText("Committed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Show$/ })).toBeInTheDocument();
    expect(screen.queryByText("file1.ts")).not.toBeInTheDocument();
  });
});
