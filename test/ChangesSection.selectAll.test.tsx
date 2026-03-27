import { describe, it, expect, vi } from "vitest";
import { render, screen } from "./test-utils";
import userEvent from "@testing-library/user-event";
import { ChangesSection } from "../src/components/ChangesSection";
import type { ParsedFileChange } from "../src/lib/git-utils";

const mockFiles: ParsedFileChange[] = [
	{ path: "file1.ts", status: "M", changeId: "1" },
	{ path: "file2.ts", status: "A", changeId: "2" },
	{ path: "file3.ts", status: "D", changeId: "3" },
];

describe("ChangesSection - Select All Button", () => {
	it("renders select all button when files exist and onSelectAll provided", () => {
		const onSelectAll = vi.fn();
		render(
			<ChangesSection
				title="Changes"
				files={mockFiles}
				isCollapsed={false}
				onToggleCollapse={vi.fn()}
				onSelectAll={onSelectAll}
			/>,
		);

		// Select all button should be present with tooltip text
		const selectAllButton = screen.getByTitle(/select all/i);
		expect(selectAllButton).toBeInTheDocument();
	});

	it("does not render select all button when no files", () => {
		render(
			<ChangesSection
				title="Changes"
				files={[]}
				isCollapsed={false}
				onToggleCollapse={vi.fn()}
				onSelectAll={vi.fn()}
			/>,
		);

		const selectAllButton = screen.queryByTitle(/select all/i);
		expect(selectAllButton).not.toBeInTheDocument();
	});

	it("does not render select all button when onSelectAll not provided", () => {
		render(
			<ChangesSection
				title="Changes"
				files={mockFiles}
				isCollapsed={false}
				onToggleCollapse={vi.fn()}
			/>,
		);

		const selectAllButton = screen.queryByTitle(/select all/i);
		expect(selectAllButton).not.toBeInTheDocument();
	});

	it("calls onSelectAll when clicked", async () => {
		const user = userEvent.setup();
		const onSelectAll = vi.fn();

		render(
			<ChangesSection
				title="Changes"
				files={mockFiles}
				isCollapsed={false}
				onToggleCollapse={vi.fn()}
				onSelectAll={onSelectAll}
			/>,
		);

		const selectAllButton = screen.getByTitle(/select all/i);
		await user.click(selectAllButton);

		expect(onSelectAll).toHaveBeenCalledTimes(1);
	});

	it("stops propagation when select all button clicked", async () => {
		const user = userEvent.setup();
		const onSelectAll = vi.fn();
		const onDeselectAll = vi.fn();

		render(
			<ChangesSection
				title="Changes"
				files={mockFiles}
				isCollapsed={false}
				onToggleCollapse={vi.fn()}
				onSelectAll={onSelectAll}
				onDeselectAll={onDeselectAll}
			/>,
		);

		const selectAllButton = screen.getByTitle(/select all/i);
		await user.click(selectAllButton);

		// onDeselectAll should NOT be called (event propagation was stopped)
		expect(onDeselectAll).not.toHaveBeenCalled();
	});

	it("shows 'Select all' tooltip when not all files are selected", () => {
		const selectedFiles = new Set(["file1.ts"]);

		render(
			<ChangesSection
				title="Changes"
				files={mockFiles}
				isCollapsed={false}
				onToggleCollapse={vi.fn()}
				onSelectAll={vi.fn()}
				selectedFiles={selectedFiles}
			/>,
		);

		const selectAllButton = screen.getByTitle(/^Select all$/i);
		expect(selectAllButton).toBeInTheDocument();
	});

	it("shows 'Deselect all' tooltip when all files are selected", () => {
		const selectedFiles = new Set(mockFiles.map((f) => f.path));

		render(
			<ChangesSection
				title="Changes"
				files={mockFiles}
				isCollapsed={false}
				onToggleCollapse={vi.fn()}
				onSelectAll={vi.fn()}
				selectedFiles={selectedFiles}
			/>,
		);

		const deselectAllButton = screen.getByTitle(/Deselect all/i);
		expect(deselectAllButton).toBeInTheDocument();
	});
});

