import { describe, expect, it } from "vitest";
import {
	buildCreateMetadata,
	parseSparsePathsInput,
} from "./workspaceMetadata";

describe("parseSparsePathsInput", () => {
	it("splits lines, trims, and drops empties", () => {
		expect(parseSparsePathsInput("src\n docs/guide.md \n\n")).toEqual([
			"src",
			"docs/guide.md",
		]);
	});

	it("returns undefined for blank input", () => {
		expect(parseSparsePathsInput("")).toBeUndefined();
		expect(parseSparsePathsInput("  \n  ")).toBeUndefined();
	});
});

describe("buildCreateMetadata", () => {
	it("includes only provided fields", () => {
		const metadata = JSON.parse(
			buildCreateMetadata({
				title: "T",
				description: "D",
				sparsePaths: "src\ndocs",
			}),
		);
		expect(metadata).toEqual({
			title: "T",
			description: "D",
			sparse_patterns: ["src", "docs"],
		});
	});

	it("omits empty fields entirely", () => {
		expect(
			buildCreateMetadata({ title: " ", description: "", sparsePaths: "\n" }),
		).toBe("{}");
	});

	it("includes moved_files when given", () => {
		const metadata = JSON.parse(
			buildCreateMetadata({
				title: "",
				description: "",
				movedFiles: ["a.rs"],
				sparsePaths: "",
			}),
		);
		expect(metadata).toEqual({ moved_files: ["a.rs"] });
	});
});