describe("ChangesSection - Select All Button", () => {
	it("renders select all button in Changes section when onSelectAll provided", () => {
		const onSelectAll = vi.fn();
		render(
			<ChangesSection
				title="Changes"
				files={mockFiles}
				isCollapsed={false}
				onToggleCollapse={vi.fn()}
				onSelectAll={onSelectAll}
				isStaged={false}
			/>,
		);

		const selectAllButton = screen.getByTitle(/Select all/i);
		expect(selectAllButton).toBeInTheDocument();
	});

	it("does not render select all button in Selected section", () => {
		render(
			<ChangesSection
				title="Selected"
				files={mockFiles}
				isCollapsed={false}
				onToggleCollapse={vi.fn()}
				onSelectAll={vi.fn()}
				isStaged={true}
			/>,
		);

		const selectAllButton = screen.queryByTitle(/Select all/i);
		expect(selectAllButton).not.toBeInTheDocument();
	});

	it("does not render select all button when no files", () => {
		render(
			<ChangesSection
				title="Changes"
				files={[]}
				isCollapsed={false}
				onToggleCollapse={vi.fn()}
				onSelectAll={vi.fn()}
				isStaged={false}
			/>,
		);

		const selectAllButton = screen.queryByTitle(/Select all/i);
		expect(selectAllButton).not.toBeInTheDocument();
	});

	it("does not render select all button when onSelectAll not provided", () => {
		render(
			<ChangesSection
				title="Changes"
				files={mockFiles}
				isCollapsed={false}
				onToggleCollapse={vi.fn()}
				isStaged={false}
			/>,
		);

		const selectAllButton = screen.queryByTitle(/Select all/i);
		expect(selectAllButton).not.toBeInTheDocument();
	});

	it("calls onSelectAll when clicked", async () => {
		const user = userEvent.setup();
		const onSelectAll = vi.fn();

		render(
			<ChangesSection
				title="Changes"
				files={mockFiles}
				isCollapsed={false}
				onToggleCollapse={vi.fn()}
				onSelectAll={onSelectAll}
				isStaged={false}
			/>,
		);

		const selectAllButton = screen.getByTitle(/Select all/i);
		await user.click(selectAllButton);

		expect(onSelectAll).toHaveBeenCalledTimes(1);
	});

	it("stops propagation when select all button clicked", async () => {
		const user = userEvent.setup();
		const onSelectAll = vi.fn();
		const onDeselectAll = vi.fn();

		render(
			<ChangesSection
				title="Changes"
				files={mockFiles}
				isCollapsed={false}
				onToggleCollapse={vi.fn()}
				onSelectAll={onSelectAll}
				onDeselectAll={onDeselectAll}
				isStaged={false}
			/>,
		);

		const selectAllButton = screen.getByTitle(/Select all/i);
		await user.click(selectAllButton);

		// onDeselectAll should NOT be called (event propagation was stopped)
		expect(onDeselectAll).not.toHaveBeenCalled();
	});

	it("shows correct file count in tooltip", () => {
		render(
			<ChangesSection
				title="Changes"
				files={mockFiles}
				isCollapsed={false}
				onToggleCollapse={vi.fn()}
				onSelectAll={vi.fn()}
				isStaged={false}
			/>,
		);

		const selectAllButton = screen.getByTitle(/Select all 3 file/i);
		expect(selectAllButton).toBeInTheDocument();
	});

	it("shows correct file count for single file", () => {
		const singleFile: ParsedFileChange[] = [
			{ path: "file1.ts", status: "M", changeId: "1" },
		];

		render(
			<ChangesSection
				title="Changes"
				files={singleFile}
				isCollapsed={false}
				onToggleCollapse={vi.fn()}
				onSelectAll={vi.fn()}
				isStaged={false}
			/>,
		);

		const selectAllButton = screen.getByTitle(/Select all 1 file/i);
		expect(selectAllButton).toBeInTheDocument();
	});
});
